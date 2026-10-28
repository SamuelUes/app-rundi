import * as functions from 'firebase-functions/v1';
import admin from 'firebase-admin';
import { z } from 'zod';
import { DriverFeatureAssignmentRepository } from '../sequelize/repositories/DriverFeatureAssignmentRepository';
import { FeatureRepository, type FeatureRow } from '../sequelize/repositories/FeatureRepository';
import { VehicleFeatureAssignmentRepository } from '../sequelize/repositories/VehicleFeatureAssignmentRepository';
import { supabaseGet } from '../supabase/rest';
import { requireAdmin, requireDriver } from '../utils/sessionUtils';
import {
  normalizeVehicleEligibilityClass,
  validateEligibilityRules,
} from '../helpers/featureEligibility';
import { getRideFeatureCapabilitiesForDriver } from '../helpers/rideFeatureService';

const featureRepo = new FeatureRepository();
const driverFeatureRepo = new DriverFeatureAssignmentRepository();
const vehicleFeatureRepo = new VehicleFeatureAssignmentRepository();
const db = admin.database();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FeatureConfigSchema = z.object({
  code: z.string().trim().min(2).max(50).regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(1000).nullable().optional(),
  enabled: z.boolean().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/).nullable().optional(),
  endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/).nullable().optional(),
  timezone: z.string().min(1).max(64).optional(),
  pricingType: z.enum(['none', 'surcharge', 'discount', 'multiplier']).optional(),
  pricingValue: z.number().finite().min(0).max(100000).optional(),
  priority: z.number().int().min(0).max(100000).optional(),
  stackable: z.boolean().optional(),
  defaultSelected: z.boolean().optional(),
  eligibilitySubject: z.enum(['none', 'driver', 'vehicle']).optional(),
  eligibilityMode: z.enum(['none', 'manual', 'automatic', 'hybrid']).optional(),
  eligibilityRules: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const FeatureAssignmentSchema = z.object({
  featureCode: z.string().trim().min(2).max(50),
  expiresAt: z.string().datetime().nullable().optional(),
});

const VehicleFeatureAssignmentSchema = FeatureAssignmentSchema.extend({
  vehicleId: z.string().uuid(),
});

const ServiceFeatureAssignmentSchema = z.object({
  featureCode: z.string().trim().min(2).max(50),
  serviceCode: z.string().trim().min(2).max(50),
  enabled: z.boolean(),
  configuration: z.object({
    pricing_type: z.enum(['none', 'surcharge', 'discount', 'multiplier']).optional(),
    pricing_value: z.number().finite().min(0).max(100000).optional(),
    priority: z.number().int().min(0).max(100000).optional(),
    stackable: z.boolean().optional(),
    default_selected: z.boolean().optional(),
  }).strict().optional(),
});

const normalizeFeatureForResponse = (feature: FeatureRow) => ({
  id: feature.id,
  code: feature.code,
  name: feature.name,
  description: feature.description,
  enabled: feature.enabled,
  startsAt: feature.starts_at,
  endsAt: feature.ends_at,
  startTime: feature.start_time,
  endTime: feature.end_time,
  timezone: feature.timezone,
  pricingType: feature.pricing_type,
  pricingValue: Number(feature.pricing_value),
  priority: feature.priority,
  stackable: feature.stackable,
  defaultSelected: feature.metadata?.defaultSelected !== false,
  eligibilitySubject: feature.eligibility_subject,
  eligibilityMode: feature.eligibility_mode,
  eligibilityRules: feature.eligibility_rules ?? {},
  metadata: feature.metadata ?? {},
});

const validateEligibilityPolicy = (
  subject: FeatureRow['eligibility_subject'] | undefined,
  mode: FeatureRow['eligibility_mode'] | undefined,
  rules: unknown,
) => {
  if (!subject || !mode || !validateEligibilityRules(rules).valid) return false;
  if (subject === 'none') return mode === 'none' && Object.keys(rules as object).length === 0;
  if (subject === 'driver') return mode === 'manual' && Object.keys(rules as object).length === 0;
  return ['manual', 'automatic', 'hybrid'].includes(mode);
};

const parseExpiresAt = (value: string | null | undefined): string | null => {
  if (value == null) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
    throw new functions.https.HttpsError('invalid-argument', 'expiresAt debe ser una fecha futura');
  }
  return new Date(timestamp).toISOString();
};

const getDriverRecord = async (userId: string) => {
  const rows = await supabaseGet(
    'drivers',
    { user_id: userId },
    'id,user_id,account_status',
    { limit: 1, requireServiceRole: true },
  ) as Array<Record<string, any>>;
  const driver = rows[0];
  if (!driver?.id || driver.account_status === 'suspended' || driver.account_status === 'rejected') {
    throw new functions.https.HttpsError('not-found', 'Conductor no encontrado o inactivo');
  }
  return driver;
};

const getVehicleRecord = async (vehicleId: string, driverId?: string) => {
  const filters: Record<string, unknown> = { id: vehicleId };
  if (driverId) filters.driver_id = driverId;
  const rows = await supabaseGet(
    'vehicles',
    filters,
    'id,driver_id,type,year,brand,model,is_active',
    { limit: 1, requireServiceRole: true },
  ) as Array<Record<string, any>>;
  const vehicle = rows[0];
  if (!vehicle?.id) throw new functions.https.HttpsError('not-found', 'Vehículo no encontrado');
  return vehicle;
};

const getCurrentVehicleId = async (userId: string): Promise<string | null> => {
  const snapshot = await db.ref(`driversInfo/${userId}/vehicle`).once('value');
  const value = snapshot.val();
  const id = typeof value === 'string' ? value : value?.id;
  return typeof id === 'string' ? id : null;
};

export const listRideFeaturesForAdmin = functions.https.onCall(async (_data, context) => {
  await requireAdmin(context);
  const [features, serviceAssignments] = await Promise.all([
    featureRepo.findAll(),
    featureRepo.findServiceFeatureAssignments(),
  ]);
  return {
    success: true,
    features: features.map(normalizeFeatureForResponse),
    serviceAssignments: serviceAssignments.map((assignment) => ({
      id: assignment.id,
      featureCode: assignment.features?.code ?? null,
      serviceCode: assignment.services?.code ?? null,
      serviceName: assignment.services?.name ?? null,
      enabled: assignment.enabled === true,
      configuration: assignment.configuration ?? {},
    })),
  };
});

export const setRideFeatureServiceAssignment = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);
  const parsed = ServiceFeatureAssignmentSchema.safeParse(data);
  if (!parsed.success) {
    throw new functions.https.HttpsError('invalid-argument', 'Asignación de feature al servicio inválida');
  }
  const { featureCode, serviceCode, enabled, configuration = {} } = parsed.data;
  const feature = await featureRepo.findByCode(featureCode);
  const serviceId = await featureRepo.findServiceIdByCode(serviceCode);
  if (!feature || !serviceId) {
    throw new functions.https.HttpsError('not-found', 'Feature o servicio no encontrado');
  }
  const allowedServices: Record<string, string[]> = {
    senior: ['normal', 'designated_driver_auto'],
    premium: ['normal'],
    pet_friendly: ['normal', 'designated_driver_auto'],
  };
  if (allowedServices[featureCode] && !allowedServices[featureCode].includes(serviceCode)) {
    throw new functions.https.HttpsError('failed-precondition', 'El feature no está permitido para este servicio');
  }
  const existing = await featureRepo.findServiceFeatureAssignment(serviceId, feature.id);
  const assignment = existing
    ? await featureRepo.updateServiceFeatureAssignment(String(existing.id), { enabled, configuration })
    : await featureRepo.createServiceFeatureAssignment({
        service_id: serviceId,
        feature_id: feature.id,
        enabled,
        configuration,
      });
  return { success: true, assignment: { ...assignment, featureCode, serviceCode } };
});

export const upsertRideFeatureConfig = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);
  const parsed = FeatureConfigSchema.safeParse(data);
  if (!parsed.success) {
    throw new functions.https.HttpsError('invalid-argument', 'Configuración de feature inválida');
  }
  const value = parsed.data;
  const existing = await featureRepo.findByCode(value.code);
  const subject = value.eligibilitySubject ?? existing?.eligibility_subject ?? 'none';
  const mode = value.eligibilityMode ?? existing?.eligibility_mode ?? 'none';
  const rules = value.eligibilityRules ?? existing?.eligibility_rules ?? {};
  if (!validateEligibilityPolicy(subject, mode, rules)) {
    throw new functions.https.HttpsError('invalid-argument', 'Política de elegibilidad inválida');
  }
  if (
    (value.code === 'night' || value.code === 'senior') &&
    (subject !== 'none' || mode !== 'none')
  ) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Este feature no admite insignias de conductor o vehículo',
    );
  }
  if (value.code === 'premium' && subject !== 'vehicle') {
    throw new functions.https.HttpsError('failed-precondition', 'Premium requiere una insignia de vehículo');
  }

  const metadata = {
    ...(existing?.metadata ?? {}),
    ...(value.metadata ?? {}),
    ...(value.defaultSelected === undefined ? {} : { defaultSelected: value.defaultSelected }),
  };
  const databaseValues: Record<string, unknown> = {
    code: value.code,
    name: value.name,
    description: value.description,
    enabled: value.enabled,
    starts_at: value.startsAt,
    ends_at: value.endsAt,
    start_time: value.startTime,
    end_time: value.endTime,
    timezone: value.timezone,
    pricing_type: value.pricingType,
    pricing_value: value.pricingValue,
    priority: value.priority,
    stackable: value.stackable,
    eligibility_subject: subject,
    eligibility_mode: mode,
    eligibility_rules: rules,
    metadata,
  };
  for (const key of Object.keys(databaseValues)) {
    if (databaseValues[key] === undefined) delete databaseValues[key];
  }
  const feature = existing
    ? await featureRepo.update(existing.id, databaseValues)
    : await featureRepo.create({
        enabled: true,
        timezone: 'America/Managua',
        pricing_type: 'none',
        pricing_value: 0,
        priority: 100,
        stackable: true,
        eligibility_subject: subject,
        eligibility_mode: mode,
        eligibility_rules: rules,
        metadata: { defaultSelected: true },
        ...databaseValues,
      });
  return { success: true, feature: normalizeFeatureForResponse(feature) };
});

export const grantDriverRideFeature = functions.https.onCall(async (data, context) => {
  const adminId = await requireAdmin(context);
  const parsed = FeatureAssignmentSchema.extend({
    driverUserId: z.string().trim().min(1).max(255),
  }).safeParse(data);
  if (!parsed.success) throw new functions.https.HttpsError('invalid-argument', 'Asignación de conductor inválida');
  const feature = await featureRepo.findByCode(parsed.data.featureCode);
  if (!feature?.enabled || feature.eligibility_subject !== 'driver') {
    throw new functions.https.HttpsError('failed-precondition', 'El feature no acepta una insignia de conductor');
  }
  const driver = await getDriverRecord(parsed.data.driverUserId);
  const assignment = await driverFeatureRepo.grant(
    driver.id,
    feature.id,
    adminId,
    parseExpiresAt(parsed.data.expiresAt),
  );
  return { success: true, assignment };
});

export const revokeDriverRideFeature = functions.https.onCall(async (data, context) => {
  const adminId = await requireAdmin(context);
  const parsed = FeatureAssignmentSchema.extend({
    driverUserId: z.string().trim().min(1).max(255),
  }).safeParse(data);
  if (!parsed.success) throw new functions.https.HttpsError('invalid-argument', 'Revocación de conductor inválida');
  const driver = await getDriverRecord(parsed.data.driverUserId);
  const feature = await featureRepo.findByCode(parsed.data.featureCode);
  if (!feature || feature.eligibility_subject !== 'driver') {
    throw new functions.https.HttpsError('failed-precondition', 'El feature no corresponde a un conductor');
  }
  const current = await driverFeatureRepo.findByDriverAndFeature(driver.id, feature.id);
  if (!current) throw new functions.https.HttpsError('not-found', 'Asignación no encontrada');
  const assignment = await driverFeatureRepo.revoke(current.id, adminId);
  return { success: true, assignment };
});

export const grantVehicleRideFeature = functions.https.onCall(async (data, context) => {
  const adminId = await requireAdmin(context);
  const parsed = VehicleFeatureAssignmentSchema.safeParse(data);
  if (!parsed.success) throw new functions.https.HttpsError('invalid-argument', 'Asignación de vehículo inválida');
  const feature = await featureRepo.findByCode(parsed.data.featureCode);
  if (!feature?.enabled || feature.eligibility_subject !== 'vehicle') {
    throw new functions.https.HttpsError('failed-precondition', 'El feature no acepta una insignia de vehículo');
  }
  if (!['manual', 'hybrid'].includes(feature.eligibility_mode)) {
    throw new functions.https.HttpsError('failed-precondition', 'La configuración automática no admite insignia manual');
  }
  const vehicle = await getVehicleRecord(parsed.data.vehicleId);
  if (vehicle.is_active !== true || normalizeVehicleEligibilityClass(vehicle.type) !== 'auto') {
    throw new functions.https.HttpsError('failed-precondition', 'La insignia premium requiere un auto activo');
  }
  const assignment = await vehicleFeatureRepo.grant(
    vehicle.id,
    feature.id,
    adminId,
    parseExpiresAt(parsed.data.expiresAt),
  );
  return { success: true, assignment };
});

export const revokeVehicleRideFeature = functions.https.onCall(async (data, context) => {
  const adminId = await requireAdmin(context);
  const parsed = VehicleFeatureAssignmentSchema.safeParse(data);
  if (!parsed.success) throw new functions.https.HttpsError('invalid-argument', 'Revocación de vehículo inválida');
  const feature = await featureRepo.findByCode(parsed.data.featureCode);
  if (!feature || feature.eligibility_subject !== 'vehicle') {
    throw new functions.https.HttpsError('failed-precondition', 'El feature no corresponde a un vehículo');
  }
  const current = await vehicleFeatureRepo.findByVehicleAndFeature(parsed.data.vehicleId, feature.id);
  if (!current) throw new functions.https.HttpsError('not-found', 'Asignación no encontrada');
  const assignment = await vehicleFeatureRepo.revoke(current.id, adminId);
  return { success: true, assignment };
});

export const getMyRideFeatureCapabilities = functions.https.onCall(async (data, context) => {
  const userId = await requireDriver(context);
  const requestedVehicleId = typeof data?.vehicleId === 'string' ? data.vehicleId : null;
  if (requestedVehicleId && !UUID_PATTERN.test(requestedVehicleId)) {
    throw new functions.https.HttpsError('invalid-argument', 'vehicleId inválido');
  }
  const vehicleId = requestedVehicleId ?? await getCurrentVehicleId(userId);
  try {
    const capabilities = await getRideFeatureCapabilitiesForDriver(userId, vehicleId);
    return { success: true, ...capabilities };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error?.message === 'DRIVER_NOT_FOUND') {
      throw new functions.https.HttpsError('not-found', 'Conductor no encontrado');
    }
    if (error?.message === 'ACTIVE_VEHICLE_NOT_OWNED') {
      throw new functions.https.HttpsError('permission-denied', 'El vehículo no pertenece al conductor o no está activo');
    }
    console.error('[getMyRideFeatureCapabilities] Error:', error?.message || error);
    throw new functions.https.HttpsError('internal', 'No se pudieron obtener las capacidades del conductor');
  }
});
