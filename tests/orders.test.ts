import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/database';
import { createPaymentIntent } from '../src/services/stripe/stripePayments';
import { signupTestUser } from './helpers/auth';
import { truncateAllTables } from './helpers/db';
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

describe('GET /v1/organizations/:organizationId/events/:eventId/orders', () => {
  it('lets an admin list orders for the event', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 10,
    });
    await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ buyer_email: 'buyer@example.com', line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });

    const res = await request(app)
      .get(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/orders`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ buyer_email: 'buyer@example.com', status: 'pending' });
  });

  it('forbids a staff member (financial reports are owner/admin only)', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const staff = await signupTestUser(app);
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, accepted_at) VALUES ($1, $2, 'staff', now())`,
      [fixture.organization.id, staff.userId],
    );

    const res = await request(app)
      .get(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/orders`)
      .set('Authorization', `Bearer ${staff.accessToken}`);

    expect(res.status).toBe(403);
  });

  it("never exposes another organization's orders through a different org's URL", async () => {
    const fixtureA = await createOrgAndPublishedEvent(app);
    const fixtureB = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixtureA.owner, fixtureA.organization.id, fixtureA.event.id, {
      quantity_total: 10,
    });
    const orderRes = await request(app)
      .post(`/v1/events/${fixtureA.event.id}/orders`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ buyer_email: 'buyer@example.com', line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });

    const res = await request(app)
      .get(`/v1/organizations/${fixtureB.organization.id}/events/${fixtureA.event.id}/orders/${orderRes.body.order.id}`)
      .set('Authorization', `Bearer ${fixtureB.owner.accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('event_not_found');
  });

  it('returns tickets alongside a paid order', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 10,
    });
    const orderRes = await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ buyer_email: 'buyer@example.com', line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });

    const res = await request(app)
      .get(
        `/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/orders/${orderRes.body.order.id}`,
      )
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.order.id).toBe(orderRes.body.order.id);
    expect(res.body.tickets).toEqual([]);
  });
});
