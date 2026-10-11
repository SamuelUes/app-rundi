import * as functions from 'firebase-functions/v1';
import admin from 'firebase-admin';
import { DriverRepository } from '../sequelize/repositories/DriverRepository';
import { RideLocationRepository } from '../sequelize/repositories/RideLocationRepository';
import { RideService } from '../sequelize/services/RideService';
import { supabaseGetRidesWithLocationsAndPayments } from '../supabase/client';
import { mapRides } from './rideHistory';
import { notifyUserSafe } from '../services/notifyUserSafe';
import { notifyLiveRideUpdate, LiveRideNotificationPayload } from '../services/liveRideNotifications';
import { RideRepository } from '../sequelize/repositories/RideRepository';
// import { DriverPenaltyRepository } from '../sequelize/repositories/DriverPenaltyRepository';
import { ServiceRepository } from '../sequelize/repositories/ServiceRepository';
import { PaymentRepository } from '../sequelize/repositories/PaymentRepository';
import { VehicleRepository } from '../sequelize/repositories/VehicleRepository';
import { calculateRideProgress } from '../utils/rideProgressUtils';
import { logRideEvent, AnalyticsEvents } from '../utils/analyticsUtils';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_SERVICE_AREA_ID, PUSH_NOTIFICATIONS_ENABLED } from '../config/constants';
import { ensureActiveSession, requireDriver, requireClient } from '../utils/sessionUtils';
import sequelize, { isSequelizeAvailable } from '../sequelize/config/database';
import {
  AcceptRideSchema,
  StartRideSchema,
  CompleteRideSchema,
  CancelRideSchema,
  GetRideDetailsSchema,
  CreateRideRequestSchema,
  validateData,
  AcceptRide,
  StartRide,
  CompleteRide,
  CancelRide,
  GetRideDetails,
  CreateRideRequest,
} from '../sequelize/validators';

const IS_LOAD_TEST =
  (process.env.FUNCTIONS_EMULATOR === 'true' ||
    (process.env.FIREBASE_EMULATOR_RUN_MODE ?? '').toLowerCase() === 'true') &&
  (process.env.SKIP_DB_FOR_LOADTEST ?? '').toLowerCase() === 'true';

const rideRepo = new RideRepository();
const driverRepo = new DriverRepository();
const locationRepo = new RideLocationRepository();
const rideService = new RideService();
const db = admin.database();
// const penaltyRepo = new DriverPenaltyRepository();
const serviceRepo = new ServiceRepository();
const paymentRepo = new PaymentRepository();
const vehicleRepo = new VehicleRepository();

const safeLogRideEvent = async (
  eventType: string,
  rideId: string,
  userId?: string | null,
  additionalData?: Record<string, any>,
) => {
  if (!rideId) return;
  const normalizedUserId = typeof userId === 'string' && userId.trim().length > 0 ? userId : 'system';
  try {
    await logRideEvent(eventType, rideId, normalizedUserId, additionalData);
  } catch (error) {
    console.warn(`⚠️ [analytics] Error registrando ${eventType} para ride ${rideId}`, error);
  }
};

const notifyLiveRideUpdateSafe = async (payload: LiveRideNotificationPayload) => {
  if (!PUSH_NOTIFICATIONS_ENABLED) {
    return;
  }

  try {
    await notifyLiveRideUpdate(payload);
  } catch (error) {
    console.error('❌ [rides] Error enviando live ride notification push:', {
      payload,
      error,
    });
  }
};

// notifyUserSafe is imported from ../services/notifyUserSafe

const fetchClientProfileFromRealtime = async (
  clientId: string,
): Promise<{
  fullName?: string | null;
  phone?: string | null;
  rating?: number | null;
  totalRatings?: number | null;
} | null> => {
  try {
    const snapshot = await db.ref(`clientsInfo/${clientId}`).once('value');
    const value = snapshot.val();
    if (!value) {
      return null;
    }

    return {
      fullName: value.fullName ?? value.full_name ?? null,
      phone: value.phone ?? null,
      rating: typeof value.rating === 'number' ? value.rating : null,
      totalRatings: typeof value.totalRatings === 'number' ? value.totalRatings : null,
    };
  } catch (error) {
    console.warn('[hydrateActiveRides] Error leyendo clientsInfo:', { clientId, error });
    return null;
  }
};

const needsEnrichment = (ride: any): boolean => {
  if (!ride) {
    return true;
  }
  const hasName = typeof ride.clientName === 'string' && ride.clientName.trim().length > 0;
  const hasPhone = typeof ride.clientPhone === 'string' && ride.clientPhone.trim().length > 0;
  const hasRating = typeof ride.clientRating === 'number';
  return !(hasName && hasPhone && hasRating);
};

export const hydrateActiveRidesClientProfiles = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  const options = (data && typeof data === 'object') ? data : {};
  const missingOnly = options.missingOnly !== false;
  const limit = typeof options.limit === 'number' && Number.isFinite(options.limit)
    ? Math.min(Math.max(Math.floor(options.limit), 1), 200)
    : 50;

  const snapshot = await db.ref('activeRides').once('value');
  const rawValue = snapshot.val() || {};
  const entries = Object.entries<any>(rawValue);

  let processed = 0;
  let updated = 0;
  const errors: Array<{ rideId: string; reason: string }> = [];

  for (const [rideId, ride] of entries) {
    if (processed >= limit) {
      break;
    }

    if (!ride?.clientId) {
      continue;
    }

    if (missingOnly && !needsEnrichment(ride)) {
      continue;
    }

    processed += 1;

    try {
      const profile = await fetchClientProfileFromRealtime(ride.clientId);
      if (!profile) {
        errors.push({ rideId, reason: 'client_profile_missing' });
        continue;
      }

      const updatePayload: Record<string, any> = {
        clientName: profile.fullName ?? ride.clientName ?? null,
        clientPhone: profile.phone ?? ride.clientPhone ?? null,
        clientRating: typeof profile.rating === 'number' ? profile.rating : ride.clientRating ?? null,
        clientTotalRatings: typeof profile.totalRatings === 'number'
          ? profile.totalRatings
          : ride.clientTotalRatings ?? null,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      };

      await db.ref(`activeRides/${rideId}`).update(updatePayload);
      updated += 1;
    } catch (error: any) {
      console.error('[hydrateActiveRides] Error enriqueciendo viaje:', { rideId, error });
      errors.push({ rideId, reason: error?.message ?? 'unknown_error' });
    }
  }

  return {
    success: true,
    totalRides: entries.length,
    updated,
    errors,
    remaining: Math.max(entries.length - processed, 0),
  };
});

const parseToNumber = (value: any): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
};

const parseEpochMs = (value: any): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
};

const PROGRAMMED_RIDE_MIN_AHEAD_MS = 30 * 60 * 1000;
const PROGRAMMED_RIDE_MAX_AHEAD_MS = 20 * 24 * 60 * 60 * 1000;

const validateScheduledAt = (value: any): number | null => {
  const parsed = parseEpochMs(value);
  if (parsed === null) {
    return null;
  }

  const now = Date.now();
  if (parsed < now + PROGRAMMED_RIDE_MIN_AHEAD_MS || parsed > now + PROGRAMMED_RIDE_MAX_AHEAD_MS) {
    return null;
  }

  return parsed;
};

const PROGRAMMED_RIDE_CONFLICT_BEFORE_MS = 20 * 60 * 1000; // 20 minutos antes
const PROGRAMMED_RIDE_CONFLICT_AFTER_MS = 30 * 60 * 1000; // 30 minutos después

// Solo los viajes programados "vivos" bloquean nuevas solicitudes. Los estados
// terminales (canceled, completed, expired, activated) no deben generar conflicto.
const PROGRAMMED_RIDE_ACTIVE_STATUSES = new Set([
  'scheduled',
  'driver_assigned',
  'client_confirmed',
  'driver_confirmed',
]);

// Alfabeto sin caracteres ambiguos (0/O, 1/I/L) para códigos dictados por teléfono/chat
const CLAIM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CLAIM_CODE_LENGTH = 6;
const CLAIM_CODE_MAX_ATTEMPTS = 8;

const generateClaimCode = (): string => {
  let code = '';
  for (let i = 0; i < CLAIM_CODE_LENGTH; i += 1) {
    code += CLAIM_CODE_ALPHABET[Math.floor(Math.random() * CLAIM_CODE_ALPHABET.length)];
  }
  return code;
};

const normalizeClaimCode = (value: any): string =>
  String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const issueProgrammedRideClaimCode = async (
  rideId: string,
  clientId: string,
): Promise<string | null> => {
  for (let attempt = 0; attempt < CLAIM_CODE_MAX_ATTEMPTS; attempt += 1) {
    const code = generateClaimCode();
    const indexRef = db.ref(`claimCodeIndex/${code}`);
    const existing = await indexRef.once('value');
    if (existing.exists()) {
      continue;
    }

    const updates: Record<string, any> = {};
    updates[`claimCodeIndex/${code}`] = { rideId, clientId, createdAt: Date.now() };
    updates[`programmedRideCodes/${rideId}`] = { code, clientId, createdAt: Date.now() };
    await db.ref().update(updates);
    return code;
  }
  return null;
};

const clearProgrammedRideClaimCode = async (rideId: string): Promise<void> => {
  try {
    const snap = await db.ref(`programmedRideCodes/${rideId}`).once('value');
    const code = snap.val()?.code;
    const updates: Record<string, any> = {};
    updates[`programmedRideCodes/${rideId}`] = null;
    if (typeof code === 'string' && code) {
      updates[`claimCodeIndex/${code}`] = null;
    }
    await db.ref().update(updates);
  } catch (error: any) {
    console.warn('[programmedRides] No se pudo limpiar claim code', {
      rideId,
      error: error?.message || error,
    });
  }
};

interface ProgrammedRideConflict {
  rideId: string;
  scheduledAt: number;
}

const findConflictingProgrammedRideForClient = async (
  clientId: string,
  targetTimeMs: number,
): Promise<ProgrammedRideConflict | null> => {
  try {
    const snapshot = await db
      .ref('programmedRides')
      .orderByChild('clientId')
      .equalTo(clientId)
      .once('value');

    const now = Date.now();
    const minScheduledAt = now - PROGRAMMED_RIDE_CONFLICT_AFTER_MS;

    let bestConflict: ProgrammedRideConflict | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;

    snapshot.forEach((child) => {
      const value = child.val();
      if (!value) {
        return false;
      }

      if (!PROGRAMMED_RIDE_ACTIVE_STATUSES.has(String(value.status))) {
        return false;
      }

      const scheduledRaw = value.scheduledAt ?? value.scheduled_at;
      const scheduledParsed =
        typeof scheduledRaw === 'number' && Number.isFinite(scheduledRaw)
          ? Math.floor(scheduledRaw)
          : parseEpochMs(scheduledRaw);

      if (scheduledParsed === null) {
        return false;
      }

      // Ignorar viajes muy antiguos cuyo horario ya pasó hace más del margen posterior
      if (scheduledParsed < minScheduledAt) {
        return false;
      }

      const windowStart = scheduledParsed - PROGRAMMED_RIDE_CONFLICT_BEFORE_MS;
      const windowEnd = scheduledParsed + PROGRAMMED_RIDE_CONFLICT_AFTER_MS;

      if (targetTimeMs >= windowStart && targetTimeMs <= windowEnd) {
        const delta = Math.abs(scheduledParsed - targetTimeMs);
        if (delta < bestDelta) {
          bestDelta = delta;
          bestConflict = {
            rideId: child.key as string,
            scheduledAt: scheduledParsed,
          };
        }
      }

      return false;
    });

    return bestConflict;
  } catch (error: any) {
    console.warn('[findConflictingProgrammedRideForClient] Error buscando viajes programados', {
      clientId,
      error: error?.message || error,
    });
    return null;
  }
};

const fetchFirestoreUserRole = async (uid: string): Promise<string | null> => {
  try {
    const userDoc = await admin.firestore().collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return null;
    }
    const data = userDoc.data() as Record<string, unknown> | undefined;
    const roleRaw = (data?.role ?? data?.userRole ?? data?.type ?? null) as string | null;
    return typeof roleRaw === 'string' && roleRaw.trim().length > 0 ? roleRaw.trim() : null;
  } catch (error: any) {
    console.warn('[programmedRides] No se pudo leer role en Firestore', {
      uid,
      error: error?.message || error,
    });
    return null;
  }
};

const fetchDriverInfoFromRealtime = async (driverId: string): Promise<any | null> => {
  try {
    const snapshot = await db.ref(`driversInfo/${driverId}`).once('value');
    const value = snapshot.val();
    if (!value) {
      return null;
    }

    return {
      id: driverId,
      userId: driverId,
      name: value?.name ?? value?.fullName ?? 'Conductor',
      rating: value?.rating ?? 0,
      profilePhoto: value?.photoURL ?? value?.photoUrl ?? null,
    };
  } catch (error: any) {
    console.warn('[programmedRides] No se pudo leer driversInfo', {
      driverId,
      error: error?.message || error,
    });
    return null;
  }
};

export const createProgrammedRide = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  await ensureActiveSession(context, data);

  const clientId = context.auth.uid;
  const role = await fetchFirestoreUserRole(clientId);
  if (role !== 'client') {
    throw new functions.https.HttpsError('permission-denied', 'Solo clientes pueden crear viajes programados');
  }

  const scheduledAt = validateScheduledAt(data?.scheduledAt);
  if (scheduledAt === null) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'scheduledAt debe estar entre 30 minutos y 20 días desde ahora',
    );
  }

  const origin = data?.origin;
  const destination = data?.destination;
  const estimatedPrice = parseToNumber(data?.estimatedPrice);

  if (!origin || !destination || estimatedPrice === null) {
    throw new functions.https.HttpsError('invalid-argument', 'origin, destination y estimatedPrice son requeridos');
  }

  // Verificar si el cliente ya tiene un viaje programado que entre en conflicto
  const programmedConflict = await findConflictingProgrammedRideForClient(clientId, scheduledAt);
  if (programmedConflict) {
    throw new functions.https.HttpsError('failed-precondition', 'CLIENT_PROGRAMMED_RIDE_CONFLICT', {
      code: 'CLIENT_PROGRAMMED_RIDE_CONFLICT',
      existingRideId: programmedConflict.rideId,
      existingScheduledAt: programmedConflict.scheduledAt,
    });
  }

  let clientProfile: Awaited<ReturnType<typeof fetchClientProfileFromRealtime>> | null = null;
  try {
    clientProfile = await fetchClientProfileFromRealtime(clientId);
  } catch (err) {
    console.warn('[createProgrammedRide] No se pudo obtener perfil de cliente', {
      clientId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const rideId = uuidv4();
  const normalizedClientComment = data?.clientComment ?? data?.comment ?? data?.notes ?? null;
  const normalizedNotes = data?.notes ?? data?.clientComment ?? data?.comment ?? null;

  const payload: Record<string, any> = {
    id: rideId,
    isProgrammed: true,
    status: 'scheduled',
    scheduledAt,
    clientId,
    driverId: null,
    clientConfirmed: false,
    driverConfirmed: false,
    origin,
    destination,
    extraDestinations: data?.extraDestinations ?? null,
    estimatedPrice,
    estimatedDistance: data?.estimatedDistance ?? null,
    estimatedDuration: data?.estimatedDuration ?? null,
    rideType: data?.rideType ?? 'normal',
    vehicleType: data?.vehicleType ?? null,
    designatedDriverVehicle: data?.designatedDriverVehicle ?? null,
    passengers: data?.passengers ?? 1,
    paymentMethod: data?.paymentMethod ?? 'cash',
    serviceId: data?.serviceId ?? null,
    clientVehiclePhoto: data?.clientVehiclePhoto ?? null,
    clientSuggestedPrice: data?.clientSuggestedPrice ?? null,
    clientComment: normalizedClientComment,
    notes: normalizedNotes,
    clientName: clientProfile?.fullName ?? null,
    clientPhone: clientProfile?.phone ?? null,
    clientRating: clientProfile?.rating ?? null,
    clientTotalRatings: clientProfile?.totalRatings ?? null,
    createdAt: admin.database.ServerValue.TIMESTAMP,
    updatedAt: admin.database.ServerValue.TIMESTAMP,
  };

  await db.ref(`programmedRides/${rideId}`).set(payload);

  const claimCode = await issueProgrammedRideClaimCode(rideId, clientId);
  if (!claimCode) {
    console.warn('[createProgrammedRide] No se pudo emitir claim code', { rideId });
  }

  await notifyUserSafe(clientId, '✅ Viaje programado', 'Tu viaje fue programado correctamente.', {
    rideId,
  }, {
    type: 'programmed_ride_created',
  });

  await safeLogRideEvent(AnalyticsEvents.RIDE_REQUESTED, rideId, clientId, {
    isProgrammed: true,
    scheduledAt,
  });

  return {
    success: true,
    ride: {
      id: rideId,
      status: 'scheduled',
      scheduledAt,
      claimCode: claimCode ?? null,
    },
  };
});

const assignDriverToProgrammedRideCore = async (
  rideId: string,
  driverId: string,
  driverRole: string | null,
): Promise<{ id: string; driverId: string }> => {
  const rideRef = db.ref(`programmedRides/${rideId}`);
  const preSnap = await rideRef.once('value');
  const preData = preSnap.val();
  if (!preData) {
    throw new functions.https.HttpsError('not-found', 'Viaje programado no encontrado');
  }
  if (preData.status === 'canceled') {
    throw new functions.https.HttpsError('failed-precondition', 'Viaje programado está cancelado');
  }

  const rideType = String(preData.rideType || '').toLowerCase();
  if (rideType === 'designated_driver' && driverRole !== 'designated_driver') {
    throw new functions.https.HttpsError('permission-denied', 'Este viaje requiere un conductor designado');
  }

  // Transacción: solo un conductor puede tomar el viaje; si otro claim/assign
  // concurrente ya puso driverId, la transacción se aborta.
  const txResult = await rideRef.transaction((current: any) => {
    if (current === null) {
      return current;
    }
    if (current.status === 'canceled') {
      return; // abort → canceled
    }
    if (current.driverId && current.driverId !== driverId) {
      return; // abort → already assigned
    }
    return {
      ...current,
      driverId,
      status: 'driver_assigned',
      driverAssignedAt: Date.now(),
      driverConfirmed: false,
      driverConfirmedAt: null,
      driverConfirmationRequestedAt: null,
      updatedAt: Date.now(),
    };
  });

  if (!txResult.committed) {
    const snap = await rideRef.once('value');
    const rideData = snap.val();
    if (rideData?.status === 'canceled') {
      throw new functions.https.HttpsError('failed-precondition', 'Viaje programado está cancelado');
    }
    throw new functions.https.HttpsError('failed-precondition', 'Viaje programado ya tiene conductor asignado');
  }

  const rideData = txResult.snapshot.val();

  const driverInfo = await fetchDriverInfoFromRealtime(driverId);
  await rideRef.update({ driver: driverInfo });

  await notifyUserSafe(rideData.clientId, '🚗 Conductor asignado', 'Un conductor se asignó a tu viaje programado.', {
    rideId,
    driverId,
  });

  await safeLogRideEvent(AnalyticsEvents.RIDE_ACCEPTED, rideId, driverId, {
    isProgrammed: true,
  });

  return { id: rideId, driverId };
};

export const assignDriverToProgrammedRide = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  await ensureActiveSession(context, data);

  const driverId = context.auth.uid;
  const driverRole = await fetchFirestoreUserRole(driverId);

  if (driverRole !== 'driver' && driverRole !== 'designated_driver') {
    throw new functions.https.HttpsError('permission-denied', 'Solo conductores pueden asignarse a viajes programados');
  }

  const rideId = typeof data?.rideId === 'string' ? data.rideId.trim() : '';
  if (!rideId) {
    throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
  }

  const ride = await assignDriverToProgrammedRideCore(rideId, driverId, driverRole);
  return { success: true, ride };
});

export const claimProgrammedRideByCode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  await ensureActiveSession(context, data);

  const driverId = context.auth.uid;
  const driverRole = await fetchFirestoreUserRole(driverId);

  if (driverRole !== 'driver' && driverRole !== 'designated_driver') {
    throw new functions.https.HttpsError('permission-denied', 'Solo conductores pueden reclamar viajes programados');
  }

  const code = normalizeClaimCode(data?.code ?? data?.claimCode);
  if (code.length !== CLAIM_CODE_LENGTH) {
    throw new functions.https.HttpsError('invalid-argument', 'El código debe tener 6 caracteres');
  }

  const indexSnap = await db.ref(`claimCodeIndex/${code}`).once('value');
  const indexEntry = indexSnap.val();
  const rideId = typeof indexEntry?.rideId === 'string' ? indexEntry.rideId : null;
  if (!rideId) {
    throw new functions.https.HttpsError('not-found', 'Código inválido o expirado');
  }

  try {
    const ride = await assignDriverToProgrammedRideCore(rideId, driverId, driverRole);
    return { success: true, ride: { id: ride.id, driverId: ride.driverId } };
  } catch (error: any) {
    // Self-heal: si el ride ya no existe (cancelado/activado/eliminado), limpiar
    // la entrada huérfana del índice para que el código quede inutilizable.
    if (error instanceof functions.https.HttpsError && error.code === 'not-found') {
      const updates: Record<string, any> = {};
      updates[`claimCodeIndex/${code}`] = null;
      updates[`programmedRideCodes/${rideId}`] = null;
      await db.ref().update(updates).catch(() => undefined);
      throw new functions.https.HttpsError('not-found', 'Código inválido o expirado');
    }
    throw error;
  }
});

export const confirmProgrammedRideClient = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  await ensureActiveSession(context, data);

  const clientId = context.auth.uid;
  const role = await fetchFirestoreUserRole(clientId);
  if (role !== 'client') {
    throw new functions.https.HttpsError('permission-denied', 'Solo clientes pueden confirmar viajes programados');
  }

  const rideId = typeof data?.rideId === 'string' ? data.rideId.trim() : '';
  if (!rideId) {
    throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
  }

  const rideRef = db.ref(`programmedRides/${rideId}`);
  const rideSnap = await rideRef.once('value');
  const rideData = rideSnap.val();
  if (!rideData) {
    throw new functions.https.HttpsError('not-found', 'Viaje programado no encontrado');
  }

  if (rideData.clientId !== clientId) {
    throw new functions.https.HttpsError('permission-denied', 'No tienes permiso para confirmar este viaje');
  }

  const now = admin.database.ServerValue.TIMESTAMP;
  const confirmUpdate: Record<string, any> = {
    clientConfirmedAt: now,
    clientConfirmed: true,
    status: 'client_confirmed',
    updatedAt: now,
  };
  // Si ya hay conductor asignado, habilitar su confirmación de inmediato — sin
  // esperar a que el cron abra la ventana de confirmación (scheduledAt - 10min).
  if (rideData.driverId && !rideData.driverConfirmationRequestedAt) {
    confirmUpdate.driverConfirmationRequestedAt = now;
  }
  await rideRef.update(confirmUpdate);

  const updatedRideSnap = await rideRef.once('value');
  const updatedRideData = updatedRideSnap.val();

  if (updatedRideData?.driverId) {
    await notifyUserSafe(
      updatedRideData.driverId,
      '🕒 Confirma tu viaje programado',
      'El cliente confirmó. Confirma para reservar el viaje.',
      {
        rideId,
        type: 'programmed_ride_driver_confirm',
      },
    );
  }

  await safeLogRideEvent(AnalyticsEvents.CLIENT_CONFIRMED_DRIVER, rideId, clientId, {
    isProgrammed: true,
    step: 'client_confirmed',
  });

  const responseRide = {
    id: rideId,
    status: updatedRideData?.status ?? 'client_confirmed',
    driverId: updatedRideData?.driverId ?? null,
    driverConfirmedAt: updatedRideData?.driverConfirmedAt ?? null,
    clientConfirmedAt: updatedRideData?.clientConfirmedAt ?? null,
    scheduledAt: updatedRideData?.scheduledAt ?? null,
    driver: updatedRideData?.driver ?? null,
    vehicle: updatedRideData?.vehicle ?? null,
    clientConfirmed: true,
    driverConfirmed: Boolean(updatedRideData?.driverConfirmed),
  };

  return { success: true, ride: responseRide };
});

export const confirmProgrammedRideDriver = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  await ensureActiveSession(context, data);

  const driverId = context.auth.uid;
  const driverRole = await fetchFirestoreUserRole(driverId);
  if (driverRole !== 'driver' && driverRole !== 'designated_driver') {
    throw new functions.https.HttpsError('permission-denied', 'Solo conductores pueden confirmar viajes programados');
  }

  const rideId = typeof data?.rideId === 'string' ? data.rideId.trim() : '';
  if (!rideId) {
    throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
  }

  const rideRef = db.ref(`programmedRides/${rideId}`);
  const rideSnap = await rideRef.once('value');
  const rideData = rideSnap.val();
  if (!rideData) {
    throw new functions.https.HttpsError('not-found', 'Viaje programado no encontrado');
  }

  const rideType = String(rideData.rideType || '').toLowerCase();
  if (rideType === 'designated_driver' && driverRole !== 'designated_driver') {
    throw new functions.https.HttpsError('permission-denied', 'Este viaje requiere un conductor designado');
  }

  if (rideData.driverId !== driverId) {
    throw new functions.https.HttpsError('permission-denied', 'No eres el conductor asignado a este viaje');
  }

  const now = admin.database.ServerValue.TIMESTAMP;
  await rideRef.update({
    driverConfirmedAt: now,
    driverConfirmed: true,
    status: 'driver_confirmed',
    updatedAt: now,
  });

  await notifyUserSafe(rideData.clientId, '✅ Conductor confirmó', 'El conductor confirmó tu viaje programado.', {
    rideId,
  }, {
    type: 'programmed_ride_driver_confirmed',
  });

  await safeLogRideEvent(AnalyticsEvents.RIDE_DRIVER_ON_ROUTE, rideId, driverId, {
    isProgrammed: true,
    step: 'driver_confirmed',
  });

  const updatedRide = (await rideRef.once('value')).val();
  return {
    success: true,
    ride: {
      id: rideId,
      status: updatedRide?.status ?? 'driver_confirmed',
      clientConfirmed: Boolean(updatedRide?.clientConfirmed),
      driverConfirmed: true,
      clientConfirmedAt: updatedRide?.clientConfirmedAt ?? null,
      driverConfirmedAt: updatedRide?.driverConfirmedAt ?? null,
      scheduledAt: updatedRide?.scheduledAt ?? null,
      driverId: updatedRide?.driverId ?? null,
    },
  };
});

export const cancelProgrammedRide = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  await ensureActiveSession(context, data);

  const uid = context.auth.uid;
  const rideId = typeof data?.rideId === 'string' ? data.rideId.trim() : '';
  const reason = typeof data?.reason === 'string' ? data.reason.trim() : null;

  if (!rideId) {
    throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
  }

  const rideRef = db.ref(`programmedRides/${rideId}`);
  const rideSnap = await rideRef.once('value');
  const rideData = rideSnap.val();
  if (!rideData) {
    throw new functions.https.HttpsError('not-found', 'Viaje programado no encontrado');
  }

  const isClient = rideData.clientId === uid;
  const isDriver = rideData.driverId === uid;

  if (!isClient && !isDriver) {
    throw new functions.https.HttpsError('permission-denied', 'No tienes permiso para cancelar este viaje programado');
  }

  const canceledBy = isClient ? 'client' : 'driver';
  await rideRef.update({
    status: 'canceled',
    cancelReason: reason || 'canceled',
    canceledBy,
    canceledAt: admin.database.ServerValue.TIMESTAMP,
    updatedAt: admin.database.ServerValue.TIMESTAMP,
  });

  if (isClient && rideData.driverId) {
    await notifyUserSafe(rideData.driverId, 'Viaje programado cancelado', 'El cliente canceló el viaje programado.', {
      rideId,
    }, {
      type: 'programmed_ride_canceled_by_client',
    });
  }

  if (isDriver && rideData.clientId) {
    await notifyUserSafe(rideData.clientId, 'Viaje programado cancelado', 'El conductor canceló el viaje programado.', {
      rideId,
    }, {
      type: 'programmed_ride_canceled_by_driver',
    });
  }

  await safeLogRideEvent(AnalyticsEvents.RIDE_CANCELED, rideId, uid, {
    isProgrammed: true,
    canceledBy,
  });

  // Eliminar completamente el viaje programado para evitar residuos
  try {
    await rideRef.remove();
  } catch (error) {
    console.error('❌ [cancelProgrammedRide] Error eliminando programmedRide', { rideId, error });
  }

  await clearProgrammedRideClaimCode(rideId);

  const serviceAreaId = rideData.serviceAreaId;
  if (serviceAreaId) {
    try {
      await db.ref(`programmedRidesByArea/${serviceAreaId}/${rideId}`).remove();
    } catch (error) {
      console.error('⚠️ [cancelProgrammedRide] No se pudo eliminar de programmedRidesByArea', {
        rideId,
        serviceAreaId,
        error,
      });
    }
  }

  return { success: true, ride: { id: rideId, status: 'canceled' } };
});

const getNegotiatedFare = (firebaseRide: any, rideRecord: any): number => {
  const candidates = [
    firebaseRide?.finalFare,
    rideRecord?.final_fare,
    firebaseRide?.driverOfferedPrice,
    rideRecord?.driver_offered_price,
    firebaseRide?.clientSuggestedPrice,
    rideRecord?.client_suggested_price,
    firebaseRide?.estimatedPrice,
    rideRecord?.estimated_price,
  ];

  for (const candidate of candidates) {
    const parsed = parseToNumber(candidate);
    if (parsed !== null && parsed > 0) {
      return Number(parsed.toFixed(2));
    }
  }

  return 0;
};

const getCommissionRateForRide = async (rideRecord: any): Promise<number> => {
  let commissionRate = parseToNumber((rideRecord as Record<string, any>)?.commission_rate);

  if (commissionRate === null && rideRecord?.service_id) {
    try {
      const service = await serviceRepo.findById(rideRecord.service_id);
      const serviceRate = parseToNumber(service?.commission_rate);
      if (serviceRate !== null) {
        commissionRate = serviceRate;
      }
    } catch (serviceError) {
      console.warn('⚠️ [rides] Error obteniendo comisión del servicio:', serviceError);
    }
  }

  if (commissionRate === null) {
    commissionRate = 0.11;
  }

  return Number(commissionRate.toFixed(4));
};

const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (value: number) => (value * Math.PI) / 180;

const haversineDistanceMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
};

const VEHICLE_AUTO_SYNONYMS = new Set([
  'auto',
  'car',
  'cars',
  'automovil',
  'automóvil',
  'sedan',
  'suv',
  'pickup',
  'truck',
  'camioneta',
  'van',
  'coche',
]);
const VEHICLE_MOTO_SYNONYMS = new Set([
  'moto',
  'motorcycle',
  'motocicleta',
  'motocycle',
  'bike',
]);
const VEHICLE_DESIGNATED_SYNONYMS = new Set([
  'designated_driver',
  'designated-driver',
  'designateddriver',
  'conductor_designado',
  'conductor-designado',
]);

const normalizeVehicleType = (value: any): string | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (VEHICLE_DESIGNATED_SYNONYMS.has(normalized)) {
    return 'designated_driver';
  }
  if (VEHICLE_MOTO_SYNONYMS.has(normalized)) {
    return 'moto';
  }
  if (VEHICLE_AUTO_SYNONYMS.has(normalized)) {
    return 'auto';
  }
  return normalized;
};

const normalizeDesignatedDriverVehicle = (value: any): 'auto' | 'moto' | undefined => {
  const normalized = normalizeVehicleType(value);
  if (normalized === 'moto') {
    return 'moto';
  }
  if (normalized === 'auto') {
    return 'auto';
  }
  return undefined;
};

type VehicleCompatibilityOptions = {
  rideVehicleType?: string | null;
  rideDesignatedDriverVehicle?: string | null;
  driverVehicleType?: string | null;
  driverIsDesignatedDriverMode?: boolean;
};

const checkVehicleCompatibility = (
  options: VehicleCompatibilityOptions,
): { ok: boolean; reason?: string } => {
  const rideType = normalizeVehicleType(options.rideVehicleType) ?? 'auto';
  const rideDesignatedVehicle = normalizeDesignatedDriverVehicle(
    options.rideDesignatedDriverVehicle,
  );
  const driverRawType = normalizeVehicleType(options.driverVehicleType);
  const driverType = driverRawType === 'moto' ? 'moto' : 'auto';
  const driverIsDesignatedMode = Boolean(options.driverIsDesignatedDriverMode);

  if (rideType === 'designated_driver') {
    if (!driverIsDesignatedMode) {
      return { ok: false, reason: 'designated_mode_required' };
    }
    if (rideDesignatedVehicle && driverType !== rideDesignatedVehicle) {
      return { ok: false, reason: 'designated_vehicle_mismatch' };
    }
    return { ok: true };
  }

  if (rideType === 'moto') {
    return driverType === 'moto'
      ? { ok: true }
      : { ok: false, reason: 'moto_vehicle_required' };
  }

  if (driverType === 'moto') {
    return { ok: false, reason: 'auto_vehicle_required' };
  }

  return { ok: true };
};

const normalizeRealtimeRide = (rideId: string, raw: any) => {
  const toOptionalNumber = (value: any): number | undefined => {
    const parsed = parseToNumber(value);
    return parsed !== null ? parsed : undefined;
  };

  const toTimestamp = (value: any): number | undefined => {
    if (value === null || value === undefined) {
      return undefined;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    const parsed = Date.parse(String(value));
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  const originSource = raw?.origin || {};
  const originLat = toOptionalNumber(originSource.lat ?? originSource.latitude ?? raw?.originLat);
  const originLng = toOptionalNumber(originSource.lng ?? originSource.longitude ?? raw?.originLng);
  const originAddress = originSource.address ?? raw?.originAddress ?? undefined;
  const origin = originLat !== undefined && originLng !== undefined
    ? { lat: originLat, lng: originLng, address: originAddress }
    : undefined;

  const destinationSource = raw?.destination || {};
  const destinationLat = toOptionalNumber(destinationSource.lat ?? destinationSource.latitude ?? raw?.destinationLat);
  const destinationLng = toOptionalNumber(destinationSource.lng ?? destinationSource.longitude ?? raw?.destinationLng);
  const destinationAddress = destinationSource.address ?? raw?.destinationAddress ?? undefined;
  const destination = destinationLat !== undefined && destinationLng !== undefined
    ? { lat: destinationLat, lng: destinationLng, address: destinationAddress }
    : undefined;

  const extraSource = Array.isArray(raw?.extraDestinations) ? raw.extraDestinations : [];
  const extraDestinations = extraSource
    .map((stop: any): { lat: number; lng: number; address?: string } | null => {
      const stopLat = toOptionalNumber(stop?.lat ?? stop?.latitude);
      const stopLng = toOptionalNumber(stop?.lng ?? stop?.longitude);
      if (stopLat === undefined || stopLng === undefined) {
        return null;
      }
      return {
        lat: stopLat,
        lng: stopLng,
        address: stop?.address ?? undefined,
      };
    })
    .filter((item: { lat: number; lng: number; address?: string } | null): item is { lat: number; lng: number; address?: string } => item !== null);

  const vehicleType = normalizeVehicleType(raw?.vehicleType ?? raw?.vehicle_type ?? raw?.serviceType);
  const designatedDriverVehicle = normalizeDesignatedDriverVehicle(
    raw?.designatedDriverVehicle ?? raw?.designated_driver_vehicle,
  );
  const serviceId = raw?.serviceId ?? raw?.service_id ?? undefined;
  const clientVehiclePhoto = raw?.clientVehiclePhoto ?? raw?.client_vehicle_photo ?? undefined;

  const estimatedPrice = toOptionalNumber(raw?.estimatedPrice ?? raw?.estimated_price ?? raw?.payment?.estimatedPrice) ?? 0;
  const clientSuggestedPrice = toOptionalNumber(raw?.clientSuggestedPrice ?? raw?.client_suggested_price ?? raw?.clientSuggestedFare);
  const driverOfferedPrice = toOptionalNumber(raw?.driverOfferedPrice ?? raw?.driver_offered_price ?? raw?.driverOfferPrice);
  const estimatedDistance = toOptionalNumber(raw?.estimatedDistance ?? raw?.estimated_distance);
  const estimatedDuration = toOptionalNumber(raw?.estimatedDuration ?? raw?.estimated_duration);
  const passengers = toOptionalNumber(raw?.passengers);
  const waypointsCount = toOptionalNumber(raw?.waypointsCount ?? raw?.waypoints_count);
  const clientRating = toOptionalNumber(raw?.clientRating ?? raw?.client_rating ?? raw?.client?.rating);
  const client = {
    name: raw?.client?.name ?? raw?.clientName ?? 'Cliente',
    phone: raw?.client?.phone ?? raw?.clientPhone ?? null,
    rating: clientRating ?? 0,
    photoUrl: raw?.client?.photoUrl ?? raw?.client?.photoURL ?? null,
  };

  const requestedAt = toTimestamp(raw?.requestedAt ?? raw?.requested_at ?? raw?.createdAt ?? raw?.created_at);
  const updatedAt = toTimestamp(raw?.updatedAt ?? raw?.updated_at);

  return {
    id: rideId,
    status: raw?.status ?? 'requested',
    clientId: raw?.clientId ?? raw?.client_id ?? null,
    driverId: raw?.driverId ?? raw?.driver_id ?? null,
    origin,
    destination,
    extraDestinations: extraDestinations.length > 0 ? extraDestinations : undefined,
    estimatedPrice,
    estimatedDistance,
    estimatedDuration,
    clientSuggestedPrice: clientSuggestedPrice ?? undefined,
    driverOfferedPrice: driverOfferedPrice ?? undefined,
    passengers: passengers ?? undefined,
    rideType: raw?.rideType ?? raw?.serviceType ?? 'normal',
    paymentMethod: raw?.paymentMethod ?? raw?.payment_type ?? raw?.payment?.paymentMethod ?? undefined,
  vehicleType: vehicleType ?? undefined,
  designatedDriverVehicle: designatedDriverVehicle ?? undefined,
    serviceId,
    clientVehiclePhoto,
    negotiationStatus: raw?.negotiationStatus ?? raw?.negotiation_status ?? null,
    clientName: raw?.clientName ?? client?.name ?? undefined,
    clientPhone: raw?.clientPhone ?? client?.phone ?? undefined,
    clientRating: clientRating ?? undefined,
    clientComment: raw?.clientComment ?? raw?.comment ?? raw?.notes ?? undefined,
    client,
    rejections: raw?.rejections ?? undefined,
    offers: raw?.offers ?? undefined,
    requestedAt,
    updatedAt,
    waypointsCount: waypointsCount ?? undefined,
    hasMultipleDestinations: Boolean(raw?.hasMultipleDestinations ?? (extraDestinations.length > 0)),
    payment: raw?.payment ?? undefined,
    timeline: raw?.timeline ?? undefined,
  };
};

export const getAvailableRides = functions.https.onCall(async (data, context) => {
  const uid = await requireDriver(context);

  // Enforce single-session
  await ensureActiveSession(context, data);

  const latitude = typeof data?.latitude === 'number' && Number.isFinite(data.latitude)
    ? data.latitude
    : undefined;
  const longitude = typeof data?.longitude === 'number' && Number.isFinite(data.longitude)
    ? data.longitude
    : undefined;
  const radiusKmParsed = parseToNumber(data?.radius);
  const radiusKm = radiusKmParsed !== null && radiusKmParsed > 0 ? Math.max(radiusKmParsed, 0.1) : 1.5;
  const hasCoords = latitude !== undefined && longitude !== undefined;
  const radiusMeters = hasCoords ? radiusKm * 1000 : undefined;
  const limit = typeof data?.limit === 'number' && Number.isFinite(data.limit)
    ? Math.min(Math.max(Math.floor(data.limit), 1), 50)
    : 25;

  // Resolver área de servicio del conductor desde la sesión (si existe)
  let serviceAreaId = DEFAULT_SERVICE_AREA_ID;

  try {
    const sessionSnap = await db.ref(`sessions/${uid}`).once('value');
    const sessionVal = sessionSnap.val();
    if (sessionVal && typeof sessionVal.serviceAreaId === 'string' && sessionVal.serviceAreaId.trim().length > 0) {
      serviceAreaId = sessionVal.serviceAreaId.trim();
    }
  } catch (e) {
    console.warn('[getAvailableRides] No se pudo leer serviceAreaId de sesión, usando default', {
      uid,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  let driverInfo: any = null;
  try {
    const driverInfoSnapshot = await db.ref(`driversInfo/${uid}`).once('value');
    driverInfo = driverInfoSnapshot.val();
  } catch (driverInfoErr) {
    console.warn('[getAvailableRides] No se pudo obtener driversInfo del conductor', {
      uid,
      error: driverInfoErr instanceof Error ? driverInfoErr.message : String(driverInfoErr),
    });
  }

  const driverVehicleTypeRaw =
    driverInfo?.vehicle?.type ??
    driverInfo?.vehicleType ??
    driverInfo?.vehicle_type ??
    driverInfo?.currentVehicle?.type ??
    null;
  const driverVehicleType = normalizeVehicleType(driverVehicleTypeRaw) ?? 'auto';
  const driverIsDesignatedDriverMode = Boolean(driverInfo?.isDesignatedDriverMode);

  let rawValue: any = {};
  let usedPath = '';

  try {
    const areaSnap = await db.ref(`activeRidesByArea/${serviceAreaId}`).once('value');
    rawValue = areaSnap.val() || {};
    usedPath = `activeRidesByArea/${serviceAreaId}`;

    // Fallback a path global si el shard está vacío (compatibilidad)
    if (!rawValue || (typeof rawValue === 'object' && Object.keys(rawValue).length === 0)) {
      const fallbackSnap = await db.ref('activeRides').once('value');
      rawValue = fallbackSnap.val() || {};
      usedPath = 'activeRides';
    }
  } catch (err) {
    console.warn('[getAvailableRides] Error leyendo activeRidesByArea, usando activeRides global', {
      uid,
      serviceAreaId,
      error: err instanceof Error ? err.message : String(err),
    });
    const fallbackSnap = await db.ref('activeRides').once('value');
    rawValue = fallbackSnap.val() || {};
    usedPath = 'activeRides';
  }

  const entries = Object.entries<Record<string, any>>(rawValue);

  const rides: Record<string, any>[] = [];

  for (const [rideId, rawRide] of entries) {
    const status = String(rawRide?.status || '').toLowerCase();
    if (status !== 'requested') {
      continue;
    }

    if (rawRide?.driverId) {
      continue;
    }

    const normalized = normalizeRealtimeRide(rideId, rawRide);

    let distanceMeters: number | undefined;
    if (
      hasCoords &&
      normalized.origin?.lat !== undefined &&
      normalized.origin?.lng !== undefined
    ) {
      distanceMeters = Math.round(
        haversineDistanceMeters(
          latitude as number,
          longitude as number,
          normalized.origin.lat,
          normalized.origin.lng,
        ),
      );

      if (radiusMeters !== undefined && distanceMeters > radiusMeters) {
        continue;
      }
    }

    const rideVehicleType =
      normalized.vehicleType ??
      normalizeVehicleType(rawRide?.vehicleType ?? rawRide?.vehicle_type) ??
      'auto';
    const rideDesignatedVehicle =
      normalized.designatedDriverVehicle ??
      normalizeDesignatedDriverVehicle(rawRide?.designatedDriverVehicle ?? rawRide?.designated_driver_vehicle);

    const compatibility = checkVehicleCompatibility({
      rideVehicleType,
      rideDesignatedDriverVehicle: rideDesignatedVehicle,
      driverVehicleType,
      driverIsDesignatedDriverMode,
    });

    if (!compatibility.ok) {
      console.log(
        `  ⏭️ Saltando: vehículo incompatible (${compatibility.reason || 'unknown'}) para viaje ${rideId}`,
      );
      continue;
    }

    rides.push({
      id: normalized.id,
      status: normalized.status,
      clientId: normalized.clientId,
      clientName: normalized.clientName,
      clientPhone: normalized.clientPhone,
      client: normalized.client,
      origin: normalized.origin,
      clientComment: normalized.clientComment,
      destination: normalized.destination,
      extraDestinations: normalized.extraDestinations,
      estimatedPrice: normalized.estimatedPrice,
      estimatedDistance: normalized.estimatedDistance,
      estimatedDuration: normalized.estimatedDuration,
      clientSuggestedPrice: normalized.clientSuggestedPrice,
      driverOfferedPrice: normalized.driverOfferedPrice,
      passengers: normalized.passengers,
      rideType: normalized.rideType,
      paymentMethod: normalized.paymentMethod,
      vehicleType: normalized.vehicleType,
      designatedDriverVehicle: normalized.designatedDriverVehicle,
      serviceId: normalized.serviceId,
      clientVehiclePhoto: normalized.clientVehiclePhoto,
      negotiationStatus: normalized.negotiationStatus,
      rejections: normalized.rejections?.[uid]
        ? { [uid]: normalized.rejections[uid] }
        : undefined,
      requestedAt: normalized.requestedAt,
      createdAt: normalized.requestedAt,
      updatedAt: normalized.updatedAt,
      waypointsCount: normalized.waypointsCount,
      hasMultipleDestinations: normalized.hasMultipleDestinations,
      distanceMeters,
    });
  }

  rides.sort((a, b) => {
    const distA = a.distanceMeters ?? Number.MAX_SAFE_INTEGER;
    const distB = b.distanceMeters ?? Number.MAX_SAFE_INTEGER;
    if (distA !== distB) {
      return distA - distB;
    }

    const timeA = typeof a.requestedAt === 'number' ? a.requestedAt : 0;
    const timeB = typeof b.requestedAt === 'number' ? b.requestedAt : 0;
    return timeB - timeA;
  });

  const limited = rides.slice(0, limit);
  const clientIds = Array.from(new Set(
    limited.map((ride) => typeof ride.clientId === 'string' ? ride.clientId : '').filter(Boolean),
  ));
  const clientProfiles = clientIds.length
    ? await admin.firestore().getAll(...clientIds.map((clientId) => admin.firestore().doc(`users/${clientId}`)))
    : [];
  const clientPhotos = new Map<string, string | null>();

  clientProfiles.forEach((snapshot) => {
    const profile = snapshot.data();
    const photoUrl =
      profile?.photoUrl ?? profile?.photoURL ?? profile?.profilePhoto ?? profile?.profile_photo ??
      profile?.avatarUrl ?? profile?.avatarURL ?? profile?.avatar_url ?? profile?.photo_url ?? profile?.avatar;
    clientPhotos.set(snapshot.id, typeof photoUrl === 'string' && photoUrl.trim() ? photoUrl.trim() : null);
  });

  const ridesWithClientProfiles = limited.map((ride) => ({
    ...ride,
    client: {
      ...ride.client,
      photoUrl: clientPhotos.get(ride.clientId) ?? ride.client?.photoUrl ?? null,
    },
  }));

  console.log('[getAvailableRides] Respondiendo a solicitud', {
    auth: uid,
    totalFound: rides.length,
    returned: limited.length,
    hasCoords,
    radiusKm: hasCoords ? radiusKm : null,
    limit,
    serviceAreaId,
    usedPath,
  });

  return {
    success: true,
    rides: ridesWithClientProfiles,
    total: rides.length,
    limit,
  };
});

// Legacy penalties desactivado por migración a PuntoExpress RechargeFunds.
// Se mantiene comentado para rollback rápido si fuera necesario.
/*
const updateDriverPenaltySummary = async (driverId: string) => {
  try {
    const penalties = await penaltyRepo.findByDriverId(driverId);
    const list = Array.isArray(penalties) ? penalties : [];
    const pendingOnly = list.filter((p: any) => String(p.status).toLowerCase() === 'pending');
    const pendingCount = pendingOnly.length;
    const pendingAmount = pendingOnly.reduce(
      (sum: number, item: any) => sum + parseFloat(String(item.amount || 0)),
      0,
    );

    if (MIGRATION_FLAGS.MIRROR_PENALTIES_TO_RTDB) {
      await admin
        .database()
        .ref(`driverPenalties/${driverId}/summary`)
        .update({
          pendingCount,
          pendingAmount: Number(pendingAmount.toFixed(2)),
          updatedAt: admin.database.ServerValue.TIMESTAMP,
        });
    }
  } catch (summaryErr) {
    console.warn('⚠️ [rides] Error actualizando resumen de penalizaciones:', summaryErr);
  }
};

const ensureDriverPenalty = async (options: {
  driverId?: string | null;
  rideId: string;
  amount: number;
  penaltyType: string;
  reason: string;
}) => {
  const { driverId, rideId, amount, penaltyType, reason } = options;
  const normalizedAmount = Number(Number(amount || 0).toFixed(2));
  if (!driverId || !rideId || normalizedAmount <= 0) {
    return;
  }

  try {
    const existingPenalty = await penaltyRepo.findByRideId(rideId);
    if (existingPenalty) {
      await penaltyRepo.update(existingPenalty.id, {
        amount: normalizedAmount,
        penalty_type: penaltyType,
        reason,
        status: 'pending',
      });
    } else {
      await penaltyRepo.create({
        driver_id: driverId,
        ride_id: rideId,
        penalty_type: penaltyType,
        amount: normalizedAmount,
        reason,
        status: 'pending',
      });
    }

    await updateDriverPenaltySummary(driverId);
  } catch (penaltyErr) {
    console.error('⚠️ [rides] Error asegurando penalización:', penaltyErr);
  }
};
*/

/**
 * Marcar conductor en camino (driver_on_route)
 */
export const markDriverOnRoute = functions.https.onCall(async (data, context) => {
  await requireDriver(context);
  // Enforce single-session
  await ensureActiveSession(context, data);

  try {
    const { rideId } = data;
    const driverId = context.auth!.uid;

    if (!rideId) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
    }

    console.log(`🚕 [markDriverOnRoute] Driver ${driverId} marcando viaje ${rideId} como en camino`);

    const snapshot = await db.ref(`activeRides/${rideId}`).once('value');
    const rideData = snapshot.val();

    if (!rideData) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado en Firebase');
    }

    // Ownership estricto: sin driverId asignado el viaje aún no pertenece a
    // nadie — un conductor cualquiera no puede auto-asignarse marcando "en camino".
    if (!rideData.driverId || rideData.driverId !== driverId) {
      throw new functions.https.HttpsError('permission-denied', 'No eres el conductor asignado a este viaje');
    }

    if (rideData.status === 'driver_on_route') {
      console.log(`🔁 [markDriverOnRoute] Viaje ${rideId} ya está en driver_on_route`);
      return {
        success: true,
        ride: { id: rideId, status: rideData.status, driverId },
        message: 'Viaje ya estaba marcado como en camino',
      };
    }

    // Según el state machine solo 'accepted → driver_on_route' es válida:
    // 'driver_offered' requiere primero la confirmación del cliente.
    if (rideData.status !== 'accepted') {
      throw new functions.https.HttpsError('failed-precondition', `Estado actual (${rideData.status}) no permite marcar en camino`);
    }

    const driverOnRouteAt = new Date();
    await rideService.markDriverOnRoute(rideId, driverId, {
      driver_on_route_at: driverOnRouteAt,
    });

    const firebaseUpdate: any = {
      status: 'driver_on_route',
      driverId,
      driverOnRouteAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      clientSuggestedPrice: rideData.clientSuggestedPrice || null,
      driverOfferedPrice: rideData.driverOfferedPrice || null,
      negotiationStatus: rideData.negotiationStatus || null,
    };

    if (rideData.driver) {
      firebaseUpdate.driver = rideData.driver;
    }
    if (rideData.vehicle) {
      firebaseUpdate.vehicle = rideData.vehicle;
    }

    await db.ref(`activeRides/${rideId}`).update(firebaseUpdate);
    console.log(`✅ [markDriverOnRoute] Viaje ${rideId} actualizado en Firebase`);

    // ✅ NUEVO: Marcar conductor como BUSY
    try {
      await db.ref(`driverLocations/${driverId}`).update({
        status: 'busy',
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });
    } catch (busyErr) {
      console.warn('⚠️ [markDriverOnRoute] No se pudo marcar BUSY en driverLocations:', busyErr instanceof Error ? busyErr.message : String(busyErr));
    }

    await notifyUserSafe(rideData.clientId, '🚗 Conductor en camino', 'Tu conductor se dirige al punto de recogida.', {
      rideId,
      driverId,
    }, {
      type: 'ride_driver_on_route',
    });

    await notifyLiveRideUpdateSafe({
      userId: rideData.clientId,
      rideId,
      status: 'driver_on_route',
      driverName: rideData?.driver?.name || rideData?.driverName || null,
    });

    await safeLogRideEvent(AnalyticsEvents.RIDE_DRIVER_ON_ROUTE, rideId, driverId, {
      previousStatus: rideData.status,
    });
    return {
      success: true,
      ride: { id: rideId, status: 'driver_on_route', driverId },
      message: 'Viaje marcado como conductor en camino',
    };
  } catch (error: any) {
    console.error('❌ [markDriverOnRoute] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Crear viaje - Versión mejorada que acepta datos del Frontend
 */
export const createRide = functions.https.onCall(async (data, context) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚗 [createRide] INICIANDO CREACIÓN DE VIAJE`);
  console.log(`🚗 [createRide] Timestamp: ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}\n`);

  await requireClient(context);
  // Enforce single-session
  await ensureActiveSession(context, data);
  try {
    const clientId = context.auth!.uid;
    // Validar payload con Zod
    const validatedData = validateData<CreateRideRequest>(CreateRideRequestSchema, data);
    const normalizedClientComment = validatedData.clientComment ?? validatedData.comment ?? validatedData.notes ?? null;
    const normalizedNotes = validatedData.notes ?? validatedData.clientComment ?? validatedData.comment ?? null;
    console.log(`👤 [createRide] Cliente ID: ${clientId}`);
    console.log(`📦 [createRide] Data recibida:`, JSON.stringify(data, null, 2));
    
    // Extraer datos del Frontend (ya validados)
    const {
      origin,
      destination,
      estimatedDistance,
      estimatedDuration,
      estimatedPrice,
      rideType = 'normal',
      vehicleType = 'auto',
      designatedDriverVehicle,
      passengers = 1,
      clientVehiclePhoto: clientVehiclePhotoRaw,
    } = validatedData;

    const clientVehiclePhoto = typeof clientVehiclePhotoRaw === 'string' && clientVehiclePhotoRaw.trim().length > 0
      ? clientVehiclePhotoRaw.trim()
      : null;

    const biometricAcceptanceRequired = data.biometric_acceptance_required ?? data.biometricAcceptanceRequired ?? false;
    const biometricAcceptanceType = data.biometric_acceptance_type ?? data.biometricAcceptanceType ?? null;
    const biometricAcceptanceVerified = data.biometric_acceptance_verified ?? data.biometricAcceptanceVerified ?? false;
    const biometricAcceptanceAt = data.biometric_acceptance_at ?? data.biometricAcceptanceAt ?? null;

    // Validar datos requeridos
    if (!origin || !destination || !estimatedPrice) {
      throw new functions.https.HttpsError('invalid-argument', 'origin, destination y estimatedPrice son requeridos');
    }

    // ✅ Idempotencia: el cliente solo puede tener un viaje activo.
    // Evita duplicados por doble-tap/retry en el frontend.
    const activeRides = await rideRepo.findActiveByClientId(clientId);
    if (activeRides.length > 0) {
      console.warn(`⚠️ [createRide] Cliente ${clientId} ya tiene viaje activo: ${activeRides[0].id} (${activeRides[0].status})`);
      throw new functions.https.HttpsError('failed-precondition', 'CLIENT_HAS_ACTIVE_RIDE', {
        code: 'CLIENT_HAS_ACTIVE_RIDE',
        existingRideId: activeRides[0].id,
        existingStatus: activeRides[0].status,
      });
    }

    // Verificar si el cliente ya tiene un viaje programado que entre en conflicto con este horario inmediato
    const now = Date.now();
    const programmedConflict = await findConflictingProgrammedRideForClient(clientId, now);
    if (programmedConflict) {
      throw new functions.https.HttpsError('failed-precondition', 'CLIENT_PROGRAMMED_RIDE_CONFLICT', {
        code: 'CLIENT_PROGRAMMED_RIDE_CONFLICT',
        existingRideId: programmedConflict.rideId,
        existingScheduledAt: programmedConflict.scheduledAt,
      });
    }

    console.log(`🚗 [createRide] Creando viaje para cliente: ${clientId}`);
    console.log(`📋 [createRide] Datos recibidos:`, {
      rideType: data.rideType,
      vehicleType: data.vehicleType,
      serviceId: data.serviceId,
      clientSuggestedPrice: data.clientSuggestedPrice,
    });

    // Preparar paradas extras (waypoints)
    const extraDestinations = data.extraDestinations || [];
    console.log(`📍 [createRide] Paradas extras recibidas: ${extraDestinations.length}`);

    if (IS_LOAD_TEST) {
      const rideRef = db.ref('activeRides').push();
      const rideId = rideRef.key as string;

      const firebaseRideData: any = {
        id: rideId,
        clientId,
        status: 'requested',
        origin: {
          lat: origin.lat,
          lng: origin.lng,
          address: origin.address || 'Ubicación de origen',
        },
        destination: {
          lat: destination.lat,
          lng: destination.lng,
          address: destination.address || 'Ubicación de destino',
        },
        estimatedPrice,
        estimatedDistance,
        estimatedDuration,
        rideType,
        vehicleType,
        passengers,
        paymentMethod: data.paymentMethod || 'cash',
        clientVehiclePhoto,
        clientSuggestedPrice: data.clientSuggestedPrice || null,
        driverOfferedPrice: null,
        negotiationStatus: data.clientSuggestedPrice ? 'client_suggested' : null,
        clientComment: normalizedClientComment,
        notes: normalizedNotes,
        createdAt: admin.database.ServerValue.TIMESTAMP,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      };

      if (extraDestinations.length > 0) {
        firebaseRideData.extraDestinations = extraDestinations;
        firebaseRideData.hasMultipleDestinations = true;
        firebaseRideData.waypointsCount = extraDestinations.length;
        console.log(`✅ [createRide][LOADTEST] ${extraDestinations.length} paradas agregadas a Firebase`);
      } else {
        firebaseRideData.hasMultipleDestinations = false;
        firebaseRideData.waypointsCount = 0;
      }

      await db.ref(`activeRides/${rideId}`).set(firebaseRideData);
      console.log(`✅ [createRide][LOADTEST] Viaje fake sincronizado a Firebase: activeRides/${rideId}`);

      try {
        await db.ref(`paymentStatus/${rideId}`).set({
          status: 'pending',
          amount: estimatedPrice,
          paymentMethod: data.paymentMethod || 'cash',
          createdAt: admin.database.ServerValue.TIMESTAMP,
        });
        console.log(`✅ [createRide][LOADTEST] paymentStatus creado para viaje fake`);
      } catch (firebaseError: any) {
        console.error(`⚠️ [createRide][LOADTEST] Error creando paymentStatus (no es crítico):`, firebaseError.message);
      }

      await notifyUserSafe(clientId, '🚗 Solicitud enviada', 'Estamos buscando un conductor para tu viaje', {
        rideId,
      }, {
        type: 'ride_requested',
      });

      return {
        success: true,
        ride: {
          id: rideId,
          firebaseRideId: rideId,
          status: 'requested',
          createdAt: new Date(),
          clientId,
          origin,
          destination,
          estimatedPrice,
          rideType,
          vehicleType,
          passengers,
        },
      };
    }

    // ✅ NUEVO: Mapear vehicleType a service_id
    let serviceId = data.serviceId || null;
    if (!serviceId && vehicleType) {
      // Mapear vehicleType a código de servicio
      const serviceCodeMap: {[key: string]: string} = {
        'auto': 'normal',
        'moto': 'motorcycle',
        'designated_driver': 'designated_driver',
      };
      const serviceCode = serviceCodeMap[vehicleType];
      
      if (serviceCode) {
        try {
          const Service = require('../sequelize/models/Service').default;
          const service = await Service.findOne({ where: { code: serviceCode } });
          if (service) {
            serviceId = service.id;
            console.log(`✅ [createRide] Service encontrado: ${serviceCode} -> ${serviceId}`);
          }
        } catch (err: any) {
          console.warn(`⚠️ [createRide] Error buscando servicio: ${err.message}`);
        }
      }
    }

    // Enriquecer con datos del cliente (nombre/teléfono) desde Realtime DB
    let clientProfile: Awaited<ReturnType<typeof fetchClientProfileFromRealtime>> | null = null;
    try {
      clientProfile = await fetchClientProfileFromRealtime(clientId);
    } catch (profileErr) {
      console.warn('[createRide] No se pudo obtener perfil de cliente', {
        clientId,
        error: profileErr instanceof Error ? profileErr.message : String(profileErr),
      });
    }

    // Guardar en Sequelize (PostgreSQL)
    // ✅ IMPORTANTE: Usar nombres de columnas exactos del schema
    const ride = await rideService.createRide({
      firebase_ride_id: '', // Se actualizará después con el ID real
      client_id: clientId,
      driver_id: null, // Sin conductor asignado aún
      estimated_distance: estimatedDistance,  // ✅ Correcto: estimated_distance
      estimated_duration: estimatedDuration,  // ✅ Correcto: estimated_duration
      estimated_price: estimatedPrice,
      passengers: passengers,
      notes: normalizedNotes,
      ride_type: rideType,
      vehicle_type: vehicleType,
      designated_driver_vehicle: designatedDriverVehicle ?? null,
      payment_type: data.paymentMethod || 'cash',  // ✅ Correcto: payment_type
      biometric_acceptance_required: biometricAcceptanceRequired,
      biometric_acceptance_type: biometricAcceptanceType,
      biometric_acceptance_verified: biometricAcceptanceVerified,
      biometric_acceptance_at: biometricAcceptanceAt,
      status: 'requested',
      service_id: serviceId,  // ✅ NUEVO: service_id mapeado desde vehicleType
      client_vehicle_photo: clientVehiclePhoto,
    });

    console.log(`✅ [createRide] Viaje creado en Sequelize: ${ride.id}`);

    // Crear ubicaciones en ride_locations
    console.log(`📍 [createRide] Creando ubicaciones para viaje: ${ride.id}`);
    let originLocationId: string | null = null;
    let destinationLocationId: string | null = null;
    
    try {
      let locationOrder = 1;
      
      // Crear ubicación de origen
      const originLocation = await locationRepo.create({
        ride_id: ride.id,
        location_type: 'origin',
        location_order: locationOrder++,
        latitude: origin.lat,
        longitude: origin.lng,
        address: origin.address || 'Ubicación de origen',
      });
      originLocationId = originLocation.id;
      console.log(`✅ [createRide] Ubicación de origen creada: ${originLocationId}`);

      // Crear ubicaciones para paradas intermedias (waypoints)
      if (extraDestinations.length > 0) {
        console.log(`📍 [createRide] Creando ${extraDestinations.length} paradas intermedias...`);
        for (const waypoint of extraDestinations) {
          try {
            const waypointLocation = await locationRepo.create({
              ride_id: ride.id,
              location_type: 'waypoint',
              location_order: locationOrder++,
              latitude: waypoint.lat,
              longitude: waypoint.lng,
              address: waypoint.address || `Parada ${locationOrder - 2}`,
            });
            console.log(`✅ [createRide] Parada intermedia creada: ${waypointLocation.id}`);
          } catch (waypointError: any) {
            console.error(`⚠️ [createRide] Error creando parada intermedia:`, waypointError.message);
          }
        }
      }

      // Crear ubicación de destino
      const destinationLocation = await locationRepo.create({
        ride_id: ride.id,
        location_type: 'destination',
        location_order: locationOrder++,
        latitude: destination.lat,
        longitude: destination.lng,
        address: destination.address || 'Ubicación de destino',
      });
      destinationLocationId = destinationLocation.id;
      console.log(`✅ [createRide] Ubicación de destino creada: ${destinationLocationId}`);
      
      // Actualizar ride con los IDs de ubicaciones y contador de paradas
      console.log(`🔗 [createRide] Actualizando ride con IDs de ubicaciones...`);
      await rideRepo.update(ride.id, {
        origin_location_id: originLocationId,
        destination_location_id: destinationLocationId,
        waypoints_count: extraDestinations.length,
        has_multiple_stops: extraDestinations.length > 0,
      });
      console.log(`✅ [createRide] Ride actualizado con IDs de ubicaciones y ${extraDestinations.length} paradas`);
    } catch (locationError: any) {
      console.error(`⚠️ [createRide] Error creando ubicaciones:`, locationError.message);
      // No lanzar error - el viaje ya está creado
    }

    // Sincronizar a Firebase Realtime DB - activeRides (COMPLETO)
    console.log(`🔥 [createRide] Sincronizando a Firebase Realtime DB...`);
    
    const firebaseRideData: any = {
      id: ride.id,
      clientId: clientId,
      clientName: clientProfile?.fullName ?? null,
      status: 'requested',
      clientVehiclePhoto,
      origin: {
        lat: origin.lat,
        lng: origin.lng,
        address: origin.address || 'Ubicación de origen',
      },
      destination: {
        lat: destination.lat,
        lng: destination.lng,
        address: destination.address || 'Ubicación de destino',
      },
      estimatedPrice,
      estimatedDistance,
      estimatedDuration,
      rideType,
      vehicleType,
      designatedDriverVehicle: designatedDriverVehicle ?? null,
      passengers,
      paymentMethod: data.paymentMethod || 'cash',
      // ✅ NUEVO: Campos para negociación de precios
      clientSuggestedPrice: data.clientSuggestedPrice || null,
      driverOfferedPrice: null,
      negotiationStatus: data.clientSuggestedPrice ? 'client_suggested' : null,
      clientComment: normalizedClientComment,
      notes: normalizedNotes,
      createdAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    };
    
    // Agregar paradas extras si existen
    if (extraDestinations.length > 0) {
      firebaseRideData.extraDestinations = extraDestinations;
      firebaseRideData.hasMultipleDestinations = true;
      firebaseRideData.waypointsCount = extraDestinations.length;
      console.log(`✅ [createRide] ${extraDestinations.length} paradas agregadas a Firebase`);
    } else {
      firebaseRideData.hasMultipleDestinations = false;
      firebaseRideData.waypointsCount = 0;
    }

    try {
      await db.ref(`activeRides/${ride.id}`).set(firebaseRideData);
      console.log(`✅ [createRide] Viaje sincronizado a Firebase: activeRides/${ride.id}`);
      
      // ✅ NUEVO: Actualizar firebase_ride_id en PostgreSQL
      await rideRepo.update(ride.id, {
        firebase_ride_id: ride.id,
      });
      console.log(`✅ [createRide] firebase_ride_id guardado en PostgreSQL: ${ride.id}`);
      
      // Crear paymentStatus inicial
      console.log(`💳 [createRide] Creando paymentStatus...`);
      await db.ref(`paymentStatus/${ride.id}`).set({
        status: 'pending',
        amount: estimatedPrice,
        paymentMethod: data.paymentMethod || 'cash',
        createdAt: admin.database.ServerValue.TIMESTAMP,
      });
      console.log(`✅ [createRide] paymentStatus creado`);
    } catch (firebaseError: any) {
      console.error(`⚠️ [createRide] Error sincronizando a Firebase (no es crítico):`, firebaseError.message);
      // No lanzar error - el viaje ya está en Supabase
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ [createRide] VIAJE CREADO EXITOSAMENTE`);
    console.log(`✅ [createRide] ID: ${ride.id}`);
    console.log(`✅ [createRide] Status: ${ride.status}`);
    console.log(`✅ [createRide] Client: ${clientId}`);
    console.log(`${'='.repeat(60)}\n`);

    await notifyUserSafe(clientId, '🚗 Solicitud enviada', 'Estamos buscando un conductor para tu viaje', {
      rideId: ride.id,
    }, {
      type: 'ride_requested',
    });

    const resultPayload = {
      success: true,
      ride: {
        id: ride.id,
        firebaseRideId: ride.firebase_ride_id,
        status: ride.status,
        createdAt: ride.created_at,
        clientId,
        origin,
        destination,
        estimatedPrice,
        rideType,
        vehicleType,
        passengers,
      },
    };

    await safeLogRideEvent(AnalyticsEvents.RIDE_REQUESTED, ride.id, clientId, {
      estimatedPrice,
      rideType,
      vehicleType,
      passengers,
      waypointsCount: extraDestinations.length,
      hasMultipleStops: extraDestinations.length > 0,
      serviceId,
    });

    return resultPayload;
  } catch (error: any) {
    console.error(`\n${'='.repeat(60)}`);
    console.error(`❌ [createRide] ERROR`);
    console.error(`❌ [createRide] Mensaje:`, error.message);
    console.error(`❌ [createRide] Stack:`, error.stack);
    console.error(`${'='.repeat(60)}\n`);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Aceptar viaje
 */
export const acceptRide = functions.https.onCall(async (data, context) => {
  await requireDriver(context);
  // Enforce single-session
  await ensureActiveSession(context, data);
  try {
    const { rideId, vehicleId } = validateData<AcceptRide>(AcceptRideSchema, data);
    const driverId = context.auth!.uid;
    let driverRealtimeInfo: any = null;
    console.log(`✅ [acceptRide] Aceptando viaje: ${rideId} por conductor: ${driverId}`);
    
    // ✅ NUEVO: Obtener datos del viaje desde Firebase ANTES de aceptar
    console.log(`🔍 [acceptRide] Obteniendo datos del viaje desde Firebase...`);
    let firebaseRideData: any = null;
    try {
      const firebaseRideSnapshot = await db.ref(`activeRides/${rideId}`).once('value');
      firebaseRideData = firebaseRideSnapshot.val();
      if (firebaseRideData) {
        console.log(`✅ [acceptRide] Datos de Firebase obtenidos:`, {
          serviceId: firebaseRideData.serviceId,
          vehicleType: firebaseRideData.vehicleType,
          status: firebaseRideData.status,
          driverId: firebaseRideData.driverId,
        });
      }
    } catch (err: any) {
      console.warn(`⚠️ [acceptRide] Error obteniendo datos de Firebase:`, err.message);
    }

    if (!firebaseRideData) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado en Firebase');
    }

    if (firebaseRideData.driverId && firebaseRideData.driverId !== driverId && firebaseRideData.status !== 'requested') {
      throw new functions.https.HttpsError('failed-precondition', 'El viaje ya fue asignado a otro conductor');
    }

    const rideVehicleType =
      normalizeVehicleType(firebaseRideData.vehicleType ?? firebaseRideData.vehicle_type) ?? 'auto';
    const rideDesignatedVehicle = normalizeDesignatedDriverVehicle(
      firebaseRideData.designatedDriverVehicle ?? firebaseRideData.designated_driver_vehicle,
    );

    let driverVehicleTypeRaw: string | null = null;
    let driverIsDesignatedDriverMode = false;
    try {
      const driverInfoSnapshot = await db.ref(`driversInfo/${driverId}`).once('value');
      driverRealtimeInfo = driverInfoSnapshot.val();
      driverVehicleTypeRaw =
        driverRealtimeInfo?.vehicle?.type ??
        driverRealtimeInfo?.vehicleType ??
        driverRealtimeInfo?.vehicle_type ??
        driverRealtimeInfo?.currentVehicle?.type ??
        null;
      driverIsDesignatedDriverMode = Boolean(driverRealtimeInfo?.isDesignatedDriverMode);
    } catch (driverInfoError: any) {
      console.warn(
        '⚠️ [acceptRide] Error obteniendo driversInfo para compatibilidad:',
        driverInfoError?.message || driverInfoError,
      );
    }

    const compatibility = checkVehicleCompatibility({
      rideVehicleType,
      rideDesignatedDriverVehicle: rideDesignatedVehicle,
      driverVehicleType: driverVehicleTypeRaw,
      driverIsDesignatedDriverMode,
    });

    if (!compatibility.ok) {
      const reasonMessageMap: Record<string, string> = {
        designated_mode_required: 'Debes activar el modo de conductor designado para aceptar este viaje.',
        designated_vehicle_mismatch:
          'Tu vehículo no coincide con el requerido para este servicio de conductor designado.',
        moto_vehicle_required: 'Este viaje solo está disponible para motos.',
        auto_vehicle_required: 'Este viaje requiere un vehículo de cuatro ruedas.',
      };
      const message = reasonMessageMap[compatibility.reason ?? ''] || 'Tu vehículo no es compatible con este viaje.';
      throw new functions.https.HttpsError('failed-precondition', message);
    }

    if (IS_LOAD_TEST) {
      const currentData = firebaseRideData || {};
      let newStatus = 'accepted';

      if (!currentData.clientSuggestedPrice && !currentData.driverOfferedPrice) {
        newStatus = 'driver_offered';
      }

      const updateData: any = {
        status: newStatus,
        driverId,
        acceptedAt: currentData.acceptedAt || admin.database.ServerValue.TIMESTAMP,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
        clientSuggestedPrice: currentData.clientSuggestedPrice || null,
        driverOfferedPrice: currentData.driverOfferedPrice || null,
        negotiationStatus: currentData.negotiationStatus || null,
        extraDestinations: currentData.extraDestinations || null,
        hasMultipleDestinations: currentData.hasMultipleDestinations || false,
        waypointsCount: currentData.waypointsCount || 0,
      };

      await db.ref(`activeRides/${rideId}`).update(updateData);

      try {
        await db.ref(`paymentStatus/${rideId}`).update({
          status: 'pending',
          updatedAt: admin.database.ServerValue.TIMESTAMP,
        });
      } catch (paymentErr: any) {
        console.warn('⚠️ [acceptRide][LOADTEST] Error actualizando paymentStatus:', paymentErr.message || paymentErr);
      }

      console.log(`✅ [acceptRide][LOADTEST] Viaje aceptado sin Supabase: ${rideId}`);

      await safeLogRideEvent(AnalyticsEvents.RIDE_ACCEPTED, rideId, driverId, { loadTest: true, status: newStatus });
      return { success: true, ride: { id: rideId, status: newStatus, driverId } };
    }

    const stableStatuses = ['driver_offered', 'accepted', 'driver_on_route', 'in_progress', 'pending_payment', 'completed'];
    if (firebaseRideData.driverId === driverId && stableStatuses.includes(firebaseRideData.status)) {
      console.log(`🔁 [acceptRide] Viaje ${rideId} ya está gestionado por este conductor en estado ${firebaseRideData.status}`);
      return { success: true, ride: { id: rideId, status: firebaseRideData.status, driverId } };
    }

    // Legacy penalties desactivado por migración a PuntoExpress RechargeFunds.
    // El bloqueo por saldo se realiza con wallet/rechargeFunds en preflight + front driver.

    // ✅ NUEVO: Verificar que el conductor no esté BUSY
    try {
      const driverLocSnap = await db.ref(`driverLocations/${driverId}`).once('value');
      const driverStatus = String(driverLocSnap.val()?.status || '').toLowerCase();
      if (driverStatus === 'busy') {
        throw new functions.https.HttpsError('failed-precondition', 'DRIVER_BUSY');
      }
    } catch (locErr: any) {
      if (locErr instanceof functions.https.HttpsError) throw locErr;
      console.warn('⚠️ [acceptRide] Error verificando driverLocations:', locErr?.message || locErr);
    }

    const ride = await rideService.acceptRide(rideId, driverId, firebaseRideData?.serviceId);
    if (!ride) {
      throw new functions.https.HttpsError('internal', 'Error al aceptar el viaje');
    }
    const newStatus = ride.status;
    
    // Obtener datos del conductor y vehículo
    console.log(`👤 [acceptRide] Obteniendo datos del conductor...`);
    let driverData: any = null;
    let vehicleData: any = null;
    
    let designatedVehiclePhoto: string | null = null;

    try {
      const driver = await driverRepo.findByUserId(driverId);
      let driverName: string | null = null;

      if (driver) {
        const driverJson: Record<string, any> = driver.toJSON ? driver.toJSON() : (driver as Record<string, any>);
        const firstName = driverJson.first_name || driverJson.firstName || '';
        const lastName = driverJson.last_name || driverJson.lastName || '';
        const fullName = `${firstName} ${lastName}`.trim();
        if (fullName.length > 0) {
          driverName = fullName;
        }
      }

      if (driver) {
        const safeName = driverName || 'Conductor';
        driverData = {
          id: driver.id,
          userId: driver.user_id,
          name: safeName,
          rating: driver.average_rating || 0,
          profilePhoto: driver.profile_photo,
        };
        console.log(`✅ [acceptRide] Datos del conductor obtenidos`);
      }
      
      // Obtener vehículo
      const driverCurrentVehicleId = (driver as Record<string, any> | null)?.current_vehicle_id ?? null;
      let supabaseVehicleId = vehicleId || driverCurrentVehicleId;
      if (!supabaseVehicleId) {
        const designatedVehicle = await vehicleRepo.findByDriverId(driverId);
        supabaseVehicleId = designatedVehicle?.[0]?.id ?? null;
      }

      if (vehicleId) {
        console.log(`🚗 [acceptRide] Obteniendo datos del vehículo realtime: ${vehicleId}`);
        const vehicleSnap = await db.ref(`vehicles/${vehicleId}`).once('value');
        if (vehicleSnap.exists()) {
          vehicleData = vehicleSnap.val();
          designatedVehiclePhoto = vehicleData?.vehiclePhoto || vehicleData?.photoURL || null;
          console.log(`✅ [acceptRide] Datos del vehículo realtime obtenidos`);
        }
      }

      if (!designatedVehiclePhoto && supabaseVehicleId) {
        try {
          const supabaseVehicle = await vehicleRepo.findById(supabaseVehicleId);
          designatedVehiclePhoto = supabaseVehicle?.vehicle_photo || null;
          if (supabaseVehicle && !vehicleData) {
            vehicleData = {
              id: supabaseVehicle.id,
              plate: supabaseVehicle.plate,
              brand: supabaseVehicle.brand,
              model: supabaseVehicle.model,
              color: supabaseVehicle.color,
              vehiclePhoto: supabaseVehicle.vehicle_photo,
              type: supabaseVehicle.type,
            };
          }
        } catch (vehicleErr) {
          console.warn('⚠️ [acceptRide] Error obteniendo vehículo de Supabase:', vehicleErr instanceof Error ? vehicleErr.message : String(vehicleErr));
        }
      }
    } catch (dataError: any) {
      console.warn(`⚠️ [acceptRide] Error obteniendo datos adicionales:`, dataError.message);
    }
    
    // Sincronizar a Firebase Realtime DB (COMPLETO)
    console.log(`🔥 [acceptRide] Sincronizando a Firebase...`);
    try {
      // Obtener datos actuales del viaje para preservar negociación
      const currentRide = await db.ref(`activeRides/${rideId}`).once('value');
      const currentData = currentRide.val() || {};

      if (currentData.driverId && currentData.driverId !== driverId && currentData.status !== 'requested') {
        throw new functions.https.HttpsError('failed-precondition', 'El viaje ya es gestionado por otro conductor');
      }

      // ✅ ACTUALIZADO: Determinar estado basado en si hay negociación
      // Si hay negociación (clientSuggestedPrice o driverOfferedPrice), mantener estado de negociación
      // Si no hay negociación, cambiar a 'driver_offered' para que el cliente vea la card del conductor
      let newStatus = 'accepted';
      if (!currentData.clientSuggestedPrice && !currentData.driverOfferedPrice) {
        // Sin negociación - cambiar a 'driver_offered' para que el cliente confirme
        newStatus = 'driver_offered';
        console.log(`✅ [acceptRide] Sin negociación previa, estado: 'driver_offered'`);
      } else {
        // Con negociación - mantener estado actual
        newStatus = 'accepted';
        console.log(`✅ [acceptRide] Con negociación previa, estado: 'accepted'`);
      }
      
      const updateData: any = {
        status: newStatus,
        driverId,
        acceptedAt: currentData.acceptedAt || admin.database.ServerValue.TIMESTAMP,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
        // ✅ NUEVO: Preservar campos de negociación
        clientSuggestedPrice: currentData.clientSuggestedPrice || null,
        driverOfferedPrice: currentData.driverOfferedPrice || null,
        negotiationStatus: currentData.negotiationStatus || null,
        // ✅ NUEVO: Preservar paradas extras y múltiples destinos
        extraDestinations: currentData.extraDestinations || null,
        hasMultipleDestinations: currentData.hasMultipleDestinations || false,
        waypointsCount: currentData.waypointsCount || 0,
      };
      
      if (driverData) {
        updateData.driver = driverData;
      }
      
      if (vehicleData) {
        updateData.vehicle = vehicleData;
      }

      if (!updateData.designatedDriverVehiclePhoto && designatedVehiclePhoto) {
        updateData.designatedDriverVehiclePhoto = designatedVehiclePhoto;
      }
      
      if (currentData.driverId === driverId && currentData.status === newStatus) {
        console.log(`🔁 [acceptRide] Viaje ${rideId} ya estaba en estado ${newStatus} para este conductor`);
      } else {
        await db.ref(`activeRides/${rideId}`).update(updateData);
        console.log(`✅ [acceptRide] Viaje sincronizado a Firebase con status: ${newStatus}`);
      }

      if (newStatus === 'driver_offered' && currentData.status !== 'driver_offered') {
        await notifyUserSafe(currentData.clientId, '🚗 Conductor disponible', 'Un conductor está listo para tu viaje. Revísalo ahora.', {
          rideId,
          driverId,
        }, {
          type: 'ride_driver_offered',
        });
      }
      
      // ✅ NUEVO: Guardar oferta del conductor en offers/{driverId}
      console.log(`💰 [acceptRide] Guardando oferta del conductor en offers...`);
      try {
        const offerPrice = currentData.estimatedPrice || currentData.finalFare || 0;
        const existingOffer = currentData.offers?.[driverId] || null;

        // Obtener datos completos del conductor desde driversInfo
        let driverInfo: any = driverRealtimeInfo;
        if (!driverInfo) {
          try {
            const driverInfoSnapshot = await db.ref(`driversInfo/${driverId}`).once('value');
            driverInfo = driverInfoSnapshot.val();
          } catch (err) {
            console.warn(`⚠️ [acceptRide] Error obteniendo driversInfo:`, err);
          }
        }

        const offerDriverData = driverData || {
          id: driverId,
          name: driverInfo?.name || 'Conductor',
          rating: driverInfo?.rating || 0,
          photoURL: driverInfo?.photoURL || null,
        };

        const offerRef = db.ref(`activeRides/${rideId}/offers/${driverId}`);
        const offerUpdates: any = {
          offeredPrice: offerPrice,
          driver: offerDriverData,
          updatedAt: admin.database.ServerValue.TIMESTAMP,
        };

        if (!existingOffer) {
          offerUpdates.status = 'pending';
          offerUpdates.createdAt = admin.database.ServerValue.TIMESTAMP;
        } else {
          offerUpdates.status = existingOffer.status || 'pending';
        }

        await offerRef.update(offerUpdates);
        console.log(`✅ [acceptRide] Oferta del conductor guardada: C$${offerPrice}, Status: ${offerUpdates.status}`);
      } catch (offerError: any) {
        console.warn(`⚠️ [acceptRide] Error guardando oferta:`, offerError.message);
      }
      
      // Actualizar paymentStatus
      await db.ref(`paymentStatus/${rideId}`).update({
        status: 'pending',
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });

      // ✅ NUEVO: Marcar conductor como BUSY solo si el estado ya implica asignación efectiva
      try {
        if (newStatus !== 'driver_offered') {
          await db.ref(`driverLocations/${driverId}`).update({
            status: 'busy',
            updatedAt: admin.database.ServerValue.TIMESTAMP,
          });
        }
      } catch (busyErr) {
        console.warn('⚠️ [acceptRide] No se pudo marcar BUSY en driverLocations:', busyErr instanceof Error ? busyErr.message : String(busyErr));
      }
    } catch (firebaseError: any) {
      console.error(`⚠️ [acceptRide] Error sincronizando a Firebase:`, firebaseError.message);
    }
    
    await safeLogRideEvent(AnalyticsEvents.RIDE_ACCEPTED, rideId, driverId, {
      status: newStatus,
      serviceId: firebaseRideData?.serviceId || ride?.service_id || null,
      designatedDriverVehiclePhoto: designatedVehiclePhoto,
    });
    return { success: true, ride: { id: rideId, status: newStatus, driverId } };
  } catch (error: any) {
    console.error('❌ [acceptRide] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * ✅ NUEVO: Cliente confirma un conductor específico
 * Usado cuando el cliente acepta la oferta de un conductor
 */
export const confirmDriver = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  // Enforce single-session
  await ensureActiveSession(context, data);

  try {
    const { rideId, selectedDriverId } = data;
    const clientId = context.auth.uid;

    if (!rideId || !selectedDriverId) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId y selectedDriverId son requeridos');
    }

    console.log(`✅ [confirmDriver] Cliente ${clientId} confirmando conductor ${selectedDriverId} para viaje ${rideId}`);

    // Obtener datos del viaje
    const rideSnapshot = await db.ref(`activeRides/${rideId}`).once('value');
    const rideData = rideSnapshot.val();

    if (!rideData) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    if (rideData.clientId !== clientId) {
      throw new functions.https.HttpsError('permission-denied', 'No tienes permiso para confirmar este viaje');
    }

    if (rideData.driverId === selectedDriverId) {
      const stableStatuses = ['accepted', 'driver_on_route', 'in_progress', 'pending_payment', 'completed'];
      if (stableStatuses.includes(rideData.status)) {
        console.log(`🔁 [confirmDriver] Viaje ${rideId} ya estaba asignado a ${selectedDriverId} con estado ${rideData.status}`);
        return {
          success: true,
          message: 'Viaje ya asignado a este conductor',
          ride: {
            id: rideId,
            status: rideData.status,
            driverId: selectedDriverId,
          },
        };
      }
    }

    if (rideData.driverId && rideData.driverId !== selectedDriverId && rideData.status !== 'driver_offered') {
      throw new functions.https.HttpsError('failed-precondition', 'El viaje ya está asignado a otro conductor');
    }

    // ✅ Solo estados en los que el cliente puede confirmar un conductor
    const confirmableStatuses = ['requested', 'driver_offered', 'pending_confirm'];
    if (!confirmableStatuses.includes(rideData.status)) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `No se puede confirmar un conductor en estado: ${rideData.status}`
      );
    }

    // ✅ Seguridad: el conductor seleccionado debe tener una oferta registrada
    //    (aceptó el viaje, aceptó el precio del cliente o hizo contraoferta).
    const selectedOffer = rideData.offers?.[selectedDriverId];
    const hasValidOffer = !!selectedOffer && ['pending', 'accepted'].includes(
      String(selectedOffer.status || 'pending').toLowerCase(),
    );
    const isRideLevelDriver = rideData.driverId === selectedDriverId;
    if (!hasValidOffer && !isRideLevelDriver) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'El conductor seleccionado no tiene una oferta activa para este viaje'
      );
    }

    // ✅ NUEVO: Bloquear si el conductor está BUSY
    try {
      const locSnap = await db.ref(`driverLocations/${selectedDriverId}`).once('value');
      const status = String(locSnap.val()?.status || '').toLowerCase();
      if (status === 'busy') {
        throw new functions.https.HttpsError('failed-precondition', 'DRIVER_BUSY');
      }
    } catch (locErr: any) {
      if (locErr instanceof functions.https.HttpsError) throw locErr;
      console.warn('⚠️ [confirmDriver] Error verificando driverLocations:', locErr?.message || locErr);
    }

    // Obtener datos del conductor
    console.log(`👤 [confirmDriver] Obteniendo datos del conductor ${selectedDriverId}...`);
    let driverData: any = null;

    try {
      // Intentar buscar por user_id (Firebase Auth UID)
      let driver = await driverRepo.findByUserId(selectedDriverId);
      
      // Si no encuentra, intentar buscar por ID de Supabase
      if (!driver) {
        console.log(`⚠️ [confirmDriver] No encontrado por user_id, intentando por ID de Supabase...`);
        driver = await driverRepo.findById(selectedDriverId);
      }
      
      if (driver) {
        const driverJson: Record<string, any> = driver.toJSON ? driver.toJSON() : (driver as Record<string, any>);
        const firstName = driverJson.first_name || driverJson.firstName || '';
        const lastName = driverJson.last_name || driverJson.lastName || '';
        const fullName = `${firstName} ${lastName}`.trim();
        let safeName = fullName;
        if (!safeName && rideData?.driver && typeof rideData.driver.name === 'string') {
          safeName = rideData.driver.name;
        }
        if (!safeName) {
          safeName = 'Conductor';
        }

        driverData = {
          id: driver.id,
          userId: driver.user_id,
          name: safeName,
          rating: driver.average_rating || 0,
          profilePhoto: driver.profile_photo,
        };
        console.log(`✅ [confirmDriver] Datos del conductor obtenidos`);
      } else {
        console.warn(`⚠️ [confirmDriver] Conductor no encontrado en Supabase (userId: ${selectedDriverId})`);
        // Continuar sin datos del conductor - no es crítico
      }
    } catch (dataError: any) {
      console.warn(`⚠️ [confirmDriver] Error obteniendo datos del conductor:`, dataError.message);
      // Continuar sin datos del conductor - no es crítico
    }

    // Actualizar viaje en Firebase
    console.log(`🔥 [confirmDriver] Actualizando viaje en Firebase...`);
    const calculatedFinalFare = (() => {
      const candidates = [
        rideData.finalFare,
        rideData.driverOfferedPrice,
        rideData.clientSuggestedPrice,
        rideData.estimatedPrice,
      ];
      for (const value of candidates) {
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
          return Number(value.toFixed(2));
        }
      }
      return null;
    })();

    const updateData: any = {
      status: 'accepted',
      driverId: selectedDriverId,
      acceptedAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      clientConfirmationPending: false,
      // ✅ Preservar campos de negociación
      clientSuggestedPrice: rideData.clientSuggestedPrice || null,
      driverOfferedPrice: rideData.driverOfferedPrice || null,
      finalFare: calculatedFinalFare,
      // ✅ NUEVO: Preservar paradas extras y múltiples destinos
      extraDestinations: rideData.extraDestinations || null,
      hasMultipleDestinations: rideData.hasMultipleDestinations || false,
      waypointsCount: rideData.waypointsCount || 0,
    };

    if (driverData) {
      updateData.driver = driverData;
    }

    await db.ref(`activeRides/${rideId}`).update(updateData);
    console.log(`✅ [confirmDriver] Viaje actualizado en Firebase`);

    // ✅ NUEVO: Marcar conductor como BUSY
    try {
      await db.ref(`driverLocations/${selectedDriverId}`).update({
        status: 'busy',
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });
    } catch (busyErr) {
      console.warn('⚠️ [confirmDriver] No se pudo marcar BUSY en driverLocations:', busyErr instanceof Error ? busyErr.message : String(busyErr));
    }

    await notifyUserSafe(selectedDriverId, '✅ Viaje asignado', 'El cliente confirmó el viaje. Dirígete al punto de encuentro.', {
      rideId,
      clientId,
    }, {
      type: 'ride_assigned',
    });

    await notifyLiveRideUpdateSafe({
      userId: clientId,
      rideId,
      status: 'driver_assigned',
      driverName: driverData?.name || rideData?.driver?.name || null,
    });

    // ✅ NUEVO: Guardar oferta del conductor en offers/{driverId}
    console.log(`💰 [confirmDriver] Guardando oferta del conductor en offers...`);
    try {
      const offerPrice = calculatedFinalFare ?? rideData.driverOfferedPrice ?? rideData.estimatedPrice ?? 0;
      
      // Obtener datos completos del conductor desde driversInfo
      let driverInfo: any = null;
      try {
        const driverInfoSnapshot = await db.ref(`driversInfo/${selectedDriverId}`).once('value');
        driverInfo = driverInfoSnapshot.val();
      } catch (err) {
        console.warn(`⚠️ [confirmDriver] Error obteniendo driversInfo:`, err);
      }
      
      const offerDriverData = driverData || {
        id: selectedDriverId,
        name: driverInfo?.name || 'Conductor',
        rating: driverInfo?.rating || 0,
        photoURL: driverInfo?.photoURL || null,
      };
      
      const selectedOfferRef = db.ref(`activeRides/${rideId}/offers/${selectedDriverId}`);
      await selectedOfferRef.update({
        offeredPrice: offerPrice,
        status: 'accepted',
        driver: offerDriverData,
        acceptedAt: admin.database.ServerValue.TIMESTAMP,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
        awaitingClientConfirmation: false,
      });
      console.log(`✅ [confirmDriver] Oferta del conductor aceptado actualizada: C$${offerPrice}, Rating: ${offerDriverData.rating}`);

      // ✅ NUEVO: Cancelar otras ofertas pendientes
      try {
        const offersSnapshot = await db.ref(`activeRides/${rideId}/offers`).once('value');
        const offersData = offersSnapshot.val();

        if (offersData && typeof offersData === 'object') {
          const updates: Record<string, any> = {};
          Object.keys(offersData).forEach((driverIdKey) => {
            if (driverIdKey === selectedDriverId) {
              updates[`${driverIdKey}/status`] = 'accepted';
              updates[`${driverIdKey}/acceptedAt`] = admin.database.ServerValue.TIMESTAMP;
              updates[`${driverIdKey}/awaitingClientConfirmation`] = false;
            } else {
              updates[`${driverIdKey}/status`] = 'canceled';
              updates[`${driverIdKey}/canceledAt`] = admin.database.ServerValue.TIMESTAMP;
              updates[`${driverIdKey}/awaitingClientConfirmation`] = false;
            }
            updates[`${driverIdKey}/updatedAt`] = admin.database.ServerValue.TIMESTAMP;
          });

          if (Object.keys(updates).length > 0) {
            await db.ref(`activeRides/${rideId}/offers`).update(updates);
            console.log(`✅ [confirmDriver] Ofertas restantes marcadas como canceladas`);
          }
        }
      } catch (offersUpdateError: any) {
        console.warn(`⚠️ [confirmDriver] Error actualizando estados de offers:`, offersUpdateError.message);
      }
    } catch (offerError: any) {
      console.warn(`⚠️ [confirmDriver] Error guardando oferta:`, offerError.message);
    }

    // ✅ NUEVO: Actualizar en Supabase
    console.log(`🔥 [confirmDriver] Actualizando viaje en Supabase...`);
    try {
      const supabaseUpdateData: any = {
        driver_id: selectedDriverId,
        status: 'accepted',
        accepted_at: new Date(),
        client_confirmation_pending: false,
      };
      
      // ✅ NUEVO: Agregar service_id si existe en Firebase
      if (rideData.serviceId) {
        supabaseUpdateData.service_id = rideData.serviceId;
        console.log(`✅ [confirmDriver] Service ID: ${rideData.serviceId}`);
      }
      
      // Preservar campos de negociación
      if (rideData.clientSuggestedPrice) {
        supabaseUpdateData.client_suggested_price = rideData.clientSuggestedPrice;
      }
      if (rideData.driverOfferedPrice) {
        supabaseUpdateData.driver_offered_price = rideData.driverOfferedPrice;
      }

      // ✅ Actualización condicional: no pisar un viaje cancelado/completado
      //    entre el check en RTDB y este write.
      const pgRide = await rideRepo.findById(rideId);
      if (!pgRide) {
        throw new functions.https.HttpsError('not-found', 'Viaje no encontrado en PostgreSQL');
      }
      const pgConfirmableStatuses = ['requested', 'driver_offered', 'pending_confirm', 'accepted'];
      if (!pgConfirmableStatuses.includes(pgRide.status)) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `El viaje ya no es confirmable (estado actual: ${pgRide.status})`
        );
      }
      const updatedCount = await rideRepo.updateIfStatus(rideId, pgRide.status, supabaseUpdateData);
      if (updatedCount === 0) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'El estado del viaje cambió durante la confirmación (operación concurrente)'
        );
      }
      console.log(`✅ [confirmDriver] Viaje actualizado en Supabase`);
    } catch (supabaseError: any) {
      console.warn(`⚠️ [confirmDriver] Error actualizando en Supabase:`, supabaseError.message);
      // No lanzar error - Firebase ya fue actualizado
    }

    // Actualizar paymentStatus
    await db.ref(`paymentStatus/${rideId}`).update({
      status: 'pending',
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    });

    await safeLogRideEvent(AnalyticsEvents.CLIENT_CONFIRMED_DRIVER, rideId, clientId, {
      driverId: selectedDriverId,
      finalFare: calculatedFinalFare,
    });
    return {
      success: true,
      message: `Conductor ${selectedDriverId} confirmado`,
      ride: {
        id: rideId,
        status: 'accepted',
        driverId: selectedDriverId,
        finalFare: calculatedFinalFare,
      },
    };
  } catch (error: any) {
    console.error('❌ [confirmDriver] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Iniciar viaje
 */
export const startRide = functions.https.onCall(async (data, context) => {
  await requireDriver(context);
  // Enforce single-session
  await ensureActiveSession(context, data);
  try {
    const { rideId, vehicleInspection } = validateData<StartRide>(StartRideSchema, data);
    console.log(`🚗 [startRide] Iniciando viaje: ${rideId}`);

    // Inspección de vehículo (conductor designado): se persiste junto al
    // arranque para que ambos participantes la vean en activeRides.
    const inspectionPayload =
      vehicleInspection && typeof vehicleInspection === 'object'
        ? {
            inspected: vehicleInspection.inspected === true,
            timestamp: typeof vehicleInspection.timestamp === 'number' ? vehicleInspection.timestamp : Date.now(),
            driver_id: context.auth!.uid,
            inspection_id: typeof vehicleInspection.inspection_id === 'string' ? vehicleInspection.inspection_id : null,
            photos: vehicleInspection.photos && typeof vehicleInspection.photos === 'object' ? vehicleInspection.photos : null,
            storage_provider: 'supabase',
          }
        : null;

    // Ownership temprano: leer el viaje activo una sola vez y verificar que el
    // caller es el conductor asignado antes de tocar PostgreSQL.
    const earlySnapshot = await db.ref(`activeRides/${rideId}`).once('value');
    const earlyData = earlySnapshot.val();
    if (!earlyData) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado en Firebase');
    }
    if (!earlyData.driverId || earlyData.driverId !== context.auth!.uid) {
      throw new functions.https.HttpsError('permission-denied', 'No eres el conductor asignado a este viaje');
    }

    let latestActiveRideSnapshot: any = earlyData;

    if (IS_LOAD_TEST) {
      try {
        const currentRide = await db.ref(`activeRides/${rideId}`).once('value');
        const currentData = currentRide.val() || {};

        await db.ref(`activeRides/${rideId}`).update({
          status: 'in_progress',
          startedAt: currentData.startedAt || admin.database.ServerValue.TIMESTAMP,
          updatedAt: admin.database.ServerValue.TIMESTAMP,
          // Preservar campos de negociación
          clientSuggestedPrice: currentData.clientSuggestedPrice || null,
          driverOfferedPrice: currentData.driverOfferedPrice || null,
          negotiationStatus: currentData.negotiationStatus || null,
          ...(inspectionPayload ? { vehicleInspection: inspectionPayload } : {}),
        });
        console.log(`✅ [startRide][LOADTEST] Viaje sincronizado a Firebase`);

        try {
          const driverId = currentData.driverId;
          if (driverId) {
            await db.ref(`driverLocations/${driverId}`).update({
              status: 'busy',
              updatedAt: admin.database.ServerValue.TIMESTAMP,
            });
          }
        } catch (busyErr: any) {
          console.warn('⚠️ [startRide][LOADTEST] No se pudo marcar BUSY en driverLocations:', busyErr.message || busyErr);
        }
      } catch (firebaseError: any) {
        console.error(`⚠️ [startRide][LOADTEST] Error sincronizando a Firebase:`, firebaseError.message);
      }

      await safeLogRideEvent(AnalyticsEvents.RIDE_STARTED, rideId, context.auth!.uid, { loadTest: true });

      return { success: true, ride: { id: rideId, status: 'in_progress' } };
    }

    const ride = await rideService.startRide(rideId, context.auth!.uid);
    if (!ride) {
      throw new functions.https.HttpsError('internal', 'Error al iniciar el viaje');
    }
    
    // Sincronizar a Firebase Realtime DB
    console.log(`🔥 [startRide] Sincronizando a Firebase...`);
    try {
      // Reusar el snapshot leído al inicio (mismo RTDB, aún no modificado)
      const currentData = earlyData || {};
      latestActiveRideSnapshot = currentData;
      
      if (currentData.status === 'in_progress') {
        console.log(`🔁 [startRide] Viaje ${rideId} ya estaba en progreso en Firebase`);
      } else {
        await db.ref(`activeRides/${rideId}`).update({
          status: 'in_progress',
          startedAt: currentData.startedAt || admin.database.ServerValue.TIMESTAMP,
          updatedAt: admin.database.ServerValue.TIMESTAMP,
          // ✅ NUEVO: Preservar campos de negociación
          clientSuggestedPrice: currentData.clientSuggestedPrice || null,
          driverOfferedPrice: currentData.driverOfferedPrice || null,
          negotiationStatus: currentData.negotiationStatus || null,
          ...(inspectionPayload ? { vehicleInspection: inspectionPayload } : {}),
        });
        console.log(`✅ [startRide] Viaje sincronizado a Firebase`);

        // ✅ NUEVO: Marcar conductor como BUSY
        try {
          const driverId = currentData.driverId;
          if (driverId) {
            await db.ref(`driverLocations/${driverId}`).update({
              status: 'busy',
              updatedAt: admin.database.ServerValue.TIMESTAMP,
            });
          }
        } catch (busyErr) {
          console.warn('⚠️ [startRide] No se pudo marcar BUSY en driverLocations:', busyErr instanceof Error ? busyErr.message : String(busyErr));
        }
      }
    } catch (firebaseError: any) {
      console.error(`⚠️ [startRide] Error sincronizando a Firebase:`, firebaseError.message);
    }

    await safeLogRideEvent(AnalyticsEvents.RIDE_STARTED, rideId, context.auth!.uid, { driverId: ride.driver_id });

    try {
      const clientId = latestActiveRideSnapshot?.clientId || ride.client_id || null;
      if (clientId) {
        const driverName =
          latestActiveRideSnapshot?.driver?.full_name ||
          latestActiveRideSnapshot?.driver?.fullName ||
          latestActiveRideSnapshot?.driver?.name ||
          (ride as Record<string, any>)?.driver_name ||
          null;
        await notifyLiveRideUpdateSafe({
          userId: clientId,
          rideId,
          status: 'trip_in_progress',
          driverName,
        });
      }
    } catch (liveErr) {
      console.warn('⚠️ [startRide] Error enviando live notification:', liveErr);
    }

    return { success: true, ride: { id: ride.id, status: ride.status } };
  } catch (error: any) {
    console.error('❌ [startRide] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Completar viaje
 */
export const completeRide = functions.https.onCall(async (data, context) => {
  await requireDriver(context);
  // Enforce single-session
  await ensureActiveSession(context, data);
  try {
    const { rideId, finalFare, actualDistance, actualDuration } = validateData<CompleteRide>(CompleteRideSchema, data);
    const callerUid = context.auth!.uid;
    console.log(`✅ [completeRide] Completando viaje: ${rideId}`);

    // Snapshot temprano: verifica ownership y estado antes de tocar PostgreSQL,
    // y se reutiliza después para no releer el nodo.
    const earlySnapshot = await db.ref(`activeRides/${rideId}`).once('value');
    const earlyData = earlySnapshot.val();
    if (!earlyData) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado en Firebase');
    }
    if (!earlyData.driverId || earlyData.driverId !== callerUid) {
      throw new functions.https.HttpsError('permission-denied', 'No eres el conductor asignado a este viaje');
    }

    // Idempotencia: el viaje ya está esperando pago o completado.
    if (['pending_payment', 'completed'].includes(earlyData.status)) {
      console.log(`🔁 [completeRide] Viaje ${rideId} ya estaba en ${earlyData.status}`);
      return {
        success: true,
        ride: { id: rideId, status: earlyData.status, finalFare: earlyData.finalFare ?? null },
        message: 'Viaje ya estaba completado',
      };
    }

    // Solo un viaje en curso puede completarse ('started' es alias legado).
    if (!['in_progress', 'started'].includes(earlyData.status)) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `El viaje no puede completarse en estado: ${earlyData.status}`,
      );
    }

    // Tarifa autoritativa: se deriva del viaje en servidor (negociada/estimada),
    // nunca del payload — el cliente solo manda un valor de referencia.
    const rideRecord = await rideRepo.findById(rideId);
    const negotiatedFare = getNegotiatedFare(earlyData, rideRecord);
    const effectiveFare = negotiatedFare > 0 ? negotiatedFare : finalFare;
    // Si SQL ya lo marcó completed (retry tras un crash post-commit), no
    // acreditar ganancias otra vez — pero sí continuar al sync de Firebase,
    // que puede haber quedado divergente (ej. RTDB atascado en 'in_progress').
    const alreadyCompletedInSql = rideRecord?.status === 'completed';
    if (negotiatedFare > 0 && Math.abs(finalFare - negotiatedFare) > Math.max(negotiatedFare * 0.3, 75)) {
      console.warn(
        `⚠️ [completeRide] finalFare cliente (${finalFare}) difiere de la tarifa autoritativa (${negotiatedFare}) — usando la del servidor. rideId=${rideId} driverId=${callerUid}`,
      );
    }

    if (IS_LOAD_TEST) {
      try {
        const currentData = earlyData || {};

        await db.ref(`activeRides/${rideId}`).update({
          status: 'pending_payment',
          completedAt: admin.database.ServerValue.TIMESTAMP,
          finalFare: effectiveFare,
          updatedAt: admin.database.ServerValue.TIMESTAMP,
          // Preservar campos de negociación
          clientSuggestedPrice: currentData.clientSuggestedPrice || null,
          driverOfferedPrice: currentData.driverOfferedPrice || null,
          negotiationStatus: currentData.negotiationStatus || null,
        });
        console.log(`✅ [completeRide][LOADTEST] Viaje sincronizado a Firebase`);

        try {
          const resolvedDriverId = currentData.driverId || null;
          if (resolvedDriverId) {
            await db.ref(`driverLocations/${resolvedDriverId}`).update({
              status: 'available',
              updatedAt: admin.database.ServerValue.TIMESTAMP,
            });
          }
        } catch (availErr: any) {
          console.warn('⚠️ [completeRide][LOADTEST] No se pudo marcar AVAILABLE en driverLocations:', availErr.message || availErr);
        }

        try {
          await db.ref(`paymentStatus/${rideId}`).update({
            status: 'pending',
            amount: effectiveFare,
            updatedAt: admin.database.ServerValue.TIMESTAMP,
          });
        } catch (paymentErr: any) {
          console.warn('⚠️ [completeRide][LOADTEST] Error actualizando paymentStatus:', paymentErr.message || paymentErr);
        }

        await notifyUserSafe(currentData.clientId, 'Viaje finalizado', 'Por favor confirma y realiza el pago.', {
          rideId,
          finalFare: effectiveFare,
        }, {
          type: 'ride_completed',
        });

        await notifyLiveRideUpdateSafe({
          userId: currentData.clientId,
          rideId,
          status: 'completed',
          driverName: currentData?.driver?.full_name || currentData?.driver?.fullName || currentData?.driver?.name || null,
        });
      } catch (firebaseError: any) {
        console.error(`⚠️ [completeRide][LOADTEST] Error sincronizando a Firebase:`, firebaseError.message);
      }

      await safeLogRideEvent(AnalyticsEvents.RIDE_COMPLETED, rideId, context.auth!.uid, { loadTest: true });

      return {
        success: true,
        ride: {
          id: rideId,
          status: 'pending_payment',
          finalFare: effectiveFare,
          completedAt: new Date(),
        },
      };
    }

    const ride = await rideService.completeRide(rideId, effectiveFare, {
      expectedDriverId: callerUid,
      actualDistance,
      actualDuration,
    });
    if (!ride) {
      throw new functions.https.HttpsError('internal', 'Error al completar el viaje');
    }
    // Ganancias al conductor asignado según el registro — jamás al driverId del payload.
    // Post-commit del viaje: un fallo aquí no debe devolver error al cliente
    // (el viaje ya quedó completado; las ganancias son reconciliables).
    const earningsDriverId = ride.driver_id || earlyData.driverId;
    if (earningsDriverId && !alreadyCompletedInSql) {
      try {
        const earnings = effectiveFare * 0.90;
        // ✅ Grupo 4: Transacción para incrementos atómicos de driver
        if (isSequelizeAvailable) {
          await sequelize.transaction(async (t) => {
            await driverRepo.incrementTotalRides(earningsDriverId, t);
            await driverRepo.incrementEarnings(earningsDriverId, earnings, t);
          });
        } else {
          await driverRepo.incrementTotalRides(earningsDriverId);
          await driverRepo.incrementEarnings(earningsDriverId, earnings);
        }
      } catch (earningsErr: any) {
        console.error(
          `⚠️ [completeRide] No se pudieron acreditar ganancias al conductor ${earningsDriverId} (rideId=${rideId}):`,
          earningsErr?.message || earningsErr,
        );
      }
    }
    
    // Sincronizar a Firebase Realtime DB - mover a completedRides
    console.log(`🔥 [completeRide] Sincronizando a Firebase...`);
    try {
      // Reusar el snapshot leído al inicio (mismo RTDB, aún no modificado)
      const currentData = earlyData || {};
      
      // ✅ IMPORTANTE: Cambiar a 'pending_payment' (no directamente a 'completed')
      // El viaje solo pasa a 'completed' después de que se confirme el pago
      await db.ref(`activeRides/${rideId}`).update({
        status: 'pending_payment',
        completedAt: admin.database.ServerValue.TIMESTAMP,
        finalFare: effectiveFare,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
        // ✅ NUEVO: Preservar campos de negociación
        clientSuggestedPrice: currentData.clientSuggestedPrice || null,
        driverOfferedPrice: currentData.driverOfferedPrice || null,
        negotiationStatus: currentData.negotiationStatus || null,
      });
      console.log(`✅ [completeRide] Viaje sincronizado a Firebase`);

      // ✅ NUEVO: Marcar conductor como AVAILABLE
      try {
        const resolvedDriverId = currentData.driverId || null;
        if (resolvedDriverId) {
          await db.ref(`driverLocations/${resolvedDriverId}`).update({
            status: 'available',
            updatedAt: admin.database.ServerValue.TIMESTAMP,
          });
        }
      } catch (availErr) {
        console.warn('⚠️ [completeRide] No se pudo marcar AVAILABLE en driverLocations:', availErr instanceof Error ? availErr.message : String(availErr));
      }

      await notifyUserSafe(currentData.clientId, '✅ Viaje finalizado', 'Por favor confirma y realiza el pago.', {
        rideId,
        finalFare: effectiveFare,
      }, {
        type: 'ride_completed',
      });

      await notifyLiveRideUpdateSafe({
        userId: currentData.clientId,
        rideId,
        status: 'completed',
        driverName: currentData?.driver?.full_name || currentData?.driver?.fullName || currentData?.driver?.name || null,
      });
    } catch (firebaseError: any) {
      console.error(`⚠️ [completeRide] Error sincronizando a Firebase:`, firebaseError.message);
    }
    
    await safeLogRideEvent(AnalyticsEvents.RIDE_COMPLETED, rideId, context.auth!.uid, {
      finalFare: effectiveFare,
      driverId: earningsDriverId,
      clientReportedFare: finalFare,
    });

    return { success: true, ride: { id: ride.id, status: ride.status, finalFare: ride.final_fare, completedAt: ride.completed_at } };
  } catch (error: any) {
    // Re-lanzar HttpsError con su código real (not-found, permission-denied,
    // failed-precondition) — envolverlos en 'internal' rompe el manejo del cliente.
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    console.error('❌ [completeRide] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Cancelar viaje
 */
export const cancelRide = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  // Enforce single-session
  await ensureActiveSession(context, data);
  try {
    const { rideId, reason } = validateData<CancelRide>(CancelRideSchema, data);
    const callerUid = context.auth.uid;

    // Obtener datos del viaje ANTES de cancelar
    const rideSnapshot = await db.ref(`activeRides/${rideId}`).once('value');
    const firebaseRide = rideSnapshot.val();

    if (!firebaseRide) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado en Firebase');
    }

    // ✅ Seguridad: solo el cliente o el conductor asignado pueden cancelar.
    // El rol del que cancela se deriva del auth.uid — nunca del payload.
    const isRideClient = firebaseRide.clientId === callerUid;
    const isRideDriver = !!firebaseRide.driverId && firebaseRide.driverId === callerUid;
    if (!isRideClient && !isRideDriver) {
      throw new functions.https.HttpsError('permission-denied', 'No tienes permiso para cancelar este viaje');
    }
    const canceledBy = isRideClient ? 'client' : 'driver';

    const rideStatus = firebaseRide.status; // 'requested', 'accepted', 'started', etc.
    console.log(`❌ [cancelRide] Cancelando viaje: ${rideId} por: ${canceledBy} (${callerUid})`);
    console.log(`📊 [cancelRide] Estado actual del viaje: ${rideStatus}`);

    // ✅ Solo estados vivos son cancelables — jamás completados/ya cobrados.
    const cancelableStatuses = [
      'requested',
      'pending_confirm',
      'driver_offered',
      'accepted',
      'driver_on_route',
      'driver_arrived',
      'in_progress',
      'started',
    ];
    if (!cancelableStatuses.includes(rideStatus)) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `El viaje no puede cancelarse en estado: ${rideStatus}`
      );
    }
    
    // Cancelar en Supabase
    const ride = await rideService.cancelRide(rideId, reason || '');
    if (!ride) {
      throw new functions.https.HttpsError('internal', 'Error al cancelar el viaje');
    }

    // ✅ Grupo 4: Actualizar cancel_reason y canceled_by en PostgreSQL (atómico con el cancel)
    if (isSequelizeAvailable) {
      await sequelize.transaction(async (t) => {
        await rideRepo.update(rideId, {
          cancel_reason: reason || null,
          canceled_by: canceledBy || null,
        }, t);
      });
    } else {
      await rideRepo.update(rideId, {
        cancel_reason: reason || null,
        canceled_by: canceledBy || null,
      });
    }
    console.log(`✅ [cancelRide] Información de cancelación guardada en PostgreSQL`);
    
    // ✅ Obtener tarifa negociada/definitiva
    const rideRecord = await rideRepo.findById(rideId);
    const negotiatedFare = getNegotiatedFare(firebaseRide, rideRecord);
    const commissionRate = await getCommissionRateForRide(rideRecord);
    console.log(`💰 [cancelRide] negotiatedFare=${negotiatedFare} commissionRate=${commissionRate}`);

    // ✅ Calcular progreso del viaje si ya había iniciado
    let progressPercentage = 0;
    if (firebaseRide?.estimatedDistance && rideStatus && ['started', 'in_progress'].includes(rideStatus)) {
      try {
        progressPercentage = await calculateRideProgress(rideId, Number(firebaseRide.estimatedDistance));
      } catch (progressErr) {
        console.warn('⚠️ [cancelRide] Error calculando progreso:', progressErr);
        progressPercentage = 0;
      }
    }

    console.log(`📏 [cancelRide] progress=${progressPercentage}%`);

    const progressFactor = Math.min(Math.max(progressPercentage, 0), 100) / 100;

    // ✅ LÓGICA DE PAGO SEGÚN ESTADO Y QUIÉN CANCELA
    console.log(`💳 [cancelRide] Procesando paymentStatus...`);
    let paymentStatusUpdate: any = {
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      requiresClientPayment: false,
      chargeTarget: null,
    };
    let chargeTarget: 'driver' | 'client' | null = null;
    let chargeAmount = 0;
    let commissionDue = 0;
    let driverPayout = 0;
    const cancelerDriverId = canceledBy === 'driver' ? (firebaseRide?.driverId || rideRecord?.driver_id || null) : null;
    
    // Si el viaje NO ha iniciado (incluye driver_offered / driver_arrived que antes
    // caían fuera de todas las ramas y dejaban paymentStatusUpdate.status undefined)
    if (['requested', 'pending_confirm', 'driver_offered', 'accepted', 'driver_on_route', 'driver_arrived'].includes(rideStatus)) {
      console.log(`✅ [cancelRide] Viaje sin iniciar (estado ${rideStatus})`);
      paymentStatusUpdate.canceledAt = admin.database.ServerValue.TIMESTAMP;
      paymentStatusUpdate.canceledBy = canceledBy || 'unknown';
      paymentStatusUpdate.cancelReason = reason || 'Sin especificar';

      // Cargo al cliente solo si ya había asignación efectiva (conductor confirmado/en camino)
      const chargeableStatuses = ['accepted', 'driver_on_route', 'driver_arrived'];
      if (canceledBy === 'client' && chargeableStatuses.includes(rideStatus)) {
        console.log(`💸 [cancelRide] Cliente canceló después de asignar conductor - generando cargo`);
        paymentStatusUpdate.status = 'pending';
        paymentStatusUpdate.chargeType = 'client_cancellation_before_start';
        paymentStatusUpdate.shouldCharge = true;
        paymentStatusUpdate.requiresClientPayment = true;
        paymentStatusUpdate.chargeTarget = 'client';
        chargeTarget = 'client';
        const fallbackAmountSources = [
          negotiatedFare,
          firebaseRide?.finalFare,
          firebaseRide?.estimatedPrice,
          rideRecord?.final_fare,
          rideRecord?.estimated_price,
          rideRecord?.client_suggested_price,
          rideRecord?.driver_offered_price,
        ];

        for (const candidate of fallbackAmountSources) {
          const numeric = Number(candidate || 0);
          if (Number.isFinite(numeric) && numeric > 0) {
            chargeAmount = Number(numeric.toFixed(2));
            break;
          }
        }

        if (!chargeAmount || chargeAmount <= 0) {
          chargeAmount = 0;
        }

        commissionDue = Number((chargeAmount * commissionRate).toFixed(2));
        driverPayout = Number((chargeAmount - commissionDue).toFixed(2));
      } else {
        paymentStatusUpdate.status = 'canceled';
        paymentStatusUpdate.shouldCharge = false;
        paymentStatusUpdate.chargeType = 'pre_start_cancellation';
      }

      await notifyUserSafe(firebaseRide.clientId, 'Viaje cancelado', 'Tu solicitud de viaje fue cancelada.', {
        rideId,
        type: 'ride_canceled',
        canceledBy: canceledBy || 'unknown',
      });

      await notifyLiveRideUpdateSafe({
        userId: firebaseRide.clientId,
        rideId,
        status: 'canceled',
        driverName: firebaseRide?.driver?.full_name || firebaseRide?.driver?.fullName || firebaseRide?.driver?.name || null,
      });

      if (firebaseRide.driverId) {
        await notifyUserSafe(firebaseRide.driverId, 'Viaje cancelado', 'El cliente canceló la solicitud antes de iniciar el viaje.', {
          rideId,
          type: 'ride_canceled',
          canceledBy: canceledBy || 'unknown',
        });
      }
    }
    // Si el viaje está en progreso (in_progress)
    else if (rideStatus === 'in_progress') {
      console.log(`⚠️ [cancelRide] Viaje en progreso - Procesando pago pendiente`);
      
      // Si lo cancela el CONDUCTOR
      if (canceledBy === 'driver') {
        console.log(`🚗 [cancelRide] Cancelado por conductor en progreso - Se cobrará según programación`);
        paymentStatusUpdate.status = 'pending';
        paymentStatusUpdate.chargeType = 'driver_cancellation';
        paymentStatusUpdate.shouldCharge = true;
        paymentStatusUpdate.requiresClientPayment = false;
        paymentStatusUpdate.chargeTarget = 'driver';
        chargeTarget = 'driver';
        chargeAmount = negotiatedFare;
        commissionDue = Number((negotiatedFare * commissionRate).toFixed(2));
        driverPayout = Number((negotiatedFare - commissionDue).toFixed(2));
      }
      // Si lo cancela el CLIENTE
      else if (canceledBy === 'client') {
        console.log(`👤 [cancelRide] Cancelado por cliente en progreso - Cliente debe pagar pendientes`);
        paymentStatusUpdate.status = 'pending';
        paymentStatusUpdate.chargeType = 'client_cancellation';
        paymentStatusUpdate.shouldCharge = true;
        paymentStatusUpdate.requiresClientPayment = true;
        paymentStatusUpdate.chargeTarget = 'client';
        chargeTarget = 'client';

        const progressFactor = Math.min(Math.max(progressPercentage, 0), 100) / 100;
        chargeAmount = Number((negotiatedFare * progressFactor).toFixed(2));
        commissionDue = Number((chargeAmount * commissionRate).toFixed(2));
        driverPayout = Number((chargeAmount - commissionDue).toFixed(2));
      }
      
      paymentStatusUpdate.canceledAt = admin.database.ServerValue.TIMESTAMP;
      paymentStatusUpdate.canceledBy = canceledBy || 'unknown';
      paymentStatusUpdate.cancelReason = reason || 'Sin especificar';
    }
    // Si el viaje YA ha iniciado (started, completed, etc.)
    else if (rideStatus === 'started') {
      console.log(`⚠️ [cancelRide] Viaje iniciado - Procesando pago pendiente`);
      
      // Si lo cancela el CONDUCTOR
      if (canceledBy === 'driver') {
        console.log(`🚗 [cancelRide] Cancelado por conductor - Se cobrará según programación`);
        paymentStatusUpdate.status = 'pending';
        paymentStatusUpdate.chargeType = 'driver_cancellation'; // Cargo por cancelación de conductor
        paymentStatusUpdate.shouldCharge = true;
        paymentStatusUpdate.requiresClientPayment = false;
        paymentStatusUpdate.chargeTarget = 'driver';
        chargeTarget = 'driver';
        commissionDue = Number((negotiatedFare * commissionRate).toFixed(2));
        chargeAmount = commissionDue;
        driverPayout = 0;
      }
      // Si lo cancela el CLIENTE
      else if (canceledBy === 'client') {
        console.log(`👤 [cancelRide] Cancelado por cliente - Cliente debe pagar pendientes`);
        paymentStatusUpdate.status = 'pending';
        paymentStatusUpdate.chargeType = 'client_cancellation'; // Cargo por cancelación de cliente
        paymentStatusUpdate.shouldCharge = true;
        paymentStatusUpdate.requiresClientPayment = true;
        paymentStatusUpdate.chargeTarget = 'client';
        chargeTarget = 'client';
        chargeAmount = Number((negotiatedFare * progressFactor).toFixed(2));
        commissionDue = Number((chargeAmount * commissionRate).toFixed(2));
        driverPayout = Number((chargeAmount - commissionDue).toFixed(2));
      }
      
      paymentStatusUpdate.canceledAt = admin.database.ServerValue.TIMESTAMP;
      paymentStatusUpdate.canceledBy = canceledBy || 'unknown';
      paymentStatusUpdate.cancelReason = reason || 'Sin especificar';
    }
    
    // Sincronizar a Firebase Realtime DB
    console.log(`🔥 [cancelRide] Sincronizando a Firebase...`);
    try {
      const updateData: any = {
        status: 'canceled',
        cancelReason: reason || 'Sin especificar',
        canceledBy: canceledBy || 'unknown',
        canceledAt: admin.database.ServerValue.TIMESTAMP,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      };
      
      await db.ref(`activeRides/${rideId}`).update(updateData);
      console.log(`✅ [cancelRide] Viaje sincronizado a Firebase`);
      
      // Actualizar paymentStatus
      const effectiveChargeAmount = chargeAmount > 0 ? chargeAmount : 0;
      const effectiveAmountField = chargeAmount > 0 ? chargeAmount : negotiatedFare;

      paymentStatusUpdate.chargeAmount = Number(effectiveChargeAmount.toFixed(2));
      paymentStatusUpdate.amount = Number(effectiveAmountField.toFixed(2));
      paymentStatusUpdate.finalAmount = paymentStatusUpdate.amount;
      paymentStatusUpdate.negotiatedFare = negotiatedFare;
      paymentStatusUpdate.progress = Number(progressPercentage.toFixed(2));
      paymentStatusUpdate.commissionDue = Number(commissionDue.toFixed(2));
      paymentStatusUpdate.driverPayout = Number(driverPayout.toFixed(2));

      if (chargeTarget === 'client') {
        if (paymentStatusUpdate.chargeAmount <= 0 && negotiatedFare > 0) {
          const fallbackCharge = Number(negotiatedFare.toFixed(2));
          paymentStatusUpdate.chargeAmount = fallbackCharge;
          paymentStatusUpdate.amount = fallbackCharge;
          paymentStatusUpdate.finalAmount = fallbackCharge;
          commissionDue = Number((fallbackCharge * commissionRate).toFixed(2));
          driverPayout = Number((fallbackCharge - commissionDue).toFixed(2));
          paymentStatusUpdate.commissionDue = commissionDue;
          paymentStatusUpdate.driverPayout = driverPayout;
        }

        paymentStatusUpdate.shouldCharge = paymentStatusUpdate.chargeAmount > 0;
        paymentStatusUpdate.requiresClientPayment = paymentStatusUpdate.chargeAmount > 0;
      } else if (chargeTarget === 'driver' && paymentStatusUpdate.chargeAmount <= 0) {
        paymentStatusUpdate.shouldCharge = false;
      }

      console.log(`💳 [cancelRide] Actualizando paymentStatus con: ${JSON.stringify(paymentStatusUpdate)}`);
      if (cancelerDriverId) {
        paymentStatusUpdate.canceledById = cancelerDriverId;
      }

      await db.ref(`paymentStatus/${rideId}`).update(paymentStatusUpdate);
      console.log(`✅ [cancelRide] paymentStatus actualizado`);

      // ✅ NUEVO: Marcar conductor como AVAILABLE si estaba asignado
      try {
        const assignedDriverId = firebaseRide?.driverId || rideRecord?.driver_id || null;
        if (assignedDriverId) {
          await db.ref(`driverLocations/${assignedDriverId}`).update({
            status: 'available',
            updatedAt: admin.database.ServerValue.TIMESTAMP,
          });
        }
      } catch (availErr) {
        console.warn('⚠️ [cancelRide] No se pudo marcar AVAILABLE en driverLocations:', availErr instanceof Error ? availErr.message : String(availErr));
      }
    } catch (firebaseError: any) {
      console.error(`⚠️ [cancelRide] Error sincronizando a Firebase:`, firebaseError.message);
    }

    await safeLogRideEvent(AnalyticsEvents.RIDE_CANCELED, rideId, context.auth.uid, {
      canceledBy,
      reason,
      rideStatus,
      chargeTarget,
      chargeAmount,
    });

    // ✅ Penalizaciones y registros de cobro
    try {
      // Legacy penalties desactivado (migrado a PuntoExpress RechargeFunds)
      // if (chargeTarget === 'driver' && commissionDue > 0 && cancelerDriverId) {
      //   await ensureDriverPenalty({
      //     driverId: cancelerDriverId,
      //     rideId,
      //     amount: commissionDue,
      //     penaltyType: 'driver_cancellation_after_start',
      //     reason: reason || 'Cancelación del conductor con viaje iniciado',
      //   });
      // }

      if (chargeTarget === 'client' && chargeAmount > 0 && firebaseRide?.clientId) {
        await admin
          .database()
          .ref(`clientCharges/${firebaseRide.clientId}/${rideId}`)
          .set({
            amount: Number(chargeAmount.toFixed(2)),
            commission: Number(commissionDue.toFixed(2)),
            driverPayout: Number(driverPayout.toFixed(2)),
            progressPercentage: Number(progressPercentage.toFixed(2)),
            chargeType: paymentStatusUpdate.chargeType,
            createdAt: admin.database.ServerValue.TIMESTAMP,
          });
      }

      const existingPayment = await paymentRepo.findByRideId(rideId);
      if (existingPayment) {
        // ✅ Grupo 4: Transacción para actualización atómica del payment
        if (isSequelizeAvailable) {
          await sequelize.transaction(async (t) => {
            await paymentRepo.update(existingPayment.id, {
              amount: Number((chargeAmount > 0 ? chargeAmount : negotiatedFare).toFixed(2)),
              commission: Number(commissionDue.toFixed(2)),
              commission_rate_applied: commissionRate,
              status: paymentStatusUpdate.status,
              cancel_reason: reason || null,
              updated_at: new Date(),
            }, t);
          });
        } else {
          await paymentRepo.update(existingPayment.id, {
            amount: Number((chargeAmount > 0 ? chargeAmount : negotiatedFare).toFixed(2)),
            commission: Number(commissionDue.toFixed(2)),
            commission_rate_applied: commissionRate,
            status: paymentStatusUpdate.status,
            cancel_reason: reason || null,
            updated_at: new Date(),
          });
        }
      }
    } catch (penaltyErr) {
      console.error('⚠️ [cancelRide] Error procesando penalizaciones/cargos:', penaltyErr);
    }
    
    return { 
      success: true, 
      ride: { 
        id: ride.id, 
        status: ride.status, 
        canceledAt: ride.canceled_at,
        paymentStatus: paymentStatusUpdate.status,
      } 
    };
  } catch (error: any) {
    console.error('❌ [cancelRide] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Obtener viajes del cliente
 */
export const getClientRides = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  try {
    const clientId = context.auth.uid;
    console.log(`📋 [getClientRides] Obteniendo viajes del cliente: ${clientId}`);
    const rides = await rideService.getRidesByClient(clientId);
    return {
      success: true,
      rides: rides.map((r: any) => ({
        id: r.id,
        firebaseRideId: r.firebase_ride_id,
        status: r.status,
        estimatedPrice: r.estimated_price,
        finalFare: r.final_fare,
        distance: r.distance,
        duration: r.duration,
        createdAt: r.created_at,
        completedAt: r.completed_at,
      })),
    };
  } catch (error: any) {
    console.error('❌ [getClientRides] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Obtener viajes del conductor
 */
export const getDriverRides = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  try {
    const driverId = context.auth.uid;
    console.log(`📋 [getDriverRides] Obteniendo viajes del conductor: ${driverId}`);
    const rides = await rideService.getRidesByDriver(driverId);
    return {
      success: true,
      rides: rides.map((r: any) => ({
        id: r.id,
        firebaseRideId: r.firebase_ride_id,
        status: r.status,
        estimatedPrice: r.estimated_price,
        finalFare: r.final_fare,
        distance: r.distance,
        duration: r.duration,
        createdAt: r.created_at,
        completedAt: r.completed_at,
      })),
    };
  } catch (error: any) {
    console.error('❌ [getDriverRides] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Obtener detalles del viaje
 * Intenta primero en Supabase, luego en Realtime DB
 */
export const getRideDetails = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  // Enforce single-session
  await ensureActiveSession(context, data);
  try {
    const { rideId } = validateData<GetRideDetails>(GetRideDetailsSchema, data);

    console.log(`📍 [getRideDetails] Buscando viaje: ${rideId}`);

    // Intentar obtener de Supabase REST (datos enriquecidos)
    try {
      const supabaseResult = await supabaseGetRidesWithLocationsAndPayments(
        context.auth?.uid || rideId,
        'client',
        {
          rideId,
          includeTotals: false,
        },
      );

      const ridesList: any[] = Array.isArray(supabaseResult)
        ? supabaseResult
        : (supabaseResult?.rides || []);

      if (ridesList.length > 0) {
        const mapped = await mapRides(ridesList);
        if (mapped.length > 0) {
          console.log(`✅ [getRideDetails] Viaje encontrado y enriquecido desde Supabase`);
          return {
            success: true,
            ride: mapped[0],
          };
        }
      }
    } catch (supabaseError) {
      console.warn(`⚠️ [getRideDetails] Error obteniendo datos enriquecidos de Supabase:`, supabaseError);
    }

    // Fallback: utilizar repositorio Sequelize directo
    try {
      const ride = await rideRepo.findById(rideId);
      if (ride) {
        console.log(`✅ [getRideDetails] Viaje encontrado en Sequelize (fallback)`);
        return {
          success: true,
          ride: {
            id: ride.id,
            firebaseRideId: ride.firebase_ride_id,
            clientId: ride.client_id,
            driverId: ride.driver_id,
            status: ride.status,
            estimatedPrice: ride.estimated_price,
            finalFare: ride.final_fare,
            createdAt: ride.created_at,
          },
        };
      }
    } catch (repoError) {
      console.warn(`⚠️ [getRideDetails] Error en repositorio Sequelize, intentando Realtime DB:`, repoError);
    }

    // Fallback: Obtener de Realtime DB
    const db = admin.database();
    const snapshot = await db.ref(`activeRides/${rideId}`).once('value');
    const rideData = snapshot.val();

    if (!rideData) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    console.log(`✅ [getRideDetails] Viaje encontrado en Realtime DB`);

    return {
      success: true,
      ride: {
        id: rideId,
        clientId: rideData.clientId,
        driverId: rideData.driverId,
        status: rideData.status,
        originAddress: rideData.origin?.address || rideData.origin || null,
        destinationAddress: rideData.destination?.address || rideData.destination || null,
        estimatedPrice: rideData.estimatedPrice ?? 0,
        finalFare: rideData.finalFare ?? null,
        estimatedDistance: rideData.estimatedDistance ?? rideData.distance ?? 0,
        distance: rideData.distance ?? 0,
        estimatedDuration: rideData.estimatedDuration ?? rideData.duration ?? 0,
        duration: rideData.duration ?? 0,
        createdAt: rideData.createdAt ?? null,
        requestedAt: rideData.requestedAt ?? null,
        acceptedAt: rideData.acceptedAt ?? null,
        startedAt: rideData.startedAt ?? null,
        completedAt: rideData.completedAt ?? null,
        canceledAt: rideData.canceledAt ?? null,
        paymentType: rideData.paymentType ?? null,
        payments: [],
        locations: [],
        primaryPayment: null,
        allAddresses: [
          rideData.origin?.address || rideData.origin || 'Origen desconocido',
          rideData.destination?.address || rideData.destination || 'Destino desconocido',
        ].filter(Boolean),
        hasMultipleStops: false,
        waypointsCount: 0,
        passengers: rideData.passengers ?? 1,
      },
    };
  } catch (error: any) {
    console.error('❌ [getRideDetails] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Obtener viajes activos
 */
export const getActiveRides = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  // Enforce single-session
  await ensureActiveSession(context, data);
  try {
    console.log(`🚗 [getActiveRides] Obteniendo viajes activos`);
    const rides = await rideRepo.findByStatus('in_progress');
    return {
      success: true,
      count: rides.length,
      rides: rides.map((r: any) => ({
        id: r.id,
        firebaseRideId: r.firebase_ride_id,
        clientId: r.client_id,
        driverId: r.driver_id,
        status: r.status,
        estimatedPrice: r.estimated_price,
        createdAt: r.created_at,
      })),
    };
  } catch (error: any) {
    console.error('❌ [getActiveRides] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Obtener estadísticas de viajes
 */
export const getRideStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  try {
    console.log(`📊 [getRideStats] Obteniendo estadísticas de viajes`);
    // ✅ Grupo 7 (H2): Usar agregación SQL en lugar de cargar todos los rides en memoria
    const stats = await rideRepo.getStats();
    return {
      success: true,
      stats: {
        totalRides: stats.total,
        completedRides: stats.completed,
        canceledRides: stats.canceled,
        totalRevenue: stats.totalRevenue,
        averageRideValue: stats.completed > 0 ? stats.totalRevenue / stats.completed : 0,
      },
    };
  } catch (error: any) {
    console.error('❌ [getRideStats] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Aceptar precio sugerido por cliente (conductor)
 * ✅ NUEVO: Conductor acepta directamente el precio del cliente
 * ⚠️ Cuando acepta, el viaje pasa a 'accepted' con este conductor
 */
export const acceptClientPrice = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  try {
    const { rideId } = data;
    const driverId = context.auth.uid;
    
    if (!rideId) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
    }
    
    console.log(`💰 [acceptClientPrice] ✅ Conductor ${driverId} acepta precio del cliente para viaje ${rideId}`);
    
    // Obtener viaje actual
    const firebaseRide = await db.ref(`activeRides/${rideId}`).once('value');
    const ride = firebaseRide.val();
    
    if (!ride) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }
    
    // Validar que hay un precio sugerido por el cliente
    if (!ride.clientSuggestedPrice) {
      throw new functions.https.HttpsError('failed-precondition', 'No hay precio sugerido por el cliente');
    }
    
    // ✅ NUEVO: Permitir aceptar en estado 'requested' (antes de aceptar el viaje)
    // o si ya es el conductor asignado
    const isAssignedDriver = ride.driverId === driverId;
    const isRequestedState = ride.status === 'requested';
    
    if (!isAssignedDriver && !isRequestedState) {
      throw new functions.https.HttpsError('permission-denied', 'No puedes negociar este viaje');
    }
    
    // ✅ IMPORTANTE: Cuando el conductor acepta el precio, el viaje pasa a 'accepted'
    // Esto notifica al cliente que este conductor aceptó su precio sugerido
    await db.ref(`activeRides/${rideId}`).update({
      driverId: driverId,  // Asignar este conductor
      status: 'accepted',  // Cambiar estado a accepted
      finalFare: ride.clientSuggestedPrice,
      negotiationStatus: 'driver_accepted',
      acceptedAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    });
    
    // Actualizar en PostgreSQL
    await rideRepo.update(rideId, {
      driver_id: driverId,
      status: 'accepted',
      final_fare: ride.clientSuggestedPrice,
    });
    
    console.log(`✅ [acceptClientPrice] Conductor ${driverId} aceptó precio: ${ride.clientSuggestedPrice}, viaje ahora en estado 'accepted'`);
    
    return {
      success: true,
      message: 'Precio aceptado, esperando confirmación del cliente',
      finalFare: ride.clientSuggestedPrice,
      driverId: driverId,
    };
  } catch (error: any) {
    console.error('❌ [acceptClientPrice] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Hacer contraoferta de precio (conductor)
 * ✅ NUEVO: Permite al conductor hacer una contraoferta
 * ⚠️ Puede hacerlo en estado 'requested' (antes de aceptar) o después
 */
export const makeCounterOffer = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  try {
    const { rideId, offeredPrice } = data;
    const driverId = context.auth.uid;
    
    if (!rideId || offeredPrice === undefined) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId y offeredPrice son requeridos');
    }
    
    console.log(`💰 [makeCounterOffer] Conductor ${driverId} hace contraoferta: ${offeredPrice} para viaje ${rideId}`);
    
    // Obtener viaje actual
    const firebaseRide = await db.ref(`activeRides/${rideId}`).once('value');
    const ride = firebaseRide.val();
    
    if (!ride) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }
    
    // ✅ NUEVO: Permitir contraoferta en estado 'requested' o si ya es el conductor asignado
    const isAssignedDriver = ride.driverId === driverId;
    const isRequestedState = ride.status === 'requested';
    
    if (!isAssignedDriver && !isRequestedState) {
      throw new functions.https.HttpsError('permission-denied', 'No puedes negociar este viaje');
    }
    
    // Actualizar en Firebase
    await db.ref(`activeRides/${rideId}`).update({
      driverOfferedPrice: offeredPrice,
      negotiationStatus: 'driver_offered',
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    });
    
    // Actualizar en PostgreSQL
    await rideRepo.update(rideId, {
      driver_offered_price: offeredPrice,
    });
    
    console.log(`✅ [makeCounterOffer] Contraoferta guardada: ${offeredPrice}`);
    
    return {
      success: true,
      message: 'Contraoferta enviada',
      offeredPrice,
    };
  } catch (error: any) {
    console.error('❌ [makeCounterOffer] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Aceptar contraoferta (cliente)
 * ✅ NUEVO: Permite al cliente aceptar la contraoferta del conductor
 * ⚠️ El viaje pasa a 'accepted' con el conductor que hizo la contraoferta
 */
export const acceptCounterOffer = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  try {
    const { rideId, driverId, acceptedPrice } = data;
    const clientId = context.auth.uid;
    
    if (!rideId || !driverId || acceptedPrice === undefined) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId, driverId y acceptedPrice son requeridos');
    }
    
    console.log(`💰 [acceptCounterOffer] Cliente ${clientId} acepta contraoferta de ${driverId}: ${acceptedPrice} para viaje ${rideId}`);
    
    // Obtener viaje actual
    const firebaseRide = await db.ref(`activeRides/${rideId}`).once('value');
    const ride = firebaseRide.val();
    
    if (!ride) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }
    
    // Validar que el cliente es quien solicitó el viaje
    if (ride.clientId !== clientId) {
      throw new functions.https.HttpsError('permission-denied', 'No eres el cliente de este viaje');
    }
    
    // ✅ IMPORTANTE: Cuando el cliente acepta la contraoferta, el viaje pasa a 'accepted'
    // con el conductor que hizo la contraoferta
    await db.ref(`activeRides/${rideId}`).update({
      driverId: driverId,  // Asignar el conductor que hizo la contraoferta
      status: 'accepted',  // Cambiar estado a accepted
      finalFare: acceptedPrice,
      negotiationStatus: 'client_accepted',
      acceptedAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    });
    
    // Actualizar en PostgreSQL
    await rideRepo.update(rideId, {
      driver_id: driverId,
      status: 'accepted',
      final_fare: acceptedPrice,
    });
    
    console.log(`✅ [acceptCounterOffer] Cliente aceptó contraoferta de ${driverId}: ${acceptedPrice}, viaje ahora en estado 'accepted'`);
    
    return {
      success: true,
      message: 'Contraoferta aceptada, esperando confirmación del conductor',
      finalFare: acceptedPrice,
      driverId: driverId,
    };
  } catch (error: any) {
    console.error('❌ [acceptCounterOffer] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Calcular ETA inteligente basado en ubicación actual
 * ✅ NUEVO: Calcula ETA dinámico para el cliente
 */
export const getIntelligentETA = functions.https.onCall(async (data, context) => {
  try {
    const { rideId, currentLat, currentLng } = data;
    
    if (!rideId || currentLat === undefined || currentLng === undefined) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId, currentLat y currentLng son requeridos');
    }
    
    console.log(`⏱️ [getIntelligentETA] Calculando ETA para viaje: ${rideId}`);
    
    // Obtener datos del viaje desde Firebase
    const firebaseRide = await db.ref(`activeRides/${rideId}`).once('value');
    const ride = firebaseRide.val();
    
    if (!ride) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }
    
    // Calcular distancia aproximada usando fórmula de Haversine
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const haversine = (lat1: number, lng1: number, lat2: number, lng2: number) => {
      const R = 6371; // Radio de la Tierra en km
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };
    
    // Calcular distancia al destino
    const destination = ride.destination || ride.extraDestinations?.[0];
    if (!destination) {
      throw new functions.https.HttpsError('invalid-argument', 'No hay destino en el viaje');
    }
    
    const distanceKm = haversine(currentLat, currentLng, destination.lat, destination.lng);
    const distanceMeters = Math.round(distanceKm * 1000);
    
    // Estimar velocidad promedio: 40 km/h en ciudad
    const avgSpeed = 40; // km/h
    const etaMinutes = Math.ceil((distanceKm / avgSpeed) * 60);
    
    // Calcular timestamp de llegada
    const etaTimestamp = new Date(Date.now() + etaMinutes * 60 * 1000).toISOString();
    
    console.log(`✅ [getIntelligentETA] ETA calculado: ${etaMinutes} minutos, ${distanceMeters}m`);
    
    return {
      success: true,
      data: {
        etaMinutes,
        etaTimestamp,
        distanceRemaining: distanceMeters,
      },
    };
  } catch (error: any) {
    console.error('❌ [getIntelligentETA] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Actualizar estado del viaje y ubicación del conductor (para tracking)
 * ✅ NUEVO: Cloud Function para actualizar tracking desde el Frontend
 * ⚠️ Permite llamadas sin autenticación usando token especial
 */
export const updateRideStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { rideId, status, driverLocation, vehicleInspection } = data || {};

    if (!rideId || typeof rideId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
    }

    const uid = context.auth.uid;
    const snapshot = await db.ref(`activeRides/${rideId}`).once('value');
    const ride = snapshot.val();

    if (!ride) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    const isDriver = ride.driverId === uid;
    const isClient = ride.clientId === uid;
    if (!isDriver && !isClient) {
      throw new functions.https.HttpsError('permission-denied', 'No eres participante de este viaje');
    }

    console.log(`🚗 [updateRideStatus] Actualizando viaje: ${rideId}, status: ${status}, uid: ${uid}`);

    const updateData: any = {
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    };

    // Las transiciones de estado las gobiernan los callables dedicados
    // (startRide/completeRide/cancelRide). Aquí solo se permite el arranque
    // por el conductor (flujo de inspección de conductor designado) desde un
    // estado válido — nunca estados terminales ni retrocesos.
    if (status !== undefined && status !== null) {
      const canStartRide =
        status === 'in_progress' &&
        isDriver &&
        ['accepted', 'driver_on_route', 'driver_arrived'].includes(ride.status);
      if (!canStartRide) {
        throw new functions.https.HttpsError(
          'permission-denied',
          `Transición de estado no permitida: ${ride.status} -> ${status}`,
        );
      }
      updateData.status = 'in_progress';
      updateData.startedAt = ride.startedAt || admin.database.ServerValue.TIMESTAMP;
    }

    if (driverLocation !== undefined && driverLocation !== null) {
      if (!isDriver) {
        throw new functions.https.HttpsError('permission-denied', 'Solo el conductor puede actualizar driverLocation');
      }
      const lat = Number(driverLocation.latitude);
      const lng = Number(driverLocation.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new functions.https.HttpsError('invalid-argument', 'driverLocation inválido');
      }
      updateData.driverLocation = {
        latitude: lat,
        longitude: lng,
        speed: Number.isFinite(Number(driverLocation.speed)) ? Number(driverLocation.speed) : null,
        heading: Number.isFinite(Number(driverLocation.heading)) ? Number(driverLocation.heading) : null,
        accuracy: Number.isFinite(Number(driverLocation.accuracy)) ? Number(driverLocation.accuracy) : null,
        timestamp: admin.database.ServerValue.TIMESTAMP,
      };
    }

    if (vehicleInspection !== undefined && vehicleInspection !== null) {
      if (!isDriver) {
        throw new functions.https.HttpsError('permission-denied', 'Solo el conductor puede registrar la inspección');
      }
      if (typeof vehicleInspection !== 'object') {
        throw new functions.https.HttpsError('invalid-argument', 'vehicleInspection inválido');
      }
      const photos = vehicleInspection.photos && typeof vehicleInspection.photos === 'object'
        ? Object.fromEntries(
            Object.entries(vehicleInspection.photos)
              .filter(([, v]) => typeof v === 'string' && v.length <= 2000)
              .slice(0, 20),
          )
        : null;
      updateData.vehicleInspection = {
        inspected: vehicleInspection.inspected === true,
        timestamp: typeof vehicleInspection.timestamp === 'number' ? vehicleInspection.timestamp : Date.now(),
        driver_id: uid,
        inspection_id: typeof vehicleInspection.inspection_id === 'string' ? vehicleInspection.inspection_id : null,
        photos,
        storage_provider: 'supabase',
      };
    }

    await db.ref(`activeRides/${rideId}`).update(updateData);
    console.log(`✅ [updateRideStatus] Viaje actualizado: ${rideId} por ${uid}`);

    return { success: true, message: 'Viaje actualizado correctamente' };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    console.error('❌ [updateRideStatus] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * ✅ NUEVO: Cambiar método de pago
 * Permite al cliente o conductor cambiar el método de pago durante el viaje
 */
export const changePaymentMethod = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  // Enforce single-session
  await ensureActiveSession(context, data);

  try {
    const { rideId, newPaymentMethod, reason } = data;
    const userId = context.auth.uid;

    if (!rideId || !newPaymentMethod) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId y newPaymentMethod son requeridos');
    }

    // Validar que el método de pago sea válido
    if (!['cash', 'card'].includes(newPaymentMethod)) {
      throw new functions.https.HttpsError('invalid-argument', 'Método de pago inválido. Debe ser "cash" o "card"');
    }

    console.log(`💳 [changePaymentMethod] Cambiando método de pago para viaje: ${rideId}`);
    console.log(`   De: ?, A: ${newPaymentMethod}, Por: ${userId}, Razón: ${reason || 'No especificada'}`);

    // Obtener datos del viaje (intentar primero con el ID como Firebase ID)
    let rideSnapshot = await db.ref(`activeRides/${rideId}`).once('value');
    let rideData = rideSnapshot.val();
    let firebaseRideId = rideId; // Guardar el Firebase ID para actualizar después

    // Si no encuentra en Firebase, intentar buscar en Supabase y luego en Firebase por firebase_ride_id
    if (!rideData) {
      console.log(`⚠️ [changePaymentMethod] Viaje no encontrado en activeRides/${rideId}, buscando en Supabase...`);
      try {
        const { RideRepository } = await import('../sequelize/repositories/RideRepository');
        const rideRepo = new RideRepository();
        const supabaseRide = await rideRepo.findById(rideId);
        
        if (supabaseRide && supabaseRide.firebase_ride_id) {
          console.log(`✅ [changePaymentMethod] Viaje encontrado en Supabase, buscando en Firebase con firebase_ride_id: ${supabaseRide.firebase_ride_id}`);
          firebaseRideId = supabaseRide.firebase_ride_id;
          rideSnapshot = await db.ref(`activeRides/${firebaseRideId}`).once('value');
          rideData = rideSnapshot.val();
        }
      } catch (err: any) {
        console.warn(`⚠️ [changePaymentMethod] Error buscando en Supabase:`, err.message);
      }
    }

    if (!rideData) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado en Firebase ni en Supabase');
    }

    // Validar que el usuario sea cliente o conductor del viaje
    const isClient = rideData.clientId === userId;
    const isDriver = rideData.driverId === userId;

    if (!isClient && !isDriver) {
      throw new functions.https.HttpsError('permission-denied', 'No tienes permiso para cambiar el método de pago de este viaje');
    }

    const oldPaymentMethod = rideData.paymentMethod || 'cash';

    // No permitir cambiar si es el mismo método
    if (oldPaymentMethod === newPaymentMethod) {
      throw new functions.https.HttpsError('invalid-argument', `El método de pago ya es ${newPaymentMethod}`);
    }

    // ✅ ACTUALIZADO: Usar firebaseRideId para actualizar en Firebase
    console.log(`🔥 [changePaymentMethod] Actualizando en Firebase con ID: ${firebaseRideId}`);
    await db.ref(`activeRides/${firebaseRideId}`).update({
      paymentMethod: newPaymentMethod,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    });

    // ✅ También sincronizar paymentStatus/{rideId}
    try {
      const paymentStatusRef = db.ref(`paymentStatus/${firebaseRideId}`);
      const paymentStatusSnapshot = await paymentStatusRef.once('value');
      const paymentStatusData = paymentStatusSnapshot.val() || {};

      const paymentStatusUpdate: Record<string, any> = {
        method: newPaymentMethod,
        paymentMethod: newPaymentMethod,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      };

      // Preservar status existente o establecer 'pending' si no existe
      if (!paymentStatusData.status) {
        paymentStatusUpdate.status = 'pending';
      }

      // Conservar amount si existe, de lo contrario reutilizar existente
      if (!paymentStatusData.amount && rideData.finalFare) {
        paymentStatusUpdate.amount = rideData.finalFare;
      }

      await paymentStatusRef.update(paymentStatusUpdate);
      console.log(`✅ [changePaymentMethod] paymentStatus sincronizado con método ${newPaymentMethod}`);
    } catch (paymentStatusError: any) {
      console.warn(`⚠️ [changePaymentMethod] No se pudo sincronizar paymentStatus:`, paymentStatusError.message);
    }

    console.log(`✅ [changePaymentMethod] Método de pago actualizado en Firebase: ${oldPaymentMethod} → ${newPaymentMethod}`);

    // ✅ NUEVO: Actualizar en Supabase también
    try {
      const { RideRepository } = await import('../sequelize/repositories/RideRepository');
      const rideRepo = new RideRepository();
      await rideRepo.update(rideId, {
        payment_method: newPaymentMethod,
      });
      console.log(`✅ [changePaymentMethod] Método de pago actualizado en Supabase: ${newPaymentMethod}`);
    } catch (supabaseError: any) {
      console.warn(`⚠️ [changePaymentMethod] Error actualizando en Supabase:`, supabaseError.message);
      // No lanzar error - Firebase ya fue actualizado
    }

    // Registrar el cambio en paymentMethodChanges
    const changeId = db.ref().push().key;
    await db.ref(`paymentMethodChanges/${firebaseRideId}/${changeId}`).set({
      changedAt: admin.database.ServerValue.TIMESTAMP,
      changedBy: userId,
      from: oldPaymentMethod,
      to: newPaymentMethod,
      reason: reason || 'No especificada',
    });

    console.log(`📝 [changePaymentMethod] Cambio registrado en paymentMethodChanges/${firebaseRideId}/${changeId}`);

    return {
      success: true,
      message: `Método de pago cambiado de ${oldPaymentMethod} a ${newPaymentMethod}`,
      ride: {
        id: rideId,
        paymentMethod: newPaymentMethod,
      },
    };
  } catch (error: any) {
    console.error('❌ [changePaymentMethod] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Rechazar una solicitud de viaje para un conductor específico
 * Oculta el viaje para ese conductor hasta que el precio cambie
 */
export const rejectRide = functions.https.onCall(async (data, context) => {
  await requireDriver(context);

  try {
    const { rideId, reason } = data || {};
    const driverId = context.auth!.uid;

    if (!rideId) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
    }

    // Obtener datos actuales del viaje desde Firebase
    const rideSnap = await db.ref(`activeRides/${rideId}`).once('value');
    const rideData = rideSnap.val();

    if (!rideData) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    // Permitir rechazo principalmente en solicitudes abiertas, pero registrar en cualquier estado
    const allowedStatuses = ['requested', 'driver_offered', 'pending_confirm'];
    if (!allowedStatuses.includes(String(rideData.status))) {
      console.log(`ℹ️ [rejectRide] Registrando rechazo en estado ${rideData.status}`);
    }

    // Determinar precio de referencia actual (cliente > estimado)
    const currentEstimatedPrice = Number(rideData.estimatedPrice || 0) || null;
    const currentClientSuggestedPrice = (
      rideData.clientSuggestedPrice !== undefined && rideData.clientSuggestedPrice !== null
    ) ? Number(rideData.clientSuggestedPrice) : null;
    const priceAtRejection = (currentClientSuggestedPrice && currentClientSuggestedPrice > 0)
      ? currentClientSuggestedPrice
      : (currentEstimatedPrice || null);

    const nowTs = admin.database.ServerValue.TIMESTAMP;

    const currentRideStatus = String(rideData.status || '').toLowerCase();
    const currentOffers = (rideData.offers && typeof rideData.offers === 'object')
      ? rideData.offers
      : {};
    const myOffer = currentOffers[driverId];
    const myOfferStatus = String(myOffer?.status || '').toLowerCase();
    const hasDriverOfferPrice = Number(myOffer?.offeredPrice || 0) > 0;
    const hasNegotiationEvidence = hasDriverOfferPrice
      || String(rideData.negotiationStatus || '').toLowerCase().startsWith('driver_');
    const clientAlreadyAcceptedDriver = myOfferStatus === 'accepted'
      || (String(rideData.driverId || '').trim() === driverId
        && ['pending_confirm', 'driver_assigned', 'accepted', 'driver_on_route', 'driver_arrived', 'in_progress', 'completed'].includes(currentRideStatus));

    // Guardar registro de rechazo por conductor
    const rejectionRef = db.ref(`activeRides/${rideId}/rejections/${driverId}`);
    await rejectionRef.update({
      reason: reason || 'not_interested',
      priceAtRejection: priceAtRejection,
      clientSuggestedPriceAtRejection: currentClientSuggestedPrice,
      estimatedPriceAtRejection: currentEstimatedPrice,
      rejectedAt: nowTs,
      updatedAt: nowTs,
    });

    // Si el conductor retiró una oferta/no aceptada por cliente, eliminarla para que desaparezca en cliente
    if (hasNegotiationEvidence && !clientAlreadyAcceptedDriver) {
      try {
        await db.ref(`activeRides/${rideId}/offers/${driverId}`).remove();
      } catch (offerRemoveErr) {
        console.warn('⚠️ [rejectRide] No se pudo eliminar offers/{driverId}:', offerRemoveErr);
      }
    }

    // Mantener compatibilidad para flujos que consumen estado de oferta si no se eliminó
    try {
      if (!hasNegotiationEvidence || clientAlreadyAcceptedDriver) {
        await db.ref(`activeRides/${rideId}/offers/${driverId}`).update({
          status: 'rejected',
          updatedAt: nowTs,
        });
      }
    } catch (offerErr) {
      console.warn('⚠️ [rejectRide] No se pudo actualizar offers:', offerErr);
    }

    console.log(`✅ [rejectRide] Conductor ${driverId} rechazó viaje ${rideId} (precio: ${priceAtRejection ?? 'N/A'})`);

    return {
      success: true,
      message: 'Viaje rechazado para este conductor hasta que el precio cambie',
      ride: { id: rideId },
    };
  } catch (error: any) {
    console.error('❌ [rejectRide] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});
