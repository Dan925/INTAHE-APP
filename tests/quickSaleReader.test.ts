import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/database';
import { createConnectionToken, createTerminalLocation } from '../src/services/stripe/stripeTerminal';
import { createQuickSaleReaderPaymentIntent } from '../src/services/stripe/stripePayments';
import { truncateAllTables } from './helpers/db';
import { signupTestUser } from './helpers/auth';
import { createOrgAndPublishedEvent, createOrgAndPublishedEventWithoutStripe } from './helpers/checkoutFixtures';

jest.mock('../src/services/stripe/stripeTerminal');
jest.mock('../src/services/stripe/stripePayments');

const mockCreateConnectionToken = createConnectionToken as jest.MockedFunction<typeof createConnectionToken>;
const mockCreateTerminalLocation = createTerminalLocation as jest.MockedFunction<typeof createTerminalLocation>;
const mockCreateQuickSaleReaderPaymentIntent = createQuickSaleReaderPaymentIntent as jest.MockedFunction<
  typeof createQuickSaleReaderPaymentIntent
>;

const app = createApp();

const validAddress = {
  line1: '123 Rue Principale',
  city: 'Montréal',
  postal_code: 'H2X 1Y6',
  country: 'CA',
};

beforeEach(async () => {
  await truncateAllTables();
  jest.clearAllMocks();
  mockCreateConnectionToken.mockResolvedValue({ secret: 'ctst_test_secret' } as never);
  mockCreateTerminalLocation.mockResolvedValue({ id: 'tml_test_location' } as never);
  mockCreateQuickSaleReaderPaymentIntent.mockImplementation(async () => {
    const id = `pi_test_${Math.random().toString(16).slice(2)}`;
    return { id, client_secret: `${id}_secret` } as never;
  });
});

afterAll(async () => {
  await pool.end();
});

describe('POST /v1/organizations/:organizationId/quick-sale-reader/connection-token', () => {
  it('lets a volunteer fetch a connection token, scoped to the connected account', async () => {
    const { owner, organization } = await createOrgAndPublishedEvent(app);

    const res = await request(app)
      .post(`/v1/organizations/${organization.id}/quick-sale-reader/connection-token`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ secret: 'ctst_test_secret' });
    expect(mockCreateConnectionToken).toHaveBeenCalledWith(expect.any(String));
  });

  it('refuses when the organization has no connected, charges-enabled Stripe account', async () => {
    const { owner, organization } = await createOrgAndPublishedEventWithoutStripe(app);

    const res = await request(app)
      .post(`/v1/organizations/${organization.id}/quick-sale-reader/connection-token`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('stripe_not_connected');
  });

  it('rejects someone with no membership in the organization', async () => {
    const { organization } = await createOrgAndPublishedEvent(app);
    const stranger = await signupTestUser(app);

    const res = await request(app)
      .post(`/v1/organizations/${organization.id}/quick-sale-reader/connection-token`)
      .set('Authorization', `Bearer ${stranger.accessToken}`);

    expect(res.status).toBe(403);
  });
});

describe('quick sale reader location', () => {
  it('starts unset, and an admin can set one up', async () => {
    const { owner, organization } = await createOrgAndPublishedEvent(app);

    const beforeRes = await request(app)
      .get(`/v1/organizations/${organization.id}/quick-sale-reader/location`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(beforeRes.status).toBe(200);
    expect(beforeRes.body).toEqual({ location_id: null });

    const setUpRes = await request(app)
      .post(`/v1/organizations/${organization.id}/quick-sale-reader/location`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ display_name: 'Salon principal', address: validAddress });
    expect(setUpRes.status).toBe(201);
    expect(setUpRes.body).toEqual({ location_id: 'tml_test_location' });
    expect(mockCreateTerminalLocation).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ displayName: 'Salon principal' }),
    );

    const afterRes = await request(app)
      .get(`/v1/organizations/${organization.id}/quick-sale-reader/location`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(afterRes.body).toEqual({ location_id: 'tml_test_location' });
  });

  it('rejects an incomplete address', async () => {
    const { owner, organization } = await createOrgAndPublishedEvent(app);

    const res = await request(app)
      .post(`/v1/organizations/${organization.id}/quick-sale-reader/location`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ display_name: 'Salon principal', address: { line1: '123 Rue Principale' } });

    expect(res.status).toBe(400);
    expect(mockCreateTerminalLocation).not.toHaveBeenCalled();
  });
});

describe('POST /v1/organizations/:organizationId/quick-sales with in_person', () => {
  it('creates a card-present PaymentIntent instead of an online one', async () => {
    const { owner, organization } = await createOrgAndPublishedEvent(app);
    const itemRes = await request(app)
      .post(`/v1/organizations/${organization.id}/quick-sale-items`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Coupe', price_cents: 3500 });

    const res = await request(app)
      .post(`/v1/organizations/${organization.id}/quick-sales`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ quick_sale_item_id: itemRes.body.quick_sale_item.id, in_person: true });

    expect(res.status).toBe(201);
    expect(mockCreateQuickSaleReaderPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: res.body.quick_sale.total_cents }),
    );
  });
});
