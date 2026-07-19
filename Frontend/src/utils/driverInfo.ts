const preferNonEmpty = (...candidates: Array<string | null | undefined>): string | null => {
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return null;
};

export const extractNameFromSource = (source: any): string | null => {
  if (!source || typeof source !== 'object') return null;
  return preferNonEmpty(
    source.fullName,
    source.displayName,
    source.name,
    [source.firstName, source.lastName].filter(Boolean).join(' '),
    source.driverName,
    source.username
  );
};

export const mergeName = (fallback: string, ...sources: Array<any | null | undefined>): string => {
  for (const source of sources) {
    const candidate = extractNameFromSource(source);
    if (candidate) {
      return candidate;
    }
  }
  return fallback;
};

export { preferNonEmpty };
