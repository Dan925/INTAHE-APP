import { pool } from '../../config/database';
import { env } from '../../config/env';
import { retrieveBalance, createPayout } from '../stripe/stripePayouts';
import { ApiError } from '../../utils/errors';

interface DuePayoutEvent {
  eventId: string;
  organizationId: string;
  stripeAccountId: string;
  scheduledFor: Date;
  currency: string;
}

/** ticket_types.currency, not orders — orders don't carry their own
 * currency column; checkout already enforces one currency per order (see
 * checkoutService.reserveInventory), and in practice an organization runs
 * one currency across its ticket types, so any one row here is
 * representative. */
async function primaryCurrencyForEvent(eventId: string): Promise<string> {
  const result = await pool.query<{ currency: string }>(`SELECT currency FROM ticket_types WHERE event_id = $1 LIMIT 1`, [
    eventId,
  ]);
  return result.rows[0]?.currency ?? 'usd';
}

/**
 * Events whose organizer's Stripe balance has been sitting untouched for
 * PAYOUT_DELAY_HOURS since the event ended, has at least one real sale,
 * hasn't been placed on hold by a platform admin, and has never had a
 * *successful* payout logged for it. Deliberately checks
 * `organizer_payouts` for a 'succeeded' row rather than "any row" — a
 * previous 'failed' or 'skipped_no_balance' attempt must not block retrying
 * on the next run.
 */
async function findDueEvents(now: Date): Promise<DuePayoutEvent[]> {
  const result = await pool.query<{
    event_id: string;
    organization_id: string;
    stripe_account_id: string;
    end_at: Date;
  }>(
    `SELECT e.id AS event_id, e.organization_id, org.stripe_account_id, e.end_at
     FROM events e
     JOIN organizations org ON org.id = e.organization_id
     WHERE e.deleted_at IS NULL
       AND e.payout_held_at IS NULL
       AND org.stripe_account_id IS NOT NULL
       AND e.end_at <= $1::timestamptz - ($2 * interval '1 hour')
       AND EXISTS (
         SELECT 1 FROM orders o WHERE o.event_id = e.id AND o.status IN ('paid', 'partial_refund')
       )
       AND NOT EXISTS (
         SELECT 1 FROM organizer_payouts p WHERE p.event_id = e.id AND p.status = 'succeeded'
       )
     ORDER BY e.end_at ASC`,
    [now, env.PAYOUT_DELAY_HOURS],
  );

  const due: DuePayoutEvent[] = [];
  for (const row of result.rows) {
    due.push({
      eventId: row.event_id,
      organizationId: row.organization_id,
      stripeAccountId: row.stripe_account_id,
      scheduledFor: new Date(row.end_at.getTime() + env.PAYOUT_DELAY_HOURS * 3_600_000),
      currency: await primaryCurrencyForEvent(row.event_id),
    });
  }
  return due;
}

export type PayoutOutcome = 'succeeded' | 'skipped_no_balance' | 'failed' | 'already_in_flight';

/**
 * One row per attempt, insert-then-update rather than insert-only: the row
 * is created 'pending' immediately (so a concurrent run of this worker can
 * see an attempt is already in flight and skip it — see the
 * already-pending guard below) and updated in place to its final status
 * once the attempt resolves. Earlier attempts for the same event are never
 * touched, so the audit trail across retries stays intact.
 */
async function attemptPayout(due: DuePayoutEvent): Promise<PayoutOutcome> {
  const inFlight = await pool.query(`SELECT id FROM organizer_payouts WHERE event_id = $1 AND status = 'pending'`, [
    due.eventId,
  ]);
  if (inFlight.rows.length > 0) {
    return 'already_in_flight';
  }

  const insertResult = await pool.query<{ id: string }>(
    `INSERT INTO organizer_payouts (organization_id, event_id, stripe_account_id, scheduled_for, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING id`,
    [due.organizationId, due.eventId, due.stripeAccountId, due.scheduledFor],
  );
  const payoutRowId = insertResult.rows[0]!.id;

  try {
    const balance = await retrieveBalance(due.stripeAccountId);
    const availableCents = balance.available.find((entry) => entry.currency === due.currency)?.amount ?? 0;

    if (availableCents <= 0) {
      // Not necessarily a permanent condition — a payment settled very
      // close to the event's end may still be in Stripe's own "pending"
      // bucket (typically ~2 business days) rather than "available" yet.
      // Left to retry on the next worker run rather than treated as final.
      await pool.query(
        `UPDATE organizer_payouts SET status = 'skipped_no_balance', attempted_at = now(), updated_at = now() WHERE id = $1`,
        [payoutRowId],
      );
      return 'skipped_no_balance';
    }

    const payout = await createPayout({
      connectedAccountId: due.stripeAccountId,
      amountCents: availableCents,
      currency: due.currency,
    });

    await pool.query(
      `UPDATE organizer_payouts
       SET status = 'succeeded', stripe_payout_id = $2, amount_cents = $3, currency = $4,
           attempted_at = now(), updated_at = now()
       WHERE id = $1`,
      [payoutRowId, payout.id, availableCents, due.currency],
    );
    return 'succeeded';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE organizer_payouts SET status = 'failed', error_message = $2, attempted_at = now(), updated_at = now() WHERE id = $1`,
      [payoutRowId, message],
    );
    return 'failed';
  }
}

/**
 * The admin console's manual-trigger button: forces an immediate attempt
 * for one specific event, ignoring both the 48h delay and any hold placed
 * on it (an admin override is exactly for bypassing those). Still runs
 * through the exact same attemptPayout logic — same in-flight guard, same
 * ledger row, same no-balance/failure handling — so a manual trigger can
 * never double-pay an event any more than the worker can.
 */
export async function triggerPayoutForEvent(eventId: string): Promise<PayoutOutcome> {
  const result = await pool.query<{ organization_id: string; stripe_account_id: string | null; end_at: Date }>(
    `SELECT e.organization_id, org.stripe_account_id, e.end_at
     FROM events e
     JOIN organizations org ON org.id = e.organization_id
     WHERE e.id = $1 AND e.deleted_at IS NULL`,
    [eventId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(404, 'event_not_found', 'Event not found.', null);
  }
  if (!row.stripe_account_id) {
    throw new ApiError(409, 'stripe_not_connected', 'This event has no connected Stripe account to pay out to.', null);
  }

  return attemptPayout({
    eventId,
    organizationId: row.organization_id,
    stripeAccountId: row.stripe_account_id,
    scheduledFor: new Date(row.end_at.getTime() + env.PAYOUT_DELAY_HOURS * 3_600_000),
    currency: await primaryCurrencyForEvent(eventId),
  });
}

export interface PayoutRunSummary {
  due: number;
  succeeded: number;
  skippedNoBalance: number;
  failed: number;
  alreadyInFlight: number;
}

/**
 * The whole deferred-payout mechanism's entry point — called on an
 * interval by src/index.ts (never by createApp()/tests, so tests can call
 * this directly without a live timer running against a mocked Stripe
 * client). Safe to call as often as you like: findDueEvents only returns
 * events with no successful payout yet, and attemptPayout no-ops if one is
 * already in flight for a given event.
 */
export async function runDuePayouts(now: Date = new Date()): Promise<PayoutRunSummary> {
  const due = await findDueEvents(now);
  const summary: PayoutRunSummary = { due: due.length, succeeded: 0, skippedNoBalance: 0, failed: 0, alreadyInFlight: 0 };

  for (const event of due) {
    const outcome = await attemptPayout(event);
    if (outcome === 'succeeded') summary.succeeded += 1;
    else if (outcome === 'skipped_no_balance') summary.skippedNoBalance += 1;
    else if (outcome === 'failed') summary.failed += 1;
    else summary.alreadyInFlight += 1;
  }

  return summary;
}
