import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/database';
import { createPaymentIntent } from '../src/services/stripe/stripePayments';
import { truncateAllTables } from './helpers/db';
import { signupTestUser } from './helpers/auth';
import { createOrgAndPublishedEvent, createTicketType } from './helpers/checkoutFixtures';

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

describe('GET /v1/discover/events', () => {
  it('only returns published events the organizer opted into discovery', async () => {
    const discoverable = await createOrgAndPublishedEvent(app, { is_public_discoverable: true });
    await createOrgAndPublishedEvent(app, { is_public_discoverable: false });

    const res = await request(app).get('/v1/discover/events');

    expect(res.status).toBe(200);
    const ids = res.body.items.map((e: { id: string }) => e.id);
    expect(ids).toContain(discoverable.event.id);
    expect(ids).toHaveLength(1);
  });

  it('excludes draft and cancelled events even if flagged discoverable', async () => {
    const fixture = await createOrgAndPublishedEvent(app, { is_public_discoverable: true });
    await request(app)
      .post(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/cancel`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`);

    const res = await request(app).get('/v1/discover/events');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it('requires no authentication', async () => {
    await createOrgAndPublishedEvent(app, { is_public_discoverable: true });
    const res = await request(app).get('/v1/discover/events');
    expect(res.status).toBe(200);
  });

  it('sorts by distance when latitude/longitude are given, nearest first', async () => {
    // Montreal
    const near = await createOrgAndPublishedEvent(app, {
      is_public_discoverable: true,
      latitude: 45.5019,
      longitude: -73.5674,
    });
    // Vancouver
    const far = await createOrgAndPublishedEvent(app, {
      is_public_discoverable: true,
      latitude: 49.2827,
      longitude: -123.1207,
    });

    const res = await request(app)
      .get('/v1/discover/events')
      .query({ latitude: 45.5088, longitude: -73.5878 }); // downtown Montreal

    expect(res.status).toBe(200);
    const ids = res.body.items.map((e: { id: string }) => e.id);
    expect(ids).toEqual([near.event.id, far.event.id]);
    expect(res.body.items[0].distance_km).toBeLessThan(res.body.items[1].distance_km);
  });

  it('rejects latitude given without longitude', async () => {
    const res = await request(app).get('/v1/discover/events').query({ latitude: 45.5 });
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/discover/events/:eventId', () => {
  it('resolves a published event via direct link even when not discoverable', async () => {
    const fixture = await createOrgAndPublishedEvent(app, { is_public_discoverable: false });

    const res = await request(app).get(`/v1/discover/events/${fixture.event.id}`);

    expect(res.status).toBe(200);
    expect(res.body.event.id).toBe(fixture.event.id);
  });

  it('404s for a draft event', async () => {
    const owner = await signupTestUser(app);
    const orgRes = await request(app)
      .post('/v1/organizations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Draft Org' });
    const eventRes = await request(app)
      .post(`/v1/organizations/${orgRes.body.organization.id}/events`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: 'Still Draft',
        start_at: '2026-09-01T18:00:00.000Z',
        end_at: '2026-09-01T23:00:00.000Z',
      });

    const res = await request(app).get(`/v1/discover/events/${eventRes.body.event.id}`);

    expect(res.status).toBe(404);
  });
});

describe('GET /v1/discover/events/:eventId/ticket-types', () => {
  it('returns ticket types for a published event without auth', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      name: 'GA',
    });

    const res = await request(app).get(`/v1/discover/events/${fixture.event.id}/ticket-types`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name).toBe('GA');
  });

  // Reproduces the deadlock: abandoned carts reserve the entire stock and
  // time out, but nothing ever calls checkoutService.reserveInventory again
  // (the only place that sweeps expired reservations) to release it,
  // because the public page already shows the event as sold out and no one
  // attempts to buy. The fix has to be in the read path itself.
  it('does not report an event as sold out when its stock is only held by expired reservations', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      name: 'GA',
      quantity_total: 1,
    });

    const orderRes = await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', 'discover-sold-out-repro')
      .send({ buyer_email: 'abandoned@example.com', line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });
    expect(orderRes.status).toBe(201);

    await pool.query(`UPDATE orders SET reservation_expires_at = now() - interval '1 minute' WHERE id = $1`, [
      orderRes.body.order.id,
    ]);

    const res = await request(app).get(`/v1/discover/events/${fixture.event.id}/ticket-types`);

    expect(res.status).toBe(200);
    const item = res.body.items.find((i: { id: string }) => i.id === ticketType.id);
    expect(item.quantity_sold).toBe(0);
    expect(item.quantity_total - item.quantity_sold).toBe(1);

    // Confirms this is a pure read-side correction, not a hidden write —
    // the stored counter is still stale until someone actually checks out.
    const raw = await pool.query('SELECT quantity_sold FROM ticket_types WHERE id = $1', [ticketType.id]);
    expect(raw.rows[0].quantity_sold).toBe(1);
  });

  it('still reports reduced availability for a reservation that has not expired yet', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      name: 'GA',
      quantity_total: 1,
    });

    const orderRes = await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', 'discover-active-reservation')
      .send({ buyer_email: 'active-buyer@example.com', line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });
    expect(orderRes.status).toBe(201);

    const res = await request(app).get(`/v1/discover/events/${fixture.event.id}/ticket-types`);

    expect(res.status).toBe(200);
    const item = res.body.items.find((i: { id: string }) => i.id === ticketType.id);
    expect(item.quantity_sold).toBe(1);
    expect(item.quantity_total - item.quantity_sold).toBe(0);
  });
});
