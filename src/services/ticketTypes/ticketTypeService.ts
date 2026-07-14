import { pool } from '../../config/database';
import { ApiError } from '../../utils/errors';
import { buildPage, decodeCursor, encodeCursor, type CursorPage } from '../../utils/pagination';
import type { TicketTypeRow } from '../../types/db';

export interface CreateTicketTypeInput {
  name: string;
  price_cents: number;
  currency?: string | undefined;
  quantity_total: number;
  sale_starts_at?: string | undefined;
  sale_ends_at?: string | undefined;
}

export interface UpdateTicketTypeInput {
  name?: string | undefined;
  price_cents?: number | undefined;
  quantity_total?: number | undefined;
  sale_starts_at?: string | null | undefined;
  sale_ends_at?: string | null | undefined;
}

export interface PublicTicketType {
  id: string;
  event_id: string;
  name: string;
  price_cents: number;
  currency: string;
  quantity_total: number;
  quantity_sold: number;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  created_at: string;
}

function toPublicTicketType(row: TicketTypeRow): PublicTicketType {
  return {
    id: row.id,
    event_id: row.event_id,
    name: row.name,
    price_cents: row.price_cents,
    currency: row.currency,
    quantity_total: row.quantity_total,
    quantity_sold: row.quantity_sold,
    sale_starts_at: row.sale_starts_at ? row.sale_starts_at.toISOString() : null,
    sale_ends_at: row.sale_ends_at ? row.sale_ends_at.toISOString() : null,
    created_at: row.created_at.toISOString(),
  };
}

function notFound(): ApiError {
  return new ApiError(404, 'ticket_type_not_found', 'Ticket type not found.', null);
}

export async function createTicketType(
  eventId: string,
  input: CreateTicketTypeInput,
): Promise<PublicTicketType> {
  const result = await pool.query<TicketTypeRow>(
    `INSERT INTO ticket_types (event_id, name, price_cents, currency, quantity_total, sale_starts_at, sale_ends_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      eventId,
      input.name,
      input.price_cents,
      input.currency ?? 'usd',
      input.quantity_total,
      input.sale_starts_at ?? null,
      input.sale_ends_at ?? null,
    ],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('Insert into ticket_types did not return a row.');
  }
  return toPublicTicketType(row);
}

export async function getTicketType(eventId: string, ticketTypeId: string): Promise<PublicTicketType> {
  const result = await pool.query<TicketTypeRow>(
    `SELECT * FROM ticket_types WHERE id = $1 AND event_id = $2`,
    [ticketTypeId, eventId],
  );
  const row = result.rows[0];
  if (!row) {
    throw notFound();
  }
  return toPublicTicketType(row);
}

export async function updateTicketType(
  eventId: string,
  ticketTypeId: string,
  patch: UpdateTicketTypeInput,
): Promise<PublicTicketType> {
  const fields: Array<[string, unknown]> = [];
  if ('name' in patch) fields.push(['name', patch.name]);
  if ('price_cents' in patch) fields.push(['price_cents', patch.price_cents]);
  if ('quantity_total' in patch) fields.push(['quantity_total', patch.quantity_total]);
  if ('sale_starts_at' in patch) fields.push(['sale_starts_at', patch.sale_starts_at]);
  if ('sale_ends_at' in patch) fields.push(['sale_ends_at', patch.sale_ends_at]);

  if (fields.length === 0) {
    throw new ApiError(400, 'validation_error', 'At least one field must be provided.', null);
  }

  const setClause = fields.map(([column], i) => `${column} = $${i + 3}`).join(', ');
  const values = fields.map(([, value]) => value);

  const result = await pool.query<TicketTypeRow>(
    `UPDATE ticket_types SET ${setClause} WHERE id = $1 AND event_id = $2 RETURNING *`,
    [ticketTypeId, eventId, ...values],
  );
  const row = result.rows[0];
  if (!row) {
    throw notFound();
  }
  return toPublicTicketType(row);
}

export async function listTicketTypes(
  eventId: string,
  cursor: string | undefined,
  limit: number,
): Promise<CursorPage<PublicTicketType>> {
  const decoded = cursor ? decodeCursor(cursor) : null;

  const result = await pool.query<TicketTypeRow>(
    `SELECT * FROM ticket_types
     WHERE event_id = $1
       AND (
         $2::timestamptz IS NULL
         OR (created_at, id) < ($2::timestamptz, $3::uuid)
       )
     ORDER BY created_at DESC, id DESC
     LIMIT $4`,
    [eventId, decoded?.createdAt ?? null, decoded?.id ?? null, limit + 1],
  );

  return buildPage(result.rows, limit, toPublicTicketType, (row) => encodeCursor(row.created_at, row.id));
}
