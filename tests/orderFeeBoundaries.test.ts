import { computeOrderFees } from '../src/utils/fees';
import { computeTicketCommissionCents } from '../src/utils/commissionGrid';

/**
 * Full-formula boundary coverage, not just the commission grid in
 * isolation — the $0.30-on-a-free-ticket bug (fixed in fees.ts) showed up
 * as a side effect of an unrelated checkout test, not from a test that
 * actually exercised computeOrderFees at every price boundary. This file
 * is that missing coverage: for each boundary price, the exact Intahe
 * commission, Stripe fee estimate, buyer total, and organizer net — for
 * both fee modes (buyer pays fees on top vs. organizer absorbs them).
 *
 * net_revenue (dashboardService's definition: total_cents - stripe_fee_cents
 * - intahe_fee_cents) is NOT always equal to the ticket price: when the
 * organizer absorbs fees, it's genuinely less — a real, not a bug, fact
 * this table pins down explicitly (see the $0.01 row: a one-cent ticket
 * with absorbed fees produces a *negative* net, because Stripe's own
 * ~30-cent floor plus Intahe's $0.49 floor together exceed one cent).
 */
describe('computeOrderFees boundary table (single ticket, quantity 1)', () => {
  const cases: Array<{
    label: string;
    priceCents: number;
    intaheFeeCents: number;
    stripeFeeCents: number;
    totalNotAbsorbedCents: number;
    netNotAbsorbedCents: number;
    totalAbsorbedCents: number;
    netAbsorbedCents: number;
  }> = [
    {
      label: 'free ($0)',
      priceCents: 0,
      intaheFeeCents: 0,
      stripeFeeCents: 0,
      totalNotAbsorbedCents: 0,
      netNotAbsorbedCents: 0,
      totalAbsorbedCents: 0,
      netAbsorbedCents: 0,
    },
    {
      label: 'one cent ($0.01) — floor dominates, absorbed net goes negative',
      priceCents: 1,
      intaheFeeCents: 49,
      stripeFeeCents: 30,
      totalNotAbsorbedCents: 80,
      netNotAbsorbedCents: 1,
      totalAbsorbedCents: 1,
      netAbsorbedCents: -78,
    },
    {
      label: '$5.00 — floor still binding (3% would be 15c)',
      priceCents: 500,
      intaheFeeCents: 49,
      stripeFeeCents: 45,
      totalNotAbsorbedCents: 594,
      netNotAbsorbedCents: 500,
      totalAbsorbedCents: 500,
      netAbsorbedCents: 406,
    },
    {
      label: '$16.33 — floor/percentage transition',
      priceCents: 1633,
      intaheFeeCents: 49,
      stripeFeeCents: 77,
      totalNotAbsorbedCents: 1759,
      netNotAbsorbedCents: 1633,
      totalAbsorbedCents: 1633,
      netAbsorbedCents: 1507,
    },
    {
      label: '$166.33 — percentage/cap transition',
      priceCents: 16633,
      intaheFeeCents: 499,
      stripeFeeCents: 512,
      totalNotAbsorbedCents: 17644,
      netNotAbsorbedCents: 16633,
      totalAbsorbedCents: 16633,
      netAbsorbedCents: 15622,
    },
    {
      label: '$250.00 — cap binding (3% would be $7.50)',
      priceCents: 25000,
      intaheFeeCents: 499,
      stripeFeeCents: 755,
      totalNotAbsorbedCents: 26254,
      netNotAbsorbedCents: 25000,
      totalAbsorbedCents: 25000,
      netAbsorbedCents: 23746,
    },
    {
      label: 'very high ($10,000) — cap still binding',
      priceCents: 1_000_000,
      intaheFeeCents: 499,
      stripeFeeCents: 29_030,
      totalNotAbsorbedCents: 1_029_529,
      netNotAbsorbedCents: 1_000_000,
      totalAbsorbedCents: 1_000_000,
      netAbsorbedCents: 970_471,
    },
  ];

  it.each(cases)(
    '$label',
    ({ priceCents, intaheFeeCents, stripeFeeCents, totalNotAbsorbedCents, netNotAbsorbedCents }) => {
      const notAbsorbed = computeOrderFees([{ priceCents, quantity: 1 }], false);
      expect(notAbsorbed.intaheFeeCents).toBe(intaheFeeCents);
      expect(notAbsorbed.stripeFeeCents).toBe(stripeFeeCents);
      expect(notAbsorbed.totalCents).toBe(totalNotAbsorbedCents);
      const netNotAbsorbed = notAbsorbed.totalCents - notAbsorbed.stripeFeeCents - notAbsorbed.intaheFeeCents;
      expect(netNotAbsorbed).toBe(netNotAbsorbedCents);
    },
  );

  it.each(cases)(
    '$label (fees absorbed by organizer)',
    ({ priceCents, intaheFeeCents, stripeFeeCents, totalAbsorbedCents, netAbsorbedCents }) => {
      const absorbed = computeOrderFees([{ priceCents, quantity: 1 }], true);
      // The commission and Stripe-fee-estimate values themselves don't
      // depend on who pays them — only totalCents (and therefore net)
      // changes with fees_absorbed_by_organizer.
      expect(absorbed.intaheFeeCents).toBe(intaheFeeCents);
      expect(absorbed.stripeFeeCents).toBe(stripeFeeCents);
      expect(absorbed.totalCents).toBe(totalAbsorbedCents);
      const netAbsorbed = absorbed.totalCents - absorbed.stripeFeeCents - absorbed.intaheFeeCents;
      expect(netAbsorbed).toBe(netAbsorbedCents);
    },
  );
});

describe('multi-ticket rounding: per-ticket commission sum must exactly equal the charged total', () => {
  it('matches a manually-summed total across a mixed cart spanning every boundary', () => {
    // 2x $16.33 (floor/percentage transition) + 3x $166.33 (percentage/cap
    // transition) + 1x free — deliberately mixes quantities > 1 with the
    // exact boundary prices, so a rounding bug that only shows up when a
    // per-unit commission is multiplied by quantity (rather than summed
    // unit-by-unit) would be caught here.
    const lines = [
      { priceCents: 1633, quantity: 2 },
      { priceCents: 16633, quantity: 3 },
      { priceCents: 0, quantity: 5 },
    ];

    const fees = computeOrderFees(lines, false);

    const expectedIntaheFeeCents = lines.reduce(
      (sum, line) => sum + computeTicketCommissionCents(line.priceCents) * line.quantity,
      0,
    );
    expect(expectedIntaheFeeCents).toBe(49 * 2 + 499 * 3 + 0 * 5); // = 1595
    expect(fees.intaheFeeCents).toBe(expectedIntaheFeeCents);

    const subtotalCents = lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);
    expect(subtotalCents).toBe(1633 * 2 + 16633 * 3 + 0); // = 53165
    expect(fees.totalCents).toBe(subtotalCents + fees.stripeFeeCents + fees.intaheFeeCents);

    // The Intahe portion of what the buyer is charged must equal the exact
    // sum of each individual ticket's own commission — no rounding drift
    // introduced by aggregating before rounding, or any other shortcut.
    expect(fees.intaheFeeCents).toBe(1595);
  });

  it('never lets a free line item contribute a nonzero commission or Stripe-fee component', () => {
    const fees = computeOrderFees([{ priceCents: 0, quantity: 50 }], false);
    expect(fees).toEqual({ stripeFeeCents: 0, intaheFeeCents: 0, totalCents: 0 });
  });
});
