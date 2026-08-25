import type { PoolClient } from 'pg';
import { pool } from '../../config/database';
import { env } from '../../config/env';
import type { OrderLineItemRow, OrderRow } from '../../types/db';

/**
 * Gives back the ticket-type inventory an order reserved and marks it
 * 'expired'. Pure write — the caller must already hold a row lock on
 * `order` (via `SELECT ... FOR UPDATE`) and must have confirmed
 * `order.status === 'pending'` first, since this doesn't re-check either.
 * Shared by the lazy sweep below, the payment_intent.canceled/
 * payment_failed webhook handlers, and nothing else — every release in
 * this codebase goes through here so there's exactly one place that
 * decrements quantity_sold.
 */
async function writeRelease(client: PoolClient, order: OrderRow): Promise<void> {
  const lineItemsResult = await client.query<OrderLineItemRow>(
    `SELECT * FROM order_line_items WHERE order_id = $1`,
    [order.id],
  );
  for (const line of lineItemsResult.rows) {
    await client.query(`UPDATE ticket_types SET quantity_sold = quantity_sold - $2 WHERE id = $1`, [
      line.ticket_type_id,
      line.quantity,
    ]);
  }
  await client.query(`UPDATE orders SET status = 'expired' WHERE id = $1`, [order.id]);
}

/**
 * Undoes writeRelease's decrement for an order a late Stripe success is
 * about to mark paid despite already being released — "payment always
 * wins" per the brief: Stripe already moved real money, so the ticket
 * types' quantity_sold must reflect that even though the reservation had
 * already lapsed. Deliberately does NOT re-check capacity (unlike the
 * conditional UPDATE reserveInventory uses for a *new* reservation) —
 * there's nothing to reject a completed payment back into, so this always
 * succeeds. Whoever else may have bought the freed capacity in the
 * meantime is an accepted, narrow race the brief chose to allow rather
 * than ever refusing a confirmed payment.
 */
async function reReserveAfterLatePayment(client: PoolClient, orderId: string): Promise<void> {
  const lineItemsResult = await client.query<OrderLineItemRow>(
    `SELECT * FROM order_line_items WHERE order_id = $1`,
    [orderId],
  );
  for (const line of lineItemsResult.rows) {
    await client.query(`UPDATE ticket_types SET quantity_sold = quantity_sold + $2 WHERE id = $1`, [
      line.ticket_type_id,
      line.quantity,
    ]);
  }
}

export { reReserveAfterLatePayment };

/**
 * Called immediately from the payment_intent.canceled / payment_failed
 * webhook handlers — no need to wait for the reservation to time out once
 * Stripe has already told us the payment isn't going to happen (for
 * payment_failed specifically: the same PaymentIntent can still be retried
 * with a different card, so this releases eagerly and relies on
 * reReserveAfterLatePayment above if that retry later succeeds, rather
 * than trying to guess whether a retry is coming).
 */
export async function releaseOrderByPaymentIntentId(paymentIntentId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query<OrderRow>(
      `SELECT * FROM orders WHERE stripe_payment_intent_id = $1 FOR UPDATE`,
      [paymentIntentId],
    );
    const order = orderResult.rows[0];
    // No matching order, or it already left 'pending' (paid — payment
    // won a race with this cancellation/failure event; already expired —
    // some other release beat this one to it; refunded, etc.) — release
    // only ever applies to a still-pending reservation.
    if (!order || order.status !== 'pending') {
      await client.query('ROLLBACK');
      return;
    }
    await writeRelease(client, order);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * The lazy-release side of the mechanism: called from inside
 * checkoutService's reservation transaction, right before it reserves
 * inventory for a *new* order, scoped to just the ticket types that new
 * order needs. Finds any 'pending' orders on those ticket types whose
 * reservation has timed out and releases them first, so the capacity
 * they were holding is available for the conditional UPDATE that follows
 * in the same transaction. Runs on the same `client`/transaction as the
 * caller (no separate BEGIN/COMMIT here) — if the new order's own
 * reservation subsequently fails for any reason, these releases roll back
 * with it, which is fine: they were genuinely expired and remain eligible
 * for release the next time anyone tries to buy this ticket type.
 */
export async function releaseExpiredReservations(client: PoolClient, ticketTypeIds: string[]): Promise<void> {
  if (ticketTypeIds.length === 0) return;

  // A plain JOIN against order_line_items would need DISTINCT to collapse
  // an order with several matching line items back to one row — and
  // Postgres rejects DISTINCT combined with FOR UPDATE outright ("FOR
  // UPDATE is not allowed with DISTINCT clause"). EXISTS sidesteps that:
  // the outer SELECT stays a single-table query against orders, so the
  // row lock applies cleanly.
  const expiredOrdersResult = await client.query<OrderRow>(
    `SELECT * FROM orders o
     WHERE o.status = 'pending'
       AND o.reservation_expires_at IS NOT NULL
       AND o.reservation_expires_at < now()
       AND EXISTS (
         SELECT 1 FROM order_line_items oli
         WHERE oli.order_id = o.id AND oli.ticket_type_id = ANY($1::uuid[])
       )
     FOR UPDATE`,
    [ticketTypeIds],
  );

  for (const order of expiredOrdersResult.rows) {
    await writeRelease(client, order);
  }
}

/** `now() + ORDER_RESERVATION_TTL_MINUTES`, computed in JS so it's easy to assert on in tests. */
export function computeReservationExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + env.ORDER_RESERVATION_TTL_MINUTES * 60_000);
}
