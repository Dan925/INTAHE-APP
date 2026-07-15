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
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('refunded');
    expect(mockCreateRefund).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: totalCents, reverseTransfer: false }),
    );

    const txResult = await pool.query(
      `SELECT type, amount_cents FROM transactions WHERE order_id = $1 AND type = 'refund'`,
      [orderId],
    );
    expect(txResult.rows).toEqual([{ type: 'refund', amount_cents: totalCents }]);
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
      .send({ amount_cents: partialAmount });

    expect(firstRes.status).toBe(200);
    expect(firstRes.body.order.status).toBe('partial_refund');

    const secondRes = await request(app)
      .post(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/orders/${orderId}/refund`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`)
      .send({});

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
      .send({ amount_cents: 999999 });

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
      .send({});

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
    await request(app).post(refundUrl).set('Authorization', `Bearer ${fixture.owner.accessToken}`).send({});

    const res = await request(app)
      .post(refundUrl)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('order_not_refundable');
  });

  it('sets reverse_transfer when the organization has a connected Stripe account', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    await pool.query(`UPDATE organizations SET stripe_account_id = 'acct_test_123' WHERE id = $1`, [
      fixture.organization.id,
    ]);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
      quantity_total: 10,
    });
    const { orderId } = await purchaseAndConfirm(fixture.event.id, ticketType.id, 1);

    await request(app)
      .post(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/orders/${orderId}/refund`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`)
      .send({});

    expect(mockCreateRefund).toHaveBeenCalledWith(expect.objectContaining({ reverseTransfer: true }));
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
      .send({});

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
      .send({});

    expect(res.status).toBe(403);
    expect(mockCreateRefund).not.toHaveBeenCalled();
  });
});
