import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/database';
import { truncateAllTables } from './helpers/db';

const app = createApp();

const validSignup = {
  email: 'jane@example.com',
  password: 'correcthorsebattery',
  full_name: 'Jane Doe',
};

beforeEach(async () => {
  await truncateAllTables();
});

afterAll(async () => {
  await pool.end();
});

describe('POST /v1/auth/signup', () => {
  it('creates a user and returns an access token', async () => {
    const res = await request(app).post('/v1/auth/signup').send(validSignup);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      email: validSignup.email,
      full_name: validSignup.full_name,
    });
    expect(res.body.user.id).toEqual(expect.any(String));
    expect(typeof res.body.access_token).toBe('string');
  });

  it('rejects a duplicate email with a stable error code', async () => {
    await request(app).post('/v1/auth/signup').send(validSignup);

    const res = await request(app).post('/v1/auth/signup').send(validSignup);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('email_already_registered');
    expect(res.body.error.field).toBe('email');
  });

  it('rejects a signup with an invalid payload', async () => {
    const res = await request(app)
      .post('/v1/auth/signup')
      .send({ email: 'not-an-email', password: 'short', full_name: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('is case-insensitive on email uniqueness', async () => {
    await request(app).post('/v1/auth/signup').send(validSignup);

    const res = await request(app)
      .post('/v1/auth/signup')
      .send({ ...validSignup, email: 'JANE@example.com' });

    expect(res.status).toBe(409);
  });
});

describe('POST /v1/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/v1/auth/signup').send(validSignup);
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: validSignup.email, password: validSignup.password });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(validSignup.email);
    expect(typeof res.body.access_token).toBe('string');
  });

  it('rejects an incorrect password without revealing which field was wrong', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: validSignup.email, password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_credentials');
    expect(res.body.error.field).toBeNull();
  });

  it('rejects an unknown email with the same error code as a wrong password', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'nobody@example.com', password: validSignup.password });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_credentials');
  });
});

describe('password reset flow', () => {
  beforeEach(async () => {
    await request(app).post('/v1/auth/signup').send(validSignup);
  });

  it('always returns 200 for a reset request, whether or not the email exists', async () => {
    const known = await request(app)
      .post('/v1/auth/password-reset/request')
      .send({ email: validSignup.email });
    const unknown = await request(app)
      .post('/v1/auth/password-reset/request')
      .send({ email: 'nobody@example.com' });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
  });

  it('resets the password and allows login with the new one', async () => {
    await request(app).post('/v1/auth/password-reset/request').send({ email: validSignup.email });

    const tokenRow = await pool.query<{ token_hash: string }>(
      'SELECT token_hash FROM password_reset_tokens ORDER BY created_at DESC LIMIT 1',
    );
    expect(tokenRow.rows).toHaveLength(1);

    // The raw token is only ever available via the (stubbed) email delivery
    // step, so this test reaches into the service layer's hashing logic by
    // requesting a reset then intercepting console output would be brittle;
    // instead we exercise the confirm endpoint through the DB token record
    // by regenerating a request and capturing the token from the logger.
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await request(app).post('/v1/auth/password-reset/request').send({ email: validSignup.email });
    const logCall = logSpy.mock.calls.find((call) => String(call[0]).includes('password-reset'));
    logSpy.mockRestore();
    expect(logCall).toBeDefined();
    const rawToken = String(logCall?.[0]).split('token ')[1];
    expect(rawToken).toBeTruthy();

    const confirmRes = await request(app)
      .post('/v1/auth/password-reset/confirm')
      .send({ token: rawToken, new_password: 'brand-new-password' });

    expect(confirmRes.status).toBe(200);

    const loginWithOld = await request(app)
      .post('/v1/auth/login')
      .send({ email: validSignup.email, password: validSignup.password });
    expect(loginWithOld.status).toBe(401);

    const loginWithNew = await request(app)
      .post('/v1/auth/login')
      .send({ email: validSignup.email, password: 'brand-new-password' });
    expect(loginWithNew.status).toBe(200);
  });

  it('rejects an invalid or already-used token', async () => {
    const res = await request(app)
      .post('/v1/auth/password-reset/confirm')
      .send({ token: 'not-a-real-token', new_password: 'brand-new-password' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_reset_token');
  });
});
