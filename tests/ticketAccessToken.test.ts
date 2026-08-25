import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/database';
import { createPaymentIntent } from '../src/services/stripe/stripePayments';
import { ticketAccessTokenMatches } from '../src/utils/ticketAccessToken';
import { truncateAllTables } from './helpers/db';
import { createOrgAndPublishedEvent, createTicketType } from './helpers/checkoutFixtures';
import { signupTestUser } from './helpers/auth';

jest.mock('../src/services/stripe/stripePayments');

const mockCreatePaymentIntent = createPaymentIntent as jest.MockedFunction<typeof createPaymentIntent>;

const app = createApp();

beforeEach(async () => {
  await truncateAllTables();
  jest.clearAllMocks();
  mockCreatePaymentIntent.mockImplementation(async () => {
    const id = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
    return { id, client_secret: `${id}_secret` } as never;
  });
});

afterAll(async () => {
  await pool.end();
});

describe('GET /v1/events/:eventId/orders/:orderId/tickets (access token)', () => {
  it('grants access with the correct ticket_access_token from checkout', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 5,
    });

    const orderRes = await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ buyer_email: 'buyer@example.com', line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.order.id;
    const token = orderRes.body.ticket_access_token;
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThanOrEqual(32);

    const res = await request(app)
      .get(`/v1/events/${fixture.event.id}/orders/${orderId}/tickets`)
      .query({ token });

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('rejects a wrong token with 404 order_not_found (never revealing whether the order exists)', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 5,
    });

    const orderRes = await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ buyer_email: 'buyer@example.com', line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });
    const orderId = orderRes.body.order.id;

    const res = await request(app)
      .get(`/v1/events/${fixture.event.id}/orders/${orderId}/tickets`)
      .query({ token: crypto.randomBytes(32).toString('hex') });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('order_not_found');
  });

  it('rejects a request with no token and no session at all', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 5,
    });

    const orderRes = await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ buyer_email: 'buyer@example.com', line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });
    const orderId = orderRes.body.order.id;

    const res = await request(app).get(`/v1/events/${fixture.event.id}/orders/${orderId}/tickets`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('order_not_found');
  });

  it('no longer accepts buyer_email as a substitute for the token (the mechanism this replaces)', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 5,
    });
    const buyerEmail = 'buyer@example.com';

    const orderRes = await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ buyer_email: buyerEmail, line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });
    const orderId = orderRes.body.order.id;

    const res = await request(app)
      .get(`/v1/events/${fixture.event.id}/orders/${orderId}/tickets`)
      .query({ buyer_email: buyerEmail });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('order_not_found');
  });

  it('grants access to the authenticated buyer via session, with no token needed', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 5,
    });
    const buyer = await signupTestUser(app);

    const orderRes = await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Authorization', `Bearer ${buyer.accessToken}`)
      .send({ buyer_email: buyer.email, line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });
    const orderId = orderRes.body.order.id;

    const res = await request(app)
      .get(`/v1/events/${fixture.event.id}/orders/${orderId}/tickets`)
      .set('Authorization', `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(200);
  });

  it('rejects a different logged-in user who is not the buyer and has no token', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 5,
    });
    const buyer = await signupTestUser(app);
    const someoneElse = await signupTestUser(app);

    const orderRes = await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('Authorization', `Bearer ${buyer.accessToken}`)
      .send({ buyer_email: buyer.email, line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });
    const orderId = orderRes.body.order.id;

    const res = await request(app)
      .get(`/v1/events/${fixture.event.id}/orders/${orderId}/tickets`)
      .set('Authorization', `Bearer ${someoneElse.accessToken}`);

    expect(res.status).toBe(404);
  });

  it('is stored hashed, not in plaintext, on the orders row', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 5,
    });

    const orderRes = await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ buyer_email: 'buyer@example.com', line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });
    const orderId = orderRes.body.order.id;
    const token = orderRes.body.ticket_access_token;

    const row = await pool.query('SELECT ticket_access_token_hash FROM orders WHERE id = $1', [orderId]);
    const storedHash = row.rows[0].ticket_access_token_hash;

    expect(storedHash).not.toBe(token);
    expect(storedHash).not.toContain(token);
    expect(ticketAccessTokenMatches(token, storedHash)).toBe(true);
    expect(ticketAccessTokenMatches('wrong-token', storedHash)).toBe(false);
  });
});

describe('ticketAccessTokenMatches', () => {
  it('rejects a missing candidate or a missing stored hash', () => {
    expect(ticketAccessTokenMatches(undefined, 'abc')).toBe(false);
    expect(ticketAccessTokenMatches('abc', null)).toBe(false);
  });

  it('rejects a candidate whose hash has a different length than the stored one', () => {
    // Deliberately not a real sha256 hex digest — exercises the length
    // guard that runs before crypto.timingSafeEqual, which throws on
    // mismatched buffer lengths rather than returning false.
    expect(ticketAccessTokenMatches('anything', 'ab')).toBe(false);
  });
});
