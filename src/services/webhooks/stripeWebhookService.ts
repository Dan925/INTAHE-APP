import crypto from 'node:crypto';
import type Stripe from 'stripe';
import { env } from '../../config/env';
import { pool } from '../../config/database';
import { sendEmail } from '../email/emailClient';
import { retrieveAccount } from '../stripe/stripeConnect';
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

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    await markOrderPaidAndIssueTickets(paymentIntent.id);
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
  // Other event types (e.g. payment_intent.payment_failed) are acknowledged
  // but intentionally ignored: the orders.status enum has no "failed" state
  // in this schema, so a failed attempt just leaves the order pending.
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
  let confirmedOrder: { id: string; eventId: string; buyerEmail: string } | null = null;
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

    await client.query(`UPDATE orders SET status = 'paid' WHERE id = $1`, [order.id]);

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
    confirmedOrder = { id: order.id, eventId: order.event_id, buyerEmail: order.buyer_email };
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
  // wouldn't even get the retry it seemed to be asking for.
  if (confirmedOrder) {
    await deliverOrderConfirmationEmail(confirmedOrder.buyerEmail, confirmedOrder.eventId, confirmedOrder.id);
  }
}

async function deliverOrderConfirmationEmail(email: string, eventId: string, orderId: string): Promise<void> {
  const ticketsUrl = `${env.APP_BASE_URL}/events/${eventId}/orders/${orderId}/tickets?buyer_email=${encodeURIComponent(email)}`;
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
