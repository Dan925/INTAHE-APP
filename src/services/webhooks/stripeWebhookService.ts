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
import { escapeHtml, renderEmailButton, renderEmailLayout } from '../email/emailLayout';
import { retrieveAccount } from '../stripe/stripeConnect';
import { generateTicketAccessToken, hashTicketAccessToken } from '../../utils/ticketAccessToken';
import { markQuickSaleFailed, markQuickSalePaidAndPayOut } from '../quickSales/quickSaleService';
import type { AppliedTaxLine, Locale, OrderLineItemRow, OrderRow } from '../../types/db';

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

interface ConfirmedOrderLineItem {
  ticketTypeName: string;
  quantity: number;
  unitPriceCents: number;
}

interface ConfirmedOrder {
  id: string;
  eventId: string;
  eventName: string;
  buyerEmail: string;
  buyerLocale: Locale;
  ticketAccessToken: string;
  currency: string;
  subtotalCents: number;
  taxCents: number;
  taxLines: AppliedTaxLine[];
  stripeFeeCents: number;
  intaheFeeCents: number;
  totalCents: number;
  lineItems: ConfirmedOrderLineItem[];
  capacityOvershootIncidents: CapacityOvershootIncident[];
}

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    // metadata.quick_sale_id vs. order_id is how a single webhook endpoint
    // tells a ticket-order PaymentIntent apart from a quick-sale one — see
    // stripePayments.createPaymentIntent/createQuickSalePaymentIntent,
    // the only two places that set this metadata.
    if (paymentIntent.metadata?.['quick_sale_id']) {
      await markQuickSalePaidAndPayOut(paymentIntent.id);
    } else {
      await markOrderPaidAndIssueTickets(paymentIntent.id);
    }
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
    if (paymentIntent.metadata?.['quick_sale_id']) {
      await markQuickSaleFailed(paymentIntent.id);
    } else {
      await releaseOrderByPaymentIntentId(paymentIntent.id);
    }
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

/**
 * Exported so paymentReconciliationService's admin-triggered reissue action
 * can go through the exact same transaction as the real webhook path — same
 * idempotency guard (a 'paid' order is a no-op), same late-payment
 * re-reservation, same confirmation email — rather than a second
 * hand-maintained copy of "how a paid order gets its tickets."
 */
export async function markOrderPaidAndIssueTickets(paymentIntentId: string): Promise<void> {
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

    // For the confirmation email's itemized receipt — ticket_type name and
    // currency aren't on order_line_items itself (unit_price_cents is
    // snapshotted there, but the name/currency are looked up fresh here;
    // safe because a ticket type is never renamed after tickets are sold
    // in a way that would make a past receipt look wrong in practice).
    const ticketTypeNamesResult = await client.query<{ id: string; name: string; currency: string }>(
      `SELECT id, name, currency FROM ticket_types WHERE id = ANY($1::uuid[])`,
      [lineItemsResult.rows.map((line) => line.ticket_type_id)],
    );
    const ticketTypeById = new Map(ticketTypeNamesResult.rows.map((tt) => [tt.id, tt]));
    const eventNameResult = await client.query<{ name: string }>(`SELECT name FROM events WHERE id = $1`, [
      order.event_id,
    ]);

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
      eventName: eventNameResult.rows[0]?.name ?? 'your event',
      buyerEmail: order.buyer_email,
      buyerLocale: order.buyer_locale,
      ticketAccessToken,
      currency: ticketTypeNamesResult.rows[0]?.currency ?? 'usd',
      subtotalCents: order.subtotal_cents,
      taxCents: order.tax_cents,
      taxLines: order.tax_lines,
      stripeFeeCents: order.stripe_fee_cents,
      intaheFeeCents: order.intahe_fee_cents,
      totalCents: order.total_cents,
      lineItems: lineItemsResult.rows.map((line) => ({
        ticketTypeName: ticketTypeById.get(line.ticket_type_id)?.name ?? 'Ticket',
        quantity: line.quantity,
        unitPriceCents: line.unit_price_cents,
      })),
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
    await deliverOrderConfirmationEmail(confirmedOrder);
    for (const incident of confirmedOrder.capacityOvershootIncidents) {
      await notifyCapacityOvershoot(incident);
    }
  }
}

function formatMoney(cents: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-CA' : 'en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

const ORDER_CONFIRMATION_COPY: Record<
  Locale,
  { subject: (eventName: string) => string; intro: (eventName: string) => string; orderRef: string; subtotal: string; fee: string; total: string; viewTickets: string }
> = {
  en: {
    subject: (eventName) => `Your order for ${eventName} is confirmed`,
    intro: (eventName) => `Thanks for your purchase! Your tickets for <strong>${eventName}</strong> are confirmed — see you there.`,
    orderRef: 'Order reference',
    subtotal: 'Subtotal',
    fee: 'Service fee',
    total: 'Total paid',
    viewTickets: 'View your tickets',
  },
  fr: {
    subject: (eventName) => `Ta commande pour ${eventName} est confirmée`,
    intro: (eventName) => `Merci pour ton achat! Tes billets pour <strong>${eventName}</strong> sont confirmés — on se voit là-bas.`,
    orderRef: 'Numéro de commande',
    subtotal: 'Sous-total',
    fee: 'Frais de service',
    total: 'Total payé',
    viewTickets: 'Voir mes billets',
  },
};

async function deliverOrderConfirmationEmail(order: ConfirmedOrder): Promise<void> {
  const ticketsUrl = `${env.APP_BASE_URL}/events/${order.eventId}/orders/${order.id}/tickets?token=${encodeURIComponent(order.ticketAccessToken)}`;
  const copy = ORDER_CONFIRMATION_COPY[order.buyerLocale];
  const eventName = escapeHtml(order.eventName);

  const lineItemsHtml = order.lineItems
    .map(
      (line) =>
        `<tr><td>${line.quantity} × ${escapeHtml(line.ticketTypeName)}</td><td style="text-align:right">${formatMoney(line.unitPriceCents * line.quantity, order.currency, order.buyerLocale)}</td></tr>`,
    )
    .join('');
  const taxLinesHtml = order.taxLines
    .map(
      (line) =>
        `<tr><td>${escapeHtml(line.label)} (${line.rate_percent}%)</td><td style="text-align:right">${formatMoney(line.amount_cents, order.currency, order.buyerLocale)}</td></tr>`,
    )
    .join('');
  const feesCents = order.totalCents - order.subtotalCents - order.taxCents;

  try {
    await sendEmail({
      to: order.buyerEmail,
      subject: copy.subject(eventName),
      html: renderEmailLayout({
        locale: order.buyerLocale,
        bodyHtml: `<p>${copy.intro(eventName)}</p>
<p style="color:#6b5d4c;font-size:13px;">${copy.orderRef}: <strong>${order.id}</strong></p>
<table cellpadding="4" style="border-collapse:collapse;width:100%;max-width:400px">
${lineItemsHtml}
<tr><td>${copy.subtotal}</td><td style="text-align:right">${formatMoney(order.subtotalCents, order.currency, order.buyerLocale)}</td></tr>
${taxLinesHtml}
${feesCents > 0 ? `<tr><td>${copy.fee}</td><td style="text-align:right">${formatMoney(feesCents, order.currency, order.buyerLocale)}</td></tr>` : ''}
<tr><td><strong>${copy.total}</strong></td><td style="text-align:right"><strong>${formatMoney(order.totalCents, order.currency, order.buyerLocale)}</strong></td></tr>
</table>
<p>${renderEmailButton(ticketsUrl, copy.viewTickets)}</p>`,
      }),
    });
  } catch (err) {
    console.error('Failed to send order confirmation email:', err);
  }
}
