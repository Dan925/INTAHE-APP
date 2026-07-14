import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/database';
import { truncateAllTables } from './helpers/db';
import { signupTestUser } from './helpers/auth';

const app = createApp();

beforeEach(async () => {
  await truncateAllTables();
});

afterAll(async () => {
  await pool.end();
});

async function createOrgAndEvent(owner: Awaited<ReturnType<typeof signupTestUser>>) {
  const orgRes = await request(app)
    .post('/v1/organizations')
    .set('Authorization', `Bearer ${owner.accessToken}`)
    .send({ name: 'Acme Events' });
  const eventRes = await request(app)
    .post(`/v1/organizations/${orgRes.body.organization.id}/events`)
    .set('Authorization', `Bearer ${owner.accessToken}`)
    .send({
      name: 'Summer Festival',
      start_at: '2026-08-01T18:00:00.000Z',
      end_at: '2026-08-01T23:00:00.000Z',
    });
  return { organization: orgRes.body.organization, event: eventRes.body.event };
}

describe('ticket types CRUD', () => {
  it('lets an owner create, list, get, and update ticket types', async () => {
    const owner = await signupTestUser(app);
    const { organization, event } = await createOrgAndEvent(owner);

    const createRes = await request(app)
      .post(`/v1/organizations/${organization.id}/events/${event.id}/ticket-types`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'General Admission', price_cents: 2500, quantity_total: 100 });

    expect(createRes.status).toBe(201);
    expect(createRes.body.ticket_type).toMatchObject({
      name: 'General Admission',
      price_cents: 2500,
      currency: 'usd',
      quantity_total: 100,
      quantity_sold: 0,
    });
    const ticketTypeId = createRes.body.ticket_type.id;

    const listRes = await request(app)
      .get(`/v1/organizations/${organization.id}/events/${event.id}/ticket-types`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(1);

    const getRes = await request(app)
      .get(`/v1/organizations/${organization.id}/events/${event.id}/ticket-types/${ticketTypeId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(getRes.status).toBe(200);

    const updateRes = await request(app)
      .patch(`/v1/organizations/${organization.id}/events/${event.id}/ticket-types/${ticketTypeId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ price_cents: 3000 });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.ticket_type.price_cents).toBe(3000);
  });

  it('forbids a staff member from creating ticket types', async () => {
    const owner = await signupTestUser(app);
    const staff = await signupTestUser(app);
    const { organization, event } = await createOrgAndEvent(owner);
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, accepted_at) VALUES ($1, $2, 'staff', now())`,
      [organization.id, staff.userId],
    );

    const res = await request(app)
      .post(`/v1/organizations/${organization.id}/events/${event.id}/ticket-types`)
      .set('Authorization', `Bearer ${staff.accessToken}`)
      .send({ name: 'VIP', price_cents: 5000, quantity_total: 10 });

    expect(res.status).toBe(403);
  });

  it("rejects a ticket type creation request for an event that belongs to a different organization", async () => {
    const ownerA = await signupTestUser(app);
    const ownerB = await signupTestUser(app);
    const { event: eventInA } = await createOrgAndEvent(ownerA);
    const { organization: orgB } = await createOrgAndEvent(ownerB);

    // ownerB is owner of orgB (passes requireOrgRole for orgB) but the
    // eventId in the URL actually belongs to orgA.
    const res = await request(app)
      .post(`/v1/organizations/${orgB.id}/events/${eventInA.id}/ticket-types`)
      .set('Authorization', `Bearer ${ownerB.accessToken}`)
      .send({ name: 'Sneaky', price_cents: 100, quantity_total: 1 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('event_not_found');
  });

  it('rejects lowering quantity_total below quantity_sold', async () => {
    const owner = await signupTestUser(app);
    const { organization, event } = await createOrgAndEvent(owner);
    const createRes = await request(app)
      .post(`/v1/organizations/${organization.id}/events/${event.id}/ticket-types`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'General Admission', price_cents: 2500, quantity_total: 10 });
    const ticketTypeId = createRes.body.ticket_type.id;

    await pool.query(`UPDATE ticket_types SET quantity_sold = 5 WHERE id = $1`, [ticketTypeId]);

    const res = await request(app)
      .patch(`/v1/organizations/${organization.id}/events/${event.id}/ticket-types/${ticketTypeId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ quantity_total: 2 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_input');
  });
});
