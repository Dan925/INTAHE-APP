import { pool } from '../../config/database';
import { env } from '../../config/env';
import { ApiError } from '../../utils/errors';
import { createAccountLink, createConnectedAccount } from '../stripe/stripeConnect';
import type { OrganizationRow } from '../../types/db';

export interface OnboardingLinkResult {
  url: string;
}

export interface StripeConnectStatus {
  connected: boolean;
  charges_enabled: boolean;
}

async function getActiveOrganization(organizationId: string): Promise<OrganizationRow> {
  const result = await pool.query<OrganizationRow>(
    `SELECT * FROM organizations WHERE id = $1 AND deleted_at IS NULL`,
    [organizationId],
  );
  const organization = result.rows[0];
  if (!organization) {
    throw new ApiError(403, 'forbidden', 'You do not have access to this resource.', null);
  }
  return organization;
}

/**
 * Creates the connected account on first call, reuses it on every
 * subsequent one — so an owner re-clicking "Connect Stripe" (e.g. after
 * abandoning onboarding partway through) resumes the same account instead
 * of accumulating orphaned Stripe accounts.
 */
export async function createOnboardingLink(organizationId: string): Promise<OnboardingLinkResult> {
  const organization = await getActiveOrganization(organizationId);

  let stripeAccountId = organization.stripe_account_id;
  if (!stripeAccountId) {
    const account = await createConnectedAccount({ email: organization.contact_email });
    stripeAccountId = account.id;
    await pool.query(`UPDATE organizations SET stripe_account_id = $2 WHERE id = $1`, [
      organizationId,
      stripeAccountId,
    ]);
  }

  const accountLink = await createAccountLink({
    accountId: stripeAccountId,
    refreshUrl: env.STRIPE_CONNECT_REFRESH_URL,
    returnUrl: env.STRIPE_CONNECT_RETURN_URL,
  });

  return { url: accountLink.url };
}

export async function getConnectStatus(organizationId: string): Promise<StripeConnectStatus> {
  const organization = await getActiveOrganization(organizationId);
  return {
    connected: organization.stripe_account_id !== null,
    charges_enabled: organization.stripe_charges_enabled,
  };
}
