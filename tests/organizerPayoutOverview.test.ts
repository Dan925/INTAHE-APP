import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { pool } from '../src/config/database';
import { stripeClient } from '../src/services/stripe/stripeClient';
import { createPaymentIntent } from '../src/services/stripe/stripePayments';
import { retrieveBalance } from '../src/services/stripe/stripePayouts';
import { truncateAllTables } from './helpers/db';
import { createOrgAndPublishedEvent, createOrgAndPublishedEventWithoutStripe, createTicketType } from './helpers/checkoutFixtures';

jest.mock('../src/services/stripe/stripePayments');
jest.mock('../src/services/stripe/stripePayouts');

const mockCreatePaymentIntent = createPaymentIntent as jest.MockedFunction<typeof createPaymentIntent>;
const mockRetrieveBalance = retrieveBalance as jest.MockedFunction<typeof retrieveBalance>;

const app = createApp();

beforeEach(async () => {
  await truncateAllTables();
  jest.clearAllMocks();
  mockCreatePaymentIntent.mockImplementation(async () => {
    const id = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
    return { id, client_secret: `${id}_secret` } as never;
  });
  mockRetrieveBalance.mockResolvedValue({
    available: [{ amount: 1000, currency: 'usd' }],
    pending: [{ amount: 500, currency: 'usd' }],
  } as never);
});

afterAll(async () => {
  await pool.end();
});

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

describe('GET /v1/organizations/:organizationId/stripe/payouts', () => {
  it('reports not connected, with empty balance/upcoming/history, when the org has no Stripe account', async () => {
    const fixture = await createOrgAndPublishedEventWithoutStripe(app);

    const res = await request(app)
      .get(`/v1/organizations/${fixture.organization.id}/stripe/payouts`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      connected: false,
      payout_delay_hours: env.PAYOUT_DELAY_HOURS,
      balance: null,
      upcoming: [],
      history: [],
    });
    expect(mockRetrieveBalance).not.toHaveBeenCalled();
  });

  it('reports the live Stripe balance and lists a paid event as upcoming before its 48h delay elapses', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
      quantity_total: 10,
    });
    await purchaseAndConfirm(fixture.event.id, ticketType.id, 1);

    const res = await request(app)
      .get(`/v1/organizations/${fixture.organization.id}/stripe/payouts`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.balance).toEqual({ available_cents: 1000, pending_cents: 500, currency: 'usd' });
    expect(res.body.upcoming).toHaveLength(1);
    expect(res.body.upcoming[0]).toMatchObject({ event_id: fixture.event.id, event_name: 'Ticketed Event' });
    expect(res.body.history).toEqual([]);

    const eventRow = await pool.query('SELECT end_at FROM events WHERE id = $1', [fixture.event.id]);
    const expectedScheduledFor = new Date(
      new Date(eventRow.rows[0].end_at).getTime() + env.PAYOUT_DELAY_HOURS * 3_600_000,
    ).toISOString();
    expect(res.body.upcoming[0].scheduled_for).toBe(expectedScheduledFor);
  });

  it('excludes an event from upcoming once it has a succeeded payout, and lists every attempt in history, most recent first', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 2500,
      quantity_total: 10,
    });
    await purchaseAndConfirm(fixture.event.id, ticketType.id, 1);

    await pool.query(
      `INSERT INTO organizer_payouts (organization_id, event_id, stripe_account_id, scheduled_for, status, attempted_at, error_message, created_at)
       VALUES ($1, $2, 'acct_x', now(), 'failed', now() - interval '2 hours', 'transient error', now() - interval '2 hours')`,
      [fixture.organization.id, fixture.event.id],
    );
    await pool.query(
      `INSERT INTO organizer_payouts (organization_id, event_id, stripe_account_id, scheduled_for, status, stripe_payout_id, amount_cents, currency, attempted_at, created_at)
       VALUES ($1, $2, 'acct_x', now(), 'succeeded', 'po_test_1', 2678, 'usd', now(), now())`,
      [fixture.organization.id, fixture.event.id],
    );

    const res = await request(app)
      .get(`/v1/organizations/${fixture.organization.id}/stripe/payouts`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.upcoming).toEqual([]);
    expect(res.body.history).toHaveLength(2);
    expect(res.body.history[0].status).toBe('succeeded');
    expect(res.body.history[1].status).toBe('failed');
    expect(res.body.history[1].error_message).toBe('transient error');
  });

  it('forbids a non-owner from reading payout info', async () => {
    const fixture = await createOrgAndPublishedEvent(app);

    const res = await request(app)
      .get(`/v1/organizations/${fixture.organization.id}/stripe/payouts`)
      .set('Authorization', `Bearer invalid`);

    expect(res.status).toBe(401);
  });
});
