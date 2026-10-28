import {
  evaluateAutomaticVehicleEligibility,
  resolveRideFeatureEligibility,
  type FeatureEligibilityResult,
} from './featureEligibility';
import { serviceCodeFromRideFields } from './priceCalculator';
import { DriverFeatureAssignmentRepository } from '../sequelize/repositories/DriverFeatureAssignmentRepository';
import { FeatureRepository, type FeatureRow } from '../sequelize/repositories/FeatureRepository';
import { VehicleFeatureAssignmentRepository } from '../sequelize/repositories/VehicleFeatureAssignmentRepository';
import { supabaseGet, supabaseGetIn } from '../supabase/rest';

const featureRepo = new FeatureRepository();
const driverAssignmentRepo = new DriverFeatureAssignmentRepository();
const vehicleAssignmentRepo = new VehicleFeatureAssignmentRepository();
const BATCH_SIZE = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DriverRideFeatureCapabilities {
  driverFeatureCodes: string[];
  vehicleFeatureCodes: string[];
  vehicleId: string | null;
  vehicleFacts: {
    type?: string | null;
    year?: number | null;
    brand?: string | null;
    model?: string | null;
  } | null;
}

export async function evaluateDriverRideFeatureEligibility(
  ride: Record<string, any>,
  driverUserId: string,
  vehicleId: string | null,
): Promise<FeatureEligibilityResult> {
  const featureCodes = Array.isArray(ride.featureCodes ?? ride.feature_codes)
    ? (ride.featureCodes ?? ride.feature_codes)
      .filter((code: unknown): code is string => typeof code === 'string')
    : Array.isArray(ride.pricingSnapshot?.featureCodes)
      ? ride.pricingSnapshot.featureCodes.filter((code: unknown): code is string => typeof code === 'string')
      : [];
  if (featureCodes.length === 0) return { eligible: true };

  const serviceCode = String(
    ride.pricingSnapshot?.serviceCode ??
    ride.pricing_snapshot?.serviceCode ??
    ride.serviceCode ??
    ride.service_code ??
    serviceCodeFromRideFields(
      ride.rideType ?? ride.ride_type,
      ride.vehicleType ?? ride.vehicle_type,
      ride.designatedDriverVehicle ?? ride.designated_driver_vehicle,
    ),
  );
  const serviceId =
    (typeof (ride.serviceId ?? ride.service_id) === 'string' && (ride.serviceId ?? ride.service_id)) ||
    await featureRepo.findServiceIdByCode(serviceCode);
  if (!serviceId) return { eligible: false, reason: 'feature_service_missing' };

  const capabilities = await getRideFeatureCapabilitiesForDriver(driverUserId, vehicleId);
  const requestedAtValue =
    ride.scheduledAt ??
    ride.requestedAt ??
    ride.requested_at ??
    ride.createdAt ??
    ride.created_at ??
    Date.now();
  const requestedAt = new Date(requestedAtValue);
  return resolveRideFeatureEligibility(
    await getFeaturePoliciesForService(serviceId),
    featureCodes,
    {
      serviceCode,
      rideType: String(ride.rideType ?? ride.ride_type ?? 'normal'),
      vehicleType: String(ride.vehicleType ?? ride.vehicle_type ?? 'auto'),
      designatedDriverVehicle: ride.designatedDriverVehicle ?? ride.designated_driver_vehicle ?? null,
      driverFeatureCodes: capabilities.driverFeatureCodes,
      vehicleFeatureCodes: capabilities.vehicleFeatureCodes,
      vehicleFacts: capabilities.vehicleFacts,
      at: requestedAt,
      currentTime: new Date(),
    },
  );
}

const chunks = (values: readonly string[], size = BATCH_SIZE): string[][] => {
  const result: string[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
};

const activeAssignments = <T extends { is_active: boolean; expires_at: string | null }>(
  rows: T[],
): T[] => {
  const now = Date.now();
  return rows.filter((row) =>
    row.is_active &&
    (!row.expires_at || new Date(row.expires_at).getTime() > now),
  );
};

const mapDriverFeatureCodes = (
  assignments: Array<{ feature_id: string; is_active: boolean; expires_at: string | null }>,
  featuresById: Map<string, FeatureRow>,
): string[] => [...new Set(activeAssignments(assignments)
  .filter((assignment) => {
    const feature = featuresById.get(assignment.feature_id);
    return feature?.enabled === true &&
      feature.eligibility_subject === 'driver' &&
      ['manual', 'hybrid'].includes(feature.eligibility_mode);
  })
  .map((assignment) => featuresById.get(assignment.feature_id)?.code)
  .filter((code): code is string => Boolean(code)))];

const mapVehicleFeatureCodes = (
  assignments: Array<{ feature_id: string; is_active: boolean; expires_at: string | null }>,
  features: FeatureRow[],
  vehicleFacts: DriverRideFeatureCapabilities['vehicleFacts'],
): string[] => {
  const featuresById = new Map(features.map((feature) => [feature.id, feature]));
  const manualCodes = activeAssignments(assignments)
    .filter((assignment) => {
      const feature = featuresById.get(assignment.feature_id);
      return feature?.enabled === true &&
        feature.eligibility_subject === 'vehicle' &&
        ['manual', 'hybrid'].includes(feature.eligibility_mode);
    })
    .map((assignment) => featuresById.get(assignment.feature_id)?.code)
    .filter((code): code is string => Boolean(code));
  const automaticCodes = features
    .filter((feature) =>
      feature.enabled &&
      feature.eligibility_subject === 'vehicle' &&
      ['automatic', 'hybrid'].includes(feature.eligibility_mode) &&
      evaluateAutomaticVehicleEligibility(feature.eligibility_rules, vehicleFacts),
    )
    .map((feature) => feature.code);
  return [...new Set([...manualCodes, ...automaticCodes])];
};

const mapVehicleFacts = (vehicle: Record<string, any> | null | undefined) => {
  if (!vehicle) return null;
  const year = vehicle.year === null || vehicle.year === undefined || vehicle.year === ''
    ? null
    : Number(vehicle.year);
  return {
    type: typeof vehicle.type === 'string' ? vehicle.type : null,
    year: Number.isInteger(year) ? year : null,
    brand: typeof vehicle.brand === 'string' ? vehicle.brand : null,
    model: typeof vehicle.model === 'string' ? vehicle.model : null,
  };
};

export async function getFeaturePoliciesForService(serviceId: string) {
  const assignments = await featureRepo.findAssignedToService(serviceId);
  return assignments
    .filter((assignment) => {
      const feature = assignment.features;
      return assignment.enabled === true && feature?.enabled === true && typeof feature.code === 'string';
    })
    .map((assignment) => {
      const feature = assignment.features;
      return {
        code: String(feature.code),
        enabled: feature.enabled === true,
        startsAt: feature.starts_at ?? null,
        endsAt: feature.ends_at ?? null,
        startTime: feature.start_time ?? null,
        endTime: feature.end_time ?? null,
        timezone: feature.timezone ?? 'America/Managua',
        eligibilitySubject: feature.eligibility_subject ?? 'none',
        eligibilityMode: feature.eligibility_mode ?? 'none',
        eligibilityRules: feature.eligibility_rules ?? {},
      };
    });
}

export async function getRideFeatureCapabilitiesForDriver(
  userId: string,
  vehicleId: string | null,
): Promise<DriverRideFeatureCapabilities> {
  const drivers = await supabaseGet(
    'drivers',
    { user_id: userId },
    'id,user_id',
    { limit: 1, requireServiceRole: true },
  ) as Array<Record<string, any>>;
  const driverId = drivers[0]?.id as string | undefined;
  if (!driverId) throw new Error('DRIVER_NOT_FOUND');

  const driverAssignments = await driverAssignmentRepo.findByDriverIds([driverId]);
  const features = await featureRepo.findEnabled();
  const featuresById = new Map(features.map((feature) => [feature.id, feature]));
  const driverFeatureCodes = mapDriverFeatureCodes(driverAssignments, featuresById);

  if (!vehicleId) {
    return { driverFeatureCodes, vehicleFeatureCodes: [], vehicleId: null, vehicleFacts: null };
  }
  const vehicles = await supabaseGet(
    'vehicles',
    { id: vehicleId, driver_id: driverId, is_active: true },
    'id,type,year,brand,model,is_active',
    { limit: 1, requireServiceRole: true },
  ) as Array<Record<string, any>>;
  const vehicle = vehicles[0];
  if (!vehicle) throw new Error('ACTIVE_VEHICLE_NOT_OWNED');
  const vehicleAssignments = await vehicleAssignmentRepo.findByVehicleIds([vehicle.id]);
  const vehicleFacts = mapVehicleFacts(vehicle);
  return {
    driverFeatureCodes,
    vehicleFeatureCodes: mapVehicleFeatureCodes(vehicleAssignments, features, vehicleFacts),
    vehicleId: vehicle.id,
    vehicleFacts,
  };
}

export async function getRideFeatureCapabilitiesForDrivers(
  candidates: readonly { userId: string; vehicleId: string | null }[],
): Promise<Map<string, DriverRideFeatureCapabilities>> {
  const userIds = [...new Set(candidates.map((candidate) => candidate.userId).filter(Boolean))];
  const driverRows: Array<Record<string, any>> = [];
  for (const batch of chunks(userIds)) {
    const rows = await supabaseGetIn('drivers', 'user_id', batch, 'id,user_id', {
      limit: batch.length,
      requireServiceRole: true,
    }) as Array<Record<string, any>>;
    driverRows.push(...rows);
  }

  const driverIdByUserId = new Map(
    driverRows.filter((driver) => driver.id && driver.user_id)
      .map((driver) => [String(driver.user_id), String(driver.id)]),
  );
  const driverIds = [...new Set(driverIdByUserId.values())];
  const vehicleIds = [...new Set(candidates
    .map((candidate) => candidate.vehicleId)
    .filter((id): id is string => typeof id === 'string' && UUID_PATTERN.test(id)))];
  const driverAssignments = [];
  const vehicleAssignments = [];
  const vehicles: Array<Record<string, any>> = [];
  for (const batch of chunks(driverIds)) {
    driverAssignments.push(...await driverAssignmentRepo.findByDriverIds(batch));
  }
  for (const batch of chunks(vehicleIds)) {
    vehicleAssignments.push(...await vehicleAssignmentRepo.findByVehicleIds(batch));
    vehicles.push(...await supabaseGetIn(
      'vehicles',
      'id',
      batch,
      'id,driver_id,type,year,brand,model,is_active',
      { limit: batch.length, requireServiceRole: true },
    ) as Array<Record<string, any>>);
  }

  const features = await featureRepo.findEnabled();
  const featuresById = new Map(features.map((feature) => [feature.id, feature]));
  const vehicleById = new Map(vehicles.map((vehicle) => [String(vehicle.id), vehicle]));
  const driverAssignmentsById = new Map<string, typeof driverAssignments>();
  for (const assignment of driverAssignments) {
    const key = String(assignment.driver_id);
    const rows = driverAssignmentsById.get(key) ?? [];
    rows.push(assignment);
    driverAssignmentsById.set(key, rows);
  }
  const vehicleAssignmentsById = new Map<string, typeof vehicleAssignments>();
  for (const assignment of vehicleAssignments) {
    const key = String(assignment.vehicle_id);
    const rows = vehicleAssignmentsById.get(key) ?? [];
    rows.push(assignment);
    vehicleAssignmentsById.set(key, rows);
  }

  const result = new Map<string, DriverRideFeatureCapabilities>();
  for (const candidate of candidates) {
    const driverId = driverIdByUserId.get(candidate.userId);
    const vehicle = candidate.vehicleId ? vehicleById.get(candidate.vehicleId) : null;
    const validVehicle = vehicle &&
      vehicle.is_active === true &&
      driverId &&
      String(vehicle.driver_id) === driverId
      ? vehicle
      : null;
    const vehicleFacts = mapVehicleFacts(validVehicle);
    result.set(candidate.userId, {
      driverFeatureCodes: driverId
        ? mapDriverFeatureCodes(driverAssignmentsById.get(driverId) ?? [], featuresById)
        : [],
      vehicleFeatureCodes: validVehicle
        ? mapVehicleFeatureCodes(vehicleAssignmentsById.get(String(validVehicle.id)) ?? [], features, vehicleFacts)
        : [],
      vehicleId: validVehicle ? String(validVehicle.id) : null,
      vehicleFacts,
    });
  }
  return result;
}
