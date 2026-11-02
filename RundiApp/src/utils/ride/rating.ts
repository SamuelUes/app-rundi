export const extractRatingValue = (value: any): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'object') {
    return (
      extractRatingValue(value.value) ??
      extractRatingValue(value.average) ??
      extractRatingValue(value.avg) ??
      extractRatingValue(value.rating) ??
      extractRatingValue(value.score)
    );
  }
  return null;
};

export const mergeRating = (...sources: Array<any | null | undefined>): number | null => {
  const ratingCandidates: any[] = [];

  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    ratingCandidates.push(
      source.rating,
      source.averageRating,
      source.avgRating,
      source?.stats?.rating,
      source?.stats?.averageRating,
      source?.stats?.avgRating
    );
  }

  for (const candidate of ratingCandidates) {
    const parsed = extractRatingValue(candidate);
    if (parsed !== null) return parsed;
  }

  return null;
};
