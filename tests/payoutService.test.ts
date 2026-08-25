import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { pool } from '../src/config/database';
import { stripeClient } from '../src/services/stripe/stripeClient';
import { createPaymentIntent } from '../src/services/stripe/stripePayments';
import { retrieveBalance, createPayout } from '../src/services/stripe/stripePayouts';
import { runDuePayouts } from '../src/services/payouts/payoutService';
import { truncateAllTables } from './helpers/db';
import { createOrgAndPublishedEvent, createTicketType } from './helpers/checkoutFixtures';

jest.mock('../src/services/stripe/stripePayments');
jest.mock('../src/services/stripe/stripePayouts');

const mockCreatePaymentIntent = createPaymentIntent as jest.MockedFunction<typeof createPaymentIntent>;
const mockRetrieveBalance = retrieveBalance as jest.MockedFunction<typeof retrieveBalance>;
const mockCreatePayout = createPayout as jest.MockedFunction<typeof createPayout>;

const app = createApp();

const STRIPE_ACCOUNT_ID = 'acct_test_payout_org';

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

/** Purchases and confirms one ticket (a genuinely 'paid' order), on a
 * connected, charges-enabled organization, then sets the event's end_at to
 * `hoursAgo` hours in the past. */
async function createPaidEventEndedHoursAgo(hoursAgo: number) {
  const fixture = await createOrgAndPublishedEvent(app);
  await pool.query(
    `UPDATE organizations SET stripe_account_id = $2, stripe_charges_enabled = true WHERE id = $1`,
    [fixture.organization.id, STRIPE_ACCOUNT_ID],
  );
  const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
    price_cents: 2500,
    quantity_total: 10,
  });

  const paymentIntentId = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
  mockCreatePaymentIntent.mockResolvedValueOnce({
    id: paymentIntentId,
    client_secret: `${paymentIntentId}_secret`,
  } as never);
  const checkoutRes = await request(app)
    .post(`/v1/events/${fixture.event.id}/orders`)
    .set('Idempotency-Key', crypto.randomUUID())
    .send({ buyer_email: 'buyer@example.com', line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });
  if (checkoutRes.status !== 201) {
    throw new Error(`Checkout failed in test helper: ${JSON.stringify(checkoutRes.body)}`);
  }

  const eventPayload = {
    id: `evt_${crypto.randomBytes(6).toString('hex')}`,
    object: 'event',
    type: 'payment_intent.succeeded',
    account: STRIPE_ACCOUNT_ID,
    data: { object: { id: paymentIntentId } },
  };
  const payload = JSON.stringify(eventPayload);
  const signature = stripeClient.webhooks.generateTestHeaderString({ payload, secret: env.STRIPE_WEBHOOK_SECRET });
  const webhookRes = await request(app)
    .post('/v1/stripe/webhook')
    .set('Content-Type', 'application/json')
    .set('Stripe-Signature', signature)
    .send(payload);
  if (webhookRes.status !== 200) {
    throw new Error(`Webhook confirmation failed in test helper: ${JSON.stringify(webhookRes.body)}`);
  }

  await pool.query(
    `UPDATE events
     SET start_at = now() - (($2 + 5) * interval '1 hour'), end_at = now() - ($2 * interval '1 hour')
     WHERE id = $1`,
    [fixture.event.id, hoursAgo],
  );

  return { ...fixture, ticketType };
}

describe('runDuePayouts', () => {
  it('pays out an event whose 48h delay has elapsed and logs the success', async () => {
    const { event, organization } = await createPaidEventEndedHoursAgo(49);
    mockRetrieveBalance.mockResolvedValue({ available: [{ amount: 2500, currency: 'usd' }] } as never);
    mockCreatePayout.mockResolvedValue({ id: 'po_test_1' } as never);

    const summary = await runDuePayouts();

    expect(summary).toEqual({ due: 1, succeeded: 1, skippedNoBalance: 0, failed: 0, alreadyInFlight: 0 });
    expect(mockCreatePayout).toHaveBeenCalledWith({
      connectedAccountId: STRIPE_ACCOUNT_ID,
      amountCents: 2500,
      currency: 'usd',
    });

    const rows = await pool.query(
      `SELECT status, stripe_payout_id, amount_cents, currency, organization_id FROM organizer_payouts WHERE event_id = $1`,
      [event.id],
    );
    expect(rows.rows).toEqual([
      {
        status: 'succeeded',
        stripe_payout_id: 'po_test_1',
        amount_cents: 2500,
        currency: 'usd',
        organization_id: organization.id,
      },
    ]);
  });

  it('does not touch an event that ended less than 48h ago', async () => {
    await createPaidEventEndedHoursAgo(10);

    const summary = await runDuePayouts();

    expect(summary).toEqual({ due: 0, succeeded: 0, skippedNoBalance: 0, failed: 0, alreadyInFlight: 0 });
    expect(mockCreatePayout).not.toHaveBeenCalled();
  });

  it('ignores an event with no paid orders', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    await pool.query(
      `UPDATE organizations SET stripe_account_id = $2, stripe_charges_enabled = true WHERE id = $1`,
      [fixture.organization.id, STRIPE_ACCOUNT_ID],
    );
    await pool.query(`UPDATE events SET start_at = now() - interval '54 hours', end_at = now() - interval '49 hours' WHERE id = $1`, [fixture.event.id]);

    const summary = await runDuePayouts();

    expect(summary.due).toBe(0);
    expect(mockCreatePayout).not.toHaveBeenCalled();
  });

  it('ignores an event whose organization never connected a Stripe account', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 10,
    });
    await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ buyer_email: 'buyer@example.com', line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });
    await pool.query(`UPDATE events SET start_at = now() - interval '54 hours', end_at = now() - interval '49 hours' WHERE id = $1`, [fixture.event.id]);

    const summary = await runDuePayouts();

    expect(summary.due).toBe(0);
  });

  it('logs skipped_no_balance without failing when the connected account has no available funds yet, and retries later', async () => {
    const { event } = await createPaidEventEndedHoursAgo(49);
    mockRetrieveBalance.mockResolvedValue({ available: [{ amount: 0, currency: 'usd' }] } as never);

    const firstRun = await runDuePayouts();
    expect(firstRun).toEqual({ due: 1, succeeded: 0, skippedNoBalance: 1, failed: 0, alreadyInFlight: 0 });
    expect(mockCreatePayout).not.toHaveBeenCalled();

    // Funds settle by the next run — the earlier skip must not have
    // permanently marked the event as handled.
    mockRetrieveBalance.mockResolvedValue({ available: [{ amount: 2500, currency: 'usd' }] } as never);
    mockCreatePayout.mockResolvedValue({ id: 'po_test_retry' } as never);
    const secondRun = await runDuePayouts();
    expect(secondRun).toEqual({ due: 1, succeeded: 1, skippedNoBalance: 0, failed: 0, alreadyInFlight: 0 });

    const rows = await pool.query(
      `SELECT status FROM organizer_payouts WHERE event_id = $1 ORDER BY created_at ASC`,
      [event.id],
    );
    expect(rows.rows.map((r) => r.status)).toEqual(['skipped_no_balance', 'succeeded']);
  });

  it('logs a failed attempt with the error message when the Stripe payout call throws, and retries later', async () => {
    const { event } = await createPaidEventEndedHoursAgo(49);
    mockRetrieveBalance.mockResolvedValue({ available: [{ amount: 2500, currency: 'usd' }] } as never);
    mockCreatePayout.mockRejectedValueOnce(new Error('Stripe API error: account is restricted'));

    const firstRun = await runDuePayouts();
    expect(firstRun).toEqual({ due: 1, succeeded: 0, skippedNoBalance: 0, failed: 1, alreadyInFlight: 0 });

    const failedRow = await pool.query(
      `SELECT status, error_message FROM organizer_payouts WHERE event_id = $1`,
      [event.id],
    );
    expect(failedRow.rows).toEqual([{ status: 'failed', error_message: 'Stripe API error: account is restricted' }]);

    mockCreatePayout.mockResolvedValue({ id: 'po_test_after_failure' } as never);
    const secondRun = await runDuePayouts();
    expect(secondRun.succeeded).toBe(1);
  });

  it('never pays out the same event twice once a payout has succeeded', async () => {
    const { event } = await createPaidEventEndedHoursAgo(49);
    mockRetrieveBalance.mockResolvedValue({ available: [{ amount: 2500, currency: 'usd' }] } as never);
    mockCreatePayout.mockResolvedValue({ id: 'po_test_once' } as never);

    await runDuePayouts();
    const secondRun = await runDuePayouts();

    expect(secondRun.due).toBe(0);
    expect(mockCreatePayout).toHaveBeenCalledTimes(1);

    const succeededRows = await pool.query(
      `SELECT id FROM organizer_payouts WHERE event_id = $1 AND status = 'succeeded'`,
      [event.id],
    );
    expect(succeededRows.rows).toHaveLength(1);
  });
});
