import * as functions from 'firebase-functions';
import admin from 'firebase-admin';
import { firestore } from '../config/firebase';
import { regionConfig } from '../config/functions-config';
import { DriverRepository } from '../sequelize/repositories/DriverRepository';
import { VehicleRepository } from '../sequelize/repositories/VehicleRepository';
import { handleCheckRegionAvailability } from './region_availability';

type PreflightRole = 'client' | 'driver';
type DriverApprovalStatus = 'active' | 'pending' | 'suspended' | 'rejected';
type DriverDocumentsStatus = 'verified' | 'pending' | 'suspended' | 'rejected';

type GetPreflightDataRequest = {
  role?: PreflightRole;
  userId?: string;
  platform?: string;
  appVersion?: string;
  location?: {
    lat?: number;
    lng?: number;
  } | null;
};

type PendingPaymentsSummary = {
  type: PreflightRole;
  count: number;
  amount: number;
  firstRideId?: string;
  firstAmount?: number;
  firstPaymentMethod?: string;
};

type RechargeFundsSummary = {
  availableBalance: number;
  blocked: boolean;
};

const db = admin.database();
const driverRepo = new DriverRepository();
const vehicleRepo = new VehicleRepository();

const CURRENT_TERMS_VERSION = '2025-11-29';
const ACTIVE_DRIVER_STATUSES = new Set(['accepted', 'driver_on_route', 'driver_arrived', 'in_progress']);
const ACTIVE_CLIENT_TRACK_STATUSES = new Set(['accepted', 'driver_on_route', 'driver_arrived', 'in_progress']);
const CLIENT_WAITING_STATUSES = new Set(['requested', 'searching', 'pending', 'pending_confirmation']);
const PENDING_PAYMENT_STATUSES = new Set(['pending', 'pending_confirmation', 'payment_in_progress', 'in_progress', 'processing', 'pending_capture']);

function normalizeString(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function buildRechargeFundsSummary(
  walletData: Record<string, any> | null,
  driverData: Record<string, any> | null,
): RechargeFundsSummary {
  const walletBalance = toFiniteNumber(
    walletData?.availableBalance ??
      walletData?.balance ??
      walletData?.currentBalance ??
      walletData?.currentRechargeBalance,
  );

  const driverBalance = toFiniteNumber(
    driverData?.current_recharge_balance ??
      driverData?.currentRechargeBalance,
  );

  const availableBalance = round2(walletBalance ?? driverBalance ?? 0);
  return {
    availableBalance,
    blocked: availableBalance <= 0,
  };
}

function toEpochMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (value && typeof value === 'object') {
    const candidate = value as { toDate?: () => Date; seconds?: number; nanoseconds?: number };
    if (typeof candidate.toDate === 'function') {
      const date = candidate.toDate();
      if (date instanceof Date && Number.isFinite(date.getTime())) {
        return date.getTime();
      }
    }
    if (typeof candidate.seconds === 'number') {
      const millis = candidate.seconds * 1000 + Math.floor((candidate.nanoseconds || 0) / 1_000_000);
      if (Number.isFinite(millis)) {
        return millis;
      }
    }
  }

  return undefined;
}

function normalizeDriverAccountStatus(raw: unknown): DriverApprovalStatus {
  const value = normalizeString(raw).toLowerCase();
  if (value === 'suspended') return 'suspended';
  if (value === 'rejected' || value === 'disabled' || value === 'denied') return 'rejected';
  if (value === 'active' || value === 'verified' || value === 'approved') return 'active';
  return 'pending';
}

function normalizeDriverDocumentsStatus(raw: unknown): DriverDocumentsStatus {
  const value = normalizeString(raw).toLowerCase();
  if (value === 'verified') return 'verified';
  if (value === 'suspended') return 'suspended';
  if (value === 'rejected') return 'rejected';
  return 'pending';
}

async function getDriverApproval(driverId: string): Promise<{
  allowed: boolean;
  accountStatus: DriverApprovalStatus;
  documentsStatus: DriverDocumentsStatus;
  hasActiveVehicle: boolean;
} | null> {
  try {
    const driver = await driverRepo.findByUserId(driverId);
    if (!driver) {
      return null;
    }

    const driverJson = driver.toJSON() as Record<string, unknown>;
    const accountStatus = normalizeDriverAccountStatus(driverJson.status);
    const documentsStatus = normalizeDriverDocumentsStatus(driverJson.documents_status);

    const vehicles = await vehicleRepo.findByDriverId(String(driverJson.id || ''));
    const hasActiveVehicle = Array.isArray(vehicles)
      ? vehicles.some((vehicle) => {
          const vehicleJson = vehicle.toJSON() as Record<string, unknown>;
          return vehicleJson.is_active === true;
        })
      : false;

    return {
      allowed: accountStatus === 'active' && documentsStatus === 'verified' && hasActiveVehicle,
      accountStatus,
      documentsStatus,
      hasActiveVehicle,
    };
  } catch (error) {
    console.warn('⚠️ [getPreflightData] Error obteniendo driverApproval:', error);
    return null;
  }
}

async function getTermsSummary(userId: string): Promise<{
  currentVersion: string;
  acceptedVersion?: string;
  acceptedAt?: number;
}> {
  try {
    const profileDoc = await firestore.collection('users').doc(userId).get();
    const profile = profileDoc.exists ? profileDoc.data() : undefined;
    const acceptedVersion = normalizeString(profile?.termsVersion);
    return {
      currentVersion: CURRENT_TERMS_VERSION,
      acceptedVersion: acceptedVersion || undefined,
      acceptedAt: toEpochMs(profile?.termsAcceptedAt),
    };
  } catch (error) {
    console.warn('⚠️ [getPreflightData] Error leyendo términos de usuario:', error);
    return {
      currentVersion: CURRENT_TERMS_VERSION,
    };
  }
}

function buildActiveRideSummary(role: PreflightRole, userId: string, activeRides: Record<string, any>) {
  const entries = Object.entries(activeRides || {});
  for (const [rideId, ride] of entries) {
    if (!ride || typeof ride !== 'object') {
      continue;
    }

    const status = normalizeString(ride.status).toLowerCase();

    if (role === 'driver') {
      const rideDriverId = normalizeString(ride.driverId);
      if (rideDriverId !== userId) {
        continue;
      }
      if (!ACTIVE_DRIVER_STATUSES.has(status)) {
        continue;
      }
      return {
        rideId,
        status,
        roleView: 'driver' as const,
        routeHint: 'active' as const,
        metadata: {
          rideId,
          clientId: ride.clientId,
          origin: ride.origin,
          destination: ride.destination,
          estimatedFare: ride.finalFare || ride.estimatedPrice,
        },
      };
    }

    const rideClientId = normalizeString(ride.clientId);
    if (rideClientId !== userId) {
      continue;
    }
    if (!(ACTIVE_CLIENT_TRACK_STATUSES.has(status) || CLIENT_WAITING_STATUSES.has(status))) {
      continue;
    }

    const waiting = CLIENT_WAITING_STATUSES.has(status);
    return {
      rideId,
      status,
      roleView: waiting ? 'client_waiting' as const : 'client_tracking' as const,
      routeHint: waiting ? 'waiting' as const : 'tracking' as const,
      metadata: waiting
        ? { rideId }
        : {
            rideId,
            driverId: ride.driverId,
            driverName: ride.driver?.name,
            vehiclePlate: ride.vehicle?.plate,
            vehicleBrand: ride.vehicle?.brand,
            vehicleModel: ride.vehicle?.model,
            estimatedFare: ride.estimatedPrice,
          },
    };
  }

  return null;
}

function buildProgrammedRideSummary(role: PreflightRole, userId: string, programmedRides: Record<string, any>) {
  const entries = Object.entries(programmedRides || {});
  const now = Date.now();

  if (role === 'client') {
    for (const [rideId, ride] of entries) {
      if (!ride || typeof ride !== 'object') continue;
      if (normalizeString(ride.status).toLowerCase() === 'canceled') continue;
      if (normalizeString(ride.clientId) !== userId) continue;
      if (!ride.clientConfirmationRequestedAt) continue;
      if (ride.clientConfirmedAt) continue;

      const scheduledAt = toFiniteNumber(ride.scheduledAt);
      if (scheduledAt && now > scheduledAt + 5 * 60 * 1000) continue;

      return {
        type: 'programmed_ride_client_confirm' as const,
        rideId,
        scheduledAt: scheduledAt || undefined,
      };
    }
    return null;
  }

  for (const [rideId, ride] of entries) {
    if (!ride || typeof ride !== 'object') continue;
    if (normalizeString(ride.status).toLowerCase() === 'canceled') continue;
    if (normalizeString(ride.driverId) !== userId) continue;
    if (!ride.driverConfirmationRequestedAt) continue;
    if (ride.driverConfirmedAt) continue;
    if (!ride.clientConfirmedAt) continue;

    const scheduledAt = toFiniteNumber(ride.scheduledAt);
    if (scheduledAt && now > scheduledAt + 5 * 60 * 1000) continue;

    return {
      type: 'programmed_ride_driver_confirm' as const,
      rideId,
      scheduledAt: scheduledAt || undefined,
    };
  }
  return null;
}

function buildPendingPaymentsSummary(
  role: PreflightRole,
  userId: string,
  paymentStatus: Record<string, any>,
  activeRides: Record<string, any>,
  completedRides: Record<string, any>,
): PendingPaymentsSummary | null {
  let count = 0;
  let amount = 0;
  let firstRideId: string | undefined;
  let firstAmount: number | undefined;
  let firstPaymentMethod: string | undefined;

  const entries = Object.entries(paymentStatus || {});
  for (const [rideId, payment] of entries) {
    if (!payment || typeof payment !== 'object') {
      continue;
    }

    const status = normalizeString(payment.status).toLowerCase();
    if (!PENDING_PAYMENT_STATUSES.has(status)) {
      continue;
    }

    const rawAmount = toFiniteNumber(payment.finalAmount ?? payment.amount ?? payment.chargeAmount ?? 0) ?? 0;
    if (rawAmount <= 0) {
      continue;
    }

    if (role === 'driver') {
      const paymentDriverId = normalizeString(
        payment.driverId ??
          payment.driver_id ??
          payment?.ride?.driverId ??
          payment?.ride?.driver_id,
      );
      if (paymentDriverId !== userId) {
        continue;
      }

      const chargeTargetRaw = normalizeString(payment.chargeTarget ?? payment.charge_target);
      const requiresClientPaymentFlag = payment.requiresClientPayment ?? payment.requires_client_payment;
      if (requiresClientPaymentFlag === false) {
        continue;
      }
      if (chargeTargetRaw === 'driver') {
        continue;
      }
    } else {
      const requiresClientPayment =
        payment.requiresClientPayment === true ||
        payment.chargeTarget === 'client' ||
        (typeof payment.chargeType === 'string' && payment.chargeType.includes('client')) ||
        (typeof payment.canceledBy === 'string' && payment.canceledBy === 'client' && rawAmount > 0) ||
        (rawAmount > 0 && typeof payment.cancelReason === 'string' && payment.cancelReason.toLowerCase().includes('cliente'));

      if (!requiresClientPayment) {
        continue;
      }

      const paymentClientId = normalizeString(
        payment.clientId ??
          payment.client_id ??
          payment?.ride?.clientId ??
          payment?.ride?.client_id,
      );
      if (paymentClientId) {
        if (paymentClientId !== userId) {
          continue;
        }
      } else {
        const rideData = activeRides[rideId] || completedRides[rideId];
        const rideClientId = normalizeString(rideData?.clientId ?? rideData?.client_id);
        if (!rideClientId || rideClientId !== userId) {
          continue;
        }
      }
    }

    count += 1;
    amount += rawAmount;

    if (!firstRideId) {
      firstRideId = rideId;
      firstAmount = round2(rawAmount);
      firstPaymentMethod = normalizeString(payment.paymentMethod ?? payment.method ?? 'cash') || 'cash';
    }
  }

  if (count === 0) {
    return null;
  }

  return {
    type: role,
    count,
    amount: round2(amount),
    firstRideId,
    firstAmount,
    firstPaymentMethod,
  };
}

async function resolveAuthenticatedUserIdFromHttpRequest(req: any): Promise<string> {
  const authHeaderRaw = req?.headers?.authorization || req?.headers?.Authorization || '';
  const authHeader = String(authHeaderRaw);
  if (!authHeader.startsWith('Bearer ')) {
    throw new functions.https.HttpsError('unauthenticated', 'Token Authorization no enviado');
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    throw new functions.https.HttpsError('unauthenticated', 'Token Authorization vacío');
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return normalizeString(decoded?.uid);
  } catch (error) {
    console.warn('⚠️ [getPreflightDataHttp] verifyIdToken falló:', error);
    throw new functions.https.HttpsError('unauthenticated', 'Token inválido o expirado');
  }
}

async function buildPreflightDataResponse(data: GetPreflightDataRequest, authUserId: string) {
  const startTime = Date.now();
  const role = data?.role;
  if (role !== 'client' && role !== 'driver') {
    throw new functions.https.HttpsError('invalid-argument', 'role inválido');
  }

  const requestedUserId = normalizeString(data?.userId);
  if (requestedUserId && requestedUserId !== authUserId) {
    throw new functions.https.HttpsError('permission-denied', 'userId no coincide con el usuario autenticado');
  }
  const userId = authUserId;

  const lat = toFiniteNumber(data?.location?.lat);
  const lng = toFiniteNumber(data?.location?.lng);

  try {
    const activeRidesPromise = db.ref('activeRides').once('value');
    const programmedRidesPromise = db.ref('programmedRides').once('value');
    const paymentStatusPromise = db.ref('paymentStatus').once('value');
    const completedRidesPromise = role === 'client' ? db.ref('completedRides').once('value') : Promise.resolve(null);
    const driverWalletPromise = role === 'driver'
      ? db.ref(`drivers/${userId}/wallet`).once('value')
      : Promise.resolve(null);
    const driverProfilePromise = role === 'driver'
      ? driverRepo.findByUserId(userId).catch(() => null)
      : Promise.resolve(null);
    const termsPromise = getTermsSummary(userId);
    const driverApprovalPromise = role === 'driver' ? getDriverApproval(userId) : Promise.resolve(null);
    const regionPromise = lat != null && lng != null
      ? handleCheckRegionAvailability({
          latitude: lat,
          longitude: lng,
          platform: normalizeString(data?.platform) || undefined,
          appVersion: normalizeString(data?.appVersion) || undefined,
        })
          .then((regionResponse) => ({
            ...regionResponse,
            latitude: lat,
            longitude: lng,
          }))
          .catch((error) => {
            console.warn('⚠️ [getPreflightData] Error verificando región:', error);
            return null;
          })
      : Promise.resolve(null);

    const settled = await Promise.allSettled([
      activeRidesPromise,
      programmedRidesPromise,
      paymentStatusPromise,
      completedRidesPromise,
      driverWalletPromise,
      driverProfilePromise,
      termsPromise,
      driverApprovalPromise,
      regionPromise,
    ]);

    const activeRidesSnapshot = settled[0].status === 'fulfilled' ? settled[0].value : null;
    const programmedRidesSnapshot = settled[1].status === 'fulfilled' ? settled[1].value : null;
    const paymentStatusSnapshot = settled[2].status === 'fulfilled' ? settled[2].value : null;
    const completedRidesSnapshot = settled[3].status === 'fulfilled' ? settled[3].value : null;
    const driverWalletSnapshot = settled[4].status === 'fulfilled' ? settled[4].value : null;
    const driverProfile = settled[5].status === 'fulfilled' ? settled[5].value : null;
    const terms = settled[6].status === 'fulfilled'
      ? settled[6].value
      : {
          currentVersion: CURRENT_TERMS_VERSION,
        };
    const driverApproval = settled[7].status === 'fulfilled' ? settled[7].value : null;
    const region = settled[8].status === 'fulfilled' ? settled[8].value : null;

    const activeRidesData = (activeRidesSnapshot?.val() || {}) as Record<string, any>;
    const programmedRidesData = (programmedRidesSnapshot?.val() || {}) as Record<string, any>;
    const paymentStatusData = (paymentStatusSnapshot?.val() || {}) as Record<string, any>;
    const completedRidesData = (completedRidesSnapshot && typeof completedRidesSnapshot.val === 'function'
      ? completedRidesSnapshot.val()
      : {}) as Record<string, any>;
    const driverWalletData = (driverWalletSnapshot && typeof driverWalletSnapshot.val === 'function'
      ? driverWalletSnapshot.val()
      : null) as Record<string, any> | null;
    const driverProfileData = (driverProfile && typeof (driverProfile as any).toJSON === 'function'
      ? (driverProfile as any).toJSON()
      : null) as Record<string, any> | null;

    const activeRide = buildActiveRideSummary(role, userId, activeRidesData);
    const programmedRide = buildProgrammedRideSummary(role, userId, programmedRidesData);
    const pendingPayments = role === 'driver'
      ? buildPendingPaymentsSummary(role, userId, paymentStatusData, activeRidesData, completedRidesData)
      : null;
    const rechargeFunds = role === 'driver'
      ? buildRechargeFundsSummary(driverWalletData, driverProfileData)
      : null;

    return {
      success: true,
      role,
      userId,
      timestamp: Date.now(),
      latencyMs: Date.now() - startTime,
      region,
      terms,
      driverApproval,
      activeRide,
      programmedRide,
      pendingPayments,
      penalties: null,
      rechargeFunds,
    };
  } catch (error: any) {
    console.error('❌ [getPreflightData] Error:', error);
    throw new functions.https.HttpsError('internal', error?.message || 'Error obteniendo preflight');
  }
}

export const getPreflightData = functions
  .runWith(regionConfig)
  .https.onCall(async (data: GetPreflightDataRequest, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    return await buildPreflightDataResponse(data, context.auth.uid);
  });

export const getPreflightDataHttp = functions
  .runWith(regionConfig)
  .https.onRequest(async (req, res) => {
    try {
      const userId = await resolveAuthenticatedUserIdFromHttpRequest(req);
      const data = (req.body || {}) as GetPreflightDataRequest;
      const response = await buildPreflightDataResponse(data, userId);
      res.status(200).json(response);
    } catch (error: any) {
      const code = String(error?.code || '');
      const message = typeof error?.message === 'string' ? error.message : 'Error obteniendo preflight';
      if (code === 'invalid-argument') {
        res.status(400).json({ error: message, code });
        return;
      }
      if (code === 'permission-denied') {
        res.status(403).json({ error: message, code });
        return;
      }
      if (code === 'unauthenticated') {
        res.status(401).json({ error: message, code });
        return;
      }
      console.error('❌ [getPreflightDataHttp] Error:', error);
      res.status(500).json({ error: message, code: code || 'internal' });
    }
  });
