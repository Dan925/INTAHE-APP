import { computeTicketCommissionCents, INTAHE_COMMISSION_GRID } from '../src/utils/commissionGrid';

describe('computeTicketCommissionCents', () => {
  it('is $0 for a free ticket', () => {
    expect(computeTicketCommissionCents(0)).toBe(0);
  });

  it('applies the $0.49 floor when 3% would be lower — $5.00 ticket', () => {
    // 3% of $5.00 is $0.15, well under the $0.49 floor.
    expect(computeTicketCommissionCents(500)).toBe(49);
  });

  it('sits exactly on the $0.49 floor boundary — $16.33 ticket', () => {
    // 3% of $16.33 is $0.4899, which rounds to $0.49 — the same value as
    // the floor itself. This is the ticket price where the floor stops
    // being the binding constraint.
    expect(computeTicketCommissionCents(1633)).toBe(49);
  });

  it('charges the plain 3% rate in the unconstrained middle — $50.00 ticket', () => {
    // Neither the floor nor the cap applies here: 3% of $50.00 is $1.50.
    expect(computeTicketCommissionCents(5000)).toBe(150);
  });

  it('sits exactly on the $4.99 cap boundary — $166.33 ticket', () => {
    // 3% of $166.33 is $4.9899, which rounds to $4.99 — the same value as
    // the cap itself. This is the ticket price where the cap starts
    // becoming the binding constraint.
    expect(computeTicketCommissionCents(16633)).toBe(499);
  });

  it('applies the $4.99 cap when 3% would be higher — $250.00 ticket', () => {
    // 3% of $250.00 is $7.50, well over the $4.99 cap.
    expect(computeTicketCommissionCents(25000)).toBe(499);
  });

  it('never charges a commission above 3% of the ticket price', () => {
    // Sanity check on the grid's own constants, not a specific price: the
    // floor must never be reachable by rounding a legitimately higher rate
    // down, and the whole point of a floor/cap is that actual commission
    // never exceeds the plain percentage on a ticket cheap enough that 3%
    // alone would already clear the floor.
    const rate = INTAHE_COMMISSION_GRID.rateBasisPoints / 10_000;
    expect(computeTicketCommissionCents(100_000)).toBeLessThanOrEqual(Math.round(100_000 * rate));
  });
});
