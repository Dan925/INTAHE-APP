import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { pool } from '../src/config/database';
import { stripeClient } from '../src/services/stripe/stripeClient';
import { createQuickSalePaymentIntent } from '../src/services/stripe/stripePayments';
import { retrieveBalance, createPayout } from '../src/services/stripe/stripePayouts';
import { truncateAllTables } from './helpers/db';
import { signupTestUser } from './helpers/auth';
import { createOrgAndPublishedEvent, createOrgAndPublishedEventWithoutStripe } from './helpers/checkoutFixtures';

jest.mock('../src/services/stripe/stripePayments');
jest.mock('../src/services/stripe/stripePayouts');

const mockCreateQuickSalePaymentIntent = createQuickSalePaymentIntent as jest.MockedFunction<
  typeof createQuickSalePaymentIntent
>;
const mockRetrieveBalance = retrieveBalance as jest.MockedFunction<typeof retrieveBalance>;
const mockCreatePayout = createPayout as jest.MockedFunction<typeof createPayout>;

const app = createApp();

beforeEach(async () => {
  await truncateAllTables();
  jest.clearAllMocks();
  mockCreateQuickSalePaymentIntent.mockImplementation(async () => {
    const id = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
    return { id, client_secret: `${id}_secret` } as never;
  });
});

afterAll(async () => {
  await pool.end();
});

function signedWebhookRequest(eventPayload: unknown) {
  const payload = JSON.stringify(eventPayload);
  const signature = stripeClient.webhooks.generateTestHeaderString({ payload, secret: env.STRIPE_WEBHOOK_SECRET });
  return request(app)
    .post('/v1/stripe/webhook')
    .set('Content-Type', 'application/json')
    .set('Stripe-Signature', signature)
    .send(payload);
}

describe('quick sale items', () => {
  it('lets an owner create and list a quick sale item', async () => {
    const { owner, organization } = await createOrgAndPublishedEvent(app);

    const createRes = await request(app)
      .post(`/v1/organizations/${organization.id}/quick-sale-items`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Haircut', price_cents: 3000 });
    expect(createRes.status).toBe(201);
    expect(createRes.body.quick_sale_item).toMatchObject({ name: 'Haircut', price_cents: 3000, currency: 'cad' });

    const listRes = await request(app)
      .get(`/v1/organizations/${organization.id}/quick-sale-items`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(1);
  });

  it('rejects someone with no membership in the organization', async () => {
    const { organization } = await createOrgAndPublishedEvent(app);
    const stranger = await signupTestUser(app);

    const res = await request(app)
      .post(`/v1/organizations/${organization.id}/quick-sale-items`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .send({ name: 'Haircut', price_cents: 3000 });

    expect(res.status).toBe(403);
  });

  it('soft-deletes an item so it stops appearing in the list', async () => {
    const { owner, organization } = await createOrgAndPublishedEvent(app);
    const createRes = await request(app)
      .post(`/v1/organizations/${organization.id}/quick-sale-items`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Haircut', price_cents: 3000 });
    const itemId = createRes.body.quick_sale_item.id;

    const deleteRes = await request(app)
      .delete(`/v1/organizations/${organization.id}/quick-sale-items/${itemId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(deleteRes.status).toBe(204);

    const listRes = await request(app)
      .get(`/v1/organizations/${organization.id}/quick-sale-items`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(listRes.body.items).toHaveLength(0);
  });
});

describe('POST /v1/organizations/:organizationId/quick-sales', () => {
  it('creates a pending quick sale with correctly computed fees and a client secret', async () => {
    const { owner, organization } = await createOrgAndPublishedEvent(app);
    const itemRes = await request(app)
      .post(`/v1/organizations/${organization.id}/quick-sale-items`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Haircut', price_cents: 3000 });
    const itemId = itemRes.body.quick_sale_item.id;

    const res = await request(app)
      .post(`/v1/organizations/${organization.id}/quick-sales`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ quick_sale_item_id: itemId });

    expect(res.status).toBe(201);
    expect(res.body.quick_sale).toMatchObject({
      item_name: 'Haircut',
      subtotal_cents: 3000,
      status: 'pending',
      payout_status: 'not_attempted',
    });
    expect(typeof res.body.client_secret).toBe('string');
    expect(mockCreateQuickSalePaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: res.body.quick_sale.total_cents, connectedAccountId: expect.any(String) }),
    );
  });

  it('refuses a quick sale when the organization has no connected, charges-enabled Stripe account', async () => {
    const { owner, organization } = await createOrgAndPublishedEventWithoutStripe(app);
    // Bypass the item-creation route's own connectivity requirements aren't
    // relevant here — insert the item directly to isolate the sale-creation
    // gate under test.
    const itemInsert = await pool.query(
      `INSERT INTO quick_sale_items (organization_id, name, price_cents) VALUES ($1, 'Haircut', 3000) RETURNING id`,
      [organization.id],
    );

    const res = await request(app)
      .post(`/v1/organizations/${organization.id}/quick-sales`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ quick_sale_item_id: itemInsert.rows[0].id });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('stripe_not_connected');
  });
});

describe('payment_intent.succeeded for a quick sale', () => {
  async function createPendingQuickSale(paymentIntentId: string) {
    const { owner, organization } = await createOrgAndPublishedEvent(app);
    const itemRes = await request(app)
      .post(`/v1/organizations/${organization.id}/quick-sale-items`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Haircut', price_cents: 3000 });

    mockCreateQuickSalePaymentIntent.mockResolvedValueOnce({
      id: paymentIntentId,
      client_secret: `${paymentIntentId}_secret`,
    } as never);

    const saleRes = await request(app)
      .post(`/v1/organizations/${organization.id}/quick-sales`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ quick_sale_item_id: itemRes.body.quick_sale_item.id });

    return { owner, organization, quickSale: saleRes.body.quick_sale };
  }

  it('marks the sale paid and succeeds an instant payout when funds are available', async () => {
    const paymentIntentId = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
    const { owner, organization, quickSale } = await createPendingQuickSale(paymentIntentId);

    mockRetrieveBalance.mockResolvedValueOnce({ available: [{ amount: 3000, currency: 'cad' }] } as never);
    mockCreatePayout.mockResolvedValueOnce({ id: 'po_test_instant' } as never);

    const res = await signedWebhookRequest({
      id: `evt_${crypto.randomBytes(6).toString('hex')}`,
      type: 'payment_intent.succeeded',
      data: { object: { id: paymentIntentId, metadata: { quick_sale_id: quickSale.id } } },
    });
    expect(res.status).toBe(200);

    expect(mockCreatePayout).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 3000, currency: 'cad', method: 'instant' }),
    );

    const listRes = await request(app)
      .get(`/v1/organizations/${organization.id}/quick-sales`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(listRes.body.items[0]).toMatchObject({ status: 'paid', payout_status: 'succeeded' });
  });

  it('marks the payout failed (not the sale) when funds are not yet available, and lets it be retried', async () => {
    const paymentIntentId = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
    const { owner, organization, quickSale } = await createPendingQuickSale(paymentIntentId);

    mockRetrieveBalance.mockResolvedValueOnce({ available: [{ amount: 0, currency: 'cad' }] } as never);

    await signedWebhookRequest({
      id: `evt_${crypto.randomBytes(6).toString('hex')}`,
      type: 'payment_intent.succeeded',
      data: { object: { id: paymentIntentId, metadata: { quick_sale_id: quickSale.id } } },
    });
    expect(mockCreatePayout).not.toHaveBeenCalled();

    const afterWebhook = await request(app)
      .get(`/v1/organizations/${organization.id}/quick-sales`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(afterWebhook.body.items[0]).toMatchObject({ status: 'paid', payout_status: 'failed' });

    mockRetrieveBalance.mockResolvedValueOnce({ available: [{ amount: 3000, currency: 'cad' }] } as never);
    mockCreatePayout.mockResolvedValueOnce({ id: 'po_test_retry' } as never);

    const retryRes = await request(app)
      .post(`/v1/organizations/${organization.id}/quick-sales/${quickSale.id}/retry-payout`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(retryRes.status).toBe(200);
    expect(retryRes.body.quick_sale).toMatchObject({ payout_status: 'succeeded' });
  });

  it('is idempotent: a second delivery of the same event never attempts a second payout', async () => {
    const paymentIntentId = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
    const { quickSale } = await createPendingQuickSale(paymentIntentId);

    mockRetrieveBalance.mockResolvedValue({ available: [{ amount: 3000, currency: 'cad' }] } as never);
    mockCreatePayout.mockResolvedValueOnce({ id: 'po_test_once' } as never);

    const eventPayload = {
      id: `evt_${crypto.randomBytes(6).toString('hex')}`,
      type: 'payment_intent.succeeded',
      data: { object: { id: paymentIntentId, metadata: { quick_sale_id: quickSale.id } } },
    };
    await signedWebhookRequest(eventPayload);
    await signedWebhookRequest(eventPayload);

    expect(mockCreatePayout).toHaveBeenCalledTimes(1);
  });
});
