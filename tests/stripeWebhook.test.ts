import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { pool } from '../src/config/database';
import { releaseOrderByPaymentIntentId } from '../src/services/checkout/orderReleaseService';
import { sendEmail } from '../src/services/email/emailClient';
import { stripeClient } from '../src/services/stripe/stripeClient';
import { createPaymentIntent } from '../src/services/stripe/stripePayments';
import { truncateAllTables } from './helpers/db';
import { createOrgAndPublishedEvent, createTicketType } from './helpers/checkoutFixtures';

jest.mock('../src/services/stripe/stripePayments');
jest.mock('../src/services/email/emailClient');

const mockCreatePaymentIntent = createPaymentIntent as jest.MockedFunction<typeof createPaymentIntent>;
const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;

const app = createApp();

beforeEach(async () => {
  await truncateAllTables();
  jest.clearAllMocks();
  mockSendEmail.mockResolvedValue(undefined);
});

afterAll(async () => {
  await pool.end();
});

function signedWebhookRequest(eventPayload: unknown) {
  const payload = JSON.stringify(eventPayload);
  const signature = stripeClient.webhooks.generateTestHeaderString({
    payload,
    secret: env.STRIPE_WEBHOOK_SECRET,
  });
  return request(app)
    .post('/v1/stripe/webhook')
    .set('Content-Type', 'application/json')
    .set('Stripe-Signature', signature)
    .send(payload);
}

async function createPendingOrder(paymentIntentId: string) {
  const fixture = await createOrgAndPublishedEvent(app);
  const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
    quantity_total: 10,
  });
  mockCreatePaymentIntent.mockResolvedValueOnce({
    id: paymentIntentId,
    client_secret: `${paymentIntentId}_secret`,
  } as never);

  const checkoutRes = await request(app)
    .post(`/v1/events/${fixture.event.id}/orders`)
    .set('Idempotency-Key', crypto.randomUUID())
    .send({ buyer_email: 'buyer@example.com', line_items: [{ ticket_type_id: ticketType.id, quantity: 2 }] });

  return {
    ...fixture,
    ticketType,
    order: checkoutRes.body.order,
    ticketAccessToken: checkoutRes.body.ticket_access_token as string,
  };
}

describe('POST /v1/stripe/webhook', () => {
  it('rejects a request with an invalid signature', async () => {
    const res = await request(app)
      .post('/v1/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', 't=1,v1=deadbeef')
      .send(JSON.stringify({ id: 'evt_test', type: 'payment_intent.succeeded' }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_webhook_signature');
  });

  it('marks the order paid and issues one ticket per unit purchased on payment_intent.succeeded', async () => {
    const paymentIntentId = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
    const { order, ticketType, ticketAccessToken } = await createPendingOrder(paymentIntentId);

    const res = await signedWebhookRequest({
      id: `evt_${crypto.randomBytes(6).toString('hex')}`,
      object: 'event',
      type: 'payment_intent.succeeded',
      data: { object: { id: paymentIntentId, metadata: { ticket_access_token: ticketAccessToken } } },
    });

    expect(res.status).toBe(200);

    const orderRow = await pool.query('SELECT status FROM orders WHERE id = $1', [order.id]);
    expect(orderRow.rows[0].status).toBe('paid');

    const tickets = await pool.query('SELECT qr_code, ticket_type_id FROM tickets WHERE order_id = $1', [
      order.id,
    ]);
    expect(tickets.rows).toHaveLength(2);
    expect(new Set(tickets.rows.map((r) => r.qr_code)).size).toBe(2);
    expect(tickets.rows.every((r) => r.ticket_type_id === ticketType.id)).toBe(true);

    const transactions = await pool.query('SELECT type, amount_cents FROM transactions WHERE order_id = $1', [
      order.id,
    ]);
    expect(transactions.rows).toEqual([{ type: 'charge', amount_cents: order.total_cents }]);
  });

  it('sends the confirmation email with a token-based tickets link, never the buyer_email in the URL', async () => {
    const paymentIntentId = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
    const { order, ticketAccessToken } = await createPendingOrder(paymentIntentId);

    await signedWebhookRequest({
      id: `evt_${crypto.randomBytes(6).toString('hex')}`,
      object: 'event',
      type: 'payment_intent.succeeded',
      data: { object: { id: paymentIntentId, metadata: { ticket_access_token: ticketAccessToken } } },
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const emailHtml = mockSendEmail.mock.calls[0]?.[0]?.html ?? '';
    expect(emailHtml).toContain(`/orders/${order.id}/tickets?token=${ticketAccessToken}`);
    expect(emailHtml).not.toContain('buyer_email');
    expect(emailHtml).not.toContain(order.buyer_email);
  });

  it('is idempotent when Stripe redelivers the same event', async () => {
    const paymentIntentId = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
    const { order, ticketAccessToken } = await createPendingOrder(paymentIntentId);
    const eventPayload = {
      id: `evt_${crypto.randomBytes(6).toString('hex')}`,
      object: 'event',
      type: 'payment_intent.succeeded',
      data: { object: { id: paymentIntentId, metadata: { ticket_access_token: ticketAccessToken } } },
    };

    await signedWebhookRequest(eventPayload);
    const second = await signedWebhookRequest(eventPayload);

    expect(second.status).toBe(200);
    const tickets = await pool.query('SELECT id FROM tickets WHERE order_id = $1', [order.id]);
    expect(tickets.rows).toHaveLength(2);
    const transactions = await pool.query('SELECT id FROM transactions WHERE order_id = $1', [order.id]);
    expect(transactions.rows).toHaveLength(1);
  });

  it('acknowledges but ignores unrelated event types', async () => {
    const res = await signedWebhookRequest({
      id: `evt_${crypto.randomBytes(6).toString('hex')}`,
      object: 'event',
      type: 'charge.refunded',
      data: { object: { id: 'ch_test' } },
    });

    expect(res.status).toBe(200);
  });

  it('releases inventory and marks the order expired on payment_intent.canceled', async () => {
    const paymentIntentId = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
    const { order, ticketType } = await createPendingOrder(paymentIntentId);

    const res = await signedWebhookRequest({
      id: `evt_${crypto.randomBytes(6).toString('hex')}`,
      object: 'event',
      type: 'payment_intent.canceled',
      data: { object: { id: paymentIntentId } },
    });

    expect(res.status).toBe(200);
    const orderRow = await pool.query('SELECT status FROM orders WHERE id = $1', [order.id]);
    expect(orderRow.rows[0].status).toBe('expired');
    const ttRow = await pool.query('SELECT quantity_sold FROM ticket_types WHERE id = $1', [ticketType.id]);
    expect(ttRow.rows[0].quantity_sold).toBe(0);
  });

  it('releases inventory and marks the order expired on payment_intent.payment_failed (a declined card)', async () => {
    const paymentIntentId = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
    const { order, ticketType } = await createPendingOrder(paymentIntentId);

    const res = await signedWebhookRequest({
      id: `evt_${crypto.randomBytes(6).toString('hex')}`,
      object: 'event',
      type: 'payment_intent.payment_failed',
      data: { object: { id: paymentIntentId } },
    });

    expect(res.status).toBe(200);
    const orderRow = await pool.query('SELECT status FROM orders WHERE id = $1', [order.id]);
    expect(orderRow.rows[0].status).toBe('expired');
    const ttRow = await pool.query('SELECT quantity_sold FROM ticket_types WHERE id = $1', [ticketType.id]);
    expect(ttRow.rows[0].quantity_sold).toBe(0);
  });

  it('payment always wins: a late payment_intent.succeeded re-reserves inventory and issues tickets even after the order already expired', async () => {
    const paymentIntentId = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
    const { order, ticketType, ticketAccessToken } = await createPendingOrder(paymentIntentId);

    // The expiry sweep (or an earlier payment_intent.payment_failed on a
    // retried PaymentIntent) beat the success webhook to it.
    await releaseOrderByPaymentIntentId(paymentIntentId);
    const releasedOrder = await pool.query('SELECT status FROM orders WHERE id = $1', [order.id]);
    expect(releasedOrder.rows[0].status).toBe('expired');
    const releasedTicketType = await pool.query('SELECT quantity_sold FROM ticket_types WHERE id = $1', [
      ticketType.id,
    ]);
    expect(releasedTicketType.rows[0].quantity_sold).toBe(0);

    // Stripe confirms the payment anyway — real money moved, so the sale
    // must be honored regardless of the reservation having lapsed.
    const res = await signedWebhookRequest({
      id: `evt_${crypto.randomBytes(6).toString('hex')}`,
      object: 'event',
      type: 'payment_intent.succeeded',
      data: { object: { id: paymentIntentId, metadata: { ticket_access_token: ticketAccessToken } } },
    });

    expect(res.status).toBe(200);
    const finalOrder = await pool.query('SELECT status FROM orders WHERE id = $1', [order.id]);
    expect(finalOrder.rows[0].status).toBe('paid');

    const tickets = await pool.query('SELECT id FROM tickets WHERE order_id = $1', [order.id]);
    expect(tickets.rows).toHaveLength(2);

    const finalTicketType = await pool.query('SELECT quantity_sold FROM ticket_types WHERE id = $1', [
      ticketType.id,
    ]);
    expect(finalTicketType.rows[0].quantity_sold).toBe(2);
  });

  it('never releases an order that has already been paid, even past its reservation expiry', async () => {
    const paymentIntentId = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
    const { order, ticketType } = await createPendingOrder(paymentIntentId);

    await signedWebhookRequest({
      id: `evt_${crypto.randomBytes(6).toString('hex')}`,
      object: 'event',
      type: 'payment_intent.succeeded',
      data: { object: { id: paymentIntentId } },
    });

    await pool.query(`UPDATE orders SET reservation_expires_at = now() - interval '1 minute' WHERE id = $1`, [
      order.id,
    ]);

    // A release attempt arriving after the order is already paid (e.g. a
    // late/duplicate payment_intent.payment_failed, or the expiry sweep
    // racing a payment that already landed) must be a no-op.
    await releaseOrderByPaymentIntentId(paymentIntentId);

    const orderRow = await pool.query('SELECT status FROM orders WHERE id = $1', [order.id]);
    expect(orderRow.rows[0].status).toBe('paid');
    const ttRow = await pool.query('SELECT quantity_sold FROM ticket_types WHERE id = $1', [ticketType.id]);
    expect(ttRow.rows[0].quantity_sold).toBe(2);
  });
});
