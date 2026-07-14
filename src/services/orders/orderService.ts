import { pool } from '../../config/database';
import { ApiError } from '../../utils/errors';
import { buildPage, decodeCursor, encodeCursor, type CursorPage } from '../../utils/pagination';
import type { OrderRow, TicketRow } from '../../types/db';

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

  const result = await pool.query<OrderRow>(
    `SELECT * FROM orders
     WHERE event_id = $1
       AND (
         $2::timestamptz IS NULL
         OR (created_at, id) < ($2::timestamptz, $3::uuid)
       )
     ORDER BY created_at DESC, id DESC
     LIMIT $4`,
    [eventId, decoded?.createdAt ?? null, decoded?.id ?? null, limit + 1],
  );

  return buildPage(result.rows, limit, toPublicOrder, (row) => encodeCursor(row.created_at, row.id));
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
