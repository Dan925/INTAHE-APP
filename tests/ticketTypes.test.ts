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

async function createOrgAndEvent(
  owner: Awaited<ReturnType<typeof signupTestUser>>,
  options: { connectStripe?: boolean } = {},
) {
  const orgRes = await request(app)
    .post('/v1/organizations')
    .set('Authorization', `Bearer ${owner.accessToken}`)
    .send({ name: 'Acme Events' });
  const organization = orgRes.body.organization;

  if (options.connectStripe ?? true) {
    await pool.query(
      `UPDATE organizations SET stripe_account_id = $2, stripe_charges_enabled = true WHERE id = $1`,
      [organization.id, `acct_test_ticket_types_${organization.id}`],
    );
  }

  const eventRes = await request(app)
    .post(`/v1/organizations/${organization.id}/events`)
    .set('Authorization', `Bearer ${owner.accessToken}`)
    .send({
      name: 'Summer Festival',
      start_at: '2026-08-01T18:00:00.000Z',
      end_at: '2026-08-01T23:00:00.000Z',
    });
  return { organization, event: eventRes.body.event };
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

describe('paid ticket types require a working connected Stripe account', () => {
  it('lets a free ticket type be created and published with no Stripe account at all', async () => {
    const owner = await signupTestUser(app);
    const { organization, event } = await createOrgAndEvent(owner, { connectStripe: false });

    const res = await request(app)
      .post(`/v1/organizations/${organization.id}/events/${event.id}/ticket-types`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Free Admission', price_cents: 0, quantity_total: 200 });

    expect(res.status).toBe(201);
    expect(res.body.ticket_type.price_cents).toBe(0);

    const publishRes = await request(app)
      .post(`/v1/organizations/${organization.id}/events/${event.id}/publish`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(publishRes.status).toBe(200);
  });

  it('refuses to create a paid ticket type when the organization has no connected Stripe account', async () => {
    const owner = await signupTestUser(app);
    const { organization, event } = await createOrgAndEvent(owner, { connectStripe: false });

    const res = await request(app)
      .post(`/v1/organizations/${organization.id}/events/${event.id}/ticket-types`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'VIP', price_cents: 5000, quantity_total: 10 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('stripe_not_connected');
    expect(typeof res.body.error.message).toBe('string');
    expect(res.body.error.message.length).toBeGreaterThan(0);
  });

  it('refuses to create a paid ticket type when Stripe is connected but not yet charges_enabled', async () => {
    const owner = await signupTestUser(app);
    const { organization, event } = await createOrgAndEvent(owner, { connectStripe: false });
    await pool.query(`UPDATE organizations SET stripe_account_id = 'acct_onboarding_incomplete' WHERE id = $1`, [
      organization.id,
    ]);

    const res = await request(app)
      .post(`/v1/organizations/${organization.id}/events/${event.id}/ticket-types`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'VIP', price_cents: 5000, quantity_total: 10 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('stripe_not_connected');
  });

  it('refuses to raise a previously free ticket type above $0 without a connected Stripe account', async () => {
    // The transition case, not just initial creation: a free event that
    // adds a paid ticket type later must hit the same gate as creating one
    // paid from the start.
    const owner = await signupTestUser(app);
    const { organization, event } = await createOrgAndEvent(owner, { connectStripe: false });
    const createRes = await request(app)
      .post(`/v1/organizations/${organization.id}/events/${event.id}/ticket-types`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'General Admission', price_cents: 0, quantity_total: 50 });
    expect(createRes.status).toBe(201);
    const ticketTypeId = createRes.body.ticket_type.id;

    const res = await request(app)
      .patch(`/v1/organizations/${organization.id}/events/${event.id}/ticket-types/${ticketTypeId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ price_cents: 1500 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('stripe_not_connected');

    const stillFree = await pool.query('SELECT price_cents FROM ticket_types WHERE id = $1', [ticketTypeId]);
    expect(stillFree.rows[0].price_cents).toBe(0);
  });

  it('allows creating a paid ticket type once Stripe becomes connected and charges_enabled', async () => {
    const owner = await signupTestUser(app);
    const { organization, event } = await createOrgAndEvent(owner, { connectStripe: false });

    const before = await request(app)
      .post(`/v1/organizations/${organization.id}/events/${event.id}/ticket-types`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'VIP', price_cents: 5000, quantity_total: 10 });
    expect(before.status).toBe(409);

    await pool.query(
      `UPDATE organizations SET stripe_account_id = 'acct_now_ready', stripe_charges_enabled = true WHERE id = $1`,
      [organization.id],
    );

    const after = await request(app)
      .post(`/v1/organizations/${organization.id}/events/${event.id}/ticket-types`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'VIP', price_cents: 5000, quantity_total: 10 });
    expect(after.status).toBe(201);
  });
});

describe('paid ticket types have a $2.00 minimum price', () => {
  it('allows a free ($0) ticket type with no minimum applied', async () => {
    const owner = await signupTestUser(app);
    const { organization, event } = await createOrgAndEvent(owner, { connectStripe: false });

    const res = await request(app)
      .post(`/v1/organizations/${organization.id}/events/${event.id}/ticket-types`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Free Admission', price_cents: 0, quantity_total: 100 });

    expect(res.status).toBe(201);
    expect(res.body.ticket_type.price_cents).toBe(0);
  });

  it('refuses to create a paid ticket type priced below $2.00', async () => {
    const owner = await signupTestUser(app);
    const { organization, event } = await createOrgAndEvent(owner);

    const res = await request(app)
      .post(`/v1/organizations/${organization.id}/events/${event.id}/ticket-types`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Too Cheap', price_cents: 199, quantity_total: 10 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ticket_price_below_minimum');
    expect(typeof res.body.error.message).toBe('string');
    expect(res.body.error.message.length).toBeGreaterThan(0);
  });

  it('allows creating a paid ticket type priced at exactly $2.00', async () => {
    const owner = await signupTestUser(app);
    const { organization, event } = await createOrgAndEvent(owner);

    const res = await request(app)
      .post(`/v1/organizations/${organization.id}/events/${event.id}/ticket-types`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Just Right', price_cents: 200, quantity_total: 10 });

    expect(res.status).toBe(201);
    expect(res.body.ticket_type.price_cents).toBe(200);
  });

  it('refuses to raise an existing ticket type to a paid price below $2.00', async () => {
    const owner = await signupTestUser(app);
    const { organization, event } = await createOrgAndEvent(owner);
    const createRes = await request(app)
      .post(`/v1/organizations/${organization.id}/events/${event.id}/ticket-types`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'General Admission', price_cents: 0, quantity_total: 50 });
    const ticketTypeId = createRes.body.ticket_type.id;

    const res = await request(app)
      .patch(`/v1/organizations/${organization.id}/events/${event.id}/ticket-types/${ticketTypeId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ price_cents: 150 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ticket_price_below_minimum');

    const stillFree = await pool.query('SELECT price_cents FROM ticket_types WHERE id = $1', [ticketTypeId]);
    expect(stillFree.rows[0].price_cents).toBe(0);
  });

  it('allows lowering a paid ticket type back to $0 (free), bypassing the minimum', async () => {
    const owner = await signupTestUser(app);
    const { organization, event } = await createOrgAndEvent(owner);
    const createRes = await request(app)
      .post(`/v1/organizations/${organization.id}/events/${event.id}/ticket-types`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'General Admission', price_cents: 2500, quantity_total: 50 });
    const ticketTypeId = createRes.body.ticket_type.id;

    const res = await request(app)
      .patch(`/v1/organizations/${organization.id}/events/${event.id}/ticket-types/${ticketTypeId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ price_cents: 0 });

    expect(res.status).toBe(200);
    expect(res.body.ticket_type.price_cents).toBe(0);
  });
});
