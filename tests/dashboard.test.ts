import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { pool } from '../src/config/database';
import { stripeClient } from '../src/services/stripe/stripeClient';
import { createPaymentIntent } from '../src/services/stripe/stripePayments';
import { computeOrderFees } from '../src/utils/fees';
import { signupTestUser } from './helpers/auth';
import { truncateAllTables } from './helpers/db';
import { createOrgAndPublishedEvent, createTicketType } from './helpers/checkoutFixtures';

jest.mock('../src/services/stripe/stripePayments');

const mockCreatePaymentIntent = createPaymentIntent as jest.MockedFunction<typeof createPaymentIntent>;

const app = createApp();

beforeEach(async () => {
  await truncateAllTables();
  jest.clearAllMocks();
});

afterAll(async () => {
  await pool.end();
});

async function addMember(organizationId: string, userId: string, role: 'admin' | 'staff' | 'volunteer') {
  await pool.query(
    `INSERT INTO organization_members (organization_id, user_id, role, accepted_at) VALUES ($1, $2, $3, now())`,
    [organizationId, userId, role],
  );
}

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

describe('GET /v1/organizations/:organizationId/dashboard', () => {
  it('computes net revenue as total minus stripe and intahe fees, from paid orders only', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
      quantity_total: 10,
    });

    await purchaseAndConfirm(fixture.event.id, ticketType.id, 2);

    const res = await request(app)
      .get(`/v1/organizations/${fixture.organization.id}/dashboard`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`);

    expect(res.status).toBe(200);
    const expectedFees = computeOrderFees(5000, 2, false);
    expect(res.body.totals).toMatchObject({
      orders_paid_count: 1,
      tickets_sold: 2,
      gross_ticket_revenue_cents: 5000,
      stripe_fees_cents: expectedFees.stripeFeeCents,
      intahe_fees_cents: expectedFees.intaheFeeCents,
      net_revenue_cents: expectedFees.totalCents - expectedFees.stripeFeeCents - expectedFees.intaheFeeCents,
    });
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0]).toMatchObject({
      event_id: fixture.event.id,
      orders_paid_count: 1,
      tickets_sold: 2,
    });
  });

  it('nets subtotal minus fees even when the organizer absorbs fees (buyer pays subtotal only)', async () => {
    const fixture = await createOrgAndPublishedEvent(app, { fees_absorbed_by_organizer: true });
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
      quantity_total: 10,
    });

    await purchaseAndConfirm(fixture.event.id, ticketType.id, 1);

    const res = await request(app)
      .get(`/v1/organizations/${fixture.organization.id}/dashboard`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`);

    const expectedFees = computeOrderFees(2500, 1, true);
    expect(res.body.totals.gross_ticket_revenue_cents).toBe(2500);
    expect(res.body.totals.net_revenue_cents).toBe(2500 - expectedFees.stripeFeeCents - expectedFees.intaheFeeCents);
    expect(res.body.totals.net_revenue_cents).toBeLessThan(res.body.totals.gross_ticket_revenue_cents);
  });

  it('includes events with zero paid orders at zero, and excludes pending orders from sums', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, { quantity_total: 10 });
    // No purchase made — this order never gets confirmed, stays 'pending'.
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 10,
    });
    mockCreatePaymentIntent.mockResolvedValueOnce({
      id: `pi_test_${crypto.randomBytes(6).toString('hex')}`,
      client_secret: 'secret',
    } as never);
    await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ buyer_email: 'buyer@example.com', line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });

    const res = await request(app)
      .get(`/v1/organizations/${fixture.organization.id}/dashboard`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0]).toMatchObject({
      orders_paid_count: 0,
      tickets_sold: 0,
      gross_ticket_revenue_cents: 0,
      net_revenue_cents: 0,
    });
    expect(res.body.totals.orders_paid_count).toBe(0);
  });

  it('excludes refunded orders from revenue sums', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
      quantity_total: 10,
    });
    const { orderId } = await purchaseAndConfirm(fixture.event.id, ticketType.id, 1);

    await pool.query(`UPDATE orders SET status = 'refunded' WHERE id = $1`, [orderId]);

    const res = await request(app)
      .get(`/v1/organizations/${fixture.organization.id}/dashboard`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`);

    expect(res.body.totals).toMatchObject({
      orders_paid_count: 0,
      tickets_sold: 0,
      gross_ticket_revenue_cents: 0,
      net_revenue_cents: 0,
    });
  });

  it('aggregates totals across multiple events in the same organization', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const owner = fixture.owner;
    const organization = fixture.organization;

    const secondEventRes = await request(app)
      .post(`/v1/organizations/${organization.id}/events`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Second Event', start_at: '2026-10-01T18:00:00.000Z', end_at: '2026-10-01T23:00:00.000Z' });
    await request(app)
      .post(`/v1/organizations/${organization.id}/events/${secondEventRes.body.event.id}/publish`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    const ticketTypeA = await createTicketType(app, owner, organization.id, fixture.event.id, {
      price_cents: 1000,
      quantity_total: 10,
    });
    const ticketTypeB = await createTicketType(app, owner, organization.id, secondEventRes.body.event.id, {
      price_cents: 2000,
      quantity_total: 10,
    });

    await purchaseAndConfirm(fixture.event.id, ticketTypeA.id, 1);
    await purchaseAndConfirm(secondEventRes.body.event.id, ticketTypeB.id, 1);

    const res = await request(app)
      .get(`/v1/organizations/${organization.id}/dashboard`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.body.events).toHaveLength(2);
    expect(res.body.totals.orders_paid_count).toBe(2);
    expect(res.body.totals.tickets_sold).toBe(2);
    expect(res.body.totals.gross_ticket_revenue_cents).toBe(3000);
    const sumOfEvents = res.body.events.reduce(
      (acc: number, ev: { net_revenue_cents: number }) => acc + ev.net_revenue_cents,
      0,
    );
    expect(res.body.totals.net_revenue_cents).toBe(sumOfEvents);
  });

  it('forbids a staff member from viewing the dashboard (financial reports are owner/admin only)', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const staff = await signupTestUser(app);
    await addMember(fixture.organization.id, staff.userId, 'staff');

    const res = await request(app)
      .get(`/v1/organizations/${fixture.organization.id}/dashboard`)
      .set('Authorization', `Bearer ${staff.accessToken}`);

    expect(res.status).toBe(403);
  });
});
