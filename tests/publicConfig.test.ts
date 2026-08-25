import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/database';
import { env } from '../src/config/env';

const app = createApp();

afterAll(async () => {
  await pool.end();
});

describe('GET /v1/config', () => {
  it('exposes the configured minimum ticket price, unauthenticated', async () => {
    const res = await request(app).get('/v1/config');

    expect(res.status).toBe(200);
    expect(res.body.min_ticket_price_cents).toBe(env.MIN_TICKET_PRICE_CENTS);
  });
});
