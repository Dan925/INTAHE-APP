import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/database';
import { computeOrderFees } from '../src/utils/fees';
import { truncateAllTables } from './helpers/db';
import { createOrgAndPublishedEvent, createTicketType } from './helpers/checkoutFixtures';

import { createPaymentIntent, retrievePaymentIntent } from '../src/services/stripe/stripePayments';

jest.mock('../src/services/stripe/stripePayments');

const mockCreatePaymentIntent = createPaymentIntent as jest.MockedFunction<typeof createPaymentIntent>;
const mockRetrievePaymentIntent = retrievePaymentIntent as jest.MockedFunction<typeof retrievePaymentIntent>;

const app = createApp();

beforeEach(async () => {
  await truncateAllTables();
  jest.clearAllMocks();
  mockCreatePaymentIntent.mockImplementation(async () => {
    const id = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
    return { id, client_secret: `${id}_secret` } as never;
  });
  mockRetrievePaymentIntent.mockImplementation(
    async (id: string) => ({ id, client_secret: `${id}_secret` }) as never,
  );
});

afterAll(async () => {
  await pool.end();
});

function idempotencyKey(): string {
  return crypto.randomUUID();
}

describe('POST /v1/events/:eventId/orders (checkout)', () => {
  it('requires an Idempotency-Key header', async () => {
    const { event } = await createOrgAndPublishedEvent(app);
    const res = await request(app)
      .post(`/v1/events/${event.id}/orders`)
      .send({ buyer_email: 'buyer@example.com', line_items: [] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('idempotency_key_required');
  });

  it('creates a paid-pending order with correctly computed fees and reserves inventory', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
      quantity_total: 10,
    });

    const res = await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        buyer_email: 'buyer@example.com',
        line_items: [{ ticket_type_id: ticketType.id, quantity: 2 }],
      });

    expect(res.status).toBe(201);
    const expectedFees = computeOrderFees(5000, 2, false);
    expect(res.body.order).toMatchObject({
      status: 'pending',
      subtotal_cents: 5000,
      stripe_fee_cents: expectedFees.stripeFeeCents,
      intahe_fee_cents: expectedFees.intaheFeeCents,
      total_cents: expectedFees.totalCents,
    });
    expect(typeof res.body.client_secret).toBe('string');
    expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(1);
    expect(mockCreatePaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: expectedFees.totalCents, currency: 'usd' }),
    );

    const ttRow = await pool.query('SELECT quantity_sold FROM ticket_types WHERE id = $1', [ticketType.id]);
    expect(ttRow.rows[0].quantity_sold).toBe(2);
  });

  it('absorbs fees into the organizer when fees_absorbed_by_organizer is true, but still stores them internally', async () => {
    const fixture = await createOrgAndPublishedEvent(app, { fees_absorbed_by_organizer: true });
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
      quantity_total: 10,
    });

    const res = await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ buyer_email: 'buyer@example.com', line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });

    expect(res.status).toBe(201);
    expect(res.body.order.total_cents).toBe(2500);
    expect(res.body.order.stripe_fee_cents).toBeGreaterThan(0);
    expect(res.body.order.intahe_fee_cents).toBeGreaterThan(0);
  });

  it('is idempotent: the same key with the same body returns the same order without calling Stripe twice', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 10,
    });
    const key = idempotencyKey();
    const body = { buyer_email: 'buyer@example.com', line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] };

    const first = await request(app).post(`/v1/events/${fixture.event.id}/orders`).set('Idempotency-Key', key).send(body);
    const second = await request(app).post(`/v1/events/${fixture.event.id}/orders`).set('Idempotency-Key', key).send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.order.id).toBe(first.body.order.id);
    expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(1);

    const ttRow = await pool.query('SELECT quantity_sold FROM ticket_types WHERE id = $1', [ticketType.id]);
    expect(ttRow.rows[0].quantity_sold).toBe(1);
  });

  it('rejects reuse of the same Idempotency-Key with a different request body', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 10,
    });
    const key = idempotencyKey();

    await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', key)
      .send({ buyer_email: 'buyer@example.com', line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });

    const res = await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', key)
      .send({ buyer_email: 'buyer@example.com', line_items: [{ ticket_type_id: ticketType.id, quantity: 2 }] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('idempotency_key_reused');
  });

  it('returns ticket_sold_out and does not over-reserve when demand exceeds supply', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 1,
    });

    const first = await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ buyer_email: 'a@example.com', line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });
    const second = await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ buyer_email: 'b@example.com', line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ticket_sold_out');

    const ttRow = await pool.query('SELECT quantity_sold FROM ticket_types WHERE id = $1', [ticketType.id]);
    expect(ttRow.rows[0].quantity_sold).toBe(1);
    expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(1);
  });

  it('refuses checkout for an event that is not published', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    // Cancel it directly (no route exposes this transition yet).
    await pool.query(`UPDATE events SET status = 'cancelled' WHERE id = $1`, [fixture.event.id]);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 10,
    });

    const res = await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ buyer_email: 'buyer@example.com', line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('event_not_on_sale');
  });

  it('rejects mixing currencies within a single order', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const usdType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      currency: 'usd',
      quantity_total: 10,
    });
    const cadType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      currency: 'cad',
      quantity_total: 10,
    });

    const res = await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        buyer_email: 'buyer@example.com',
        line_items: [
          { ticket_type_id: usdType.id, quantity: 1 },
          { ticket_type_id: cadType.id, quantity: 1 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('mixed_currency_order');
  });

  it('rejects a ticket_type_id that does not belong to the event', async () => {
    const fixtureA = await createOrgAndPublishedEvent(app);
    const fixtureB = await createOrgAndPublishedEvent(app);
    const ticketTypeInB = await createTicketType(
      app,
      fixtureB.owner,
      fixtureB.organization.id,
      fixtureB.event.id,
      { quantity_total: 10 },
    );

    const res = await request(app)
      .post(`/v1/events/${fixtureA.event.id}/orders`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        buyer_email: 'buyer@example.com',
        line_items: [{ ticket_type_id: ticketTypeInB.id, quantity: 1 }],
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ticket_type_not_found');
  });
});
