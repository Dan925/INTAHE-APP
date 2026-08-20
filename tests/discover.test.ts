import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/database';
import { truncateAllTables } from './helpers/db';
import { signupTestUser } from './helpers/auth';
import { createOrgAndPublishedEvent, createTicketType } from './helpers/checkoutFixtures';

const app = createApp();

beforeEach(async () => {
  await truncateAllTables();
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
});
