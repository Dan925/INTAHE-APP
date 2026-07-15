import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { pool } from '../src/config/database';
import { stripeClient } from '../src/services/stripe/stripeClient';
import { createPaymentIntent } from '../src/services/stripe/stripePayments';
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

async function confirmPayment(paymentIntentId: string): Promise<void> {
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
  const res = await request(app)
    .post('/v1/stripe/webhook')
    .set('Content-Type', 'application/json')
    .set('Stripe-Signature', signature)
    .send(payload);
  if (res.status !== 200) {
    throw new Error(`Webhook confirmation failed in test helper: ${JSON.stringify(res.body)}`);
  }
}

async function purchaseAndConfirm(
  eventId: string,
  ticketTypeId: string,
  quantity: number,
): Promise<{ qrCodes: string[] }> {
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

  await confirmPayment(paymentIntentId);

  const ticketsResult = await pool.query<{ qr_code: string }>(
    `SELECT qr_code FROM tickets WHERE order_id = $1`,
    [checkoutRes.body.order.id],
  );
  return { qrCodes: ticketsResult.rows.map((r) => r.qr_code) };
}

describe('POST /v1/organizations/:organizationId/events/:eventId/check-in', () => {
  it('checks in a valid ticket', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 10,
    });
    const { qrCodes } = await purchaseAndConfirm(fixture.event.id, ticketType.id, 1);

    const res = await request(app)
      .post(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/check-in`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`)
      .send({ qr_code: qrCodes[0] });

    expect(res.status).toBe(200);
    expect(res.body.ticket.checked_in_at).toEqual(expect.any(String));
    expect(res.body.ticket.checked_in_by).toBe(fixture.owner.userId);
  });

  it('rejects checking in the same ticket twice', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 10,
    });
    const { qrCodes } = await purchaseAndConfirm(fixture.event.id, ticketType.id, 1);
    const url = `/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/check-in`;

    await request(app).post(url).set('Authorization', `Bearer ${fixture.owner.accessToken}`).send({ qr_code: qrCodes[0] });
    const res = await request(app).post(url).set('Authorization', `Bearer ${fixture.owner.accessToken}`).send({ qr_code: qrCodes[0] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ticket_already_checked_in');
  });

  it('returns 404 for an unknown qr_code', async () => {
    const fixture = await createOrgAndPublishedEvent(app);

    const res = await request(app)
      .post(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/check-in`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`)
      .send({ qr_code: 'not-a-real-code' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ticket_not_found');
  });

  it('never allows check-in across events, even within the same organization', async () => {
    const owner = await signupTestUser(app);
    const orgRes = await request(app)
      .post('/v1/organizations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Multi-Event Org' });
    const organization = orgRes.body.organization;

    async function publishedEventIn(name: string) {
      const eventRes = await request(app)
        .post(`/v1/organizations/${organization.id}/events`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ name, start_at: '2026-09-01T18:00:00.000Z', end_at: '2026-09-01T23:00:00.000Z' });
      await request(app)
        .post(`/v1/organizations/${organization.id}/events/${eventRes.body.event.id}/publish`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      return eventRes.body.event;
    }

    const eventA = await publishedEventIn('Event A');
    const eventB = await publishedEventIn('Event B');
    const ticketTypeA = await createTicketType(app, owner, organization.id, eventA.id, { quantity_total: 10 });
    const { qrCodes } = await purchaseAndConfirm(eventA.id, ticketTypeA.id, 1);

    // Same organization, same owner, but the ticket belongs to eventA — a
    // check-in attempt scoped to eventB must not find it.
    const res = await request(app)
      .post(`/v1/organizations/${organization.id}/events/${eventB.id}/check-in`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ qr_code: qrCodes[0] });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ticket_not_found');
  });

  it('lets a volunteer check tickets in', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const volunteer = await signupTestUser(app);
    await addMember(fixture.organization.id, volunteer.userId, 'volunteer');
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 10,
    });
    const { qrCodes } = await purchaseAndConfirm(fixture.event.id, ticketType.id, 1);

    const res = await request(app)
      .post(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/check-in`)
      .set('Authorization', `Bearer ${volunteer.accessToken}`)
      .send({ qr_code: qrCodes[0] });

    expect(res.status).toBe(200);
  });
});

describe('GET /v1/organizations/:organizationId/events/:eventId/guest-list', () => {
  it('lets staff view the guest list with attendee/order details', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const staff = await signupTestUser(app);
    await addMember(fixture.organization.id, staff.userId, 'staff');
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 10,
    });
    await purchaseAndConfirm(fixture.event.id, ticketType.id, 2);

    const res = await request(app)
      .get(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/guest-list`)
      .set('Authorization', `Bearer ${staff.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toMatchObject({
      ticket_type_name: ticketType.name,
      buyer_email: 'buyer@example.com',
      checked_in_at: null,
    });
  });

  it('forbids a volunteer from viewing the guest list', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const volunteer = await signupTestUser(app);
    await addMember(fixture.organization.id, volunteer.userId, 'volunteer');

    const res = await request(app)
      .get(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/guest-list`)
      .set('Authorization', `Bearer ${volunteer.accessToken}`);

    expect(res.status).toBe(403);
  });

  it('paginates the guest list with a cursor', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 10,
    });
    await purchaseAndConfirm(fixture.event.id, ticketType.id, 3);

    const firstPage = await request(app)
      .get(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/guest-list?limit=2`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`);
    expect(firstPage.body.items).toHaveLength(2);
    expect(firstPage.body.next_cursor).toEqual(expect.any(String));

    const secondPage = await request(app)
      .get(
        `/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/guest-list?limit=2&cursor=${firstPage.body.next_cursor}`,
      )
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`);
    expect(secondPage.body.items).toHaveLength(1);
    expect(secondPage.body.next_cursor).toBeNull();
  });
});
