import { computeTicketCommissionCents } from './commissionGrid';
import type { AppliedTaxLine, TaxLine } from '../types/db';

export interface OrderFees {
  stripeFeeCents: number;
  intaheFeeCents: number;
  taxCents: number;
  appliedTaxLines: AppliedTaxLine[];
  totalCents: number;
}

export interface OrderFeeLine {
  priceCents: number;
  quantity: number;
}

/**
 * The one place this formula is implemented — used by checkout, refunds,
 * and reports, so fees are always computed the same way and only ever
 * computed once at purchase time, never recalculated at display.
 *
 * Intahe's commission is computed per line (via the shared commission
 * grid, ./commissionGrid.ts) rather than as one rate applied to the order
 * subtotal, because the grid's floor and cap apply per ticket — an order
 * mixing a $5 ticket type with a $250 one must charge the $5 ticket its
 * $0.49 floor and the $250 ticket its $4.99 cap independently, which a
 * single subtotal-wide rate can't express. Stripe's own processing fee has
 * no such per-ticket structure (Stripe charges once per PaymentIntent), so
 * it stays a flat rate on the order subtotal.
 *
 * taxLines (an organization's configured sales tax, if any — see
 * OrganizationRow.tax_lines) is applied to the subtotal only, never to
 * Stripe's or Intahe's own fees — those aren't a taxable sale. Tax is
 * added on top of the total regardless of feesAbsorbedByOrganizer: who
 * absorbs *platform* fees is a separate decision from what's owed to the
 * buyer's tax authority, and an organizer who's registered to collect tax
 * still owes it whether or not they've also chosen to absorb Intahe's cut.
 */
export function computeOrderFees(
  lines: OrderFeeLine[],
  feesAbsorbedByOrganizer: boolean,
  taxLines: TaxLine[] = [],
): OrderFees {
  const subtotalCents = lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);
  // A $0 subtotal (every line item free) never becomes a real Stripe
  // charge — there is nothing for the flat processing-fee component to
  // apply to, and charging a buyer 30 cents for a "free" ticket would
  // contradict the ticket being free at all. Ticket types with price_cents
  // = 0 are also exempt from ever needing a connected Stripe account (see
  // ticketTypeService.assertOrganizationCanSellPaidTickets) specifically
  // because no payment is expected to happen — this keeps that promise
  // true all the way through to the amount actually charged.
  const stripeFeeCents = subtotalCents === 0 ? 0 : Math.round(subtotalCents * 0.029 + 30);
  const intaheFeeCents = lines.reduce(
    (sum, line) => sum + computeTicketCommissionCents(line.priceCents) * line.quantity,
    0,
  );

  const appliedTaxLines: AppliedTaxLine[] = taxLines.map((taxLine) => ({
    label: taxLine.label,
    rate_percent: taxLine.rate_percent,
    amount_cents: Math.round(subtotalCents * (taxLine.rate_percent / 100)),
  }));
  const taxCents = appliedTaxLines.reduce((sum, line) => sum + line.amount_cents, 0);

  const totalCents = feesAbsorbedByOrganizer
    ? subtotalCents + taxCents
    : subtotalCents + taxCents + stripeFeeCents + intaheFeeCents;

  return { stripeFeeCents, intaheFeeCents, taxCents, appliedTaxLines, totalCents };
}
