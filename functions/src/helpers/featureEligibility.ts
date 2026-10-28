import { isFeatureActiveAt } from './pricingRules';

export type FeatureEligibilitySubject = 'none' | 'driver' | 'vehicle';
export type FeatureEligibilityMode = 'none' | 'manual' | 'automatic' | 'hybrid';

export interface VehicleEligibilityRules {
  minYear?: number;
  maxYear?: number;
  vehicleTypes?: string[];
  brands?: string[];
  models?: string[];
}

export interface EligibilityFeature {
  code: string;
  enabled?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string | null;
  eligibilitySubject: FeatureEligibilitySubject;
  eligibilityMode: FeatureEligibilityMode;
  eligibilityRules?: unknown;
  assignmentExpiresAt?: string | Date | null;
}

export interface FeatureEligibilityContext {
  serviceCode: string;
  rideType: string;
  vehicleType: string;
  designatedDriverVehicle?: string | null;
  driverFeatureCodes: readonly string[];
  vehicleFeatureCodes: readonly string[];
  vehicleFacts?: {
    type?: string | null;
    year?: number | null;
    brand?: string | null;
    model?: string | null;
  } | null;
  at?: Date;
  currentTime?: Date;
}

export interface FeatureEligibilityResult {
  eligible: boolean;
  reason?: string;
}

const VALID_RULE_KEYS = new Set(['minYear', 'maxYear', 'vehicleTypes', 'brands', 'models']);
const CAR_SERVICE_CODES = new Set(['normal', 'designated_driver_auto']);

const normalize = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const normalizeVehicleClass = (value: unknown): 'auto' | 'moto' | null => {
  const normalized = normalize(value);
  if (['moto', 'motorcycle', 'motorbike', 'scooter', 'bike'].some((type) => normalized.includes(type))) {
    return 'moto';
  }
  if (['auto', 'car', 'sedan', 'suv', 'pickup', 'truck', 'van', 'crossover', 'jeep', 'normal']
    .some((type) => normalized.includes(type))) {
    return 'auto';
  }
  return null;
};

export function isRideVehicleCompatible(options: {
  rideType: string;
  vehicleType: string;
  designatedDriverVehicle?: string | null;
  driverVehicleType?: string | null;
  driverIsDesignatedDriverMode?: boolean;
}): boolean {
  const driverVehicleClass = normalizeVehicleClass(options.driverVehicleType);
  if (normalize(options.rideType) === 'designated_driver') {
    return options.driverIsDesignatedDriverMode === true &&
      driverVehicleClass !== null &&
      driverVehicleClass === normalizeVehicleClass(options.designatedDriverVehicle);
  }
  const requiredVehicleClass = normalizeVehicleClass(options.vehicleType);
  return requiredVehicleClass !== null && driverVehicleClass === requiredVehicleClass;
}

const isNonEmptyStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.length <= 50 &&
  value.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 100);

export function validateEligibilityRules(value: unknown): { valid: boolean; rules?: VehicleEligibilityRules } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false };
  }

  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !VALID_RULE_KEYS.has(key))) {
    return { valid: false };
  }

  const rules: VehicleEligibilityRules = {};
  for (const key of ['minYear', 'maxYear'] as const) {
    const year = raw[key];
    if (year === undefined) continue;
    if (!Number.isInteger(year) || Number(year) < 1950 || Number(year) > 2100) {
      return { valid: false };
    }
    rules[key] = Number(year);
  }
  if (
    rules.minYear !== undefined &&
    rules.maxYear !== undefined &&
    rules.minYear > rules.maxYear
  ) {
    return { valid: false };
  }

  for (const key of ['vehicleTypes', 'brands', 'models'] as const) {
    const items = raw[key];
    if (items === undefined) continue;
    if (!isNonEmptyStringArray(items)) return { valid: false };
    rules[key] = items.map((item) => item.trim());
  }

  return { valid: true, rules };
}

export function evaluateAutomaticVehicleEligibility(
  rawRules: unknown,
  facts: FeatureEligibilityContext['vehicleFacts'],
): boolean {
  const validation = validateEligibilityRules(rawRules);
  if (!validation.valid || !facts) return false;
  const rules = validation.rules ?? {};
  if (Object.keys(rules).length === 0) return false;

  if (rules.minYear !== undefined && (!Number.isInteger(facts.year) || Number(facts.year) < rules.minYear)) {
    return false;
  }
  if (rules.maxYear !== undefined && (!Number.isInteger(facts.year) || Number(facts.year) > rules.maxYear)) {
    return false;
  }
  if (
    rules.vehicleTypes &&
    !rules.vehicleTypes.some((type) =>
      normalize(type) === normalize(facts.type) ||
      normalizeVehicleClass(type) !== null && normalizeVehicleClass(type) === normalizeVehicleClass(facts.type),
    )
  ) {
    return false;
  }
  if (rules.brands && !rules.brands.some((brand) => normalize(brand) === normalize(facts.brand))) {
    return false;
  }
  if (rules.models && !rules.models.some((model) => normalize(model) === normalize(facts.model))) {
    return false;
  }
  return true;
}

const isFeatureAvailableAt = (
  feature: EligibilityFeature,
  at: Date,
  currentTime: Date,
): boolean => {
  if (!isFeatureActiveAt({
    code: feature.code,
    name: feature.code,
    pricingType: 'none',
    pricingValue: 0,
    priority: 0,
    stackable: true,
    startsAt: feature.startsAt,
    endsAt: feature.endsAt,
    startTime: feature.startTime,
    endTime: feature.endTime,
    timezone: feature.timezone,
  }, at)) return false;
  if (feature.assignmentExpiresAt) {
    const expiresAt = new Date(feature.assignmentExpiresAt).getTime();
    if (!Number.isFinite(expiresAt) || currentTime.getTime() >= expiresAt) return false;
  }
  return true;
};

const isCompatibleRideCategory = (
  featureCode: string,
  context: FeatureEligibilityContext,
): boolean => {
  const serviceCode = normalize(context.serviceCode);
  const rideType = normalize(context.rideType);
  const vehicleType = normalize(context.vehicleType);
  const designatedVehicle = normalize(context.designatedDriverVehicle);

  if (featureCode === 'premium') {
    return serviceCode === 'normal' &&
      rideType === 'normal' &&
      vehicleType === 'auto' &&
      normalizeVehicleClass(context.vehicleFacts?.type) === 'auto';
  }

  if (featureCode === 'senior') {
    if (!CAR_SERVICE_CODES.has(serviceCode)) return false;
    if (serviceCode === 'normal') return rideType === 'normal' && vehicleType === 'auto';
    return rideType === 'designated_driver' &&
      vehicleType === 'designated_driver' &&
      designatedVehicle === 'auto';
  }

  if (featureCode === 'pet_friendly') {
    if (!CAR_SERVICE_CODES.has(serviceCode)) return false;
    if (serviceCode === 'normal') return rideType === 'normal' && vehicleType === 'auto';
    return rideType === 'designated_driver' &&
      vehicleType === 'designated_driver' &&
      designatedVehicle === 'auto';
  }

  return true;
};

export function isRideFeatureEligible(
  feature: EligibilityFeature,
  context: FeatureEligibilityContext,
): FeatureEligibilityResult {
  if (!feature || typeof feature.code !== 'string' || feature.enabled === false) {
    return { eligible: false, reason: 'feature_disabled' };
  }
  if (!isFeatureAvailableAt(feature, context.at ?? new Date(), context.currentTime ?? new Date())) {
    return { eligible: false, reason: 'feature_or_assignment_expired' };
  }
  if (!isCompatibleRideCategory(feature.code, context)) {
    return { eligible: false, reason: 'service_or_vehicle_type_mismatch' };
  }

  const driverHasFeature = context.driverFeatureCodes.includes(feature.code);
  const vehicleHasFeature = context.vehicleFeatureCodes.includes(feature.code);

  if (feature.eligibilitySubject === 'none' && feature.eligibilityMode === 'none') {
    return { eligible: true };
  }
  if (feature.eligibilitySubject === 'driver' && feature.eligibilityMode === 'manual') {
    return driverHasFeature
      ? { eligible: true }
      : { eligible: false, reason: 'driver_feature_required' };
  }
  if (feature.eligibilitySubject === 'vehicle' && ['manual', 'automatic', 'hybrid'].includes(feature.eligibilityMode)) {
    if (
      feature.eligibilityMode !== 'manual' &&
      !validateEligibilityRules(feature.eligibilityRules).valid
    ) {
      return { eligible: false, reason: 'invalid_vehicle_eligibility_rules' };
    }
    const manualEligible = vehicleHasFeature;
    const automaticEligible =
      feature.eligibilityMode !== 'manual' &&
      evaluateAutomaticVehicleEligibility(feature.eligibilityRules, context.vehicleFacts);
    const eligible = feature.eligibilityMode === 'manual'
      ? manualEligible
      : feature.eligibilityMode === 'automatic'
        ? automaticEligible
        : manualEligible || automaticEligible;
    return eligible
      ? { eligible: true }
      : { eligible: false, reason: 'vehicle_feature_required' };
  }

  return { eligible: false, reason: 'unsupported_eligibility_policy' };
}

export function resolveRideFeatureEligibility(
  features: readonly EligibilityFeature[],
  requestedFeatureCodes: readonly string[],
  context: FeatureEligibilityContext,
): FeatureEligibilityResult {
  const byCode = new Map(features.map((feature) => [feature.code, feature]));
  for (const code of new Set(requestedFeatureCodes)) {
    const feature = byCode.get(code);
    if (!feature) return { eligible: false, reason: 'feature_not_assigned_or_enabled' };
    const result = isRideFeatureEligible(feature, context);
    if (!result.eligible) return result;
  }
  return { eligible: true };
}

export function normalizeVehicleEligibilityClass(value: unknown): 'auto' | 'moto' | null {
  return normalizeVehicleClass(value);
}
