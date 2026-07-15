import { pool } from '../../config/database';
import { createRefund } from '../stripe/stripeRefunds';
import { ApiError } from '../../utils/errors';
import { buildPage, decodeCursor, encodeCursor, type CursorPage } from '../../utils/pagination';
import type { OrderRow, OrganizationRow, TicketRow } from '../../types/db';

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

function toPublicOrder(row: OrderRow): PublicOrder {
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

  const result = await pool.query<OrderRow & { cursor_created_at: string }>(
    `SELECT *, created_at::text AS cursor_created_at FROM orders
     WHERE event_id = $1
       AND (
         $2::timestamptz IS NULL
         OR (created_at, id) < ($2::timestamptz, $3::uuid)
       )
     ORDER BY created_at DESC, id DESC
     LIMIT $4`,
    [eventId, decoded?.createdAt ?? null, decoded?.id ?? null, limit + 1],
  );

  return buildPage(result.rows, limit, toPublicOrder, (row) => encodeCursor(row.cursor_created_at, row.id));
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

  const ticketsResult = await pool.query<TicketRow>(
    `SELECT * FROM tickets WHERE order_id = $1 ORDER BY created_at ASC`,
    [order.id],
  );

  return { order: toPublicOrder(order), tickets: ticketsResult.rows.map(toPublicTicket) };
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
): Promise<PublicOrder> {
  const client = await pool.connect();
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

    const orgResult = await client.query<OrganizationRow>(`SELECT * FROM organizations WHERE id = $1`, [
      organizationId,
    ]);
    const reverseTransfer = Boolean(orgResult.rows[0]?.stripe_account_id);

    const refund = await createRefund({
      paymentIntentId: order.stripe_payment_intent_id,
      amountCents: requested,
      reverseTransfer,
    });

    await client.query(
      `INSERT INTO transactions (order_id, type, amount_cents, stripe_object_id, occurred_at)
       VALUES ($1, 'refund', $2, $3, now())`,
      [orderId, requested, refund.id],
    );

    const newStatus = remaining - requested === 0 ? 'refunded' : 'partial_refund';
    const updateResult = await client.query<OrderRow>(`UPDATE orders SET status = $2 WHERE id = $1 RETURNING *`, [
      orderId,
      newStatus,
    ]);
    const updated = updateResult.rows[0];
    if (!updated) {
      throw new Error('Update to orders did not return a row.');
    }

    await client.query('COMMIT');
    return toPublicOrder(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
