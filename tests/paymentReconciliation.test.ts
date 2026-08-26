import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/database';
import { createPaymentIntent, retrievePaymentIntent } from '../src/services/stripe/stripePayments';
import { sendEmail } from '../src/services/email/emailClient';
import { runReconciliationSweep } from '../src/services/reconciliation/paymentReconciliationService';
import { signupTestUser, type TestUser } from './helpers/auth';
import { truncateAllTables } from './helpers/db';
import { createOrgAndPublishedEvent, createTicketType } from './helpers/checkoutFixtures';

jest.mock('../src/services/stripe/stripePayments');
jest.mock('../src/services/email/emailClient');

const mockCreatePaymentIntent = createPaymentIntent as jest.MockedFunction<typeof createPaymentIntent>;
const mockRetrievePaymentIntent = retrievePaymentIntent as jest.MockedFunction<typeof retrievePaymentIntent>;
const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;

const app = createApp();

beforeEach(async () => {
  await truncateAllTables();
  jest.clearAllMocks();
  mockSendEmail.mockResolvedValue(undefined);
});

afterAll(async () => {
  await pool.end();
});

async function makePlatformAdmin(user: TestUser): Promise<void> {
  await pool.query(`UPDATE users SET is_platform_admin = true WHERE id = $1`, [user.userId]);
}

async function makeAdminUser(): Promise<TestUser> {
  const user = await signupTestUser(app);
  await makePlatformAdmin(user);
  return user;
}

/**
 * Checkout only — deliberately never confirms via the webhook, leaving the
 * order 'pending'. This is the exact shape of the failure this feature
 * exists to catch: a real PaymentIntent exists, but nothing has told this
 * app it succeeded.
 */
async function createStuckOrder(eventId: string, ticketTypeId: string): Promise<{ orderId: string; paymentIntentId: string }> {
  const paymentIntentId = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
  mockCreatePaymentIntent.mockResolvedValueOnce({
    id: paymentIntentId,
    client_secret: `${paymentIntentId}_secret`,
  } as never);

  const checkoutRes = await request(app)
    .post(`/v1/events/${eventId}/orders`)
    .set('Idempotency-Key', crypto.randomUUID())
    .send({ buyer_email: 'buyer@example.com', line_items: [{ ticket_type_id: ticketTypeId, quantity: 1 }] });
  if (checkoutRes.status !== 201) {
    throw new Error(`Checkout failed in test helper: ${JSON.stringify(checkoutRes.body)}`);
  }
  return { orderId: checkoutRes.body.order.id, paymentIntentId };
}

describe('payment reconciliation sweep', () => {
  it('flags a pending order whose PaymentIntent already succeeded at Stripe, and alerts every platform admin', async () => {
    const admin1 = await makeAdminUser();
    const admin2 = await makeAdminUser();
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
    });
    const { orderId, paymentIntentId } = await createStuckOrder(fixture.event.id, ticketType.id);
    mockRetrievePaymentIntent.mockResolvedValue({ id: paymentIntentId, status: 'succeeded' } as never);

    const futureNow = new Date(Date.now() + 15 * 60_000);
    const summary = await runReconciliationSweep(futureNow);

    expect(summary.newIncidents).toBe(1);
    expect(summary.autoResolved).toBe(0);

    const incidentRows = await pool.query(
      `SELECT order_id, stripe_payment_intent_id, resolved_at FROM payment_reconciliation_incidents WHERE order_id = $1`,
      [orderId],
    );
    expect(incidentRows.rows).toHaveLength(1);
    expect(incidentRows.rows[0].stripe_payment_intent_id).toBe(paymentIntentId);
    expect(incidentRows.rows[0].resolved_at).toBeNull();

    // The sweep only detects and alerts — it never issues tickets itself.
    const orderRow = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId]);
    expect(orderRow.rows[0].status).toBe('pending');

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    const recipients = mockSendEmail.mock.calls.map((call) => call[0].to).sort();
    expect(recipients).toEqual([admin1.email, admin2.email].sort());
    expect(mockSendEmail.mock.calls[0]![0].html).toContain(orderId);
  });

  it('does not flag a pending order still younger than RECONCILIATION_STALE_MINUTES', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
    });
    const { paymentIntentId } = await createStuckOrder(fixture.event.id, ticketType.id);
    mockRetrievePaymentIntent.mockResolvedValue({ id: paymentIntentId, status: 'succeeded' } as never);

    const summary = await runReconciliationSweep(new Date());

    expect(summary.checked).toBe(0);
    expect(summary.newIncidents).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('does not flag a pending order whose PaymentIntent has not succeeded yet', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
    });
    const { paymentIntentId } = await createStuckOrder(fixture.event.id, ticketType.id);
    mockRetrievePaymentIntent.mockResolvedValue({ id: paymentIntentId, status: 'requires_payment_method' } as never);

    const futureNow = new Date(Date.now() + 15 * 60_000);
    const summary = await runReconciliationSweep(futureNow);

    expect(summary.newIncidents).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('auto-resolves an open incident once the order reaches paid on its own (a late webhook catching up)', async () => {
    const admin = await makeAdminUser();
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
    });
    const { orderId, paymentIntentId } = await createStuckOrder(fixture.event.id, ticketType.id);
    mockRetrievePaymentIntent.mockResolvedValue({ id: paymentIntentId, status: 'succeeded' } as never);
    const futureNow = new Date(Date.now() + 15 * 60_000);
    await runReconciliationSweep(futureNow);
    mockSendEmail.mockClear();

    // Simulate the delayed webhook retry finally arriving on its own,
    // independently of the admin reconciliation action.
    await pool.query(`UPDATE orders SET status = 'paid' WHERE id = $1`, [orderId]);

    const summary = await runReconciliationSweep(new Date(futureNow.getTime() + 60_000));

    expect(summary.autoResolved).toBe(1);
    expect(summary.newIncidents).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();

    const incidentRows = await pool.query(
      `SELECT resolved_at, resolution, resolved_by FROM payment_reconciliation_incidents WHERE order_id = $1`,
      [orderId],
    );
    expect(incidentRows.rows[0].resolved_at).not.toBeNull();
    expect(incidentRows.rows[0].resolution).toBe('webhook_caught_up');
    expect(incidentRows.rows[0].resolved_by).toBeNull();
    void admin;
  });
});

describe('POST /v1/admin/orders/:orderId/reconcile', () => {
  it('rejects a non-admin with 403', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
    });
    const { orderId } = await createStuckOrder(fixture.event.id, ticketType.id);
    const nonAdmin = await signupTestUser(app);

    const res = await request(app)
      .post(`/v1/admin/orders/${orderId}/reconcile`)
      .set('Authorization', `Bearer ${nonAdmin.accessToken}`);

    expect(res.status).toBe(403);
  });

  it('reissues tickets for a stuck order, without a new payment, and resolves its incident', async () => {
    const admin = await makeAdminUser();
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
    });
    const { orderId, paymentIntentId } = await createStuckOrder(fixture.event.id, ticketType.id);
    mockRetrievePaymentIntent.mockResolvedValue({ id: paymentIntentId, status: 'succeeded' } as never);
    // Let the sweep create the incident first, matching the real sequence
    // (alert fires, then an admin acts on it).
    await runReconciliationSweep(new Date(Date.now() + 15 * 60_000));
    mockSendEmail.mockClear();

    const res = await request(app)
      .post(`/v1/admin/orders/${orderId}/reconcile`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('paid');
    expect(res.body.already_resolved).toBe(false);

    // createPaymentIntent (i.e. a new payment) was never called again —
    // only the original checkout call from createStuckOrder.
    expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(1);

    const orderRow = await pool.query('SELECT status, tickets_issued_at FROM orders WHERE id = $1', [orderId]);
    expect(orderRow.rows[0].status).toBe('paid');
    expect(orderRow.rows[0].tickets_issued_at).not.toBeNull();

    const ticketRows = await pool.query('SELECT id FROM tickets WHERE order_id = $1', [orderId]);
    expect(ticketRows.rows).toHaveLength(1);

    const incidentRows = await pool.query(
      `SELECT resolved_at, resolved_by, resolution FROM payment_reconciliation_incidents WHERE order_id = $1`,
      [orderId],
    );
    expect(incidentRows.rows[0].resolved_at).not.toBeNull();
    expect(incidentRows.rows[0].resolved_by).toBe(admin.userId);
    expect(incidentRows.rows[0].resolution).toBe('manual_reissue');

    const logRows = await pool.query(
      `SELECT admin_user_id, organization_id, resource, action FROM platform_admin_access_log WHERE resource = 'admin.order.reconcile'`,
    );
    expect(logRows.rows).toEqual([
      {
        admin_user_id: admin.userId,
        organization_id: fixture.organization.id,
        resource: 'admin.order.reconcile',
        action: 'reconcile_order',
      },
    ]);
  });

  it('reissues tickets and creates its own resolved incident record even if the sweep never ran first', async () => {
    const admin = await makeAdminUser();
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
    });
    const { orderId, paymentIntentId } = await createStuckOrder(fixture.event.id, ticketType.id);
    mockRetrievePaymentIntent.mockResolvedValue({ id: paymentIntentId, status: 'succeeded' } as never);

    const res = await request(app)
      .post(`/v1/admin/orders/${orderId}/reconcile`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    const incidentRows = await pool.query(
      `SELECT detected_at, resolved_at, resolved_by, resolution FROM payment_reconciliation_incidents WHERE order_id = $1`,
      [orderId],
    );
    expect(incidentRows.rows).toHaveLength(1);
    expect(incidentRows.rows[0].resolved_at).not.toBeNull();
    expect(incidentRows.rows[0].resolution).toBe('manual_reissue');
  });

  it('refuses to reissue when Stripe reports the PaymentIntent as not actually succeeded', async () => {
    const admin = await makeAdminUser();
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
    });
    const { orderId, paymentIntentId } = await createStuckOrder(fixture.event.id, ticketType.id);
    mockRetrievePaymentIntent.mockResolvedValue({ id: paymentIntentId, status: 'requires_payment_method' } as never);

    const res = await request(app)
      .post(`/v1/admin/orders/${orderId}/reconcile`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('payment_not_succeeded');

    const orderRow = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId]);
    expect(orderRow.rows[0].status).toBe('pending');
    const ticketRows = await pool.query('SELECT id FROM tickets WHERE order_id = $1', [orderId]);
    expect(ticketRows.rows).toHaveLength(0);
  });

  it('is a no-op, reporting already_resolved, when the order is already paid', async () => {
    const admin = await makeAdminUser();
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
    });
    const { orderId } = await createStuckOrder(fixture.event.id, ticketType.id);
    await pool.query(`UPDATE orders SET status = 'paid' WHERE id = $1`, [orderId]);

    const res = await request(app)
      .post(`/v1/admin/orders/${orderId}/reconcile`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.already_resolved).toBe(true);
    expect(mockRetrievePaymentIntent).not.toHaveBeenCalled();
  });

  it('404s for an order that does not exist', async () => {
    const admin = await makeAdminUser();
    const res = await request(app)
      .post('/v1/admin/orders/00000000-0000-0000-0000-000000000000/reconcile')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /v1/admin/reconciliation', () => {
  it('lists open and resolved incidents across organizations', async () => {
    const admin = await makeAdminUser();
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
    });
    const { orderId: openOrderId, paymentIntentId: openPI } = await createStuckOrder(fixture.event.id, ticketType.id);
    const { orderId: resolvedOrderId, paymentIntentId: resolvedPI } = await createStuckOrder(
      fixture.event.id,
      ticketType.id,
    );
    mockRetrievePaymentIntent.mockImplementation(async (id) =>
      ({ id, status: 'succeeded' }) as never,
    );
    await runReconciliationSweep(new Date(Date.now() + 15 * 60_000));

    await request(app)
      .post(`/v1/admin/orders/${resolvedOrderId}/reconcile`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    const res = await request(app)
      .get('/v1/admin/reconciliation')
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.open.map((i: { order_id: string }) => i.order_id)).toEqual([openOrderId]);
    expect(res.body.open[0].stripe_payment_intent_id).toBe(openPI);
    const resolvedIds = res.body.resolved.map((i: { order_id: string }) => i.order_id);
    expect(resolvedIds).toContain(resolvedOrderId);
    expect(res.body.resolved.find((i: { order_id: string }) => i.order_id === resolvedOrderId).resolution).toBe(
      'manual_reissue',
    );
    void resolvedPI;
  });
});
