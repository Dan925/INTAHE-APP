import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/database';
import { truncateAllTables } from './helpers/db';
import { signupTestUser, type TestUser } from './helpers/auth';

const app = createApp();

async function createOrg(owner: TestUser, name = 'Acme Events') {
  const res = await request(app)
    .post('/v1/organizations')
    .set('Authorization', `Bearer ${owner.accessToken}`)
    .send({ name });
  return res.body.organization as { id: string; slug: string };
}

async function addMember(organizationId: string, userId: string, role: 'admin' | 'staff' | 'volunteer') {
  await pool.query(
    `INSERT INTO organization_members (organization_id, user_id, role, accepted_at)
     VALUES ($1, $2, $3, now())`,
    [organizationId, userId, role],
  );
}

const validEvent = {
  name: 'Summer Festival',
  start_at: '2026-08-01T18:00:00.000Z',
  end_at: '2026-08-01T23:00:00.000Z',
  address: '123 Main St',
};

beforeEach(async () => {
  await truncateAllTables();
});

afterAll(async () => {
  await pool.end();
});

describe('POST /v1/organizations/:organizationId/events', () => {
  it('lets an owner create a draft event', async () => {
    const owner = await signupTestUser(app);
    const org = await createOrg(owner);

    const res = await request(app)
      .post(`/v1/organizations/${org.id}/events`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send(validEvent);

    expect(res.status).toBe(201);
    expect(res.body.event).toMatchObject({
      name: 'Summer Festival',
      status: 'draft',
      organization_id: org.id,
    });
  });

  it('rejects end_at before start_at', async () => {
    const owner = await signupTestUser(app);
    const org = await createOrg(owner);

    const res = await request(app)
      .post(`/v1/organizations/${org.id}/events`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ ...validEvent, start_at: '2026-08-01T23:00:00.000Z', end_at: '2026-08-01T18:00:00.000Z' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(res.body.error.field).toBe('end_at');
  });

  it('forbids a staff member from creating events (owner/admin only)', async () => {
    const owner = await signupTestUser(app);
    const staff = await signupTestUser(app);
    const org = await createOrg(owner);
    await addMember(org.id, staff.userId, 'staff');

    const res = await request(app)
      .post(`/v1/organizations/${org.id}/events`)
      .set('Authorization', `Bearer ${staff.accessToken}`)
      .send(validEvent);

    expect(res.status).toBe(403);
  });

  it('allows an admin to create events', async () => {
    const owner = await signupTestUser(app);
    const admin = await signupTestUser(app);
    const org = await createOrg(owner);
    await addMember(org.id, admin.userId, 'admin');

    const res = await request(app)
      .post(`/v1/organizations/${org.id}/events`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send(validEvent);

    expect(res.status).toBe(201);
  });
});

describe('event visibility and cross-org isolation', () => {
  it('lets a volunteer view (but not create) events', async () => {
    const owner = await signupTestUser(app);
    const volunteer = await signupTestUser(app);
    const org = await createOrg(owner);
    await addMember(org.id, volunteer.userId, 'volunteer');

    const created = await request(app)
      .post(`/v1/organizations/${org.id}/events`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send(validEvent);

    const viewRes = await request(app)
      .get(`/v1/organizations/${org.id}/events/${created.body.event.id}`)
      .set('Authorization', `Bearer ${volunteer.accessToken}`);
    const createRes = await request(app)
      .post(`/v1/organizations/${org.id}/events`)
      .set('Authorization', `Bearer ${volunteer.accessToken}`)
      .send(validEvent);

    expect(viewRes.status).toBe(200);
    expect(createRes.status).toBe(403);
  });

  it("never exposes another organization's event through a different org's URL", async () => {
    const ownerA = await signupTestUser(app);
    const ownerB = await signupTestUser(app);
    const orgA = await createOrg(ownerA, 'Org A');
    const orgB = await createOrg(ownerB, 'Org B');

    const eventInA = await request(app)
      .post(`/v1/organizations/${orgA.id}/events`)
      .set('Authorization', `Bearer ${ownerA.accessToken}`)
      .send(validEvent);

    // ownerB is a member of orgB (passes requireOrgRole for orgB) but tries
    // to reach an event that actually belongs to orgA.
    const res = await request(app)
      .get(`/v1/organizations/${orgB.id}/events/${eventInA.body.event.id}`)
      .set('Authorization', `Bearer ${ownerB.accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('event_not_found');
  });
});

describe('POST /v1/organizations/:organizationId/events/:eventId/publish', () => {
  it('publishes a draft event', async () => {
    const owner = await signupTestUser(app);
    const org = await createOrg(owner);
    const created = await request(app)
      .post(`/v1/organizations/${org.id}/events`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send(validEvent);

    const res = await request(app)
      .post(`/v1/organizations/${org.id}/events/${created.body.event.id}/publish`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.event.status).toBe('published');
  });

  it('refuses to publish an already-published event', async () => {
    const owner = await signupTestUser(app);
    const org = await createOrg(owner);
    const created = await request(app)
      .post(`/v1/organizations/${org.id}/events`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send(validEvent);
    await request(app)
      .post(`/v1/organizations/${org.id}/events/${created.body.event.id}/publish`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    const res = await request(app)
      .post(`/v1/organizations/${org.id}/events/${created.body.event.id}/publish`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('event_not_publishable');
  });
});

describe('GET /v1/organizations/:organizationId/events (cursor pagination)', () => {
  it('paginates with a cursor instead of an offset', async () => {
    const owner = await signupTestUser(app);
    const org = await createOrg(owner);
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post(`/v1/organizations/${org.id}/events`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ ...validEvent, name: `Event ${i}` });
    }

    const firstPage = await request(app)
      .get(`/v1/organizations/${org.id}/events?limit=2`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.items).toHaveLength(2);
    expect(firstPage.body.next_cursor).toEqual(expect.any(String));

    const secondPage = await request(app)
      .get(`/v1/organizations/${org.id}/events?limit=2&cursor=${firstPage.body.next_cursor}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.items).toHaveLength(1);
    expect(secondPage.body.next_cursor).toBeNull();

    const allIds = [...firstPage.body.items, ...secondPage.body.items].map((e: { id: string }) => e.id);
    expect(new Set(allIds).size).toBe(3);
  });
});
