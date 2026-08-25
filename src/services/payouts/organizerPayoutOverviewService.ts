import { pool } from '../../config/database';
import { env } from '../../config/env';
import { retrieveBalance } from '../stripe/stripePayouts';
import type { OrganizerPayoutRow } from '../../types/db';

export interface PayoutBalance {
  available_cents: number;
  pending_cents: number;
  currency: string;
}

export interface UpcomingPayout {
  event_id: string;
  event_name: string;
  event_end_at: string;
  scheduled_for: string;
}

export interface PayoutHistoryEntry {
  id: string;
  event_id: string;
  event_name: string;
  status: OrganizerPayoutRow['status'];
  amount_cents: number | null;
  currency: string | null;
  stripe_payout_id: string | null;
  attempted_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface OrganizationPayoutOverview {
  connected: boolean;
  payout_delay_hours: number;
  balance: PayoutBalance | null;
  upcoming: UpcomingPayout[];
  history: PayoutHistoryEntry[];
}

/**
 * The one place "what currency is this organization's payout balance in"
 * gets decided from ticket data, mirroring payoutService.findDueEvents —
 * orders don't carry their own currency column, only ticket_types do, and
 * checkout already enforces one currency per order.
 */
async function primaryCurrencyForOrganization(organizationId: string): Promise<string> {
  const result = await pool.query<{ currency: string }>(
    `SELECT tt.currency
     FROM ticket_types tt
     JOIN events e ON e.id = tt.event_id
     WHERE e.organization_id = $1
     LIMIT 1`,
    [organizationId],
  );
  return result.rows[0]?.currency ?? 'usd';
}

/**
 * Everything the organizer-facing payout screen needs in one call: what's
 * sitting on their Stripe balance right now (collected vs. available —
 * "solde encaissé, solde disponible"), which events are still waiting on
 * their 48h delay ("date de versement prévue"), and the full attempt
 * history (due/executed/failed) from organizer_payouts.
 */
export async function getOrganizationPayoutOverview(organizationId: string): Promise<OrganizationPayoutOverview> {
  const orgResult = await pool.query<{ stripe_account_id: string | null }>(
    `SELECT stripe_account_id FROM organizations WHERE id = $1`,
    [organizationId],
  );
  const stripeAccountId = orgResult.rows[0]?.stripe_account_id ?? null;

  let balance: PayoutBalance | null = null;
  if (stripeAccountId) {
    const currency = await primaryCurrencyForOrganization(organizationId);
    const stripeBalance = await retrieveBalance(stripeAccountId);
    const availableEntry = stripeBalance.available.find((entry) => entry.currency === currency);
    // Stripe's "pending" bucket is what this UI calls "collected" — money
    // already taken from the buyer that hasn't cleared into available
    // balance yet, typically after Stripe's own ~2-day hold.
    const pendingEntry = stripeBalance.pending.find((entry) => entry.currency === currency);
    balance = {
      available_cents: availableEntry?.amount ?? 0,
      pending_cents: pendingEntry?.amount ?? 0,
      currency,
    };
  }

  const upcomingResult = await pool.query<{
    event_id: string;
    event_name: string;
    end_at: Date;
  }>(
    `SELECT e.id AS event_id, e.name AS event_name, e.end_at
     FROM events e
     WHERE e.organization_id = $1
       AND e.deleted_at IS NULL
       AND EXISTS (
         SELECT 1 FROM orders o WHERE o.event_id = e.id AND o.status IN ('paid', 'partial_refund')
       )
       AND NOT EXISTS (
         SELECT 1 FROM organizer_payouts p WHERE p.event_id = e.id AND p.status = 'succeeded'
       )
     ORDER BY e.end_at ASC`,
    [organizationId],
  );
  const upcoming: UpcomingPayout[] = upcomingResult.rows.map((row) => ({
    event_id: row.event_id,
    event_name: row.event_name,
    event_end_at: row.end_at.toISOString(),
    scheduled_for: new Date(row.end_at.getTime() + env.PAYOUT_DELAY_HOURS * 3_600_000).toISOString(),
  }));

  const historyResult = await pool.query<{
    id: string;
    event_id: string;
    event_name: string;
    status: OrganizerPayoutRow['status'];
    amount_cents: number | null;
    currency: string | null;
    stripe_payout_id: string | null;
    attempted_at: Date | null;
    error_message: string | null;
    created_at: Date;
  }>(
    `SELECT p.id, p.event_id, e.name AS event_name, p.status, p.amount_cents, p.currency,
            p.stripe_payout_id, p.attempted_at, p.error_message, p.created_at
     FROM organizer_payouts p
     JOIN events e ON e.id = p.event_id
     WHERE p.organization_id = $1
     ORDER BY p.created_at DESC
     LIMIT 50`,
    [organizationId],
  );
  const history: PayoutHistoryEntry[] = historyResult.rows.map((row) => ({
    id: row.id,
    event_id: row.event_id,
    event_name: row.event_name,
    status: row.status,
    amount_cents: row.amount_cents,
    currency: row.currency,
    stripe_payout_id: row.stripe_payout_id,
    attempted_at: row.attempted_at ? row.attempted_at.toISOString() : null,
    error_message: row.error_message,
    created_at: row.created_at.toISOString(),
  }));

  return {
    connected: Boolean(stripeAccountId),
    payout_delay_hours: env.PAYOUT_DELAY_HOURS,
    balance,
    upcoming,
    history,
  };
}
