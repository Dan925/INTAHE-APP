import { buildStatementDescriptorSuffix } from '../src/utils/statementDescriptor';

describe('buildStatementDescriptorSuffix', () => {
  it('uppercases a plain ASCII event name that already fits', () => {
    expect(buildStatementDescriptorSuffix('Annual Gala')).toBe('ANNUAL GALA');
  });

  it('strips accents down to their base letters and truncates to 12 characters', () => {
    // "Soiree Benefice" (accents stripped) is 15 characters — truncated to
    // the first 12: "Soiree Benef".
    expect(buildStatementDescriptorSuffix('Soirée Bénéfice')).toBe('SOIREE BENEF');
  });

  it('strips characters Stripe forbids in a statement descriptor', () => {
    const suffix = buildStatementDescriptorSuffix(`Gala "VIP" <2026>`);
    expect(suffix).not.toMatch(/[<>\\'"*]/);
    expect(suffix).toBe('GALA VIP 202');
  });

  it('returns undefined for a name with no letters after sanitization', () => {
    expect(buildStatementDescriptorSuffix('2026')).toBeUndefined();
    expect(buildStatementDescriptorSuffix('***')).toBeUndefined();
    expect(buildStatementDescriptorSuffix('')).toBeUndefined();
  });

  it('never returns a suffix longer than 12 characters', () => {
    const suffix = buildStatementDescriptorSuffix('The Extremely Long Charity Gala Fundraiser Night');
    expect(suffix!.length).toBeLessThanOrEqual(12);
  });
});
