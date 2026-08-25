import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { pool } from '../src/config/database';
import { sendEmail } from '../src/services/email/emailClient';
import { stripeClient } from '../src/services/stripe/stripeClient';
import { createPaymentIntent } from '../src/services/stripe/stripePayments';
import { truncateAllTables } from './helpers/db';
import { createOrgAndPublishedEvent, createTicketType } from './helpers/checkoutFixtures';
import { signupTestUser } from './helpers/auth';

jest.mock('../src/services/stripe/stripePayments');
jest.mock('../src/services/email/emailClient');

const mockCreatePaymentIntent = createPaymentIntent as jest.MockedFunction<typeof createPaymentIntent>;
const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;

const app = createApp();

beforeEach(async () => {
  await truncateAllTables();
  jest.clearAllMocks();
  mockSendEmail.mockResolvedValue(undefined);
  mockCreatePaymentIntent.mockImplementation(async () => {
    const id = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
    return { id, client_secret: `${id}_secret` } as never;
  });
});

afterAll(async () => {
  await pool.end();
});

function signedWebhookRequest(eventPayload: unknown) {
  const payload = JSON.stringify(eventPayload);
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

async function orderFor(eventId: string, ticketTypeId: string, buyerEmail: string) {
  const paymentIntentId = `pi_test_${crypto.randomBytes(6).toString('hex')}`;
  mockCreatePaymentIntent.mockResolvedValueOnce({
    id: paymentIntentId,
    client_secret: `${paymentIntentId}_secret`,
  } as never);
  const res = await request(app)
    .post(`/v1/events/${eventId}/orders`)
    .set('Idempotency-Key', crypto.randomUUID())
    .send({ buyer_email: buyerEmail, line_items: [{ ticket_type_id: ticketTypeId, quantity: 1 }] });
  return { orderId: res.body.order.id as string, paymentIntentId };
}

/**
 * Reproduces the real oversell scenario end to end, exactly as it happens
 * in production: order A reserves the only slot, its reservation expires
 * and gets released (by order B's checkout triggering the lazy sweep),
 * order B buys the now-free slot. Stops short of paying order A late, so
 * callers that need to change org/event state (e.g. setting contact_email)
 * before that webhook fires can do so via payLateOrder below.
 */
async function setUpOversellPrecondition() {
  const fixture = await createOrgAndPublishedEvent(app);
  const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
    quantity_total: 1,
  });

  const orderA = await orderFor(fixture.event.id, ticketType.id, 'buyer-a@example.com');

  await pool.query(`UPDATE orders SET reservation_expires_at = now() - interval '1 minute' WHERE id = $1`, [
    orderA.orderId,
  ]);

  // Triggers the lazy sweep (releases A, frees the slot) then reserves it for B.
  const orderB = await orderFor(fixture.event.id, ticketType.id, 'buyer-b@example.com');

  const releasedA = await pool.query('SELECT status FROM orders WHERE id = $1', [orderA.orderId]);
  expect(releasedA.rows[0].status).toBe('expired');

  return { fixture, ticketType, orderA, orderB };
}

// A's payment succeeds anyway — real money already moved.
async function payLateOrder(orderA: { orderId: string; paymentIntentId: string }) {
  return signedWebhookRequest({
    id: `evt_${crypto.randomBytes(6).toString('hex')}`,
    object: 'event',
    type: 'payment_intent.succeeded',
    data: { object: { id: orderA.paymentIntentId } },
  });
}

async function reproduceOversell() {
  const { fixture, ticketType, orderA, orderB } = await setUpOversellPrecondition();
  const webhookRes = await payLateOrder(orderA);
  return { fixture, ticketType, orderA, orderB, webhookRes };
}

describe('capacity overshoot: payment always wins, even past capacity', () => {
  it('the late webhook succeeds (200) and marks the order paid instead of failing forever', async () => {
    const { webhookRes, orderA } = await reproduceOversell();

    expect(webhookRes.status).toBe(200);
    const orderRow = await pool.query('SELECT status FROM orders WHERE id = $1', [orderA.orderId]);
    expect(orderRow.rows[0].status).toBe('paid');
    const tickets = await pool.query('SELECT id FROM tickets WHERE order_id = $1', [orderA.orderId]);
    expect(tickets.rows).toHaveLength(1);
  });

  it('pushes quantity_sold above quantity_total without erroring', async () => {
    const { ticketType } = await reproduceOversell();

    const row = await pool.query('SELECT quantity_sold, quantity_total FROM ticket_types WHERE id = $1', [
      ticketType.id,
    ]);
    expect(row.rows[0].quantity_sold).toBe(2);
    expect(row.rows[0].quantity_total).toBe(1);
  });

  it('persists a capacity_overshoot_incidents row with the right numbers', async () => {
    const { ticketType, orderA, fixture } = await reproduceOversell();

    const row = await pool.query('SELECT * FROM capacity_overshoot_incidents WHERE event_id = $1', [
      fixture.event.id,
    ]);
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0]).toMatchObject({
      organization_id: fixture.organization.id,
      event_id: fixture.event.id,
      ticket_type_id: ticketType.id,
      order_id: orderA.orderId,
      quantity_sold: 2,
      quantity_total: 1,
      overshoot_quantity: 1,
    });
  });

  it('logs an alert-level structured entry with organization/event/ticket type/order/magnitude/timestamp', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { ticketType, orderA, fixture } = await reproduceOversell();

      const alertCall = consoleErrorSpy.mock.calls.find((call) => call[0] === '[capacity_overshoot]');
      expect(alertCall).toBeDefined();
      const payload = JSON.parse(alertCall![1] as string);
      expect(payload).toMatchObject({
        level: 'alert',
        organization_id: fixture.organization.id,
        event_id: fixture.event.id,
        ticket_type_id: ticketType.id,
        order_id: orderA.orderId,
        quantity_sold: 2,
        quantity_total: 1,
        overshoot_quantity: 1,
      });
      expect(typeof payload.created_at).toBe('string');
      expect(Number.isNaN(Date.parse(payload.created_at))).toBe(false);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('falls back to the owner\'s email when the organization has no contact_email set', async () => {
    const { fixture, ticketType } = await reproduceOversell();

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: fixture.owner.email,
        subject: expect.stringContaining(ticketType.name),
      }),
    );
  });

  it('prefers the organization contact_email over the owner\'s email when one is set', async () => {
    const { fixture, ticketType, orderA } = await setUpOversellPrecondition();
    await pool.query(`UPDATE organizations SET contact_email = $2 WHERE id = $1`, [
      fixture.organization.id,
      'events-team@example.com',
    ]);

    await payLateOrder(orderA);

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'events-team@example.com',
        subject: expect.stringContaining(ticketType.name),
      }),
    );
  });

  it('never blocks check-in for a valid ticket, and signals the overshoot instead', async () => {
    const { fixture, orderA } = await reproduceOversell();

    const ticketRow = await pool.query('SELECT qr_code FROM tickets WHERE order_id = $1', [orderA.orderId]);
    const qrCode = ticketRow.rows[0].qr_code;

    const res = await request(app)
      .post(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/check-in`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`)
      .send({ qr_code: qrCode });

    expect(res.status).toBe(200);
    expect(res.body.ticket.checked_in_at).not.toBeNull();
    expect(res.body.ticket.ticket_type_capacity_exceeded).toBe(true);
    expect(res.body.ticket.ticket_type_overshoot_quantity).toBe(1);
  });

  it('reports capacity_exceeded: false for a normal ticket type never oversold', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 5,
    });
    const { orderId, paymentIntentId } = await orderFor(fixture.event.id, ticketType.id, 'buyer@example.com');
    await signedWebhookRequest({
      id: `evt_${crypto.randomBytes(6).toString('hex')}`,
      object: 'event',
      type: 'payment_intent.succeeded',
      data: { object: { id: paymentIntentId } },
    });
    const ticketRow = await pool.query('SELECT qr_code FROM tickets WHERE order_id = $1', [orderId]);

    const res = await request(app)
      .post(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/check-in`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`)
      .send({ qr_code: ticketRow.rows[0].qr_code });

    expect(res.status).toBe(200);
    expect(res.body.ticket.ticket_type_capacity_exceeded).toBe(false);
    expect(res.body.ticket.ticket_type_overshoot_quantity).toBe(0);
  });

  it('shows up in the organization dashboard as capacity_overshoot_quantity', async () => {
    const { fixture } = await reproduceOversell();

    const res = await request(app)
      .get(`/v1/organizations/${fixture.organization.id}/dashboard`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`);

    expect(res.status).toBe(200);
    const entry = res.body.events.find((e: { event_id: string }) => e.event_id === fixture.event.id);
    expect(entry.capacity_overshoot_quantity).toBe(1);
  });

  it('an unaffected event reports capacity_overshoot_quantity: 0', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, { quantity_total: 5 });

    const res = await request(app)
      .get(`/v1/organizations/${fixture.organization.id}/dashboard`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`);

    expect(res.body.events[0].capacity_overshoot_quantity).toBe(0);
  });
});

describe('GET /v1/organizations/:organizationId/events/:eventId/capacity-incidents', () => {
  it('lists the affected orders for an oversold ticket type', async () => {
    const { fixture, ticketType, orderA } = await reproduceOversell();

    const res = await request(app)
      .get(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/capacity-incidents`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      ticket_type_id: ticketType.id,
      ticket_type_name: ticketType.name,
      order_id: orderA.orderId,
      buyer_email: 'buyer-a@example.com',
      quantity_sold: 2,
      quantity_total: 1,
      overshoot_quantity: 1,
    });
  });

  it('is empty for an event with no incidents', async () => {
    const fixture = await createOrgAndPublishedEvent(app);

    const res = await request(app)
      .get(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/capacity-incidents`)
      .set('Authorization', `Bearer ${fixture.owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('forbids a volunteer (below admin) from viewing incidents', async () => {
    const { fixture } = await reproduceOversell();
    const volunteer = await signupTestUser(app);
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, accepted_at) VALUES ($1, $2, 'volunteer', now())`,
      [fixture.organization.id, volunteer.userId],
    );

    const res = await request(app)
      .get(`/v1/organizations/${fixture.organization.id}/events/${fixture.event.id}/capacity-incidents`)
      .set('Authorization', `Bearer ${volunteer.accessToken}`);

    expect(res.status).toBe(403);
  });
});
