import { computeOrderFees } from '../src/utils/fees';

describe('computeOrderFees', () => {
  it('charges no tax when no tax lines are configured (the default)', () => {
    const fees = computeOrderFees([{ priceCents: 2500, quantity: 2 }], false);
    expect(fees.taxCents).toBe(0);
    expect(fees.appliedTaxLines).toEqual([]);
  });

  it('computes each tax line on the subtotal, rounded independently, and adds them to the total', () => {
    const fees = computeOrderFees([{ priceCents: 5000, quantity: 1 }], false, [
      { label: 'TPS', rate_percent: 5 },
      { label: 'TVQ', rate_percent: 9.975 },
    ]);
    expect(fees.appliedTaxLines).toEqual([
      { label: 'TPS', rate_percent: 5, amount_cents: 250 },
      { label: 'TVQ', rate_percent: 9.975, amount_cents: 499 },
    ]);
    expect(fees.taxCents).toBe(749);
    expect(fees.totalCents).toBe(5000 + fees.stripeFeeCents + fees.intaheFeeCents + 749);
  });

  it('still adds tax on top of the total when fees are absorbed by the organizer', () => {
    const fees = computeOrderFees([{ priceCents: 5000, quantity: 1 }], true, [
      { label: 'TPS', rate_percent: 5 },
    ]);
    expect(fees.totalCents).toBe(5000 + 250);
  });

  it('never charges tax on a $0 subtotal', () => {
    const fees = computeOrderFees([{ priceCents: 0, quantity: 1 }], false, [
      { label: 'TPS', rate_percent: 5 },
    ]);
    expect(fees.taxCents).toBe(0);
    expect(fees.totalCents).toBe(0);
  });
});
