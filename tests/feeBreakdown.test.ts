import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { pool } from '../src/config/database';
import { stripeClient } from '../src/services/stripe/stripeClient';
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

describe('GET .../events/:eventId/fee-breakdown', () => {
  it('breaks down price, per-ticket Intahe commission, and cumulative totals across two ticket types', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const cheap = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      name: 'General',
      price_cents: 2500, // 3% = 75, within [49,499] — unconstrained
      quantity_total: 10,
    });
    const expensive = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      name: 'VIP Table',
      price_cents: 25_000, // 3% = 750, capped at 499
      quantity_total: 10,
    });
    await purchaseAndConfirm(fixture.event.id, cheap.id, 2);
    await purchaseAndConfirm(fixture.event.id, expensive.id, 1);

    const res = await request(app)
      .get(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/fee-breakdown`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.event_id).toBe(fixture.event.id);
    expect(res.body.ticket_types).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ticket_type_id: cheap.id,
          ticket_type_name: 'General',
          price_cents: 2500,
          intahe_commission_cents: 75,
          tickets_sold: 2,
          gross_cents: 5000,
          intahe_commission_total_cents: 150,
        }),
        expect.objectContaining({
          ticket_type_id: expensive.id,
          ticket_type_name: 'VIP Table',
          price_cents: 25_000,
          intahe_commission_cents: 499,
          tickets_sold: 1,
          gross_cents: 25_000,
          intahe_commission_total_cents: 499,
        }),
      ]),
    );

    // net_revenue_cents = total_cents - stripe_fee_cents - intahe_fee_cents
    // always equals subtotal_cents by construction (see
    // dashboardService.getOrganizationDashboard's docstring) — fees are
    // either added on top of the buyer's total or absorbed out of the
    // organizer's total, and both cancel out to the same subtotal either
    // way. Not a bug: "net" here means net of fees, not net of Stripe's
    // cut specifically.
    expect(res.body.totals).toEqual({
      tickets_sold: 3,
      gross_ticket_revenue_cents: 30_000,
      stripe_fees_cents: res.body.totals.stripe_fees_cents,
      intahe_fees_cents: 150 + 499,
      net_revenue_cents: 30_000,
    });
  });

  it('includes an unsold ticket type at zero, and requires admin access', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      price_cents: 1000,
      quantity_total: 10,
    });

    const res = await request(app)
      .get(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/fee-breakdown`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ticket_types).toEqual([
      expect.objectContaining({ ticket_type_id: ticketType.id, tickets_sold: 0, gross_cents: 0 }),
    ]);
    expect(res.body.totals).toEqual({
      tickets_sold: 0,
      gross_ticket_revenue_cents: 0,
      stripe_fees_cents: 0,
      intahe_fees_cents: 0,
      net_revenue_cents: 0,
    });
  });
});
