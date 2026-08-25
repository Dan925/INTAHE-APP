import { computeTicketCommissionCents } from './commissionGrid';

export interface OrderFees {
  stripeFeeCents: number;
  intaheFeeCents: number;
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
 */
export function computeOrderFees(lines: OrderFeeLine[], feesAbsorbedByOrganizer: boolean): OrderFees {
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
  const totalCents = feesAbsorbedByOrganizer
    ? subtotalCents
    : subtotalCents + stripeFeeCents + intaheFeeCents;

  return { stripeFeeCents, intaheFeeCents, totalCents };
}
