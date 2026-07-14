import crypto from 'node:crypto';
import type Stripe from 'stripe';
import { pool } from '../../config/database';
import type { OrderLineItemRow, OrderRow } from '../../types/db';

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    await markOrderPaidAndIssueTickets(paymentIntent.id);
    return;
  }
  // Other event types (e.g. payment_intent.payment_failed) are acknowledged
  // but intentionally ignored: the orders.status enum has no "failed" state
  // in this schema, so a failed attempt just leaves the order pending.
}

async function markOrderPaidAndIssueTickets(paymentIntentId: string): Promise<void> {
  const client = await pool.connect();
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

    await deliverOrderConfirmationEmail(order.buyer_email, order.id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deliverOrderConfirmationEmail(email: string, orderId: string): Promise<void> {
  // TODO: wire up a real transactional email provider, same as password
  // reset. Logging keeps the flow testable end-to-end before that exists.
  console.log(`[order-confirmation] would email ${email} for order ${orderId}`);
}
