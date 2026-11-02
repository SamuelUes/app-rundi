import type { ServiceFeatureOption } from '../../services/catalog/servicesService';

export type FeatureAvailability = 'eligible' | 'condition-disabled' | 'date-disabled';
export type FeatureOverrides = Record<string, boolean>;

const parseClockTime = (value: string): number | null => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

const localMinutes = (date: Date, timezone: string): number | null => {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);
    return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
  } catch {
    return null;
  }
};

export function getFeatureAvailability(feature: ServiceFeatureOption, at: Date): FeatureAvailability {
  const timestamp = at.getTime();
  if (!Number.isFinite(timestamp)) return 'date-disabled';
  if (feature.startsAt) {
    const startsAt = new Date(feature.startsAt).getTime();
    if (!Number.isFinite(startsAt) || timestamp < startsAt) return 'date-disabled';
  }
  if (feature.endsAt) {
    const endsAt = new Date(feature.endsAt).getTime();
    if (!Number.isFinite(endsAt) || timestamp >= endsAt) return 'date-disabled';
  }
  if (!feature.startTime || !feature.endTime) return 'eligible';

  const start = parseClockTime(feature.startTime);
  const end = parseClockTime(feature.endTime);
  const current = localMinutes(at, feature.timezone || 'America/Managua');
  if (start === null || end === null || current === null) return 'condition-disabled';
  if (start === end) return 'eligible';

  const active = start < end
    ? current >= start && current < end
    : current >= start || current < end;
  return active ? 'eligible' : 'condition-disabled';
}

export function getDefaultSelectedFeatureCodes(features: ServiceFeatureOption[], at: Date): string[] {
  return features
    .filter((feature) => getFeatureAvailability(feature, at) === 'eligible')
    .filter((feature) => feature.defaultSelected !== false)
    .sort((left, right) => left.priority - right.priority || left.code.localeCompare(right.code))
    .map((feature) => feature.code);
}

export function getSelectedFeatureCodes(
  features: ServiceFeatureOption[],
  overrides: FeatureOverrides,
  at: Date,
): string[] {
  return features
    .filter((feature) => getFeatureAvailability(feature, at) === 'eligible')
    .filter((feature) => overrides[feature.code] ?? feature.defaultSelected !== false)
    .sort((left, right) => left.priority - right.priority || left.code.localeCompare(right.code))
    .map((feature) => feature.code);
}

export function orderFeaturesBySelection(
  features: ServiceFeatureOption[],
  selectedCodes: readonly string[],
  at?: Date,
): ServiceFeatureOption[] {
  const selected = new Set(selectedCodes);
  const rank = (feature: ServiceFeatureOption) => {
    if (selected.has(feature.code)) return 0;
    if (at && getFeatureAvailability(feature, at) !== 'eligible') return 2;
    return 1;
  };
  return [...features].sort((left, right) => {
    const rankOrder = rank(left) - rank(right);
    return rankOrder || left.priority - right.priority || left.code.localeCompare(right.code);
  });
}
