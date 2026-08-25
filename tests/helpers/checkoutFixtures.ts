import request from 'supertest';
import type { Express } from 'express';
import { pool } from '../../src/config/database';
import { signupTestUser, type TestUser } from './auth';

export interface OrgEventFixture {
  owner: TestUser;
  organization: { id: string; slug: string };
  event: { id: string; status: string };
}

interface OrgAndPublishedEventOverrides {
  fees_absorbed_by_organizer?: boolean;
  is_public_discoverable?: boolean;
  latitude?: number;
  longitude?: number;
}

async function buildOrgAndPublishedEvent(
  app: Express,
  connectStripe: boolean,
  overrides: OrgAndPublishedEventOverrides,
): Promise<OrgEventFixture> {
  const owner = await signupTestUser(app);

  const orgRes = await request(app)
    .post('/v1/organizations')
    .set('Authorization', `Bearer ${owner.accessToken}`)
    .send({ name: `Checkout Org ${Date.now()}-${Math.random()}` });
  const organization = orgRes.body.organization;

  if (connectStripe) {
    // Sets stripe_account_id/stripe_charges_enabled directly rather than
    // going through the real onboarding-link + account.updated webhook
    // flow, which would depend on every calling test file mocking the
    // Stripe Connect service the same way. This fixture is shared by ~15
    // test files with varying mock setups, so a raw DB write is the one
    // path guaranteed to work the same everywhere.
    await pool.query(
      `UPDATE organizations SET stripe_account_id = $2, stripe_charges_enabled = true WHERE id = $1`,
      [organization.id, `acct_test_fixture_${organization.id}`],
    );
  }

  const eventRes = await request(app)
    .post(`/v1/organizations/${organization.id}/events`)
    .set('Authorization', `Bearer ${owner.accessToken}`)
    .send({
      name: 'Ticketed Event',
      start_at: '2026-09-01T18:00:00.000Z',
      end_at: '2026-09-01T23:00:00.000Z',
      address: '1 Main St',
      fees_absorbed_by_organizer: overrides.fees_absorbed_by_organizer ?? false,
      is_public_discoverable: overrides.is_public_discoverable ?? false,
      ...(overrides.latitude !== undefined ? { latitude: overrides.latitude } : {}),
      ...(overrides.longitude !== undefined ? { longitude: overrides.longitude } : {}),
    });
  const event = eventRes.body.event;

  await request(app)
    .post(`/v1/organizations/${organization.id}/events/${event.id}/publish`)
    .set('Authorization', `Bearer ${owner.accessToken}`);

  return { owner, organization, event: { ...event, status: 'published' } };
}

/**
 * Stripe-connected and charges-enabled by default — most tests using this
 * fixture go on to create a paid ticket type, which
 * ticketTypeService.assertOrganizationCanSellPaidTickets now refuses
 * without a working connected account. Pass a free ticket type
 * (price_cents: 0) if a given test doesn't need Stripe at all.
 */
export async function createOrgAndPublishedEvent(
  app: Express,
  overrides: OrgAndPublishedEventOverrides = {},
): Promise<OrgEventFixture> {
  return buildOrgAndPublishedEvent(app, true, overrides);
}

/**
 * Same as createOrgAndPublishedEvent, but the organization never connects
 * Stripe — for exercising the free-event path (a free ticket type must
 * still be creatable and sellable with no Connect account at all) and the
 * explicit refusal when something tries to sell a paid ticket type without
 * one. Deliberately a separate, explicitly-named fixture rather than an
 * options flag on the default one, so "no Stripe" stays an opt-in choice a
 * test makes on purpose, not something that quietly falls out of an
 * overrides object.
 */
export async function createOrgAndPublishedEventWithoutStripe(
  app: Express,
  overrides: OrgAndPublishedEventOverrides = {},
): Promise<OrgEventFixture> {
  return buildOrgAndPublishedEvent(app, false, overrides);
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
