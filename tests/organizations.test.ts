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

describe('POST /v1/organizations', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/v1/organizations').send({ name: 'Acme Events' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('creates an organization and makes the creator its owner', async () => {
    const user = await signupTestUser(app);

    const res = await request(app)
      .post('/v1/organizations')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Acme Events' });

    expect(res.status).toBe(201);
    expect(res.body.organization).toMatchObject({ name: 'Acme Events', slug: 'acme-events' });

    const memberRows = await pool.query(
      `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
      [res.body.organization.id, user.userId],
    );
    expect(memberRows.rows).toEqual([{ role: 'owner' }]);
  });

  it('auto-derives a unique slug when the base slug is already taken', async () => {
    const user = await signupTestUser(app);

    const first = await request(app)
      .post('/v1/organizations')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Acme Events' });
    const second = await request(app)
      .post('/v1/organizations')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Acme Events' });

    expect(first.body.organization.slug).toBe('acme-events');
    expect(second.body.organization.slug).toBe('acme-events-2');
  });

  it('rejects an explicit slug that is already taken', async () => {
    const user = await signupTestUser(app);
    await request(app)
      .post('/v1/organizations')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Acme Events', slug: 'acme' });

    const res = await request(app)
      .post('/v1/organizations')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Something Else', slug: 'acme' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('slug_already_taken');
  });
});

describe('organization access control', () => {
  it("returns a generic 403 for an organization the user isn't a member of, without revealing existence", async () => {
    const owner = await signupTestUser(app);
    const outsider = await signupTestUser(app);

    const org = await request(app)
      .post('/v1/organizations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Private Org' });

    const forbiddenRes = await request(app)
      .get(`/v1/organizations/${org.body.organization.id}`)
      .set('Authorization', `Bearer ${outsider.accessToken}`);
    const nonexistentRes = await request(app)
      .get('/v1/organizations/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${outsider.accessToken}`);

    expect(forbiddenRes.status).toBe(403);
    expect(nonexistentRes.status).toBe(403);
    expect(forbiddenRes.body).toEqual(nonexistentRes.body);
  });

  it('allows the owner to update the organization', async () => {
    const owner = await signupTestUser(app);
    const org = await request(app)
      .post('/v1/organizations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Acme Events' });

    const res = await request(app)
      .patch(`/v1/organizations/${org.body.organization.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Acme Events Inc.' });

    expect(res.status).toBe(200);
    expect(res.body.organization.name).toBe('Acme Events Inc.');
  });

  it('forbids a staff member from updating the organization', async () => {
    const owner = await signupTestUser(app);
    const staff = await signupTestUser(app);
    const org = await request(app)
      .post('/v1/organizations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Acme Events' });

    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, accepted_at)
       VALUES ($1, $2, 'staff', now())`,
      [org.body.organization.id, staff.userId],
    );

    const res = await request(app)
      .patch(`/v1/organizations/${org.body.organization.id}`)
      .set('Authorization', `Bearer ${staff.accessToken}`)
      .send({ name: 'Hijacked Name' });

    expect(res.status).toBe(403);
  });
});
