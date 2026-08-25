import { pool } from '../../config/database';
import { createRefund } from '../stripe/stripeRefunds';
import { sendEmail } from '../email/emailClient';
import { ApiError } from '../../utils/errors';
import { buildPage, decodeCursor, encodeCursor, type CursorPage } from '../../utils/pagination';
import type { OrderRow, OrganizationRow, RefundReason, TicketRow } from '../../types/db';

// The one place this decision is made: whether a refund reverses Intahe's
// application fee back to the buyer depends only on *why* the order is
// being refunded, never on how much is being refunded or which charge mode
// the order used. Per the brief: the organizer cancelling (or postponing,
// treated the same way) means the service Intahe was paid for didn't
// happen, so its fee goes back too; a refund the *buyer* asked for — full
// or partial — means the service (running the checkout, holding the seat)
// was rendered, so the fee stands regardless of refund size.
function shouldReverseApplicationFee(reason: RefundReason): boolean {
  return reason === 'organizer_cancellation' || reason === 'event_postponed';
}

export interface PublicOrder {
  id: string;
  event_id: string;
  buyer_user_id: string | null;
  buyer_email: string;
  subtotal_cents: number;
  stripe_fee_cents: number;
  intahe_fee_cents: number;
  total_cents: number;
  status: string;
  refund_reason: RefundReason | null;
  // The order row itself has no updated_at column — this is the most
  // recent type='refund' transaction's occurred_at, i.e. when the order
  // was last refunded (fully or partially). Null until the first refund.
  refunded_at: string | null;
  created_at: string;
}

export interface PublicTicket {
  id: string;
  ticket_type_id: string;
  qr_code: string;
  attendee_name: string | null;
  attendee_email: string | null;
  checked_in_at: string | null;
}

function toPublicOrder(row: OrderRow, refundedAt: Date | null = null): PublicOrder {
  return {
    id: row.id,
    event_id: row.event_id,
    buyer_user_id: row.buyer_user_id,
    buyer_email: row.buyer_email,
    subtotal_cents: row.subtotal_cents,
    stripe_fee_cents: row.stripe_fee_cents,
    intahe_fee_cents: row.intahe_fee_cents,
    total_cents: row.total_cents,
    status: row.status,
    refund_reason: row.refund_reason,
    refunded_at: refundedAt ? refundedAt.toISOString() : null,
    created_at: row.created_at.toISOString(),
  };
}

function toPublicTicket(row: TicketRow): PublicTicket {
  return {
    id: row.id,
    ticket_type_id: row.ticket_type_id,
    qr_code: row.qr_code,
    attendee_name: row.attendee_name,
    attendee_email: row.attendee_email,
    checked_in_at: row.checked_in_at ? row.checked_in_at.toISOString() : null,
  };
}

export async function listOrdersForEvent(
  eventId: string,
  cursor: string | undefined,
  limit: number,
): Promise<CursorPage<PublicOrder>> {
  const decoded = cursor ? decodeCursor(cursor) : null;

  const result = await pool.query<OrderRow & { cursor_created_at: string; refunded_at: Date | null }>(
    `SELECT o.*, o.created_at::text AS cursor_created_at, refunds.refunded_at
     FROM orders o
     LEFT JOIN LATERAL (
       SELECT MAX(occurred_at) AS refunded_at FROM transactions WHERE order_id = o.id AND type = 'refund'
     ) refunds ON true
     WHERE o.event_id = $1
       AND (
         $2::timestamptz IS NULL
         OR (o.created_at, o.id) < ($2::timestamptz, $3::uuid)
       )
     ORDER BY o.created_at DESC, o.id DESC
     LIMIT $4`,
    [eventId, decoded?.createdAt ?? null, decoded?.id ?? null, limit + 1],
  );

  return buildPage(
    result.rows,
    limit,
    (row) => toPublicOrder(row, row.refunded_at),
    (row) => encodeCursor(row.cursor_created_at, row.id),
  );
}

export async function getOrderForEvent(
  eventId: string,
  orderId: string,
): Promise<{ order: PublicOrder; tickets: PublicTicket[] }> {
  const orderResult = await pool.query<OrderRow>(`SELECT * FROM orders WHERE id = $1 AND event_id = $2`, [
    orderId,
    eventId,
  ]);
  const order = orderResult.rows[0];
  if (!order) {
    throw new ApiError(404, 'order_not_found', 'Order not found.', null);
  }

  const [ticketsResult, refundedAtResult] = await Promise.all([
    pool.query<TicketRow>(`SELECT * FROM tickets WHERE order_id = $1 ORDER BY created_at ASC`, [order.id]),
    pool.query<{ refunded_at: Date | null }>(
      `SELECT MAX(occurred_at) AS refunded_at FROM transactions WHERE order_id = $1 AND type = 'refund'`,
      [order.id],
    ),
  ]);

  return {
    order: toPublicOrder(order, refundedAtResult.rows[0]?.refunded_at ?? null),
    tickets: ticketsResult.rows.map(toPublicTicket),
  };
}

/**
 * Full or partial refund. Multiple partial refunds can stack on the same
 * order as long as their sum never exceeds total_cents — the refundable
 * balance is derived from `transactions` (type = 'refund') rather than
 * stored redundantly on the order, so it can never drift out of sync.
 * Once the balance hits zero the order becomes `refunded`; while some
 * balance remains after a partial refund it's `partial_refund`. Either way
 * the order leaves `status = 'paid'`, which is exactly what makes it drop
 * out of the dashboard's revenue sums automatically.
 */
export async function refundOrder(
  organizationId: string,
  eventId: string,
  orderId: string,
  amountCents: number | undefined,
  reason: RefundReason,
): Promise<PublicOrder> {
  const client = await pool.connect();
  let confirmationEmail: { to: string; amountCents: number; currency: string; orderId: string } | null = null;
  try {
    await client.query('BEGIN');

    const orderResult = await client.query<OrderRow>(
      `SELECT * FROM orders WHERE id = $1 AND event_id = $2 FOR UPDATE`,
      [orderId, eventId],
    );
    const order = orderResult.rows[0];
    if (!order) {
      throw new ApiError(404, 'order_not_found', 'Order not found.', null);
    }
    if (order.status !== 'paid' && order.status !== 'partial_refund') {
      throw new ApiError(
        409,
        'order_not_refundable',
        `Order cannot be refunded from status "${order.status}".`,
        null,
      );
    }
    if (!order.stripe_payment_intent_id) {
      throw new Error('Order is paid but has no stripe_payment_intent_id.');
    }

    const refundedSoFarResult = await client.query<{ total: string | null }>(
      `SELECT SUM(amount_cents) AS total FROM transactions WHERE order_id = $1 AND type = 'refund'`,
      [orderId],
    );
    const refundedSoFar = Number(refundedSoFarResult.rows[0]?.total ?? 0);
    const remaining = order.total_cents - refundedSoFar;
    if (remaining <= 0) {
      throw new ApiError(409, 'order_not_refundable', 'This order has already been fully refunded.', null);
    }

    const requested = amountCents ?? remaining;
    if (!Number.isInteger(requested) || requested <= 0 || requested > remaining) {
      throw new ApiError(
        400,
        'invalid_refund_amount',
        `amount_cents must be a positive integer no greater than the refundable balance (${remaining}).`,
        'amount_cents',
      );
    }

    // order.stripe_charge_mode is written once at order creation and never
    // changed afterwards (see checkoutService.createOrder) — refunding by
    // its recorded mode, rather than the organization's *current* Connect
    // state, is what keeps a refund on an old order correct even after the
    // organization's connected account status has moved on since.
    const orgResult = await client.query<OrganizationRow>(`SELECT * FROM organizations WHERE id = $1`, [
      organizationId,
    ]);
    const org = orgResult.rows[0];
    const connectedAccountId = order.stripe_charge_mode === 'direct' ? (org?.stripe_account_id ?? null) : null;
    const refundApplicationFee = shouldReverseApplicationFee(reason);

    const refund = await createRefund({
      paymentIntentId: order.stripe_payment_intent_id,
      amountCents: requested,
      chargeMode: order.stripe_charge_mode,
      connectedAccountId,
      refundApplicationFee,
    });

    await client.query(
      `INSERT INTO transactions (order_id, type, amount_cents, stripe_object_id, application_fee_refunded, occurred_at)
       VALUES ($1, 'refund', $2, $3, $4, now())`,
      [orderId, requested, refund.id, refundApplicationFee],
    );

    const newStatus = remaining - requested === 0 ? 'refunded' : 'partial_refund';
    const updateResult = await client.query<OrderRow>(
      `UPDATE orders SET status = $2, refund_reason = $3 WHERE id = $1 RETURNING *`,
      [orderId, newStatus, reason],
    );
    const updated = updateResult.rows[0];
    if (!updated) {
      throw new Error('Update to orders did not return a row.');
    }

    // order_line_items don't carry currency themselves — same lookup
    // payoutService uses, via the ticket types actually purchased.
    const currencyResult = await client.query<{ currency: string }>(
      `SELECT tt.currency
       FROM order_line_items oli
       JOIN ticket_types tt ON tt.id = oli.ticket_type_id
       WHERE oli.order_id = $1
       LIMIT 1`,
      [orderId],
    );

    await client.query('COMMIT');
    confirmationEmail = {
      to: updated.buyer_email,
      amountCents: requested,
      currency: currencyResult.rows[0]?.currency ?? 'usd',
      orderId,
    };
    return toPublicOrder(updated, new Date());
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    // Deliberately outside the transaction (and outside the try/catch
    // above, which already resolved either way by this point): the refund
    // is already committed, so a delivery failure here must never look
    // like the refund itself failed, and a slow/failed network call must
    // never lengthen the row lock refundOrder holds via `FOR UPDATE`.
    // Mirrors stripeWebhookService's post-commit confirmation email.
    if (confirmationEmail) {
      await deliverRefundConfirmationEmail(
        confirmationEmail.to,
        confirmationEmail.orderId,
        confirmationEmail.amountCents,
        confirmationEmail.currency,
      );
    }
  }
}

async function deliverRefundConfirmationEmail(
  email: string,
  orderId: string,
  amountCents: number,
  currency: string,
): Promise<void> {
  const formattedAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(
    amountCents / 100,
  );
  try {
    await sendEmail({
      to: email,
      subject: 'Your Intahe refund confirmation',
      html: `<p>Your refund has been processed.</p>
<p>Order reference: <strong>${orderId}</strong></p>
<p>Amount refunded: <strong>${formattedAmount}</strong></p>
<p>Refunds typically appear on your original payment method within 5-10 business days, depending on your bank.</p>`,
    });
  } catch (err) {
    console.error('Failed to send refund confirmation email:', err);
  }
}
