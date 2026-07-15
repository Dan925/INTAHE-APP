import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { pool } from '../src/config/database';
import { stripeClient } from '../src/services/stripe/stripeClient';
import { createAccountLink, createConnectedAccount } from '../src/services/stripe/stripeConnect';
import { createPaymentIntent } from '../src/services/stripe/stripePayments';
import { signupTestUser } from './helpers/auth';
import { truncateAllTables } from './helpers/db';
import { createOrgAndPublishedEvent, createTicketType } from './helpers/checkoutFixtures';

jest.mock('../src/services/stripe/stripeConnect');
jest.mock('../src/services/stripe/stripePayments');

const mockCreateConnectedAccount = createConnectedAccount as jest.MockedFunction<typeof createConnectedAccount>;
const mockCreateAccountLink = createAccountLink as jest.MockedFunction<typeof createAccountLink>;
const mockCreatePaymentIntent = createPaymentIntent as jest.MockedFunction<typeof createPaymentIntent>;

const app = createApp();

beforeEach(async () => {
  await truncateAllTables();
  jest.clearAllMocks();
  mockCreateConnectedAccount.mockImplementation(async () => {
    const id = `acct_test_${crypto.randomBytes(6).toString('hex')}`;
    return { id } as never;
  });
  mockCreateAccountLink.mockImplementation(async () => ({ url: 'https://connect.stripe.com/setup/test' }) as never);
  mockCreatePaymentIntent.mockImplementation(async () => {
    const id = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
    return { id, client_secret: `${id}_secret` } as never;
  });
});

afterAll(async () => {
  await pool.end();
});

async function createOrg(owner: Awaited<ReturnType<typeof signupTestUser>>) {
  const res = await request(app)
    .post('/v1/organizations')
    .set('Authorization', `Bearer ${owner.accessToken}`)
    .send({ name: 'Connect Org' });
  return res.body.organization as { id: string };
}

describe('POST /v1/organizations/:organizationId/stripe/onboarding-link', () => {
  it('creates a connected account on first call and returns an onboarding url', async () => {
    const owner = await signupTestUser(app);
    const org = await createOrg(owner);

    const res = await request(app)
      .post(`/v1/organizations/${org.id}/stripe/onboarding-link`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://connect.stripe.com/setup/test');
    expect(mockCreateConnectedAccount).toHaveBeenCalledTimes(1);

    const orgRow = await pool.query('SELECT stripe_account_id FROM organizations WHERE id = $1', [org.id]);
    expect(orgRow.rows[0].stripe_account_id).toEqual(expect.stringMatching(/^acct_test_/));
  });

  it('reuses the existing connected account on a second call instead of creating a new one', async () => {
    const owner = await signupTestUser(app);
    const org = await createOrg(owner);

    await request(app)
      .post(`/v1/organizations/${org.id}/stripe/onboarding-link`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    await request(app)
      .post(`/v1/organizations/${org.id}/stripe/onboarding-link`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(mockCreateConnectedAccount).toHaveBeenCalledTimes(1);
    expect(mockCreateAccountLink).toHaveBeenCalledTimes(2);
  });

  it('forbids an admin from initiating onboarding (owner only)', async () => {
    const owner = await signupTestUser(app);
    const admin = await signupTestUser(app);
    const org = await createOrg(owner);
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, accepted_at) VALUES ($1, $2, 'admin', now())`,
      [org.id, admin.userId],
    );

    const res = await request(app)
      .post(`/v1/organizations/${org.id}/stripe/onboarding-link`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(403);
    expect(mockCreateConnectedAccount).not.toHaveBeenCalled();
  });
});

describe('GET /v1/organizations/:organizationId/stripe/status', () => {
  it('reflects connected/charges_enabled state, owner only', async () => {
    const owner = await signupTestUser(app);
    const admin = await signupTestUser(app);
    const org = await createOrg(owner);
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, accepted_at) VALUES ($1, $2, 'admin', now())`,
      [org.id, admin.userId],
    );

    const before = await request(app)
      .get(`/v1/organizations/${org.id}/stripe/status`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(before.body).toEqual({ connected: false, charges_enabled: false });

    await request(app)
      .post(`/v1/organizations/${org.id}/stripe/onboarding-link`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    const afterLink = await request(app)
      .get(`/v1/organizations/${org.id}/stripe/status`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(afterLink.body).toEqual({ connected: true, charges_enabled: false });

    const forbidden = await request(app)
      .get(`/v1/organizations/${org.id}/stripe/status`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(forbidden.status).toBe(403);
  });
});

describe('account.updated webhook', () => {
  async function sendAccountUpdated(stripeAccountId: string, chargesEnabled: boolean) {
    const payload = JSON.stringify({
      id: `evt_${crypto.randomBytes(6).toString('hex')}`,
      object: 'event',
      type: 'account.updated',
      data: { object: { id: stripeAccountId, charges_enabled: chargesEnabled } },
    });
    const signature = stripeClient.webhooks.generateTestHeaderString({
      payload,
      secret: env.STRIPE_WEBHOOK_SECRET,
    });
    return request(app)
      .post('/v1/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', signature)
      .send(payload);
  }

  it('syncs stripe_charges_enabled onto the organization by stripe_account_id', async () => {
    const owner = await signupTestUser(app);
    const org = await createOrg(owner);
    await request(app)
      .post(`/v1/organizations/${org.id}/stripe/onboarding-link`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    const orgRow = await pool.query('SELECT stripe_account_id FROM organizations WHERE id = $1', [org.id]);
    const stripeAccountId = orgRow.rows[0].stripe_account_id;

    const res = await sendAccountUpdated(stripeAccountId, true);
    expect(res.status).toBe(200);

    const statusRes = await request(app)
      .get(`/v1/organizations/${org.id}/stripe/status`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(statusRes.body).toEqual({ connected: true, charges_enabled: true });
  });

  it('is a no-op for an unrecognized account id', async () => {
    const res = await sendAccountUpdated('acct_does_not_exist', true);
    expect(res.status).toBe(200);
  });
});

describe('checkout only uses a destination charge once charges_enabled is true', () => {
  it('falls back to a platform charge while onboarding is incomplete', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    await request(app)
      .post(`/v1/organizations/${fixture.organization.id}/stripe/onboarding-link`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`);
    // stripe_account_id is now set, but charges_enabled is still false.
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 10,
    });

    await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ buyer_email: 'buyer@example.com', line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });

    expect(mockCreatePaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ destinationAccountId: null, applicationFeeCents: undefined }),
    );
  });

  it('uses a destination charge once the connected account is charges_enabled', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const orgRes = await request(app)
      .post(`/v1/organizations/${fixture.organization.id}/stripe/onboarding-link`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`);
    expect(orgRes.status).toBe(200);
    const orgRow = await pool.query('SELECT stripe_account_id FROM organizations WHERE id = $1', [
      fixture.organization.id,
    ]);
    const stripeAccountId = orgRow.rows[0].stripe_account_id;
    await pool.query(`UPDATE organizations SET stripe_charges_enabled = true WHERE id = $1`, [
      fixture.organization.id,
    ]);

    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 10,
    });
    await request(app)
      .post(`/v1/events/${fixture.event.id}/orders`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ buyer_email: 'buyer@example.com', line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });

    expect(mockCreatePaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ destinationAccountId: stripeAccountId }),
    );
  });
});
