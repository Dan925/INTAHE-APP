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

async function createOrg(owner: Awaited<ReturnType<typeof signupTestUser>>, name = 'Acme Events') {
  const res = await request(app)
    .post('/v1/organizations')
    .set('Authorization', `Bearer ${owner.accessToken}`)
    .send({ name });
  return res.body.organization as { id: string };
}

describe('POST /v1/organizations/:organizationId/members/invite', () => {
  it('invites an existing user by email', async () => {
    const owner = await signupTestUser(app);
    const invitee = await signupTestUser(app);
    const org = await createOrg(owner);

    const res = await request(app)
      .post(`/v1/organizations/${org.id}/members/invite`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: invitee.email, role: 'staff' });

    expect(res.status).toBe(201);
    expect(res.body.member).toMatchObject({
      user_id: invitee.userId,
      email: invitee.email,
      role: 'staff',
      accepted_at: null,
    });
    expect(res.body.member.invited_at).toEqual(expect.any(String));
  });

  it("rejects inviting an email that doesn't have an Intahe account", async () => {
    const owner = await signupTestUser(app);
    const org = await createOrg(owner);

    const res = await request(app)
      .post(`/v1/organizations/${org.id}/members/invite`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: 'nobody@example.com', role: 'staff' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('invitee_not_found');
  });

  it('rejects inviting someone with role owner', async () => {
    const owner = await signupTestUser(app);
    const invitee = await signupTestUser(app);
    const org = await createOrg(owner);

    const res = await request(app)
      .post(`/v1/organizations/${org.id}/members/invite`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: invitee.email, role: 'owner' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('rejects a duplicate pending invite', async () => {
    const owner = await signupTestUser(app);
    const invitee = await signupTestUser(app);
    const org = await createOrg(owner);
    await request(app)
      .post(`/v1/organizations/${org.id}/members/invite`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: invitee.email, role: 'staff' });

    const res = await request(app)
      .post(`/v1/organizations/${org.id}/members/invite`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: invitee.email, role: 'admin' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('invite_already_pending');
  });

  it('rejects inviting someone who is already an accepted member', async () => {
    const owner = await signupTestUser(app);
    const invitee = await signupTestUser(app);
    const org = await createOrg(owner);
    await request(app)
      .post(`/v1/organizations/${org.id}/members/invite`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: invitee.email, role: 'staff' });
    await request(app)
      .post(`/v1/organizations/${org.id}/members/accept`)
      .set('Authorization', `Bearer ${invitee.accessToken}`);

    const res = await request(app)
      .post(`/v1/organizations/${org.id}/members/invite`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: invitee.email, role: 'admin' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('already_a_member');
  });

  it('forbids a staff member from inviting others', async () => {
    const owner = await signupTestUser(app);
    const staff = await signupTestUser(app);
    const invitee = await signupTestUser(app);
    const org = await createOrg(owner);
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, accepted_at) VALUES ($1, $2, 'staff', now())`,
      [org.id, staff.userId],
    );

    const res = await request(app)
      .post(`/v1/organizations/${org.id}/members/invite`)
      .set('Authorization', `Bearer ${staff.accessToken}`)
      .send({ email: invitee.email, role: 'volunteer' });

    expect(res.status).toBe(403);
  });
});

describe('POST /v1/organizations/:organizationId/members/accept', () => {
  it('lets the invited user accept and then act with their new role', async () => {
    const owner = await signupTestUser(app);
    const invitee = await signupTestUser(app);
    const org = await createOrg(owner);
    await request(app)
      .post(`/v1/organizations/${org.id}/members/invite`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: invitee.email, role: 'admin' });

    const acceptRes = await request(app)
      .post(`/v1/organizations/${org.id}/members/accept`)
      .set('Authorization', `Bearer ${invitee.accessToken}`);
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.member.accepted_at).toEqual(expect.any(String));

    // Now an accepted admin, they should pass requireOrgRole('admin').
    const patchRes = await request(app)
      .patch(`/v1/organizations/${org.id}`)
      .set('Authorization', `Bearer ${invitee.accessToken}`)
      .send({ name: 'Renamed by new admin' });
    expect(patchRes.status).toBe(200);
  });

  it('rejects accepting when there is no pending invite', async () => {
    const owner = await signupTestUser(app);
    const outsider = await signupTestUser(app);
    const org = await createOrg(owner);

    const res = await request(app)
      .post(`/v1/organizations/${org.id}/members/accept`)
      .set('Authorization', `Bearer ${outsider.accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('invite_not_found');
  });
});

describe('member management protects the owner invariant', () => {
  it('never lets the owner be removed', async () => {
    const owner = await signupTestUser(app);
    const org = await createOrg(owner);
    const memberRow = await pool.query('SELECT id FROM organization_members WHERE organization_id = $1', [
      org.id,
    ]);
    const ownerMemberId = memberRow.rows[0].id;

    const res = await request(app)
      .delete(`/v1/organizations/${org.id}/members/${ownerMemberId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('cannot_remove_owner');
  });

  it("never lets the owner's role be changed via the member update endpoint", async () => {
    const owner = await signupTestUser(app);
    const org = await createOrg(owner);
    const memberRow = await pool.query('SELECT id FROM organization_members WHERE organization_id = $1', [
      org.id,
    ]);
    const ownerMemberId = memberRow.rows[0].id;

    const res = await request(app)
      .patch(`/v1/organizations/${org.id}/members/${ownerMemberId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ role: 'admin' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('cannot_modify_owner');
  });

  it('lets an admin remove a staff member', async () => {
    const owner = await signupTestUser(app);
    const staff = await signupTestUser(app);
    const org = await createOrg(owner);
    const insertRes = await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, accepted_at) VALUES ($1, $2, 'staff', now()) RETURNING id`,
      [org.id, staff.userId],
    );
    const memberId = insertRes.rows[0].id;

    const res = await request(app)
      .delete(`/v1/organizations/${org.id}/members/${memberId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(204);
    const remaining = await pool.query('SELECT id FROM organization_members WHERE id = $1', [memberId]);
    expect(remaining.rows).toHaveLength(0);
  });
});

describe('GET /v1/organizations/:organizationId/members', () => {
  it('lists members with user details, owner/admin only', async () => {
    const owner = await signupTestUser(app);
    const staff = await signupTestUser(app);
    const org = await createOrg(owner);
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, accepted_at) VALUES ($1, $2, 'staff', now())`,
      [org.id, staff.userId],
    );

    const res = await request(app)
      .get(`/v1/organizations/${org.id}/members`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    const roles = res.body.items.map((m: { role: string }) => m.role).sort();
    expect(roles).toEqual(['owner', 'staff']);

    const forbiddenRes = await request(app)
      .get(`/v1/organizations/${org.id}/members`)
      .set('Authorization', `Bearer ${staff.accessToken}`);
    expect(forbiddenRes.status).toBe(403);
  });
});
