import crypto from 'node:crypto';
import type Stripe from 'stripe';
import { env } from '../../config/env';
import { pool } from '../../config/database';
import { notifyCapacityOvershoot } from '../capacity/capacityOvershootService';
import {
  releaseOrderByPaymentIntentId,
  reReserveAfterLatePayment,
  type CapacityOvershootIncident,
} from '../checkout/orderReleaseService';
import { sendEmail } from '../email/emailClient';
import { retrieveAccount } from '../stripe/stripeConnect';
import { generateTicketAccessToken, hashTicketAccessToken } from '../../utils/ticketAccessToken';
import type { OrderLineItemRow, OrderRow } from '../../types/db';

// This Stripe account's connected accounts were set up as Accounts v2, whose
// events arrive as v2.core.account.created/updated — a "thin" event carrying
// only { related_object: { id } }, not the account object itself — rather
// than the classic v1 account.updated event with the full object inline.
// Both are handled here since which one a given Stripe account/platform
// emits isn't something this code controls.
interface StripeV2AccountEvent {
  type: string;
  related_object?: { id: string; type: string };
}

interface ConfirmedOrder {
  id: string;
  eventId: string;
  buyerEmail: string;
  ticketAccessToken: string;
  capacityOvershootIncidents: CapacityOvershootIncident[];
}

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    await markOrderPaidAndIssueTickets(paymentIntent.id);
    return;
  }
  // Released immediately rather than waiting for the reservation to time
  // out, once Stripe has told us the payment isn't happening. For
  // payment_failed specifically, the same PaymentIntent can still be
  // retried with a different card — released eagerly anyway, and if that
  // retry later succeeds, markOrderPaidAndIssueTickets's payment-always-
  // wins handling re-reserves the inventory rather than ever refusing a
  // confirmed payment.
  if (event.type === 'payment_intent.canceled' || event.type === 'payment_intent.payment_failed') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    await releaseOrderByPaymentIntentId(paymentIntent.id);
    return;
  }
  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account;
    await syncConnectedAccountChargesEnabled(account.id, Boolean(account.charges_enabled));
    return;
  }
  const v2Event = event as unknown as StripeV2AccountEvent;
  if (
    (v2Event.type === 'v2.core.account.updated' || v2Event.type === 'v2.core.account.created') &&
    v2Event.related_object?.id
  ) {
    const account = await retrieveAccount(v2Event.related_object.id);
    await syncConnectedAccountChargesEnabled(account.id, Boolean(account.charges_enabled));
    return;
  }
  // Other event types are acknowledged but intentionally ignored.
}

// Stripe recommends syncing charges_enabled from this webhook rather than
// polling the Accounts API — it fires whenever onboarding progresses (or
// regresses, e.g. a compliance hold), which is exactly what checkout and
// refunds need to know before attempting a destination charge.
async function syncConnectedAccountChargesEnabled(
  stripeAccountId: string,
  chargesEnabled: boolean,
): Promise<void> {
  await pool.query(`UPDATE organizations SET stripe_charges_enabled = $2 WHERE stripe_account_id = $1`, [
    stripeAccountId,
    chargesEnabled,
  ]);
}

async function markOrderPaidAndIssueTickets(paymentIntentId: string): Promise<void> {
  const client = await pool.connect();
  let confirmedOrder: ConfirmedOrder | null = null;
  try {
    await client.query('BEGIN');

    const orderResult = await client.query<OrderRow>(
      `SELECT * FROM orders WHERE stripe_payment_intent_id = $1 FOR UPDATE`,
      [paymentIntentId],
    );
    const order = orderResult.rows[0];
    if (!order) {
      // No matching order — e.g. a payment intent from an unrelated flow.
      await client.query('ROLLBACK');
      return;
    }
    if (order.status === 'paid') {
      // Stripe may deliver the same webhook event more than once.
      await client.query('ROLLBACK');
      return;
    }

    // Payment always wins: this order's reservation may have already been
    // released (timed out, or an earlier payment_intent.payment_failed on
    // the same PaymentIntent) before this success arrived — Stripe has
    // already moved real money, so the sale is honored regardless, and the
    // ticket types' quantity_sold must be corrected back up to reflect it.
    let capacityOvershootIncidents: CapacityOvershootIncident[] = [];
    if (order.status === 'expired') {
      capacityOvershootIncidents = await reReserveAfterLatePayment(client, order);
    }

    // Minted here rather than at order creation: it's proof that this
    // order's tickets can be viewed, and no tickets exist until this exact
    // point — nothing earlier has any use for it. Only the hash is
    // persisted; the raw value lives only in memory for the rest of this
    // request, until it's handed to deliverOrderConfirmationEmail below.
    const ticketAccessToken = generateTicketAccessToken();

    // tickets_issued_at anchors the confirmation-polling route's retrieval
    // window (orderConfirmationService.ts) — it's payment-confirmation
    // time, not order-creation time (orders.created_at).
    await client.query(
      `UPDATE orders SET status = 'paid', ticket_access_token_hash = $2, tickets_issued_at = now() WHERE id = $1`,
      [order.id, hashTicketAccessToken(ticketAccessToken)],
    );

    const lineItemsResult = await client.query<OrderLineItemRow>(
      `SELECT * FROM order_line_items WHERE order_id = $1`,
      [order.id],
    );
    for (const line of lineItemsResult.rows) {
      for (let i = 0; i < line.quantity; i++) {
        const qrCode = crypto.randomBytes(16).toString('hex');
        await client.query(`INSERT INTO tickets (order_id, ticket_type_id, qr_code) VALUES ($1, $2, $3)`, [
          order.id,
          line.ticket_type_id,
          qrCode,
        ]);
      }
    }

    await client.query(
      `INSERT INTO transactions (order_id, type, amount_cents, stripe_object_id, occurred_at)
       VALUES ($1, 'charge', $2, $3, now())`,
      [order.id, order.total_cents, paymentIntentId],
    );

    await client.query('COMMIT');
    confirmedOrder = {
      id: order.id,
      eventId: order.event_id,
      buyerEmail: order.buyer_email,
      ticketAccessToken,
      capacityOvershootIncidents,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Deliberately outside the try/catch above: the order is already
  // committed at this point, so a delivery failure here must never roll
  // back real data or make the webhook response look like a failure to
  // Stripe. A failed response would make Stripe retry, and the retry would
  // just hit the `status === 'paid'` idempotency guard above and return
  // early without ever re-attempting the email — so a thrown error here
  // wouldn't even get the retry it seemed to be asking for. Same reasoning
  // for the capacity overshoot notifications below: the incident rows are
  // already committed, so a logging/email failure here must not look like
  // the payment confirmation itself failed.
  if (confirmedOrder) {
    await deliverOrderConfirmationEmail(
      confirmedOrder.buyerEmail,
      confirmedOrder.eventId,
      confirmedOrder.id,
      confirmedOrder.ticketAccessToken,
    );
    for (const incident of confirmedOrder.capacityOvershootIncidents) {
      await notifyCapacityOvershoot(incident);
    }
  }
}

async function deliverOrderConfirmationEmail(
  email: string,
  eventId: string,
  orderId: string,
  ticketAccessToken: string,
): Promise<void> {
  const ticketsUrl = `${env.APP_BASE_URL}/events/${eventId}/orders/${orderId}/tickets?token=${encodeURIComponent(ticketAccessToken)}`;
  try {
    await sendEmail({
      to: email,
      subject: 'Your Intahe order is confirmed',
      html: `<p>Thanks for your purchase! Your order is confirmed.</p>
<p>Order reference: <strong>${orderId}</strong></p>
<p><a href="${ticketsUrl}">View your tickets</a></p>`,
    });
  } catch (err) {
    console.error('Failed to send order confirmation email:', err);
  }
}
