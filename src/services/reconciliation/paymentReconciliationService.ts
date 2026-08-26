import { pool } from '../../config/database';
import { env } from '../../config/env';
import { sendEmail } from '../email/emailClient';
import { retrievePaymentIntent } from '../stripe/stripePayments';
import { markOrderPaidAndIssueTickets } from '../webhooks/stripeWebhookService';
import { ApiError } from '../../utils/errors';
import type { OrderRow, PaymentReconciliationIncidentRow } from '../../types/db';

interface CandidateOrderRow extends OrderRow {
  stripe_account_id: string | null;
}

/**
 * Same rule checkoutService.connectedAccountIdForOrder and
 * orderService.refundOrder each apply on their own: an order's recorded
 * stripe_charge_mode (written once at creation, never inferred later)
 * decides whether its PaymentIntent lives on the connected account or the
 * platform account — the organization's *current* Stripe status is
 * irrelevant to an already-existing order.
 */
function connectedAccountIdFor(row: CandidateOrderRow): string | null {
  return row.stripe_charge_mode === 'direct' ? row.stripe_account_id : null;
}

/**
 * console.error with a structured, greppable payload — same pattern as
 * capacityOvershootService's logCapacityOvershootAlert. This is the one
 * call site to swap for a paging tool (Sentry, PagerDuty) once one is
 * installed; a stuck successful payment is a "buyer charged, nothing
 * delivered" incident and belongs on-call, not just in a log.
 */
function logReconciliationAlert(incident: PaymentReconciliationIncidentRow): void {
  console.error(
    '[payment_reconciliation]',
    JSON.stringify({
      level: 'alert',
      order_id: incident.order_id,
      stripe_payment_intent_id: incident.stripe_payment_intent_id,
      amount_cents: incident.amount_cents,
      detected_at: incident.detected_at.toISOString(),
    }),
  );
}

async function platformAdminEmails(): Promise<string[]> {
  const result = await pool.query<{ email: string }>(`SELECT email FROM users WHERE is_platform_admin = true`);
  return result.rows.map((row) => row.email);
}

async function alertStuckPayment(incident: PaymentReconciliationIncidentRow): Promise<void> {
  logReconciliationAlert(incident);

  const recipients = await platformAdminEmails();
  if (recipients.length === 0) {
    console.error('[payment_reconciliation] no platform admin to notify for order', incident.order_id);
    return;
  }

  await Promise.all(
    recipients.map((to) =>
      sendEmail({
        to,
        subject: 'Action required: buyer charged, no ticket issued',
        html: `<p>Order <strong>${incident.order_id}</strong> has a Stripe PaymentIntent
(<strong>${incident.stripe_payment_intent_id}</strong>) that succeeded, but the order is still not marked paid —
the buyer was charged and received nothing.</p>
<p>Amount: <strong>${(incident.amount_cents / 100).toFixed(2)}</strong></p>
<p>Detected: ${incident.detected_at.toISOString()}</p>
<p>Reconcile this order from the admin console (Reconciliation) to reissue its tickets without a new
payment, or see docs/stripe-connect-runbook.md's "En cas d'échec à l'étape 10" section to do it by hand.</p>`,
      }).catch((err) => {
        console.error('Failed to send payment reconciliation alert email:', err);
      }),
    ),
  );
}

export interface ReconciliationSweepSummary {
  autoResolved: number;
  newIncidents: number;
  checked: number;
}

/**
 * The periodic worker tick (see src/index.ts). Two passes:
 * 1. Close any open incident whose order has since reached 'paid' — a late
 *    Stripe webhook retry caught up on its own before an admin had to act.
 * 2. Among orders still stuck ('pending' or 'expired' — both are states
 *    markOrderPaidAndIssueTickets already knows how to recover from, see
 *    its 'expired' re-reservation branch) with no already-open incident,
 *    ask Stripe directly whether the PaymentIntent actually succeeded.
 *    Only a live Stripe answer creates an incident — never inferred from
 *    local state alone.
 */
export async function runReconciliationSweep(now: Date = new Date()): Promise<ReconciliationSweepSummary> {
  const autoResolvedResult = await pool.query<{ order_id: string }>(
    `UPDATE payment_reconciliation_incidents i
     SET resolved_at = now(), resolution = 'webhook_caught_up'
     FROM orders o
     WHERE i.order_id = o.id AND i.resolved_at IS NULL AND o.status = 'paid'
     RETURNING i.order_id`,
  );

  const staleThreshold = new Date(now.getTime() - env.RECONCILIATION_STALE_MINUTES * 60_000);
  const candidatesResult = await pool.query<CandidateOrderRow>(
    `SELECT o.*, org.stripe_account_id
     FROM orders o
     JOIN events e ON e.id = o.event_id
     JOIN organizations org ON org.id = e.organization_id
     WHERE o.status IN ('pending', 'expired')
       AND o.stripe_payment_intent_id IS NOT NULL
       AND o.created_at < $1
       AND NOT EXISTS (
         SELECT 1 FROM payment_reconciliation_incidents i
         WHERE i.order_id = o.id AND i.resolved_at IS NULL
       )`,
    [staleThreshold],
  );

  let newIncidents = 0;
  for (const order of candidatesResult.rows) {
    let paymentIntent;
    try {
      paymentIntent = await retrievePaymentIntent(order.stripe_payment_intent_id!, connectedAccountIdFor(order));
    } catch (err) {
      console.error('[payment_reconciliation] failed to retrieve PaymentIntent for order', order.id, err);
      continue;
    }
    if (paymentIntent.status !== 'succeeded') {
      continue;
    }

    const insertResult = await pool.query<PaymentReconciliationIncidentRow>(
      `INSERT INTO payment_reconciliation_incidents (order_id, stripe_payment_intent_id, amount_cents)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [order.id, order.stripe_payment_intent_id, order.total_cents],
    );
    const incident = insertResult.rows[0];
    if (!incident) {
      // Another concurrent sweep already inserted the open incident for
      // this order between our NOT EXISTS check and this insert — the
      // partial unique index (payment_reconciliation_incidents_open_order_idx)
      // is what actually prevents the duplicate; losing this race just
      // means we don't double-alert.
      continue;
    }
    newIncidents += 1;
    await alertStuckPayment(incident);
  }

  return { autoResolved: autoResolvedResult.rows.length, newIncidents, checked: candidatesResult.rows.length };
}

export interface ReconciliationIncidentSummary {
  id: string;
  order_id: string;
  event_id: string;
  event_name: string;
  organization_id: string;
  organization_name: string;
  buyer_email: string;
  stripe_payment_intent_id: string;
  amount_cents: number;
  detected_at: string;
  resolved_at: string | null;
  resolution: string | null;
}

interface IncidentOverviewRow {
  id: string;
  order_id: string;
  event_id: string;
  event_name: string;
  organization_id: string;
  organization_name: string;
  buyer_email: string;
  stripe_payment_intent_id: string;
  amount_cents: number;
  detected_at: Date;
  resolved_at: Date | null;
  resolution: string | null;
}

function toSummary(row: IncidentOverviewRow): ReconciliationIncidentSummary {
  return {
    id: row.id,
    order_id: row.order_id,
    event_id: row.event_id,
    event_name: row.event_name,
    organization_id: row.organization_id,
    organization_name: row.organization_name,
    buyer_email: row.buyer_email,
    stripe_payment_intent_id: row.stripe_payment_intent_id,
    amount_cents: row.amount_cents,
    detected_at: row.detected_at.toISOString(),
    resolved_at: row.resolved_at ? row.resolved_at.toISOString() : null,
    resolution: row.resolution,
  };
}

const OVERVIEW_SELECT = `
  SELECT i.id, i.order_id, o.event_id, e.name AS event_name, org.id AS organization_id,
         org.name AS organization_name, o.buyer_email, i.stripe_payment_intent_id,
         i.amount_cents, i.detected_at, i.resolved_at, i.resolution
  FROM payment_reconciliation_incidents i
  JOIN orders o ON o.id = i.order_id
  JOIN events e ON e.id = o.event_id
  JOIN organizations org ON org.id = e.organization_id
`;

export async function getReconciliationOverview(): Promise<{
  open: ReconciliationIncidentSummary[];
  resolved: ReconciliationIncidentSummary[];
}> {
  const [openResult, resolvedResult] = await Promise.all([
    pool.query<IncidentOverviewRow>(`${OVERVIEW_SELECT} WHERE i.resolved_at IS NULL ORDER BY i.detected_at ASC`),
    pool.query<IncidentOverviewRow>(
      `${OVERVIEW_SELECT} WHERE i.resolved_at IS NOT NULL ORDER BY i.resolved_at DESC LIMIT 100`,
    ),
  ]);
  return {
    open: openResult.rows.map(toSummary),
    resolved: resolvedResult.rows.map(toSummary),
  };
}

export interface ReconcileOrderResult {
  order_id: string;
  status: string;
  already_resolved: boolean;
}

/**
 * The admin console's manual reissue action. Deliberately re-checks Stripe
 * itself rather than trusting the incident row (which could be minutes
 * old) — this mints real tickets, so the very last check before doing that
 * has to be a live answer from Stripe, not a cached one.
 */
export async function reconcileOrder(orderId: string, adminUserId: string): Promise<ReconcileOrderResult> {
  const orderResult = await pool.query<CandidateOrderRow>(
    `SELECT o.*, org.stripe_account_id
     FROM orders o
     JOIN events e ON e.id = o.event_id
     JOIN organizations org ON org.id = e.organization_id
     WHERE o.id = $1`,
    [orderId],
  );
  const order = orderResult.rows[0];
  if (!order) {
    throw new ApiError(404, 'order_not_found', 'Order not found.', null);
  }

  if (order.status === 'paid') {
    await resolveIncidentIfAny(orderId, adminUserId, 'manual_reissue');
    return { order_id: orderId, status: order.status, already_resolved: true };
  }
  if (order.status !== 'pending' && order.status !== 'expired') {
    throw new ApiError(
      409,
      'order_not_reconcilable',
      `Order cannot be reconciled from status "${order.status}".`,
      null,
    );
  }
  if (!order.stripe_payment_intent_id) {
    throw new ApiError(409, 'order_not_reconcilable', 'Order has no PaymentIntent to reconcile against.', null);
  }

  const paymentIntent = await retrievePaymentIntent(order.stripe_payment_intent_id, connectedAccountIdFor(order));
  if (paymentIntent.status !== 'succeeded') {
    throw new ApiError(
      409,
      'payment_not_succeeded',
      `Stripe reports this PaymentIntent as "${paymentIntent.status}", not "succeeded" — refusing to issue tickets.`,
      null,
    );
  }

  await markOrderPaidAndIssueTickets(order.stripe_payment_intent_id);
  await resolveIncidentIfAny(orderId, adminUserId, 'manual_reissue');

  return { order_id: orderId, status: 'paid', already_resolved: false };
}

/**
 * Resolves the order's open incident if the periodic sweep already created
 * one, or inserts an already-resolved row if it hadn't run yet — either
 * way, every manual reissue leaves a permanent record of who fixed it and
 * when, same insert-only auditing philosophy as platform_admin_access_log.
 */
async function resolveIncidentIfAny(orderId: string, adminUserId: string, resolution: 'manual_reissue'): Promise<void> {
  const updateResult = await pool.query(
    `UPDATE payment_reconciliation_incidents
     SET resolved_at = now(), resolved_by = $2, resolution = $3
     WHERE order_id = $1 AND resolved_at IS NULL`,
    [orderId, adminUserId, resolution],
  );
  if (updateResult.rowCount && updateResult.rowCount > 0) {
    return;
  }

  const order = await pool.query<{ stripe_payment_intent_id: string | null; total_cents: number }>(
    `SELECT stripe_payment_intent_id, total_cents FROM orders WHERE id = $1`,
    [orderId],
  );
  const row = order.rows[0];
  if (!row?.stripe_payment_intent_id) return;
  await pool.query(
    `INSERT INTO payment_reconciliation_incidents
       (order_id, stripe_payment_intent_id, amount_cents, resolved_at, resolved_by, resolution)
     VALUES ($1, $2, $3, now(), $4, $5)`,
    [orderId, row.stripe_payment_intent_id, row.total_cents, adminUserId, resolution],
  );
}
