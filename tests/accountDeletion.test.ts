import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/database';
import { verifyAppleIdToken } from '../src/services/apple/appleAuthClient';
import { truncateAllTables } from './helpers/db';
import { signupTestUser } from './helpers/auth';

jest.mock('../src/services/apple/appleAuthClient');

const mockVerifyAppleIdToken = verifyAppleIdToken as jest.MockedFunction<typeof verifyAppleIdToken>;

const app = createApp();

beforeEach(async () => {
  await truncateAllTables();
  jest.clearAllMocks();
});

afterAll(async () => {
  await pool.end();
});

describe('DELETE /v1/me', () => {
  it('requires the correct password for an email/password account', async () => {
    const user = await signupTestUser(app);

    const wrongPassword = await request(app)
      .delete('/v1/me')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ password: 'not-the-password' });
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('invalid_password');

    const missingPassword = await request(app).delete('/v1/me').set('Authorization', `Bearer ${user.accessToken}`);
    expect(missingPassword.status).toBe(401);
    expect(missingPassword.body.error.code).toBe('invalid_password');

    const userRow = await pool.query(`SELECT deleted_at FROM users WHERE id = $1`, [user.userId]);
    expect(userRow.rows[0].deleted_at).toBeNull();
  });

  it('scrubs PII and soft-deletes the account with the correct password', async () => {
    const user = await signupTestUser(app, { email: 'jane@example.com', full_name: 'Jane Doe' });

    const res = await request(app)
      .delete('/v1/me')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ password: 'correcthorsebattery' });
    expect(res.status).toBe(204);

    const userRow = await pool.query(
      `SELECT deleted_at, email, full_name, phone, avatar_url, password_hash, google_sub, apple_sub
       FROM users WHERE id = $1`,
      [user.userId],
    );
    const row = userRow.rows[0];
    expect(row.deleted_at).not.toBeNull();
    expect(row.email).toBe(`deleted-${user.userId}@intahe.invalid`);
    expect(row.full_name).toBe('Deleted user');
    expect(row.phone).toBeNull();
    expect(row.avatar_url).toBeNull();
    // The password hash is left in place for an email/password account —
    // the DB's users_password_required_for_email_provider constraint
    // requires it — but it's harmless once deleted_at is set, since login
    // filters deleted accounts out before it ever checks the password.
    expect(row.password_hash).not.toBeNull();
    expect(row.google_sub).toBeNull();
    expect(row.apple_sub).toBeNull();

    const loginRes = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'jane@example.com', password: 'correcthorsebattery' });
    expect(loginRes.status).toBe(401);
  });

  it('frees the original email for a fresh signup after deletion', async () => {
    const user = await signupTestUser(app, { email: 'jane@example.com' });
    await request(app)
      .delete('/v1/me')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ password: 'correcthorsebattery' });

    const resignupRes = await request(app)
      .post('/v1/auth/signup')
      .send({ email: 'jane@example.com', password: 'a-different-password', full_name: 'New Jane' });
    expect(resignupRes.status).toBe(201);
  });

  it('deletes a Google/Apple-only account with no password required', async () => {
    mockVerifyAppleIdToken.mockResolvedValueOnce({
      sub: 'apple-sub-123',
      email: 'noPassword@example.com',
      emailVerified: true,
    });
    const appleRes = await request(app)
      .post('/v1/auth/apple')
      .send({ identity_token: 'valid-token', full_name: 'No Password' });
    expect(appleRes.status).toBe(200);

    const res = await request(app)
      .delete('/v1/me')
      .set('Authorization', `Bearer ${appleRes.body.access_token}`)
      .send({});
    expect(res.status).toBe(204);

    const userRow = await pool.query(`SELECT deleted_at FROM users WHERE id = $1`, [appleRes.body.user.id]);
    expect(userRow.rows[0].deleted_at).not.toBeNull();
  });

  it('blocks deletion while the user is the sole owner of an active organization', async () => {
    const owner = await signupTestUser(app);
    await request(app)
      .post('/v1/organizations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Owner Org' });

    const res = await request(app)
      .delete('/v1/me')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ password: 'correcthorsebattery' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('owns_organizations');

    const userRow = await pool.query(`SELECT deleted_at FROM users WHERE id = $1`, [owner.userId]);
    expect(userRow.rows[0].deleted_at).toBeNull();
  });

  it('allows deletion for a non-owner member (staff) of an organization', async () => {
    const owner = await signupTestUser(app);
    const orgRes = await request(app)
      .post('/v1/organizations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Staffed Org' });
    const organization = orgRes.body.organization;

    const staff = await signupTestUser(app);
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, accepted_at) VALUES ($1, $2, 'staff', now())`,
      [organization.id, staff.userId],
    );

    const res = await request(app)
      .delete('/v1/me')
      .set('Authorization', `Bearer ${staff.accessToken}`)
      .send({ password: 'correcthorsebattery' });
    expect(res.status).toBe(204);
  });
});
