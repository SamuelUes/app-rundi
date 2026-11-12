export function getPremiumStatus(
  from: number | null,
  graceFrom: number | null,
  until: number | null,
  now: number,
) {
  const eligible = from !== null && until !== null && now >= from && now < until;
  return {
    eligible,
    grace: eligible && graceFrom !== null && now >= graceFrom,
    expired: until !== null && now >= until,
  };
}
