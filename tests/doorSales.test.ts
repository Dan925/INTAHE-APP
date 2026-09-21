import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/config/database';
import { createOrderReaderPaymentIntent, createPaymentIntent } from '../src/services/stripe/stripePayments';
import { truncateAllTables } from './helpers/db';
import { signupTestUser } from './helpers/auth';
import { createOrgAndPublishedEvent, createTicketType } from './helpers/checkoutFixtures';

jest.mock('../src/services/stripe/stripePayments');

const mockCreatePaymentIntent = createPaymentIntent as jest.MockedFunction<typeof createPaymentIntent>;
const mockCreateOrderReaderPaymentIntent = createOrderReaderPaymentIntent as jest.MockedFunction<
  typeof createOrderReaderPaymentIntent
>;

const app = createApp();

beforeEach(async () => {
  await truncateAllTables();
  jest.clearAllMocks();
  mockCreatePaymentIntent.mockImplementation(async () => {
    const id = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
    return { id, client_secret: `${id}_secret` } as never;
  });
  mockCreateOrderReaderPaymentIntent.mockImplementation(async () => {
    const id = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
    return { id, client_secret: `${id}_secret` } as never;
  });
});

afterAll(async () => {
  await pool.end();
});

describe('POST /v1/organizations/:organizationId/events/:eventId/door-sales', () => {
  it('creates a paid order via a card-present PaymentIntent, not an online one', async () => {
    const { owner, organization, event } = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, owner, organization.id, event.id, {
      name: 'General',
      price_cents: 2500,
      quantity_total: 10,
    });

    const res = await request(app)
      .post(`/v1/organizations/${organization.id}/events/${event.id}/door-sales`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ buyer_email: 'door@example.com', line_items: [{ ticket_type_id: ticketType.id, quantity: 1 }] });

    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ buyer_email: 'door@example.com', status: 'pending' });
    expect(typeof res.body.client_secret).toBe('string');
    expect(mockCreateOrderReaderPaymentIntent).toHaveBeenCalledTimes(1);
    expect(mockCreatePaymentIntent).not.toHaveBeenCalled();
  });

  it('rejects someone with no membership in the organization', async () => {
    const { organization, event } = await createOrgAndPublishedEvent(app);
    const stranger = await signupTestUser(app);

    const res = await request(app)
      .post(`/v1/organizations/${organization.id}/events/${event.id}/door-sales`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .send({ buyer_email: 'door@example.com', line_items: [] });

    expect(res.status).toBe(403);
  });

  it('rejects an event that belongs to a different organization, even one the same owner also runs', async () => {
    const { owner, event } = await createOrgAndPublishedEvent(app);
    const otherOrgRes = await request(app)
      .post('/v1/organizations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: `Other Org ${Date.now()}-${Math.random()}` });

    const res = await request(app)
      .post(`/v1/organizations/${otherOrgRes.body.organization.id}/events/${event.id}/door-sales`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ buyer_email: 'door@example.com', line_items: [{ ticket_type_id: crypto.randomUUID(), quantity: 1 }] });

    expect(res.status).toBe(404);
  });
});
