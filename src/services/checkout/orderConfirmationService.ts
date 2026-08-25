import { pool } from '../../config/database';
import { env } from '../../config/env';
import { ApiError } from '../../utils/errors';
import { generateTicketAccessToken, hashTicketAccessToken } from '../../utils/ticketAccessToken';
import type { OrderRow } from '../../types/db';

// Statuses that imply tickets_issued_at/ticket_access_token_hash are set —
// i.e. payment_intent.succeeded has already run for this order. 'expired'
// and 'pending' are deliberately NOT here: a still-pending or lapsed
// reservation might yet be paid late ("payment always wins" —
// stripeWebhookService), so the client should keep treating it as
// not-ready-yet rather than being told anything more specific.
const TICKETS_ISSUED_STATUSES = new Set(['paid', 'refunded', 'partial_refund']);

export type ConfirmationStatus = 'pending' | 'ready' | 'already_retrieved' | 'expired';

export interface OrderConfirmation {
  status: ConfirmationStatus;
  // Only set when status is 'ready' — the one and only time this route
  // ever hands it out for a given order.
  access_token?: string;
}

/**
 * Polled by the buyer's own browser/app right after paying, using only the
 * orderId it already has from the checkout response — there's nothing else
 * to present at that point (no session for a guest checkout, and the real
 * access token doesn't exist yet). Never returns ticket contents, only a
 * status and, once, a token — so relying on orderId alone here carries a
 * much smaller blast radius than the ticket-viewing route would.
 */
export async function getOrderConfirmation(eventId: string, orderId: string): Promise<OrderConfirmation> {
  const orderResult = await pool.query<OrderRow>(`SELECT * FROM orders WHERE id = $1 AND event_id = $2`, [
    orderId,
    eventId,
  ]);
  const order = orderResult.rows[0];
  if (!order) {
    throw new ApiError(404, 'order_not_found', 'Order not found.', null);
  }

  if (!TICKETS_ISSUED_STATUSES.has(order.status) || !order.tickets_issued_at) {
    return { status: 'pending' };
  }

  if (order.confirmation_token_hash) {
    return { status: 'already_retrieved' };
  }

  const windowMs = env.CONFIRMATION_TOKEN_WINDOW_MINUTES * 60_000;
  if (Date.now() - order.tickets_issued_at.getTime() > windowMs) {
    return { status: 'expired' };
  }

  // Minted here, not at order creation or in the webhook — same reasoning
  // as ticket_access_token_hash: no reason to exist before this exact
  // moment. Independent of that other token (a second hash column, not a
  // second read of the same one) since only the hash of either is ever
  // stored, so there's nothing to "recover" here — this route mints its
  // own on demand instead.
  const confirmationToken = generateTicketAccessToken();

  // Atomic, guarded by the IS NULL check: if two requests race (a client
  // double-poll, a retry after a slow response the client gave up on), the
  // second one's UPDATE affects zero rows because Postgres serializes
  // concurrent UPDATEs to the same row — it doesn't get to hand out a
  // second, different token for the same order.
  const updateResult = await pool.query<OrderRow>(
    `UPDATE orders
     SET confirmation_token_hash = $2
     WHERE id = $1 AND confirmation_token_hash IS NULL
     RETURNING *`,
    [order.id, hashTicketAccessToken(confirmationToken)],
  );
  if (updateResult.rows.length === 0) {
    // Lost the race — someone else's request already claimed it.
    return { status: 'already_retrieved' };
  }

  return { status: 'ready', access_token: confirmationToken };
}
