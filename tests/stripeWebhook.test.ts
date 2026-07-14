import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { pool } from '../src/config/database';
import { stripeClient } from '../src/services/stripe/stripeClient';
import { createPaymentIntent } from '../src/services/stripe/stripePayments';
import { truncateAllTables } from './helpers/db';
import { createOrgAndPublishedEvent, createTicketType } from './helpers/checkoutFixtures';

jest.mock('../src/services/stripe/stripePayments');

const mockCreatePaymentIntent = createPaymentIntent as jest.MockedFunction<typeof createPaymentIntent>;

const app = createApp();

beforeEach(async () => {
  await truncateAllTables();
  jest.clearAllMocks();
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

  return { ...fixture, ticketType, order: checkoutRes.body.order };
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
    const { order, ticketType } = await createPendingOrder(paymentIntentId);

    const res = await signedWebhookRequest({
      id: `evt_${crypto.randomBytes(6).toString('hex')}`,
      object: 'event',
      type: 'payment_intent.succeeded',
      data: { object: { id: paymentIntentId } },
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

  it('is idempotent when Stripe redelivers the same event', async () => {
    const paymentIntentId = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
    const { order } = await createPendingOrder(paymentIntentId);
    const eventPayload = {
      id: `evt_${crypto.randomBytes(6).toString('hex')}`,
      object: 'event',
      type: 'payment_intent.succeeded',
      data: { object: { id: paymentIntentId } },
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
});
