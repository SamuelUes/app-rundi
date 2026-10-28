export type FeaturePricingType = 'none' | 'surcharge' | 'discount' | 'multiplier';

export interface PricingFeature {
  code: string;
  name: string;
  pricingType: FeaturePricingType;
  pricingValue: number;
  priority: number;
  stackable: boolean;
  defaultSelected?: boolean;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  enabled?: boolean;
  eligibilitySubject?: 'none' | 'driver' | 'vehicle';
  eligibilityMode?: 'none' | 'manual' | 'automatic' | 'hybrid';
  eligibilityRules?: Record<string, unknown>;
}

export interface SurgeRule {
  minDemandSupplyRatio: number;
  maxDemandSupplyRatio: number | null;
  multiplier: number;
  priority: number;
}

export interface AppliedFeature {
  code: string;
  name: string;
  adjustment: number;
  pricingType: FeaturePricingType;
}

export const MIN_SURGE_MULTIPLIER = 1;
export const MAX_SURGE_MULTIPLIER = 1.6;
export const MIN_SURGE_REQUESTS = 5;
const SURGE_PRIOR_REQUESTS = 4;
const SURGE_PRIOR_DRIVERS = 5;
export const DEFAULT_SURGE_RULES: readonly SurgeRule[] = [
  { minDemandSupplyRatio: 0, maxDemandSupplyRatio: 0.8, multiplier: 1, priority: 10 },
  { minDemandSupplyRatio: 0.8, maxDemandSupplyRatio: 1.2, multiplier: 1.05, priority: 20 },
  { minDemandSupplyRatio: 1.2, maxDemandSupplyRatio: 1.5, multiplier: 1.15, priority: 30 },
  { minDemandSupplyRatio: 1.5, maxDemandSupplyRatio: 2, multiplier: 1.3, priority: 40 },
  { minDemandSupplyRatio: 2, maxDemandSupplyRatio: 3, multiplier: 1.45, priority: 50 },
  { minDemandSupplyRatio: 3, maxDemandSupplyRatio: null, multiplier: 1.6, priority: 60 },
];

function getLocalTime(date: Date, timezone: string): number | null {
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
}

function parseClockTime(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function isFeatureActiveAt(feature: PricingFeature, date: Date): boolean {
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) return false;
  if (feature.startsAt) {
    const startsAt = new Date(feature.startsAt).getTime();
    if (!Number.isFinite(startsAt) || timestamp < startsAt) return false;
  }
  if (feature.endsAt) {
    const endsAt = new Date(feature.endsAt).getTime();
    if (!Number.isFinite(endsAt) || timestamp >= endsAt) return false;
  }

  if (!feature.startTime || !feature.endTime) return true;
  const start = parseClockTime(feature.startTime);
  const end = parseClockTime(feature.endTime);
  const current = getLocalTime(date, feature.timezone || 'America/Managua');
  if (start === null || end === null || current === null) return false;

  if (start === end) return true;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export function validateSelectedFeatureCodes(
  selectedCodes: readonly string[],
  assignedFeatures: readonly PricingFeature[],
  date: Date,
): string[] {
  const assignedByCode = new Map(assignedFeatures.map((feature) => [feature.code, feature]));
  const uniqueCodes = [...new Set(selectedCodes)];

  for (const code of uniqueCodes) {
    const feature = assignedByCode.get(code);
    if (!feature) {
      throw new RangeError(`Selected feature is not assigned: ${code}`);
    }
    if (!isFeatureActiveAt(feature, date)) {
      throw new RangeError(`Selected feature is not eligible: ${code}`);
    }
  }

  return uniqueCodes;
}

export function getDefaultSelectedPricingFeatureCodes(
  features: readonly PricingFeature[],
  date: Date,
): string[] {
  return features
    .filter((feature) => feature.defaultSelected !== false && isFeatureActiveAt(feature, date))
    .map((feature) => feature.code);
}

export function applyPricingFeatures(
  baseFare: number,
  features: PricingFeature[],
  date: Date,
  selectedFeatureCodes?: readonly string[],
): { fare: number; features: AppliedFeature[] } {
  const selected = selectedFeatureCodes === undefined ? null : new Set(selectedFeatureCodes);
  const ordered = [...features]
    .filter((feature) => selected === null || selected.has(feature.code))
    .filter((feature) => ['none', 'surcharge', 'discount', 'multiplier'].includes(feature.pricingType))
    .filter((feature) => Number.isFinite(feature.pricingValue) && feature.pricingValue >= 0)
    .filter((feature) => Number.isFinite(feature.priority))
    .filter((feature) => isFeatureActiveAt(feature, date))
    .sort((left, right) => left.priority - right.priority || left.code.localeCompare(right.code));

  let fare = baseFare;
  let hasNonStackableFeature = false;
  const applied: AppliedFeature[] = [];

  for (const feature of ordered) {
    if (hasNonStackableFeature || (!feature.stackable && applied.length > 0)) continue;
    const before = fare;
    switch (feature.pricingType) {
      case 'surcharge':
        fare += feature.pricingValue;
        break;
      case 'discount':
        fare = Math.max(0, fare - feature.pricingValue);
        break;
      case 'multiplier':
        fare *= feature.pricingValue;
        break;
      case 'none':
        break;
    }
    fare = Math.round(fare * 100) / 100;
    applied.push({
      code: feature.code,
      name: feature.name,
      adjustment: fare - before,
      pricingType: feature.pricingType,
    });
    if (!feature.stackable) hasNonStackableFeature = true;
  }

  return { fare, features: applied };
}

export function resolveSurgeMultiplier(
  demandSupplyRatio: number | null,
  rules: SurgeRule[] = [...DEFAULT_SURGE_RULES],
): number {
  if (demandSupplyRatio === null || !Number.isFinite(demandSupplyRatio) || demandSupplyRatio < 0) {
    return MIN_SURGE_MULTIPLIER;
  }

  const match = [...rules]
    .filter((rule) =>
      Number.isFinite(rule.minDemandSupplyRatio) &&
      rule.minDemandSupplyRatio >= 0 &&
      Number.isFinite(rule.priority) &&
      (rule.maxDemandSupplyRatio === null ||
        (Number.isFinite(rule.maxDemandSupplyRatio) && rule.maxDemandSupplyRatio > rule.minDemandSupplyRatio)),
    )
    .sort((left, right) => left.priority - right.priority)
    .find(
      (rule) =>
        demandSupplyRatio >= rule.minDemandSupplyRatio &&
        (rule.maxDemandSupplyRatio === null || demandSupplyRatio < rule.maxDemandSupplyRatio),
    );

  if (!match || !Number.isFinite(match.multiplier)) return MIN_SURGE_MULTIPLIER;
  return Math.min(MAX_SURGE_MULTIPLIER, Math.max(MIN_SURGE_MULTIPLIER, match.multiplier));
}

export function calculateSurgeRatio(demand: number, supply: number): number | null {
  if (!Number.isInteger(demand) || demand < 0 || !Number.isInteger(supply) || supply < 0) return null;
  if (demand < MIN_SURGE_REQUESTS) return null;
  return (demand + SURGE_PRIOR_REQUESTS) / (supply + SURGE_PRIOR_DRIVERS);
}

export function roundFareToNearestFive(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError('Fare must be a finite non-negative number');
  }
  return Math.round(value / 5) * 5;
}

export function calculateCommissionAmount(finalFare: number, commissionRate: number): number {
  if (
    !Number.isFinite(finalFare) ||
    finalFare < 0 ||
    !Number.isFinite(commissionRate) ||
    commissionRate < 0 ||
    commissionRate > 1
  ) {
    throw new RangeError('Final fare and commission rate must be valid');
  }
  return Number((finalFare * commissionRate).toFixed(2));
}

export function calculateDynamicMinimumFare(
  fareBeforeSurge: number,
  finalFare: number,
  surgeMultiplier: number,
): number {
  if (
    !Number.isFinite(fareBeforeSurge) ||
    fareBeforeSurge < 0 ||
    !Number.isFinite(finalFare) ||
    finalFare < 0 ||
    !Number.isFinite(surgeMultiplier)
  ) {
    return 50;
  }
  const retainedSurgeFloor = surgeMultiplier > 1
    ? fareBeforeSurge * (1 + (Math.min(MAX_SURGE_MULTIPLIER, surgeMultiplier) - 1) * 0.5)
    : 0;
  return Math.round(Math.max(50, finalFare * 0.6667, retainedSurgeFloor) * 100) / 100;
}
