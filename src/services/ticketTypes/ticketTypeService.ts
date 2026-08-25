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

// expiredPendingQuantity subtracts reservations that have timed out but
// haven't been swept by the lazy release yet — without this, a ticket type
// whose stock is entirely tied up by abandoned carts reads as sold out
// forever: nobody can see it's actually available, so nobody goes to
// checkout, so the lazy release (which only runs inside
// checkoutService.reserveInventory) never fires. Applied everywhere a
// ticket type is read back (get/update/list) — defaults to 0 only for
// createTicketType, where quantity_sold is always freshly 0.
function toPublicTicketType(row: TicketTypeRow, expiredPendingQuantity = 0): PublicTicketType {
  return {
    id: row.id,
    event_id: row.event_id,
    name: row.name,
    price_cents: row.price_cents,
    currency: row.currency,
    quantity_total: row.quantity_total,
    quantity_sold: Math.max(0, row.quantity_sold - expiredPendingQuantity),
    sale_starts_at: row.sale_starts_at ? row.sale_starts_at.toISOString() : null,
    sale_ends_at: row.sale_ends_at ? row.sale_ends_at.toISOString() : null,
    created_at: row.created_at.toISOString(),
  };
}

function notFound(): ApiError {
  return new ApiError(404, 'ticket_type_not_found', 'Ticket type not found.', null);
}

/**
 * The actual gate on "can this organization sell paid tickets" — not
 * publishing the event, which a fully free event (a webinar, an AGM) never
 * needs Stripe for at all. Applied to every write that would result in a
 * ticket type with price_cents > 0: creating one outright, or raising an
 * existing (possibly free) one above 0. Checked fresh on every such write
 * rather than once at creation time, since stripe_charges_enabled can
 * regress after the fact (a compliance hold synced via the account.updated
 * webhook) — a ticket type created while charges were enabled must not stay
 * sellable once they aren't.
 */
async function assertOrganizationCanSellPaidTickets(organizationId: string): Promise<void> {
  const result = await pool.query<{ stripe_account_id: string | null; stripe_charges_enabled: boolean }>(
    `SELECT stripe_account_id, stripe_charges_enabled FROM organizations WHERE id = $1`,
    [organizationId],
  );
  const org = result.rows[0];
  if (!org?.stripe_account_id || !org.stripe_charges_enabled) {
    throw new ApiError(
      409,
      'stripe_not_connected',
      'Connect a Stripe account and complete verification before selling paid tickets.',
      'price_cents',
    );
  }
}

// Single-row counterpart to listTicketTypes's LEFT JOIN LATERAL below —
// same condition, just queried separately since there's only one ticket
// type here rather than a page of them. Used by every read/write path in
// this file except createTicketType (a fresh row always has
// quantity_sold = 0, so there's nothing to subtract from).
async function getExpiredPendingQuantity(ticketTypeId: string): Promise<number> {
  const result = await pool.query<{ qty: string | null }>(
    `SELECT SUM(oli.quantity) AS qty
     FROM order_line_items oli
     JOIN orders o ON o.id = oli.order_id
     WHERE oli.ticket_type_id = $1
       AND o.status = 'pending'
       AND o.reservation_expires_at IS NOT NULL
       AND o.reservation_expires_at < now()`,
    [ticketTypeId],
  );
  return Number(result.rows[0]?.qty ?? 0);
}

export async function createTicketType(
  organizationId: string,
  eventId: string,
  input: CreateTicketTypeInput,
): Promise<PublicTicketType> {
  if (input.price_cents > 0) {
    await assertOrganizationCanSellPaidTickets(organizationId);
  }

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
  return toPublicTicketType(row, await getExpiredPendingQuantity(row.id));
}

export async function updateTicketType(
  organizationId: string,
  eventId: string,
  ticketTypeId: string,
  patch: UpdateTicketTypeInput,
): Promise<PublicTicketType> {
  if (typeof patch.price_cents === 'number' && patch.price_cents > 0) {
    await assertOrganizationCanSellPaidTickets(organizationId);
  }

  const fields: Array<[string, unknown]> = [];
  if ('name' in patch) fields.push(['name', patch.name]);
  if ('price_cents' in patch) fields.push(['price_cents', patch.price_cents]);
  if ('quantity_total' in patch) fields.push(['quantity_total', patch.quantity_total]);
  if ('sale_starts_at' in patch) fields.push(['sale_starts_at', patch.sale_starts_at]);
  if ('sale_ends_at' in patch) fields.push(['sale_ends_at', patch.sale_ends_at]);

  if (fields.length === 0) {
    throw new ApiError(400, 'validation_error', 'At least one field must be provided.', null);
  }

  // An organizer lowering quantity_total below what's already sold is
  // rejected here at the application level — it used to be caught by a DB
  // CHECK constraint (quantity_sold <= quantity_total), dropped because it
  // also silently broke "payment always wins" (see orderReleaseService's
  // reReserveAfterLatePayment, which legitimately needs to push
  // quantity_sold past quantity_total). That was a DB-level invariant
  // serving two different concerns; this one is purely this organizer
  // action's own validation.
  if (typeof patch.quantity_total === 'number') {
    const currentResult = await pool.query<{ quantity_sold: number }>(
      `SELECT quantity_sold FROM ticket_types WHERE id = $1 AND event_id = $2`,
      [ticketTypeId, eventId],
    );
    const current = currentResult.rows[0];
    if (!current) {
      throw notFound();
    }
    if (patch.quantity_total < current.quantity_sold) {
      throw new ApiError(
        400,
        'invalid_input',
        'quantity_total cannot be lower than the quantity already sold.',
        'quantity_total',
      );
    }
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
  return toPublicTicketType(row, await getExpiredPendingQuantity(row.id));
}

interface TicketTypeListRow extends TicketTypeRow {
  cursor_created_at: string;
  // bigint from SUM() — node-postgres returns it as a numeric-looking
  // string to avoid silent precision loss, same convention as
  // dashboardService's SUM() columns.
  expired_pending_quantity: string;
}

export async function listTicketTypes(
  eventId: string,
  cursor: string | undefined,
  limit: number,
): Promise<CursorPage<PublicTicketType>> {
  const decoded = cursor ? decodeCursor(cursor) : null;

  const result = await pool.query<TicketTypeListRow>(
    `SELECT tt.*, tt.created_at::text AS cursor_created_at,
            COALESCE(expired.qty, 0) AS expired_pending_quantity
     FROM ticket_types tt
     LEFT JOIN LATERAL (
       -- Same "expired but not yet released" condition as
       -- orderReleaseService.releaseExpiredReservations — mirrored here as
       -- a pure read-side correction rather than a write, so a public GET
       -- never mutates state.
       SELECT SUM(oli.quantity) AS qty
       FROM order_line_items oli
       JOIN orders o ON o.id = oli.order_id
       WHERE oli.ticket_type_id = tt.id
         AND o.status = 'pending'
         AND o.reservation_expires_at IS NOT NULL
         AND o.reservation_expires_at < now()
     ) expired ON true
     WHERE tt.event_id = $1
       AND (
         $2::timestamptz IS NULL
         OR (tt.created_at, tt.id) < ($2::timestamptz, $3::uuid)
       )
     ORDER BY tt.created_at DESC, tt.id DESC
     LIMIT $4`,
    [eventId, decoded?.createdAt ?? null, decoded?.id ?? null, limit + 1],
  );

  return buildPage(
    result.rows,
    limit,
    (row) => toPublicTicketType(row, Number(row.expired_pending_quantity)),
    (row) => encodeCursor(row.cursor_created_at, row.id),
  );
}
