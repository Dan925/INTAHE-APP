import request from 'supertest';
import type { Express } from 'express';
import { signupTestUser, type TestUser } from './auth';

export interface OrgEventFixture {
  owner: TestUser;
  organization: { id: string; slug: string };
  event: { id: string; status: string };
}

export async function createOrgAndPublishedEvent(
  app: Express,
  overrides: { fees_absorbed_by_organizer?: boolean } = {},
): Promise<OrgEventFixture> {
  const owner = await signupTestUser(app);

  const orgRes = await request(app)
    .post('/v1/organizations')
    .set('Authorization', `Bearer ${owner.accessToken}`)
    .send({ name: `Checkout Org ${Date.now()}-${Math.random()}` });
  const organization = orgRes.body.organization;

  const eventRes = await request(app)
    .post(`/v1/organizations/${organization.id}/events`)
    .set('Authorization', `Bearer ${owner.accessToken}`)
    .send({
      name: 'Ticketed Event',
      start_at: '2026-09-01T18:00:00.000Z',
      end_at: '2026-09-01T23:00:00.000Z',
      address: '1 Main St',
      fees_absorbed_by_organizer: overrides.fees_absorbed_by_organizer ?? false,
    });
  const event = eventRes.body.event;

  await request(app)
    .post(`/v1/organizations/${organization.id}/events/${event.id}/publish`)
    .set('Authorization', `Bearer ${owner.accessToken}`);

  return { owner, organization, event: { ...event, status: 'published' } };
}

export async function createTicketType(
  app: Express,
  owner: TestUser,
  organizationId: string,
  eventId: string,
  overrides: Partial<{
    name: string;
    price_cents: number;
    currency: string;
    quantity_total: number;
    sale_starts_at: string;
    sale_ends_at: string;
  }> = {},
) {
  const res = await request(app)
    .post(`/v1/organizations/${organizationId}/events/${eventId}/ticket-types`)
    .set('Authorization', `Bearer ${owner.accessToken}`)
    .send({
      name: overrides.name ?? 'General Admission',
      price_cents: overrides.price_cents ?? 2500,
      ...(overrides.currency ? { currency: overrides.currency } : {}),
      quantity_total: overrides.quantity_total ?? 10,
      ...(overrides.sale_starts_at ? { sale_starts_at: overrides.sale_starts_at } : {}),
      ...(overrides.sale_ends_at ? { sale_ends_at: overrides.sale_ends_at } : {}),
    });
  if (res.status !== 201) {
    throw new Error(`Ticket type creation failed in test helper: ${JSON.stringify(res.body)}`);
  }
  return res.body.ticket_type;
}
