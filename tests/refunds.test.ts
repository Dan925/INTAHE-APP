import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { pool } from '../src/config/database';
import { stripeClient } from '../src/services/stripe/stripeClient';
import { createPaymentIntent } from '../src/services/stripe/stripePayments';
import { createRefund } from '../src/services/stripe/stripeRefunds';
import { signupTestUser } from './helpers/auth';
import { truncateAllTables } from './helpers/db';
import { createOrgAndPublishedEvent, createTicketType } from './helpers/checkoutFixtures';

jest.mock('../src/services/stripe/stripePayments');
jest.mock('../src/services/stripe/stripeRefunds');

const mockCreatePaymentIntent = createPaymentIntent as jest.MockedFunction<typeof createPaymentIntent>;
const mockCreateRefund = createRefund as jest.MockedFunction<typeof createRefund>;

const app = createApp();

beforeEach(async () => {
  await truncateAllTables();
  jest.clearAllMocks();
  mockCreateRefund.mockImplementation(async () => {
    const id = `re_test_${crypto.randomBytes(6).toString('hex')}`;
    return { id } as never;
  });
});

afterAll(async () => {
  await pool.end();
});

async function purchaseAndConfirm(
  eventId: string,
  ticketTypeId: string,
  quantity: number,
): Promise<{ orderId: string }> {
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
  const signature = stripeClient.webhooks.generateTestHeaderString({
    payload,
    secret: env.STRIPE_WEBHOOK_SECRET,
  });
  const webhookRes = await request(app)
    .post('/v1/stripe/webhook')
    .set('Content-Type', 'application/json')
    .set('Stripe-Signature', signature)
    .send(payload);
  if (webhookRes.status !== 200) {
    throw new Error(`Webhook confirmation failed in test helper: ${JSON.stringify(webhookRes.body)}`);
  }

  return { orderId: checkoutRes.body.order.id };
}

describe('POST .../orders/:orderId/refund', () => {
  it('requires a reason — it is never inferred', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
      quantity_total: 10,
    });
    const { orderId } = await purchaseAndConfirm(fixture.event.id, ticketType.id, 1);

    const res = await request(app)
      .post(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/orders/${orderId}/refund`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(mockCreateRefund).not.toHaveBeenCalled();
  });

  it('fully refunds an order when no amount_cents is given', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
      quantity_total: 10,
    });
    const { orderId } = await purchaseAndConfirm(fixture.event.id, ticketType.id, 2);
    const orderBefore = await pool.query('SELECT total_cents FROM orders WHERE id = $1', [orderId]);
    const totalCents = orderBefore.rows[0].total_cents;

    const res = await request(app)
      .post(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/orders/${orderId}/refund`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`)
      .send({ reason: 'buyer_request' });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('refunded');
    expect(mockCreateRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: totalCents,
        chargeMode: 'direct',
        refundApplicationFee: false,
      }),
    );

    const txResult = await pool.query(
      `SELECT type, amount_cents, application_fee_refunded FROM transactions WHERE order_id = $1 AND type = 'refund'`,
      [orderId],
    );
    expect(txResult.rows).toEqual([{ type: 'refund', amount_cents: totalCents, application_fee_refunded: false }]);

    const orderAfter = await pool.query('SELECT refund_reason FROM orders WHERE id = $1', [orderId]);
    expect(orderAfter.rows[0].refund_reason).toBe('buyer_request');
  });

  it('partially refunds, then tops up to a full refund on a second call', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
      quantity_total: 10,
    });
    const { orderId } = await purchaseAndConfirm(fixture.event.id, ticketType.id, 2);
    const orderRow = await pool.query('SELECT total_cents FROM orders WHERE id = $1', [orderId]);
    const totalCents = orderRow.rows[0].total_cents;
    const partialAmount = Math.floor(totalCents / 2);

    const firstRes = await request(app)
      .post(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/orders/${orderId}/refund`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`)
      .send({ amount_cents: partialAmount, reason: 'buyer_request' });

    expect(firstRes.status).toBe(200);
    expect(firstRes.body.order.status).toBe('partial_refund');

    const secondRes = await request(app)
      .post(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/orders/${orderId}/refund`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`)
      .send({ reason: 'buyer_request' });

    expect(secondRes.status).toBe(200);
    expect(secondRes.body.order.status).toBe('refunded');
    expect(mockCreateRefund).toHaveBeenLastCalledWith(
      expect.objectContaining({ amountCents: totalCents - partialAmount }),
    );
  });

  it('rejects a refund amount larger than the refundable balance', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
      quantity_total: 10,
    });
    const { orderId } = await purchaseAndConfirm(fixture.event.id, ticketType.id, 1);

    const res = await request(app)
      .post(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/orders/${orderId}/refund`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`)
      .send({ amount_cents: 999999, reason: 'buyer_request' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_refund_amount');
    expect(mockCreateRefund).not.toHaveBeenCalled();
  });

  it('refuses to refund an order that was never paid', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
      quantity_total: 10,
    });
    mockCreatePaymentIntent.mockResolvedValueOnce({ id: 'pi_pending', client_secret: 'secret' } as never);
    const checkoutRes = await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ buyer_email: 'buyer@example.com', line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });

    const res = await request(app)
      .post(
        `/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/orders/${checkoutRes.body.order.id}/refund`,
      )
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`)
      .send({ reason: 'buyer_request' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('order_not_refundable');
  });

  it('refuses to refund an order that is already fully refunded', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
      quantity_total: 10,
    });
    const { orderId } = await purchaseAndConfirm(fixture.event.id, ticketType.id, 1);
    const refundUrl = `/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/orders/${orderId}/refund`;
    await request(app)
      .post(refundUrl)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`)
      .send({ reason: 'buyer_request' });

    const res = await request(app)
      .post(refundUrl)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`)
      .send({ reason: 'buyer_request' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('order_not_refundable');
  });

  it('refunds via the connected account (direct charge) when the org is charges-enabled', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    await pool.query(
      `UPDATE organizations SET stripe_account_id = 'acct_test_123', stripe_charges_enabled = true WHERE id = $1`,
      [fixture.organization.id],
    );
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
      quantity_total: 10,
    });
    const { orderId } = await purchaseAndConfirm(fixture.event.id, ticketType.id, 1);

    const chargeModeRow = await pool.query('SELECT stripe_charge_mode FROM orders WHERE id = $1', [orderId]);
    expect(chargeModeRow.rows[0].stripe_charge_mode).toBe('direct');

    await request(app)
      .post(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/orders/${orderId}/refund`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`)
      .send({ reason: 'organizer_cancellation' });

    expect(mockCreateRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        chargeMode: 'direct',
        connectedAccountId: 'acct_test_123',
        refundApplicationFee: true,
      }),
    );
  });

  it('refunds a legacy destination-charge order using reverse_transfer, by its recorded charge mode', async () => {
    // Simulates an order created before the direct-charge migration shipped
    // — its stripe_charge_mode is 'destination' regardless of the
    // organization's *current* Connect state, and a refund on it must keep
    // using the old shape indefinitely (see checkoutService's
    // connectedAccountIdForOrder and orderService.refundOrder).
    const fixture = await createOrgAndPublishedEvent(app);
    await pool.query(
      `UPDATE organizations SET stripe_account_id = 'acct_legacy_456', stripe_charges_enabled = true WHERE id = $1`,
      [fixture.organization.id],
    );
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
      quantity_total: 10,
    });
    const { orderId } = await purchaseAndConfirm(fixture.event.id, ticketType.id, 1);
    await pool.query(`UPDATE orders SET stripe_charge_mode = 'destination' WHERE id = $1`, [orderId]);

    await request(app)
      .post(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/orders/${orderId}/refund`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`)
      .send({ reason: 'organizer_cancellation' });

    expect(mockCreateRefund).toHaveBeenCalledWith(
      expect.objectContaining({ chargeMode: 'destination', connectedAccountId: null, refundApplicationFee: true }),
    );
  });

  it('refunds a legacy platform-charge order (pre-migration, no Connect involved) with no Connect params at all', async () => {
    // 'platform' mode is no longer reachable for a *paid* order through
    // checkout — createOrder now refuses outright when total_cents > 0 and
    // the organization has no working connected account (see
    // checkoutService.createOrder). This simulates an order that predates
    // that hardening, to prove refunding it still works and never sends a
    // reverse_transfer/application-fee flag Stripe would reject for a
    // charge that was never split with a connected account in the first
    // place.
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
      quantity_total: 10,
    });
    const { orderId } = await purchaseAndConfirm(fixture.event.id, ticketType.id, 1);
    await pool.query(`UPDATE orders SET stripe_charge_mode = 'platform' WHERE id = $1`, [orderId]);

    await request(app)
      .post(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/orders/${orderId}/refund`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`)
      .send({ reason: 'organizer_cancellation' });

    expect(mockCreateRefund).toHaveBeenCalledWith(
      expect.objectContaining({ chargeMode: 'platform', connectedAccountId: null, refundApplicationFee: true }),
    );
  });

  it('excludes refunded orders from the dashboard once refunded through this endpoint', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
      quantity_total: 10,
    });
    const { orderId } = await purchaseAndConfirm(fixture.event.id, ticketType.id, 1);

    const beforeDashboard = await request(app)
      .get(`/v1/organizations/${fixture.organization.id}/dashboard`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`);
    expect(beforeDashboard.body.totals.orders_paid_count).toBe(1);

    await request(app)
      .post(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/orders/${orderId}/refund`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`)
      .send({ reason: 'buyer_request' });

    const afterDashboard = await request(app)
      .get(`/v1/organizations/${fixture.organization.id}/dashboard`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`);
    expect(afterDashboard.body.totals.orders_paid_count).toBe(0);
    expect(afterDashboard.body.totals.net_revenue_cents).toBe(0);
  });

  it('forbids a staff member from issuing refunds', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const staff = await signupTestUser(app);
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, accepted_at) VALUES ($1, $2, 'staff', now())`,
      [fixture.organization.id, staff.userId],
    );
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
      quantity_total: 10,
    });
    const { orderId } = await purchaseAndConfirm(fixture.event.id, ticketType.id, 1);

    const res = await request(app)
      .post(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/orders/${orderId}/refund`)
      .set('Authorization', `Bearer ${staff.accessToken}`)
      .send({ reason: 'buyer_request' });

    expect(res.status).toBe(403);
    expect(mockCreateRefund).not.toHaveBeenCalled();
  });
});

describe('refund reason decides whether Intahe’s commission is reversed', () => {
  async function setUpPaidOrder(): Promise<{ orgId: string; eventId: string; orderId: string; ownerToken: string }> {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
      quantity_total: 10,
    });
    const { orderId } = await purchaseAndConfirm(fixture.event.id, ticketType.id, 2);
    return {
      orgId: fixture.organization.id,
      eventId: fixture.event.id,
      orderId,
      ownerToken: fixture.owner.accessToken,
    };
  }

  async function refund(
    ctx: { orgId: string; eventId: string; orderId: string; ownerToken: string },
    body: Record<string, unknown>,
  ) {
    return request(app)
      .post(`/v1/organizations/${ctx.orgId}/events/${ctx.eventId}/orders/${ctx.orderId}/refund`)
      .set('Authorization', `Bearer ${ctx.ownerToken}`)
      .send(body);
  }

  it('organizer_cancellation reverses the application fee', async () => {
    const ctx = await setUpPaidOrder();
    await refund(ctx, { reason: 'organizer_cancellation' });
    expect(mockCreateRefund).toHaveBeenCalledWith(expect.objectContaining({ refundApplicationFee: true }));
    const order = await pool.query('SELECT refund_reason FROM orders WHERE id = $1', [ctx.orderId]);
    expect(order.rows[0].refund_reason).toBe('organizer_cancellation');
  });

  it('event_postponed is treated the same as a cancellation', async () => {
    const ctx = await setUpPaidOrder();
    await refund(ctx, { reason: 'event_postponed' });
    expect(mockCreateRefund).toHaveBeenCalledWith(expect.objectContaining({ refundApplicationFee: true }));
  });

  it('buyer_request (full refund) does not reverse the application fee', async () => {
    const ctx = await setUpPaidOrder();
    await refund(ctx, { reason: 'buyer_request' });
    expect(mockCreateRefund).toHaveBeenCalledWith(expect.objectContaining({ refundApplicationFee: false }));
  });

  it('buyer_request (partial refund) does not reverse the application fee either', async () => {
    const ctx = await setUpPaidOrder();
    const orderRow = await pool.query('SELECT total_cents FROM orders WHERE id = $1', [ctx.orderId]);
    const partialAmount = Math.floor(orderRow.rows[0].total_cents / 2);
    await refund(ctx, { amount_cents: partialAmount, reason: 'buyer_request' });
    expect(mockCreateRefund).toHaveBeenCalledWith(expect.objectContaining({ refundApplicationFee: false }));
    const order = await pool.query('SELECT status, refund_reason FROM orders WHERE id = $1', [ctx.orderId]);
    expect(order.rows[0]).toEqual({ status: 'partial_refund', refund_reason: 'buyer_request' });
  });
});
