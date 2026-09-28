import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/database';

const app = createApp();

afterAll(async () => {
  await pool.end();
});

describe('GET /forgot-password and /reset-password', () => {
  it('renders /forgot-password', async () => {
    const res = await request(app).get('/forgot-password');
    expect(res.status).toBe(200);
    expect(res.text).toContain('forgotPasswordPage.js');
  });

  it('renders /reset-password', async () => {
    const res = await request(app).get('/reset-password');
    expect(res.status).toBe(200);
    expect(res.text).toContain('resetPasswordPage.js');
  });
});
