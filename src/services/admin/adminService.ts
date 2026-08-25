import { pool } from '../../config/database';
import { env } from '../../config/env';
import { ApiError } from '../../utils/errors';
import type { EventRow, OrganizationRow, OrganizerPayoutStatus } from '../../types/db';

export async function approveOrganization(organizationId: string): Promise<{ id: string; platform_approved_at: string }> {
  const result = await pool.query<OrganizationRow>(
    `UPDATE organizations SET platform_approved_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [organizationId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(404, 'organization_not_found', 'Organization not found.', null);
  }
  return { id: row.id, platform_approved_at: row.platform_approved_at!.toISOString() };
}

export async function unpublishEvent(eventId: string): Promise<{ id: string; status: string }> {
  const result = await pool.query<EventRow>(
    `UPDATE events SET status = 'draft' WHERE id = $1 AND status = 'published' AND deleted_at IS NULL RETURNING *`,
    [eventId],
  );
  const row = result.rows[0];
  if (row) {
    return { id: row.id, status: row.status };
  }

  const existing = await pool.query<{ status: string }>(
    `SELECT status FROM events WHERE id = $1 AND deleted_at IS NULL`,
    [eventId],
  );
  const existingStatus = existing.rows[0]?.status;
  if (!existingStatus) {
    throw new ApiError(404, 'event_not_found', 'Event not found.', null);
  }
  throw new ApiError(
    409,
    'event_not_published',
    `Event cannot be unpublished from status "${existingStatus}".`,
    'status',
  );
}

export async function holdEventPayout(
  eventId: string,
  adminUserId: string,
): Promise<{ id: string; payout_held_at: string }> {
  const result = await pool.query<EventRow>(
    `UPDATE events SET payout_held_at = now(), payout_held_by = $2
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [eventId, adminUserId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(404, 'event_not_found', 'Event not found.', null);
  }
  return { id: row.id, payout_held_at: row.payout_held_at!.toISOString() };
}

export async function unholdEventPayout(eventId: string): Promise<{ id: string }> {
  const result = await pool.query<EventRow>(
    `UPDATE events SET payout_held_at = NULL, payout_held_by = NULL
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [eventId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(404, 'event_not_found', 'Event not found.', null);
  }
  return { id: row.id };
}

export interface AdminDuePayout {
  event_id: string;
  event_name: string;
  organization_id: string;
  organization_name: string;
  scheduled_for: string;
  hours_overdue: number;
  held: boolean;
}

export interface AdminPayoutHistoryEntry {
  id: string;
  event_id: string;
  event_name: string;
  organization_id: string;
  organization_name: string;
  status: OrganizerPayoutStatus;
  amount_cents: number | null;
  currency: string | null;
  stripe_payout_id: string | null;
  attempted_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface AdminPayoutOverview {
  due: AdminDuePayout[];
  executed: AdminPayoutHistoryEntry[];
  failed: AdminPayoutHistoryEntry[];
}

/**
 * Cross-organization view backing the admin console's payout section:
 * "due" is exactly what payoutService.findDueEvents would attempt next
 * (same eligibility rules, held events included so an admin can see and
 * clear a hold) — the alert the brief asks for ("un versement dû n'a pas
 * été exécuté dans les délais") is this list being non-empty, with
 * hours_overdue on each entry rather than a separate notification
 * pipeline. "executed"/"failed" read straight from organizer_payouts.
 */
export async function getAdminPayoutOverview(): Promise<AdminPayoutOverview> {
  const now = new Date();

  const dueResult = await pool.query<{
    event_id: string;
    event_name: string;
    organization_id: string;
    organization_name: string;
    end_at: Date;
    held: boolean;
  }>(
    `SELECT e.id AS event_id, e.name AS event_name, org.id AS organization_id, org.name AS organization_name,
            e.end_at, (e.payout_held_at IS NOT NULL) AS held
     FROM events e
     JOIN organizations org ON org.id = e.organization_id
     WHERE e.deleted_at IS NULL
       AND org.stripe_account_id IS NOT NULL
       AND e.end_at <= $1::timestamptz - ($2 * interval '1 hour')
       AND EXISTS (SELECT 1 FROM orders o WHERE o.event_id = e.id AND o.status IN ('paid', 'partial_refund'))
       AND NOT EXISTS (SELECT 1 FROM organizer_payouts p WHERE p.event_id = e.id AND p.status = 'succeeded')
     ORDER BY e.end_at ASC`,
    [now, env.PAYOUT_DELAY_HOURS],
  );
  const due: AdminDuePayout[] = dueResult.rows.map((row) => {
    const scheduledFor = new Date(row.end_at.getTime() + env.PAYOUT_DELAY_HOURS * 3_600_000);
    return {
      event_id: row.event_id,
      event_name: row.event_name,
      organization_id: row.organization_id,
      organization_name: row.organization_name,
      scheduled_for: scheduledFor.toISOString(),
      hours_overdue: Math.max(0, (now.getTime() - scheduledFor.getTime()) / 3_600_000),
      held: row.held,
    };
  });

  async function historyByStatus(status: 'succeeded' | 'failed'): Promise<AdminPayoutHistoryEntry[]> {
    const result = await pool.query<{
      id: string;
      event_id: string;
      event_name: string;
      organization_id: string;
      organization_name: string;
      status: OrganizerPayoutStatus;
      amount_cents: number | null;
      currency: string | null;
      stripe_payout_id: string | null;
      attempted_at: Date | null;
      error_message: string | null;
      created_at: Date;
    }>(
      `SELECT p.id, p.event_id, e.name AS event_name, org.id AS organization_id, org.name AS organization_name,
              p.status, p.amount_cents, p.currency, p.stripe_payout_id, p.attempted_at, p.error_message, p.created_at
       FROM organizer_payouts p
       JOIN events e ON e.id = p.event_id
       JOIN organizations org ON org.id = p.organization_id
       WHERE p.status = $1
       ORDER BY p.created_at DESC
       LIMIT 100`,
      [status],
    );
    return result.rows.map((row) => ({
      id: row.id,
      event_id: row.event_id,
      event_name: row.event_name,
      organization_id: row.organization_id,
      organization_name: row.organization_name,
      status: row.status,
      amount_cents: row.amount_cents,
      currency: row.currency,
      stripe_payout_id: row.stripe_payout_id,
      attempted_at: row.attempted_at ? row.attempted_at.toISOString() : null,
      error_message: row.error_message,
      created_at: row.created_at.toISOString(),
    }));
  }

  const [executed, failed] = await Promise.all([historyByStatus('succeeded'), historyByStatus('failed')]);

  return { due, executed, failed };
}
