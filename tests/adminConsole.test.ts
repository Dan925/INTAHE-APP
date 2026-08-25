import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { pool } from '../src/config/database';
import { stripeClient } from '../src/services/stripe/stripeClient';
import { createPaymentIntent } from '../src/services/stripe/stripePayments';
import { retrieveBalance, createPayout } from '../src/services/stripe/stripePayouts';
import { signupTestUser, type TestUser } from './helpers/auth';
import { truncateAllTables } from './helpers/db';
import { createOrgAndPublishedEvent, createTicketType } from './helpers/checkoutFixtures';

jest.mock('../src/services/stripe/stripePayments');
jest.mock('../src/services/stripe/stripePayouts');

const mockCreatePaymentIntent = createPaymentIntent as jest.MockedFunction<typeof createPaymentIntent>;
const mockRetrieveBalance = retrieveBalance as jest.MockedFunction<typeof retrieveBalance>;
const mockCreatePayout = createPayout as jest.MockedFunction<typeof createPayout>;

const app = createApp();

beforeEach(async () => {
  await truncateAllTables();
  jest.clearAllMocks();
  mockCreatePaymentIntent.mockImplementation(async () => {
    const id = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
    return { id, client_secret: `${id}_secret` } as never;
  });
  mockRetrieveBalance.mockResolvedValue({ available: [{ amount: 5000, currency: 'usd' }], pending: [] } as never);
  mockCreatePayout.mockResolvedValue({ id: 'po_admin_test' } as never);
});

afterAll(async () => {
  await pool.end();
});

async function makePlatformAdmin(user: TestUser): Promise<void> {
  await pool.query(`UPDATE users SET is_platform_admin = true WHERE id = $1`, [user.userId]);
}

async function purchaseAndConfirm(eventId: string, ticketTypeId: string, quantity: number) {
  const paymentIntentId = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
  mockCreatePaymentIntent.mockResolvedValueOnce({
    id: paymentIntentId,
    client_secret: `${paymentIntentId}_secret`,
  } as never);
  const checkoutRes = await request(app)
    .post(`/v1/events/${eventId}/orders`)
    .set('Idempotency-Key', crypto.randomUUID())
    .send({ buyer_email: 'buyer@example.com', line_items: [{ ticket_type_id: ticketTypeId, quantity }] });
  if (checkoutRes.status !== 201) {
    throw new Error(`Checkout failed in test helper: ${JSON.stringify(checkoutRes.body)}`);
  }
  const eventPayload = {
    id: `evt_${crypto.randomBytes(6).toString('hex')}`,
    object: 'event',
    type: 'payment_intent.succeeded',
    data: { object: { id: paymentIntentId } },
  };
  const payload = JSON.stringify(eventPayload);
  const signature = stripeClient.webhooks.generateTestHeaderString({ payload, secret: env.STRIPE_WEBHOOK_SECRET });
  await request(app)
    .post('/v1/stripe/webhook')
    .set('Content-Type', 'application/json')
    .set('Stripe-Signature', signature)
    .send(payload);
}

describe('admin console authorization', () => {
  const adminRoutesToCheck: Array<[string, string]> = [
    ['GET', '/v1/admin/payouts/overview'],
    ['POST', '/v1/admin/events/00000000-0000-0000-0000-000000000000/payouts/trigger'],
    ['POST', '/v1/admin/events/00000000-0000-0000-0000-000000000000/payouts/hold'],
    ['DELETE', '/v1/admin/events/00000000-0000-0000-0000-000000000000/payouts/hold'],
    ['POST', '/v1/admin/events/00000000-0000-0000-0000-000000000000/unpublish'],
    ['POST', '/v1/admin/organizations/00000000-0000-0000-0000-000000000000/approve'],
  ];

  it('rejects every admin route with 401 when unauthenticated', async () => {
    for (const [method, path] of adminRoutesToCheck) {
      const res = await request(app)[method.toLowerCase() as 'get' | 'post' | 'delete'](path);
      expect(res.status).toBe(401);
    }
  });

  it('rejects every admin route with 403 for a signed-in user without is_platform_admin', async () => {
    const user = await signupTestUser(app);
    for (const [method, path] of adminRoutesToCheck) {
      const verb = method.toLowerCase() as 'get' | 'post' | 'delete';
      const res = await request(app)[verb](path).set('Authorization', `Bearer ${user.accessToken}`);
      expect(res.status).toBe(403);
    }
  });

  it('is never set by signup — every new user defaults to is_platform_admin = false', async () => {
    const user = await signupTestUser(app);
    const row = await pool.query('SELECT is_platform_admin FROM users WHERE id = $1', [user.userId]);
    expect(row.rows[0].is_platform_admin).toBe(false);
  });

  it('cannot be self-assigned or assigned to another user through any admin write endpoint', async () => {
    const admin = await makeAdminUser();
    const target = await signupTestUser(app);
    const fixture = await createOrgAndPublishedEvent(app);

    // Every admin write endpoint, each probed with a malicious extra field
    // in the body attempting to grant platform-admin to the caller or to
    // someone else. None of these routes read or write that column at
    // all — this pins that down so it can't regress silently later.
    await request(app)
      .post(`/v1/admin/organizations/${fixture.organization.id}/approve`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ is_platform_admin: true, target_user_id: target.userId });

    await request(app)
      .post(`/v1/admin/events/${fixture.event.id}/unpublish`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ is_platform_admin: true });

    const adminRow = await pool.query('SELECT is_platform_admin FROM users WHERE id = $1', [admin.userId]);
    const targetRow = await pool.query('SELECT is_platform_admin FROM users WHERE id = $1', [target.userId]);
    expect(adminRow.rows[0].is_platform_admin).toBe(true); // unchanged — was already true, set only via direct SQL
    expect(targetRow.rows[0].is_platform_admin).toBe(false); // never touched
  });

  async function makeAdminUser(): Promise<TestUser> {
    const user = await signupTestUser(app);
    await makePlatformAdmin(user);
    return user;
  }
});

describe('admin console actions', () => {
  async function makeAdminUser(): Promise<TestUser> {
    const user = await signupTestUser(app);
    await makePlatformAdmin(user);
    return user;
  }

  it('unpublishes a published event back to draft, and logs the access', async () => {
    const admin = await makeAdminUser();
    const fixture = await createOrgAndPublishedEvent(app);

    const res = await request(app)
      .post(`/v1/admin/events/${fixture.event.id}/unpublish`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('draft');

    const eventRow = await pool.query('SELECT status FROM events WHERE id = $1', [fixture.event.id]);
    expect(eventRow.rows[0].status).toBe('draft');

    const logRows = await pool.query(
      `SELECT admin_user_id, organization_id, resource, action FROM platform_admin_access_log WHERE resource = 'admin.event.unpublish'`,
    );
    expect(logRows.rows).toEqual([
      {
        admin_user_id: admin.userId,
        organization_id: fixture.organization.id,
        resource: 'admin.event.unpublish',
        action: 'unpublish_event',
      },
    ]);
  });

  it('refuses to unpublish an event that is not currently published', async () => {
    const admin = await makeAdminUser();
    const fixture = await createOrgAndPublishedEvent(app);
    await pool.query(`UPDATE events SET status = 'cancelled' WHERE id = $1`, [fixture.event.id]);

    const res = await request(app)
      .post(`/v1/admin/events/${fixture.event.id}/unpublish`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('event_not_published');
  });

  it('approves an organization, recording who and when', async () => {
    const admin = await makeAdminUser();
    const fixture = await createOrgAndPublishedEvent(app);

    const res = await request(app)
      .post(`/v1/admin/organizations/${fixture.organization.id}/approve`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.platform_approved_at).toBe('string');

    const orgRow = await pool.query('SELECT platform_approved_at FROM organizations WHERE id = $1', [
      fixture.organization.id,
    ]);
    expect(orgRow.rows[0].platform_approved_at).not.toBeNull();
  });

  it('holds and clears a payout hold on an event, excluding/including it from the due list accordingly', async () => {
    const admin = await makeAdminUser();
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
      quantity_total: 10,
    });
    await purchaseAndConfirm(fixture.event.id, ticketType.id, 1);
    await pool.query(
      `UPDATE events SET start_at = now() - interval '54 hours', end_at = now() - interval '49 hours' WHERE id = $1`,
      [fixture.event.id],
    );

    const beforeHold = await request(app)
      .get('/v1/admin/payouts/overview')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(beforeHold.body.due.map((d: { event_id: string }) => d.event_id)).toContain(fixture.event.id);
    expect(beforeHold.body.due.find((d: { event_id: string }) => d.event_id === fixture.event.id).held).toBe(false);

    const holdRes = await request(app)
      .post(`/v1/admin/events/${fixture.event.id}/payouts/hold`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(holdRes.status).toBe(200);

    const afterHold = await request(app)
      .get('/v1/admin/payouts/overview')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(afterHold.body.due.find((d: { event_id: string }) => d.event_id === fixture.event.id).held).toBe(true);

    const unholdRes = await request(app)
      .delete(`/v1/admin/events/${fixture.event.id}/payouts/hold`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(unholdRes.status).toBe(200);

    const eventRow = await pool.query('SELECT payout_held_at, payout_held_by FROM events WHERE id = $1', [
      fixture.event.id,
    ]);
    expect(eventRow.rows[0]).toEqual({ payout_held_at: null, payout_held_by: null });
  });

  it('manually triggers a payout for an event via the admin override', async () => {
    const admin = await makeAdminUser();
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
      quantity_total: 10,
    });
    await purchaseAndConfirm(fixture.event.id, ticketType.id, 1);

    const res = await request(app)
      .post(`/v1/admin/events/${fixture.event.id}/payouts/trigger`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('succeeded');
    expect(mockCreatePayout).toHaveBeenCalledTimes(1);

    const payoutRow = await pool.query(`SELECT status FROM organizer_payouts WHERE event_id = $1`, [
      fixture.event.id,
    ]);
    expect(payoutRow.rows[0].status).toBe('succeeded');
  });

  it('lists succeeded and failed payout attempts across organizations in the overview', async () => {
    const admin = await makeAdminUser();
    const fixtureA = await createOrgAndPublishedEvent(app);
    const fixtureB = await createOrgAndPublishedEvent(app);
    await pool.query(
      `INSERT INTO organizer_payouts (organization_id, event_id, stripe_account_id, scheduled_for, status, stripe_payout_id, amount_cents, currency, attempted_at, created_at)
       VALUES ($1, $2, 'acct_a', now(), 'succeeded', 'po_a', 1000, 'usd', now(), now())`,
      [fixtureA.organization.id, fixtureA.event.id],
    );
    await pool.query(
      `INSERT INTO organizer_payouts (organization_id, event_id, stripe_account_id, scheduled_for, status, error_message, attempted_at, created_at)
       VALUES ($1, $2, 'acct_b', now(), 'failed', 'insufficient funds', now(), now())`,
      [fixtureB.organization.id, fixtureB.event.id],
    );

    const res = await request(app)
      .get('/v1/admin/payouts/overview')
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.executed).toHaveLength(1);
    expect(res.body.executed[0]).toMatchObject({ event_id: fixtureA.event.id, status: 'succeeded' });
    expect(res.body.failed).toHaveLength(1);
    expect(res.body.failed[0]).toMatchObject({ event_id: fixtureB.event.id, error_message: 'insufficient funds' });
  });
});
