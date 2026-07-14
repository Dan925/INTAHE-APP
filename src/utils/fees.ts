export interface OrderFees {
  stripeFeeCents: number;
  intaheFeeCents: number;
  totalCents: number;
}

/**
 * The one place this formula is implemented — used by checkout, refunds
 * (later), and reports, so fees are always computed the same way and only
 * ever computed once at purchase time, never recalculated at display.
 */
export function computeOrderFees(
  subtotalCents: number,
  quantity: number,
  feesAbsorbedByOrganizer: boolean,
): OrderFees {
  const stripeFeeCents = Math.round(subtotalCents * 0.029 + 30);
  const intaheFeeCents = Math.round(subtotalCents * 0.005 + 100 * quantity);
  const totalCents = feesAbsorbedByOrganizer
    ? subtotalCents
    : subtotalCents + stripeFeeCents + intaheFeeCents;

  return { stripeFeeCents, intaheFeeCents, totalCents };
}
