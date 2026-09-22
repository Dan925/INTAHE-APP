import { pool } from '../../config/database';
import { createPayout, retrieveBalance } from '../stripe/stripePayouts';
import { createQuickSalePaymentIntent, createQuickSaleReaderPaymentIntent } from '../stripe/stripePayments';
import { getActiveQuickSaleItem } from './quickSaleItemService';
import { ApiError } from '../../utils/errors';
import { computeOrderFees } from '../../utils/fees';
import type { AppliedTaxLine, OrganizationRow, QuickSaleRow } from '../../types/db';

export interface CreateQuickSaleInput {
  quick_sale_item_id: string;
  // True when this sale is being taken on a physical Stripe Terminal reader
  // (e.g. a WisePOS E) rather than a card form on screen — see
  // stripePayments.createQuickSaleReaderPaymentIntent for what that changes
  // about the PaymentIntent itself.
  in_person?: boolean | undefined;
}

export interface PublicQuickSale {
  id: string;
  organization_id: string;
  item_name: string;
  subtotal_cents: number;
  stripe_fee_cents: number;
  intahe_fee_cents: number;
  tax_cents: number;
  tax_lines: AppliedTaxLine[];
  total_cents: number;
  currency: string;
  status: string;
  payout_status: string;
  payout_error_message: string | null;
  created_at: string;
  // Needed by the frontend to scope Stripe.js to the connected account (see
  // public/quickSalePage.js) — a direct charge's PaymentIntent lives in the
  // organizer's own Stripe account, not the platform's.
  stripe_account_id: string | null;
}

export interface QuickSaleResult {
  quick_sale: PublicQuickSale;
  client_secret: string | null;
}

function toPublic(row: QuickSaleRow, stripeAccountId: string | null): PublicQuickSale {
  return {
    id: row.id,
    organization_id: row.organization_id,
    item_name: row.item_name,
    subtotal_cents: row.subtotal_cents,
    stripe_fee_cents: row.stripe_fee_cents,
    intahe_fee_cents: row.intahe_fee_cents,
    tax_cents: row.tax_cents,
    tax_lines: row.tax_lines,
    total_cents: row.total_cents,
    currency: row.currency,
    status: row.status,
    payout_status: row.payout_status,
    payout_error_message: row.payout_error_message,
    created_at: row.created_at.toISOString(),
    stripe_account_id: stripeAccountId,
  };
}

function notFound(): ApiError {
  return new ApiError(404, 'quick_sale_not_found', 'Quick sale not found.', null);
}

async function getConnectedOrganization(organizationId: string): Promise<OrganizationRow> {
  const result = await pool.query<OrganizationRow>(
    `SELECT * FROM organizations WHERE id = $1 AND deleted_at IS NULL`,
    [organizationId],
  );
  const organization = result.rows[0];
  if (!organization) {
    throw new ApiError(404, 'organization_not_found', 'Organization not found.', null);
  }
  // Unlike checkoutService/ticketTypeService, there's no "free" quick sale
  // (quick_sale_items.price_cents is CHECK'd > 0) and so no platform-charge
  // fallback path either — a quick sale is either a real direct charge to a
  // connected, charges-enabled account, or it's refused outright.
  if (!organization.stripe_account_id || !organization.stripe_charges_enabled) {
    throw new ApiError(
      409,
      'stripe_not_connected',
      'Connect a Stripe account and complete verification before taking quick sales.',
      null,
    );
  }
  return organization;
}

/**
 * Deliberately no idempotency-key handling (unlike checkoutService.createOrder):
 * a quick sale is a merchant-present, in-person charge initiated by the
 * organizer themselves from their own device, not a buyer-submitted web
 * form that a flaky connection might resubmit — the double-charge risk
 * checkoutService guards against doesn't really exist here the same way.
 */
export async function createQuickSale(
  organizationId: string,
  input: CreateQuickSaleInput,
): Promise<QuickSaleResult> {
  const organization = await getConnectedOrganization(organizationId);
  const item = await getActiveQuickSaleItem(organizationId, input.quick_sale_item_id);

  const { stripeFeeCents, intaheFeeCents, taxCents, appliedTaxLines, totalCents } = computeOrderFees(
    [{ priceCents: item.price_cents, quantity: 1 }],
    false,
    organization.tax_lines,
  );

  const insertResult = await pool.query<QuickSaleRow>(
    `INSERT INTO quick_sales (
       organization_id, quick_sale_item_id, item_name, subtotal_cents,
       stripe_fee_cents, intahe_fee_cents, tax_cents, tax_lines, total_cents, currency, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, 'pending')
     RETURNING *`,
    [
      organizationId,
      item.id,
      item.name,
      item.price_cents,
      stripeFeeCents,
      intaheFeeCents,
      taxCents,
      JSON.stringify(appliedTaxLines),
      totalCents,
      item.currency,
    ],
  );
  const quickSale = insertResult.rows[0];
  if (!quickSale) {
    throw new Error('Insert into quick_sales did not return a row.');
  }

  const createPaymentIntentFn = input.in_person ? createQuickSaleReaderPaymentIntent : createQuickSalePaymentIntent;
  const paymentIntent = await createPaymentIntentFn({
    amountCents: totalCents,
    currency: item.currency,
    quickSaleId: quickSale.id,
    connectedAccountId: organization.stripe_account_id,
    applicationFeeCents: intaheFeeCents,
    itemName: item.name,
  });

  const updateResult = await pool.query<QuickSaleRow>(
    `UPDATE quick_sales SET stripe_payment_intent_id = $2, updated_at = now() WHERE id = $1 RETURNING *`,
    [quickSale.id, paymentIntent.id],
  );
  const updated = updateResult.rows[0];
  if (!updated) {
    throw new Error('Update to quick_sales did not return a row.');
  }

  return { quick_sale: toPublic(updated, organization.stripe_account_id), client_secret: paymentIntent.client_secret };
}

export async function listQuickSales(organizationId: string): Promise<PublicQuickSale[]> {
  const result = await pool.query<QuickSaleRow & { stripe_account_id: string | null }>(
    `SELECT qs.*, org.stripe_account_id
     FROM quick_sales qs
     JOIN organizations org ON org.id = qs.organization_id
     WHERE qs.organization_id = $1
     ORDER BY qs.created_at DESC
     LIMIT 200`,
    [organizationId],
  );
  return result.rows.map((row) => toPublic(row, row.stripe_account_id));
}

async function attemptInstantPayout(quickSale: QuickSaleRow, stripeAccountId: string): Promise<void> {
  try {
    const balance = await retrieveBalance(stripeAccountId);
    const availableCents = balance.available.find((entry) => entry.currency === quickSale.currency)?.amount ?? 0;
    // The merchant's actual cut, not quick_sales.total_cents — the buyer
    // paid total_cents, but Stripe's own processing fee and Intahe's
    // application_fee_amount never land on the connected account's balance
    // in the first place (see stripePayments.createQuickSalePaymentIntent),
    // so requesting total_cents here would overshoot whatever is actually
    // available and fail. Tax IS included: it's a pass-through collected on
    // the organizer's behalf for them to remit, not a platform fee — Stripe
    // never deducts it, so it lands on the connected account's balance
    // exactly like the subtotal does.
    const merchantCents = quickSale.subtotal_cents + quickSale.tax_cents;
    if (availableCents < merchantCents) {
      // Not necessarily permanent — this specific charge's funds may still
      // be in Stripe's "pending" bucket rather than "available" yet, which
      // an instant payout (unlike a standard one) can never draw from. Left
      // for the organizer to retry by hand from the quick sales list rather
      // than an automatic background retry — see the module's README-style
      // comment in the migration for why there's no sweep worker here.
      await pool.query(
        `UPDATE quick_sales SET payout_status = 'failed', payout_error_message = $2, updated_at = now() WHERE id = $1`,
        [quickSale.id, 'Funds not yet available for an instant payout — try again shortly.'],
      );
      return;
    }

    const payout = await createPayout({
      connectedAccountId: stripeAccountId,
      amountCents: merchantCents,
      currency: quickSale.currency,
      method: 'instant',
    });

    await pool.query(
      `UPDATE quick_sales SET payout_status = 'succeeded', stripe_payout_id = $2, updated_at = now() WHERE id = $1`,
      [quickSale.id, payout.id],
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE quick_sales SET payout_status = 'failed', payout_error_message = $2, updated_at = now() WHERE id = $1`,
      [quickSale.id, message],
    );
  }
}

/**
 * Called from stripeWebhookService.handleStripeEvent when a
 * payment_intent.succeeded event's metadata carries quick_sale_id instead
 * of order_id. Idempotent the same way markOrderPaidAndIssueTickets is: a
 * quick sale already 'paid' is a no-op, so a duplicate webhook delivery
 * (Stripe retries, or this being called twice) never attempts a second
 * instant payout for the same sale.
 */
export async function markQuickSalePaidAndPayOut(paymentIntentId: string): Promise<void> {
  const result = await pool.query<QuickSaleRow & { stripe_account_id: string | null }>(
    `SELECT qs.*, org.stripe_account_id
     FROM quick_sales qs
     JOIN organizations org ON org.id = qs.organization_id
     WHERE qs.stripe_payment_intent_id = $1`,
    [paymentIntentId],
  );
  const row = result.rows[0];
  if (!row) {
    // Not every payment_intent.succeeded is ours to handle — see
    // handleStripeEvent, which only reaches here once it already found
    // quick_sale_id in the event's metadata, so this should be unreachable
    // in practice; guarded anyway rather than assuming.
    return;
  }
  if (row.status === 'paid') {
    return;
  }
  if (!row.stripe_account_id) {
    throw new Error(`Quick sale ${row.id}'s organization has no connected Stripe account.`);
  }

  await pool.query(`UPDATE quick_sales SET status = 'paid', updated_at = now() WHERE id = $1`, [row.id]);
  await attemptInstantPayout(row, row.stripe_account_id);
}

/** Called from stripeWebhookService.handleStripeEvent for payment_intent.canceled/payment_failed carrying quick_sale_id. */
export async function markQuickSaleFailed(paymentIntentId: string): Promise<void> {
  await pool.query(
    `UPDATE quick_sales SET status = 'failed', updated_at = now() WHERE stripe_payment_intent_id = $1 AND status = 'pending'`,
    [paymentIntentId],
  );
}

/** The organizer-facing "Retry payout" action for a sale whose instant payout failed. */
export async function retryQuickSalePayout(organizationId: string, quickSaleId: string): Promise<PublicQuickSale> {
  const result = await pool.query<QuickSaleRow & { stripe_account_id: string | null }>(
    `SELECT qs.*, org.stripe_account_id
     FROM quick_sales qs
     JOIN organizations org ON org.id = qs.organization_id
     WHERE qs.id = $1 AND qs.organization_id = $2`,
    [quickSaleId, organizationId],
  );
  const row = result.rows[0];
  if (!row) {
    throw notFound();
  }
  if (row.status !== 'paid') {
    throw new ApiError(409, 'quick_sale_not_paid', `Quick sale is "${row.status}", not paid — nothing to pay out.`, null);
  }
  if (row.payout_status === 'succeeded') {
    return toPublic(row, row.stripe_account_id);
  }
  if (!row.stripe_account_id) {
    throw new Error(`Quick sale ${row.id}'s organization has no connected Stripe account.`);
  }

  await attemptInstantPayout(row, row.stripe_account_id);

  const refreshed = await pool.query<QuickSaleRow>(`SELECT * FROM quick_sales WHERE id = $1`, [quickSaleId]);
  return toPublic(refreshed.rows[0]!, row.stripe_account_id);
}
