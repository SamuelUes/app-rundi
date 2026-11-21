import { findDateIssues } from './complianceDates';

describe('document date advisories', () => {
  const now = new Date('2026-01-02T05:30:00Z'); // Still January 1 in Nicaragua.

  it('uses the Nicaragua day and treats the expiry date itself as valid', () => {
    expect(findDateIssues({ license: { expiryDate: '2026-01-01' } }, now)).toEqual([
      { kind: 'license', state: 'upcoming', date: '2026-01-01' },
    ]);
    expect(findDateIssues({ license: { expiryDate: '2025-12-31' } }, now)[0].state).toBe('expired');
  });

  it('reports future starts and upcoming dates without inventing missing data', () => {
    expect(findDateIssues({
      insurance: { effectiveFrom: '2026-01-02', effectiveUntil: '2026-12-31' },
      inspection: { validUntil: '2026-01-31' },
      emissions: { validUntil: '2026-02-31' },
      circulation: { validUntil: '2025-12-30' },
    }, now)).toEqual([
      { kind: 'circulation', state: 'expired', date: '2025-12-30' },
      { kind: 'insurance', state: 'notYetValid', date: '2026-01-02' },
      { kind: 'inspection', state: 'upcoming', date: '2026-01-31' },
    ]);
    expect(findDateIssues({ deleted: true, license: { expiryDate: '2020-01-01' } }, now)).toEqual([]);
  });

  it('prioritizes an expired document over a forthcoming expiry', () => {
    const issues = findDateIssues({
      license: { expiryDate: '2026-01-20' },
      insurance: { effectiveUntil: '2025-12-31' },
    }, now);
    expect(issues.map((issue) => issue.kind)).toEqual(['insurance', 'license']);
  });
});
