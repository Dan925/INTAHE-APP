import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/database';
import { verifyGoogleIdToken } from '../src/services/google/googleAuthClient';
import { truncateAllTables } from './helpers/db';

jest.mock('../src/services/google/googleAuthClient');

const mockVerifyGoogleIdToken = verifyGoogleIdToken as jest.MockedFunction<typeof verifyGoogleIdToken>;

const app = createApp();

beforeEach(async () => {
  await truncateAllTables();
  jest.clearAllMocks();
});

afterAll(async () => {
  await pool.end();
});

function mockGooglePayload(overrides: Partial<Awaited<ReturnType<typeof verifyGoogleIdToken>>> = {}) {
  mockVerifyGoogleIdToken.mockResolvedValueOnce({
    sub: 'google-sub-123',
    email: 'jane@example.com',
    emailVerified: true,
    fullName: 'Jane Doe',
    avatarUrl: 'https://example.com/avatar.png',
    ...overrides,
  });
}

describe('POST /v1/auth/google', () => {
  it('creates a new user on first sign-in', async () => {
    mockGooglePayload();

    const res = await request(app).post('/v1/auth/google').send({ id_token: 'valid-token' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'jane@example.com', full_name: 'Jane Doe' });
    expect(typeof res.body.access_token).toBe('string');

    const userRow = await pool.query(
      `SELECT auth_provider, password_hash, google_sub FROM users WHERE email = 'jane@example.com'`,
    );
    expect(userRow.rows[0]).toMatchObject({
      auth_provider: 'google',
      password_hash: null,
      google_sub: 'google-sub-123',
    });
  });

  it('returns the same user on a second sign-in with the same Google account', async () => {
    mockGooglePayload();
    const first = await request(app).post('/v1/auth/google').send({ id_token: 'valid-token' });

    mockGooglePayload();
    const second = await request(app).post('/v1/auth/google').send({ id_token: 'valid-token-2' });

    expect(second.body.user.id).toBe(first.body.user.id);
    const countResult = await pool.query(`SELECT count(*) FROM users`);
    expect(Number(countResult.rows[0].count)).toBe(1);
  });

  it('links Google to an existing email/password account by verified email, preserving password login', async () => {
    const signupRes = await request(app)
      .post('/v1/auth/signup')
      .send({ email: 'jane@example.com', password: 'correcthorsebattery', full_name: 'Jane Original' });
    expect(signupRes.status).toBe(201);

    mockGooglePayload({ email: 'jane@example.com' });
    const googleRes = await request(app).post('/v1/auth/google').send({ id_token: 'valid-token' });

    expect(googleRes.status).toBe(200);
    expect(googleRes.body.user.id).toBe(signupRes.body.user.id);
    // Linking shouldn't overwrite the name they originally signed up with.
    expect(googleRes.body.user.full_name).toBe('Jane Original');

    const userRow = await pool.query(
      `SELECT auth_provider, password_hash, google_sub FROM users WHERE email = 'jane@example.com'`,
    );
    expect(userRow.rows[0].auth_provider).toBe('email');
    expect(userRow.rows[0].password_hash).not.toBeNull();
    expect(userRow.rows[0].google_sub).toBe('google-sub-123');

    const loginRes = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'jane@example.com', password: 'correcthorsebattery' });
    expect(loginRes.status).toBe(200);

    const countResult = await pool.query(`SELECT count(*) FROM users`);
    expect(Number(countResult.rows[0].count)).toBe(1);
  });

  it('rejects an unverified Google email', async () => {
    mockGooglePayload({ emailVerified: false });

    const res = await request(app).post('/v1/auth/google').send({ id_token: 'valid-token' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('google_email_not_verified');
  });

  it('rejects an invalid or expired token', async () => {
    mockVerifyGoogleIdToken.mockRejectedValueOnce(new Error('Token used too late'));

    const res = await request(app).post('/v1/auth/google').send({ id_token: 'garbage' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_google_token');
  });

  it('requires id_token in the request body', async () => {
    const res = await request(app).post('/v1/auth/google').send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(mockVerifyGoogleIdToken).not.toHaveBeenCalled();
  });

  it('falls back to the email prefix when Google provides no name', async () => {
    mockGooglePayload({ fullName: null, email: 'noname@example.com' });

    const res = await request(app).post('/v1/auth/google').send({ id_token: 'valid-token' });

    expect(res.status).toBe(200);
    expect(res.body.user.full_name).toBe('noname');
  });
});
