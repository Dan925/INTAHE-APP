/**
 * Intahe's ticket commission grid: the single source of truth for what the
 * platform charges per ticket, on top of Stripe's own processing fee.
 * Reused by checkout (via computeOrderFees in ./fees.ts) and, later, by the
 * public-facing fee calculator — both must always agree on this number, so
 * neither should ever recompute it independently.
 *
 * 3% of the ticket price, floored at $0.49 and capped at $4.99 per ticket.
 * A free ticket (price_cents === 0) carries no commission — there is
 * nothing to take a percentage of, and charging a floor fee on a free
 * ticket would contradict "free" outright.
 */
export interface CommissionGridConfig {
  rateBasisPoints: number;
  floorCents: number;
  capCents: number;
}

export const INTAHE_COMMISSION_GRID: CommissionGridConfig = {
  rateBasisPoints: 300, // 3.00%
  floorCents: 49,
  capCents: 499,
};

/** Intahe's commission on a single ticket at this price, in cents. */
export function computeTicketCommissionCents(
  priceCents: number,
  grid: CommissionGridConfig = INTAHE_COMMISSION_GRID,
): number {
  if (priceCents <= 0) return 0;
  const rawCents = Math.round((priceCents * grid.rateBasisPoints) / 10_000);
  return Math.min(grid.capCents, Math.max(grid.floorCents, rawCents));
}
