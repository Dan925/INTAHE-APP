// Rate limiting is disabled by default under NODE_ENV=test (see
// config/env.ts) because the rest of the suite hits these routes many times
// from one fixed, un-forwarded IP via shared fixture helpers — not a real
// attack pattern, and not what those tests are checking. This file opts
// back in explicitly, and only for itself: env.ts is re-parsed fresh per
// Jest test file (separate module registry), so this must run before any
// src/ import pulls env.ts in, and must be undone in afterAll so it doesn't
// leak into whichever test file Jest runs next in the same --runInBand
// process.
process.env['RATE_LIMIT_ENABLED'] = 'true';

import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/database';
import { createIpRateLimiter, createTargetRateLimiter } from '../src/middleware/rateLimit';
import { createPaymentIntent } from '../src/services/stripe/stripePayments';
import { truncateAllTables } from './helpers/db';
import { createOrgAndPublishedEvent, createTicketType } from './helpers/checkoutFixtures';

jest.mock('../src/services/stripe/stripePayments');

const mockCreatePaymentIntent = createPaymentIntent as jest.MockedFunction<typeof createPaymentIntent>;

const app = createApp();

beforeEach(async () => {
  await truncateAllTables();
  jest.clearAllMocks();
  mockCreatePaymentIntent.mockImplementation(async () => {
    const id = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
    return { id, client_secret: `${id}_secret` } as never;
  });
});

afterAll(async () => {
  delete process.env['RATE_LIMIT_ENABLED'];
  await pool.end();
});

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

// --- Unit tests: the middleware factories in isolation, with small explicit
// limits, mounted on throwaway apps. Fast and deterministic — no dependency
// on production defaults or on how many other tests share the real app's
// login/signup buckets.

describe('createIpRateLimiter', () => {
  function buildProbeApp(limit: number) {
    const probeApp = express();
    probeApp.set('trust proxy', 1);
    probeApp.use(createIpRateLimiter(60_000, limit));
    probeApp.get('/probe', (_req, res) => res.status(200).json({ ok: true }));
    return probeApp;
  }

  it('allows up to the limit from one IP, then responds 429 with Retry-After', async () => {
    const probeApp = buildProbeApp(3);

    for (let i = 0; i < 3; i++) {
      const res = await request(probeApp).get('/probe').set('X-Forwarded-For', '203.0.113.10');
      expect(res.status).toBe(200);
    }

    const blocked = await request(probeApp).get('/probe').set('X-Forwarded-For', '203.0.113.10');
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(blocked.body).toEqual({
      error: { code: 'rate_limited', message: expect.any(String), field: null },
    });
  });

  it('keeps separate buckets per client IP, reading the real IP via X-Forwarded-For behind trust proxy', async () => {
    const probeApp = buildProbeApp(3);

    // Each of these IPs individually stays under the limit of 3 — if trust
    // proxy were misconfigured (or absent) and every request collapsed onto
    // one apparent IP (Render's proxy), the 4th request here would already
    // be blocked. It must not be.
    for (const ip of ['198.51.100.1', '198.51.100.2', '198.51.100.3', '198.51.100.4']) {
      const res = await request(probeApp).get('/probe').set('X-Forwarded-For', ip);
      expect(res.status).toBe(200);
    }
  });
});

describe('createTargetRateLimiter', () => {
  function buildProbeApp(limit: number) {
    const probeApp = express();
    probeApp.set('trust proxy', 1);
    probeApp.use(express.json());
    probeApp.use(
      createTargetRateLimiter(60_000, limit, (req) => {
        const value = (req.body as Record<string, unknown> | undefined)?.['email'];
        return typeof value === 'string' ? value : undefined;
      }),
    );
    probeApp.post('/probe', (_req, res) => res.status(200).json({ ok: true }));
    return probeApp;
  }

  it('blocks by target identifier even across different client IPs', async () => {
    const probeApp = buildProbeApp(2);

    for (const ip of ['192.0.2.1', '192.0.2.2']) {
      const res = await request(probeApp).post('/probe').set('X-Forwarded-For', ip).send({ email: 'same@example.com' });
      expect(res.status).toBe(200);
    }

    const blocked = await request(probeApp)
      .post('/probe')
      .set('X-Forwarded-For', '192.0.2.99')
      .send({ email: 'same@example.com' });
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('does not count requests for a different target against the same bucket', async () => {
    const probeApp = buildProbeApp(2);

    for (let i = 0; i < 5; i++) {
      const res = await request(probeApp).post('/probe').send({ email: `distinct-${i}@example.com` });
      expect(res.status).toBe(200);
    }
  });
});

// --- Integration tests: the real app, real routes, default (production)
// limits — proving the limiters are actually wired onto the 4 required
// endpoints and that trust proxy correctly separates simulated clients.

describe('rate limiting wired onto the real routes', () => {
  it('POST /v1/auth/login blocks by email across many different client IPs, with Retry-After', async () => {
    const email = uniqueEmail('login-target');

    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post('/v1/auth/login')
        .set('X-Forwarded-For', `10.1.0.${i}`)
        .send({ email, password: 'wrong-password' });
      expect(res.status).not.toBe(429);
    }

    const blocked = await request(app)
      .post('/v1/auth/login')
      .set('X-Forwarded-For', '10.1.0.250')
      .send({ email, password: 'wrong-password' });
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(blocked.body.error.code).toBe('rate_limited');
  });

  it('POST /v1/auth/login blocks by IP across many different emails, without collapsing distinct simulated IPs', async () => {
    const ip = '10.2.0.1';

    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post('/v1/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email: uniqueEmail(`login-ip-${i}`), password: 'wrong-password' });
      expect(res.status).not.toBe(429);
    }

    const blocked = await request(app)
      .post('/v1/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email: uniqueEmail('login-ip-last'), password: 'wrong-password' });
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();

    // A different simulated client IP is an entirely separate bucket and
    // must not have been affected by the one above tripping.
    const other = await request(app)
      .post('/v1/auth/login')
      .set('X-Forwarded-For', '10.2.0.2')
      .send({ email: uniqueEmail('login-ip-other'), password: 'wrong-password' });
    expect(other.status).not.toBe(429);
  });

  it('POST /v1/auth/signup blocks repeated signup attempts for the same email', async () => {
    const email = uniqueEmail('signup-target');

    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post('/v1/auth/signup')
        .set('X-Forwarded-For', `10.3.0.${i}`)
        .send({ email, password: 'correcthorsebattery', full_name: 'Rate Limit Test' });
      expect(res.status).not.toBe(429);
    }

    const blocked = await request(app)
      .post('/v1/auth/signup')
      .set('X-Forwarded-For', '10.3.0.250')
      .send({ email, password: 'correcthorsebattery', full_name: 'Rate Limit Test' });
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('POST /v1/auth/password-reset/request blocks repeated requests for the same email', async () => {
    const email = uniqueEmail('reset-target');

    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post('/v1/auth/password-reset/request')
        .set('X-Forwarded-For', `10.4.0.${i}`)
        .send({ email });
      expect(res.status).not.toBe(429);
    }

    const blocked = await request(app)
      .post('/v1/auth/password-reset/request')
      .set('X-Forwarded-For', '10.4.0.250')
      .send({ email });
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('GET /v1/events/:eventId/orders/:orderId/tickets blocks repeated lookups against the same order', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 1000,
      quantity_total: 100,
    });
    const buyerEmail = uniqueEmail('ticket-lookup');

    const orderRes = await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', 'rate-limit-ticket-lookup-order')
      .send({ buyer_email: buyerEmail, line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.order.id;
    const token = orderRes.body.ticket_access_token;

    // The target-identifier dimension here keys on the order being looked
    // up (see paramsOrderId in src/middleware/rateLimit.ts) rather than
    // buyer_email, which this route no longer accepts at all — a wrong
    // token is rejected by ticketService's ownership check, not by rate
    // limiting, so these requests use the real token throughout.
    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .get(`/v1/events/${fixture.event.id}/orders/${orderId}/tickets`)
        .set('X-Forwarded-For', `10.5.0.${i}`)
        .query({ token });
      expect(res.status).not.toBe(429);
    }

    const blocked = await request(app)
      .get(`/v1/events/${fixture.event.id}/orders/${orderId}/tickets`)
      .set('X-Forwarded-For', '10.5.0.250')
      .query({ token });
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });
});
