import { pool } from '../../config/database';
import { ApiError } from '../../utils/errors';
import { buildPage, decodeCursor, encodeCursor, type CursorPage } from '../../utils/pagination';

export interface PublicTicket {
  id: string;
  order_id: string;
  ticket_type_id: string;
  qr_code: string;
  attendee_name: string | null;
  attendee_email: string | null;
  checked_in_at: string | null;
  checked_in_by: string | null;
}

export interface GuestListEntry extends PublicTicket {
  ticket_type_name: string;
  buyer_email: string;
}

interface TicketJoinRow {
  id: string;
  order_id: string;
  ticket_type_id: string;
  qr_code: string;
  attendee_name: string | null;
  attendee_email: string | null;
  checked_in_at: Date | null;
  checked_in_by: string | null;
  created_at: Date;
  ticket_type_name: string;
  buyer_email: string;
}

interface TicketJoinRowWithCursor extends TicketJoinRow {
  cursor_created_at: string;
}

// tickets only stores order_id/ticket_type_id, not event_id, so every
// lookup here joins through orders to scope by event — this is what makes
// check-in and the guest list impossible to reach across events, even
// within the same organization, as the brief requires.
const TICKET_JOIN_SELECT = `
  SELECT t.*, tt.name AS ticket_type_name, o.buyer_email
  FROM tickets t
  JOIN orders o ON o.id = t.order_id
  JOIN ticket_types tt ON tt.id = t.ticket_type_id
`;

function toPublicTicket(row: TicketJoinRow): PublicTicket {
  return {
    id: row.id,
    order_id: row.order_id,
    ticket_type_id: row.ticket_type_id,
    qr_code: row.qr_code,
    attendee_name: row.attendee_name,
    attendee_email: row.attendee_email,
    checked_in_at: row.checked_in_at ? row.checked_in_at.toISOString() : null,
    checked_in_by: row.checked_in_by,
  };
}

function toGuestListEntry(row: TicketJoinRow): GuestListEntry {
  return {
    ...toPublicTicket(row),
    ticket_type_name: row.ticket_type_name,
    buyer_email: row.buyer_email,
  };
}

export async function checkInTicket(
  eventId: string,
  qrCode: string,
  checkedInByUserId: string,
): Promise<GuestListEntry> {
  const existingResult = await pool.query<TicketJoinRow>(
    `${TICKET_JOIN_SELECT} WHERE t.qr_code = $1 AND o.event_id = $2`,
    [qrCode, eventId],
  );
  const existing = existingResult.rows[0];
  if (!existing) {
    throw new ApiError(404, 'ticket_not_found', 'Ticket not found.', 'qr_code');
  }
  if (existing.checked_in_at) {
    throw new ApiError(409, 'ticket_already_checked_in', 'This ticket has already been checked in.', null);
  }

  const updateResult = await pool.query<{ checked_in_at: Date; checked_in_by: string }>(
    `UPDATE tickets SET checked_in_at = now(), checked_in_by = $2
     WHERE id = $1 AND checked_in_at IS NULL
     RETURNING checked_in_at, checked_in_by`,
    [existing.id, checkedInByUserId],
  );
  const updated = updateResult.rows[0];
  if (!updated) {
    // Lost a race with a concurrent scan of the same ticket.
    throw new ApiError(409, 'ticket_already_checked_in', 'This ticket has already been checked in.', null);
  }

  return toGuestListEntry({
    ...existing,
    checked_in_at: updated.checked_in_at,
    checked_in_by: updated.checked_in_by,
  });
}

export async function listGuestList(
  eventId: string,
  cursor: string | undefined,
  limit: number,
): Promise<CursorPage<GuestListEntry>> {
  const decoded = cursor ? decodeCursor(cursor) : null;

  const result = await pool.query<TicketJoinRowWithCursor>(
    `SELECT t.*, tt.name AS ticket_type_name, o.buyer_email, t.created_at::text AS cursor_created_at
     FROM tickets t
     JOIN orders o ON o.id = t.order_id
     JOIN ticket_types tt ON tt.id = t.ticket_type_id
     WHERE o.event_id = $1
       AND (
         $2::timestamptz IS NULL
         OR (t.created_at, t.id) < ($2::timestamptz, $3::uuid)
       )
     ORDER BY t.created_at DESC, t.id DESC
     LIMIT $4`,
    [eventId, decoded?.createdAt ?? null, decoded?.id ?? null, limit + 1],
  );

  return buildPage(result.rows, limit, toGuestListEntry, (row) => encodeCursor(row.cursor_created_at, row.id));
}
