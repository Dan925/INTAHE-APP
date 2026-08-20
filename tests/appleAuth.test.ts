import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/database';
import { verifyAppleIdToken } from '../src/services/apple/appleAuthClient';
import { truncateAllTables } from './helpers/db';

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

function mockApplePayload(overrides: Partial<Awaited<ReturnType<typeof verifyAppleIdToken>>> = {}) {
  mockVerifyAppleIdToken.mockResolvedValueOnce({
    sub: 'apple-sub-123',
    email: 'jane@example.com',
    emailVerified: true,
    ...overrides,
  });
}

describe('POST /v1/auth/apple', () => {
  it('creates a new user on first sign-in, using the client-supplied full name', async () => {
    mockApplePayload();

    const res = await request(app)
      .post('/v1/auth/apple')
      .send({ identity_token: 'valid-token', full_name: 'Jane Doe' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'jane@example.com', full_name: 'Jane Doe' });
    expect(typeof res.body.access_token).toBe('string');

    const userRow = await pool.query(
      `SELECT auth_provider, password_hash, apple_sub FROM users WHERE email = 'jane@example.com'`,
    );
    expect(userRow.rows[0]).toMatchObject({
      auth_provider: 'apple',
      password_hash: null,
      apple_sub: 'apple-sub-123',
    });
  });

  it('returns the same user on a second sign-in with the same Apple account, without a name in the request', async () => {
    mockApplePayload();
    const first = await request(app)
      .post('/v1/auth/apple')
      .send({ identity_token: 'valid-token', full_name: 'Jane Doe' });

    mockApplePayload();
    const second = await request(app).post('/v1/auth/apple').send({ identity_token: 'valid-token-2' });

    expect(second.status).toBe(200);
    expect(second.body.user.id).toBe(first.body.user.id);
    const countResult = await pool.query(`SELECT count(*) FROM users`);
    expect(Number(countResult.rows[0].count)).toBe(1);
  });

  it('links Apple to an existing email/password account by verified email, preserving password login', async () => {
    const signupRes = await request(app)
      .post('/v1/auth/signup')
      .send({ email: 'jane@example.com', password: 'correcthorsebattery', full_name: 'Jane Original' });
    expect(signupRes.status).toBe(201);

    mockApplePayload({ email: 'jane@example.com' });
    const appleRes = await request(app).post('/v1/auth/apple').send({ identity_token: 'valid-token' });

    expect(appleRes.status).toBe(200);
    expect(appleRes.body.user.id).toBe(signupRes.body.user.id);
    // Linking shouldn't overwrite the name they originally signed up with.
    expect(appleRes.body.user.full_name).toBe('Jane Original');

    const userRow = await pool.query(
      `SELECT auth_provider, password_hash, apple_sub FROM users WHERE email = 'jane@example.com'`,
    );
    expect(userRow.rows[0].auth_provider).toBe('email');
    expect(userRow.rows[0].password_hash).not.toBeNull();
    expect(userRow.rows[0].apple_sub).toBe('apple-sub-123');

    const loginRes = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'jane@example.com', password: 'correcthorsebattery' });
    expect(loginRes.status).toBe(200);

    const countResult = await pool.query(`SELECT count(*) FROM users`);
    expect(Number(countResult.rows[0].count)).toBe(1);
  });

  it('rejects an unverified Apple email', async () => {
    mockApplePayload({ emailVerified: false });

    const res = await request(app).post('/v1/auth/apple').send({ identity_token: 'valid-token' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('apple_email_not_verified');
  });

  it('rejects an invalid or expired token', async () => {
    mockVerifyAppleIdToken.mockRejectedValueOnce(new Error('signature verification failed'));

    const res = await request(app).post('/v1/auth/apple').send({ identity_token: 'garbage' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_apple_token');
  });

  it('requires identity_token in the request body', async () => {
    const res = await request(app).post('/v1/auth/apple').send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(mockVerifyAppleIdToken).not.toHaveBeenCalled();
  });

  it('falls back to the email prefix when no full name is supplied on first sign-in', async () => {
    mockApplePayload({ email: 'noname@example.com' });

    const res = await request(app).post('/v1/auth/apple').send({ identity_token: 'valid-token' });

    expect(res.status).toBe(200);
    expect(res.body.user.full_name).toBe('noname');
  });
});
