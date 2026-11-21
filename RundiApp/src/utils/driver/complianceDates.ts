export type DocumentKind = 'license' | 'circulation' | 'insurance' | 'inspection' | 'emissions' | 'revisado';
export type DateIssue = { kind: DocumentKind; state: 'expired' | 'upcoming' | 'notYetValid'; date: string };

type DatedDocument = { issueDate?: unknown; issuedAt?: unknown; expiryDate?: unknown; effectiveFrom?: unknown; effectiveUntil?: unknown; validUntil?: unknown } | null;
export type PrivateDocumentSnapshot = {
  deleted?: boolean;
  license?: DatedDocument;
  circulation?: DatedDocument;
  insurance?: DatedDocument;
  inspection?: DatedDocument;
  emissions?: DatedDocument;
  revisado?: DatedDocument;
};

function dateDay(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms / 86400000 : null;
}

// Advisory only: server rules, document status and grace periods remain authoritative.
export function findDateIssues(snapshot: PrivateDocumentSnapshot | null, now = new Date()): DateIssue[] {
  if (!snapshot || snapshot.deleted) return [];
  // Nicaragua is UTC-6; its civil day is independent of the device timezone.
  const today = Math.floor((now.getTime() - 6 * 60 * 60 * 1000) / 86400000);
  const issues: DateIssue[] = [];
  const docs: [DocumentKind, DatedDocument | undefined, unknown, unknown][] = [
    ['license', snapshot.license, snapshot.license?.issueDate, snapshot.license?.expiryDate],
    ['circulation', snapshot.circulation, snapshot.circulation?.issuedAt, snapshot.circulation?.validUntil],
    ['insurance', snapshot.insurance, snapshot.insurance?.effectiveFrom, snapshot.insurance?.effectiveUntil],
    ['inspection', snapshot.inspection, null, snapshot.inspection?.validUntil],
    ['emissions', snapshot.emissions, null, snapshot.emissions?.validUntil],
    ['revisado', snapshot.revisado, null, snapshot.revisado?.validUntil],
  ];
  for (const [kind, doc, start, end] of docs) {
    if (!doc) continue;
    const startDay = dateDay(start);
    const endDay = dateDay(end);
    if (startDay !== null && startDay > today) {
      issues.push({ kind, state: 'notYetValid', date: start as string });
    } else if (endDay !== null && endDay < today) {
      issues.push({ kind, state: 'expired', date: end as string });
    } else if (endDay !== null && endDay - today <= 30) {
      issues.push({ kind, state: 'upcoming', date: end as string });
    }
  }
  const priority = { expired: 0, notYetValid: 1, upcoming: 2 };
  return issues.sort((a, b) => priority[a.state] - priority[b.state]);
}
