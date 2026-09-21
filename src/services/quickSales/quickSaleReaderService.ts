import { pool } from '../../config/database';
import { ApiError } from '../../utils/errors';
import { createConnectionToken, createTerminalLocation } from '../stripe/stripeTerminal';
import type { OrganizationRow } from '../../types/db';

async function getConnectedOrganization(organizationId: string): Promise<OrganizationRow> {
  const result = await pool.query<OrganizationRow>(
    `SELECT * FROM organizations WHERE id = $1 AND deleted_at IS NULL`,
    [organizationId],
  );
  const organization = result.rows[0];
  if (!organization) {
    throw new ApiError(404, 'organization_not_found', 'Organization not found.', null);
  }
  if (!organization.stripe_account_id || !organization.stripe_charges_enabled) {
    throw new ApiError(
      409,
      'stripe_not_connected',
      'Connect a Stripe account and complete verification before setting up a card reader.',
      null,
    );
  }
  return organization;
}

/** Fetched fresh by the mobile app's StripeTerminalProvider tokenProvider on every connection attempt — never cached. */
export async function getReaderConnectionTokenSecret(organizationId: string): Promise<string> {
  const organization = await getConnectedOrganization(organizationId);
  const token = await createConnectionToken(organization.stripe_account_id!);
  return token.secret;
}

export async function getTerminalLocationId(organizationId: string): Promise<string | null> {
  const organization = await getConnectedOrganization(organizationId);
  return organization.stripe_terminal_location_id;
}

export interface SetUpTerminalLocationInput {
  display_name: string;
  address: {
    line1: string;
    line2?: string | undefined;
    city: string;
    state?: string | undefined;
    postal_code: string;
    country: string;
  };
}

/**
 * One-time-per-organization setup: creates the Stripe Terminal Location a
 * reader must be registered to before it can be discovered/connected, and
 * persists its id so subsequent app opens (getTerminalLocationId) don't
 * need to set this up again. Re-running this for an organization that
 * already has one just creates (and switches to) a second Location — this
 * is deliberately an admin-only action (see the route), not something a
 * volunteer taking sales can trigger by accident.
 */
export async function setUpTerminalLocation(
  organizationId: string,
  input: SetUpTerminalLocationInput,
): Promise<string> {
  const organization = await getConnectedOrganization(organizationId);
  const location = await createTerminalLocation(organization.stripe_account_id!, {
    displayName: input.display_name,
    address: {
      line1: input.address.line1,
      line2: input.address.line2,
      city: input.address.city,
      state: input.address.state,
      postalCode: input.address.postal_code,
      country: input.address.country,
    },
  });
  await pool.query(`UPDATE organizations SET stripe_terminal_location_id = $2 WHERE id = $1`, [
    organizationId,
    location.id,
  ]);
  return location.id;
}
