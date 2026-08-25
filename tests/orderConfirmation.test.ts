import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { pool } from '../src/config/database';
import { sendEmail } from '../src/services/email/emailClient';
import { stripeClient } from '../src/services/stripe/stripeClient';
import { createPaymentIntent } from '../src/services/stripe/stripePayments';
import { ticketAccessTokenMatches } from '../src/utils/ticketAccessToken';
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
  mockCreatePaymentIntent.mockImplementation(async () => {
    const id = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
    return { id, client_secret: `${id}_secret` } as never;
  });
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

async function createOrder(eventId: string, ticketTypeId: string) {
  const paymentIntentId = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
  mockCreatePaymentIntent.mockResolvedValueOnce({
    id: paymentIntentId,
    client_secret: `${paymentIntentId}_secret`,
  } as never);

  const orderRes = await request(app)
    .post(`/v1/events/${eventId}/orders`)
    .set('Idempotency-Key', crypto.randomUUID())
    .send({ buyer_email: 'buyer@example.com', line_items: [{ ticket_type_id: ticketTypeId, quantity: 1 }] });

  return { orderId: orderRes.body.order.id as string, paymentIntentId };
}

async function payOrder(paymentIntentId: string) {
  return signedWebhookRequest({
    id: `evt_${crypto.randomBytes(6).toString('hex')}`,
    object: 'event',
    type: 'payment_intent.succeeded',
    data: { object: { id: paymentIntentId } },
  });
}

describe('GET /v1/events/:eventId/orders/:orderId/confirmation', () => {
  it('reports pending while the order has not been paid yet', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 5,
    });
    const { orderId } = await createOrder(fixture.event.id, ticketType.id);

    const res = await request(app).get(`/v1/events/${fixture.event.id}/orders/${orderId}/confirmation`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'pending' });
  });

  it('404s for a non-existent order rather than leaking anything about it', async () => {
    const fixture = await createOrgAndPublishedEvent(app);

    const res = await request(app).get(
      `/v1/events/${fixture.event.id}/orders/${crypto.randomUUID()}/confirmation`,
    );

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('order_not_found');
  });

  it('returns a fresh access token exactly once, then reports already_retrieved', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 5,
    });
    const { orderId, paymentIntentId } = await createOrder(fixture.event.id, ticketType.id);
    await payOrder(paymentIntentId);

    const first = await request(app).get(`/v1/events/${fixture.event.id}/orders/${orderId}/confirmation`);
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('ready');
    expect(typeof first.body.access_token).toBe('string');
    expect(first.body.access_token.length).toBeGreaterThanOrEqual(32);

    const second = await request(app).get(`/v1/events/${fixture.event.id}/orders/${orderId}/confirmation`);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ status: 'already_retrieved' });
  });

  it('mints a token independent from the one emailed at payment confirmation', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 5,
    });
    const { orderId, paymentIntentId } = await createOrder(fixture.event.id, ticketType.id);
    await payOrder(paymentIntentId);

    const emailHtml = mockSendEmail.mock.calls[0]?.[0]?.html ?? '';
    const emailedToken = emailHtml.match(/\?token=([0-9a-f]+)/)?.[1];
    expect(emailedToken).toBeDefined();

    const res = await request(app).get(`/v1/events/${fixture.event.id}/orders/${orderId}/confirmation`);
    const confirmationToken = res.body.access_token as string;

    expect(confirmationToken).not.toBe(emailedToken);

    const row = await pool.query(
      'SELECT ticket_access_token_hash, confirmation_token_hash FROM orders WHERE id = $1',
      [orderId],
    );
    expect(row.rows[0].ticket_access_token_hash).not.toBe(row.rows[0].confirmation_token_hash);
    expect(ticketAccessTokenMatches(emailedToken, row.rows[0].ticket_access_token_hash)).toBe(true);
    expect(ticketAccessTokenMatches(confirmationToken, row.rows[0].confirmation_token_hash)).toBe(true);
  });

  it('the minted token also grants access to GET .../tickets, same as the emailed one', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 5,
    });
    const { orderId, paymentIntentId } = await createOrder(fixture.event.id, ticketType.id);
    await payOrder(paymentIntentId);

    const confirmationRes = await request(app).get(
      `/v1/events/${fixture.event.id}/orders/${orderId}/confirmation`,
    );
    const token = confirmationRes.body.access_token;

    const ticketsRes = await request(app)
      .get(`/v1/events/${fixture.event.id}/orders/${orderId}/tickets`)
      .query({ token });

    expect(ticketsRes.status).toBe(200);
    expect(ticketsRes.body.items).toHaveLength(1);
  });

  it('only hands out a token to one of two concurrent requests racing after payment', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 5,
    });
    const { orderId, paymentIntentId } = await createOrder(fixture.event.id, ticketType.id);
    await payOrder(paymentIntentId);

    const [a, b] = await Promise.all([
      request(app).get(`/v1/events/${fixture.event.id}/orders/${orderId}/confirmation`),
      request(app).get(`/v1/events/${fixture.event.id}/orders/${orderId}/confirmation`),
    ]);

    const statuses = [a.body.status, b.body.status].sort();
    expect(statuses).toEqual(['already_retrieved', 'ready']);
  });

  it('stops handing out a token once the retrieval window has elapsed, even if never retrieved', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 5,
    });
    const { orderId, paymentIntentId } = await createOrder(fixture.event.id, ticketType.id);
    await payOrder(paymentIntentId);

    await pool.query(`UPDATE orders SET tickets_issued_at = now() - interval '1 hour' WHERE id = $1`, [orderId]);

    const res = await request(app).get(`/v1/events/${fixture.event.id}/orders/${orderId}/confirmation`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'expired' });

    const row = await pool.query('SELECT confirmation_token_hash FROM orders WHERE id = $1', [orderId]);
    expect(row.rows[0].confirmation_token_hash).toBeNull();
  });

  it('still reports pending for an order whose reservation expired without ever being paid', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 5,
    });
    const { orderId } = await createOrder(fixture.event.id, ticketType.id);

    await pool.query(`UPDATE orders SET reservation_expires_at = now() - interval '1 minute' WHERE id = $1`, [
      orderId,
    ]);
    // Trigger the lazy sweep so the order actually transitions to 'expired'.
    await createOrder(fixture.event.id, ticketType.id);

    const orderRow = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId]);
    expect(orderRow.rows[0].status).toBe('expired');

    const res = await request(app).get(`/v1/events/${fixture.event.id}/orders/${orderId}/confirmation`);
    expect(res.body).toEqual({ status: 'pending' });
  });
});
