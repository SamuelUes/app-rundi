import * as functions from 'firebase-functions/v1';
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

type TermsDocumentType = 'general' | 'users' | 'designated_driver';

const CURRENT_TERMS_VERSION = '1.0';
const TERMS_DOCUMENTS: TermsDocumentType[] = ['general', 'users', 'designated_driver'];
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

function normalizePreflightRole(value: unknown): PreflightRole | null {
  const role = normalizeString(value).toLowerCase();
  if (role === 'client' || role === 'admin') return 'client';
  if (role === 'driver' || role === 'designated_driver') return 'driver';
  return null;
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
  // 'active' aparece en datos reales (enum driver_documents_status lo admite)
  // con el mismo significado que en account_status: documentos aprobados.
  if (value === 'verified' || value === 'active' || value === 'approved') return 'verified';
  if (value === 'suspended') return 'suspended';
  if (value === 'rejected') return 'rejected';
  return 'pending';
}

type DriverApprovalData = {
  summary: {
    allowed: boolean;
    accountStatus: DriverApprovalStatus;
    documentsStatus: DriverDocumentsStatus;
    hasActiveVehicle: boolean;
  };
  driverData: Record<string, unknown> | null;
};

async function getDriverApproval(driverId: string): Promise<DriverApprovalData> {
  const driver = await driverRepo.findPreflightByUserId(driverId);
  if (!driver) {
    return {
      summary: {
        allowed: false,
        accountStatus: 'pending',
        documentsStatus: 'pending',
        hasActiveVehicle: false,
      },
      driverData: null,
    };
  }

  const driverJson = driver.toJSON() as Record<string, unknown>;
  const accountStatus = normalizeDriverAccountStatus(driverJson.status);
  const documentsStatus = normalizeDriverDocumentsStatus(driverJson.documents_status);
  const hasActiveVehicle = await vehicleRepo.hasActiveForDriverId(String(driverJson.id || ''));

  return {
    summary: {
      allowed: accountStatus === 'active' && documentsStatus === 'verified' && hasActiveVehicle,
      accountStatus,
      documentsStatus,
      hasActiveVehicle,
    },
    driverData: driverJson,
  };
}

function getTermsSummary(profile?: Record<string, any>): {
  currentVersion: string;
  acceptedVersion?: string;
  acceptedAt?: number;
  acceptedAllDocuments: boolean;
  acceptedDocuments: Record<TermsDocumentType, {
    accepted: boolean;
    version?: string;
    acceptedAt?: number;
  }>;
} {
  const documentAcceptances = TERMS_DOCUMENTS.reduce((acc, documentType) => {
    acc[documentType] = { accepted: false };
    return acc;
  }, {} as Record<TermsDocumentType, { accepted: boolean; version?: string; acceptedAt?: number }>);

  const acceptedVersion = normalizeString(profile?.termsVersion);
  const acceptedAt = toEpochMs(profile?.termsAcceptedAt);
  const acceptedByLegacyVersion = acceptedVersion === CURRENT_TERMS_VERSION;
  const rawTermsAcceptance =
    profile?.termsAcceptance && typeof profile.termsAcceptance === 'object'
      ? (profile.termsAcceptance as Record<string, any>)
      : null;
  const acceptanceType = normalizeString(rawTermsAcceptance?.type).toLowerCase();
  const acceptanceVersion = normalizeString(rawTermsAcceptance?.version);
  const acceptedGlobally = acceptedByLegacyVersion ||
    (acceptanceType === 'general' && acceptanceVersion === CURRENT_TERMS_VERSION);
  const documentAcceptanceRaw =
    rawTermsAcceptance?.documents && typeof rawTermsAcceptance.documents === 'object'
      ? (rawTermsAcceptance.documents as Record<string, any>)
      : null;

  for (const documentType of TERMS_DOCUMENTS) {
    const rawDocument = documentAcceptanceRaw?.[documentType];
    const documentVersion = normalizeString(rawDocument?.version);
    const documentAcceptedAt = toEpochMs(rawDocument?.acceptedAt);
    const explicitAccepted = rawDocument?.accepted === true;
    const acceptedByDocumentVersion =
      documentVersion === CURRENT_TERMS_VERSION && (explicitAccepted || Boolean(documentAcceptedAt));
    const accepted = acceptedGlobally || acceptedByDocumentVersion;

    documentAcceptances[documentType] = {
      accepted,
      version: documentVersion || (accepted ? CURRENT_TERMS_VERSION : undefined),
      acceptedAt: documentAcceptedAt || (accepted && acceptedAt ? acceptedAt : undefined),
    };
  }

  return {
    currentVersion: CURRENT_TERMS_VERSION,
    acceptedVersion: acceptedVersion || undefined,
    acceptedAt,
    acceptedAllDocuments: TERMS_DOCUMENTS.every(
      (documentType) => documentAcceptances[documentType].accepted,
    ),
    acceptedDocuments: documentAcceptances,
  };
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
  userId: string,
  paymentStatus: Record<string, any>,
): PendingPaymentsSummary | null {
  let count = 0;
  let amount = 0;
  let firstRideId: string | undefined;
  let firstAmount: number | undefined;
  let firstPaymentMethod: string | undefined;

  for (const [rideId, payment] of Object.entries(paymentStatus || {})) {
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

    const paymentDriverId = normalizeString(
      payment.driverId ?? payment.driver_id ?? payment?.ride?.driverId ?? payment?.ride?.driver_id,
    );
    if (paymentDriverId !== userId) {
      continue;
    }

    const chargeTarget = normalizeString(payment.chargeTarget ?? payment.charge_target);
    const requiresClientPayment = payment.requiresClientPayment ?? payment.requires_client_payment;
    if (requiresClientPayment === false || chargeTarget === 'driver') {
      continue;
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
    type: 'driver',
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
  } catch (error: any) {
    // En el emulador los tokens persistidos quedan revocados al reiniciarlo;
    // el cliente reintenta con token fresco vía callable.
    console.warn(
      '⚠️ [getPreflightDataHttp] verifyIdToken falló:',
      error?.errorInfo?.code || error?.code || error,
    );
    throw new functions.https.HttpsError('unauthenticated', 'Token inválido o expirado');
  }
}

async function buildPreflightDataResponse(data: GetPreflightDataRequest, authUserId: string) {
  const startTime = Date.now();
  const requestedRole = data?.role;
  if (requestedRole !== 'client' && requestedRole !== 'driver') {
    throw new functions.https.HttpsError('invalid-argument', 'role inválido');
  }

  const requestedUserId = normalizeString(data?.userId);
  if (requestedUserId && requestedUserId !== authUserId) {
    throw new functions.https.HttpsError('permission-denied', 'userId no coincide con el usuario autenticado');
  }
  const userId = authUserId;
  const ownerField = requestedRole === 'driver' ? 'driverId' : 'clientId';
  const lat = toFiniteNumber(data?.location?.lat);
  const lng = toFiniteNumber(data?.location?.lng);

  try {
    const userProfilePromise = firestore.collection('users').doc(userId).get();
    const activeRidesPromise = db.ref('activeRides').orderByChild(ownerField).equalTo(userId).once('value');
    const programmedRidesPromise = db.ref('programmedRides').orderByChild(ownerField).equalTo(userId).once('value');
    const paymentStatusPromise = requestedRole === 'driver'
      ? Promise.all([
          db.ref('paymentStatus').orderByChild('driverId').equalTo(userId).once('value'),
          db.ref('paymentStatus').orderByChild('driver_id').equalTo(userId).once('value'),
        ]).then((snapshots) =>
          Object.assign({}, ...snapshots.map((snapshot) => snapshot.val() || {})) as Record<string, any>,
        )
      : Promise.resolve(null);
    const driverWalletPromise = requestedRole === 'driver'
      ? db.ref(`drivers/${userId}/wallet`).once('value').catch((error) => {
          console.warn('⚠️ [getPreflightData] Error leyendo wallet de conductor:', error);
          return null;
        })
      : Promise.resolve(null);
    const driverApprovalPromise = requestedRole === 'driver'
      ? getDriverApproval(userId)
      : Promise.resolve(null);
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

    const [userProfileSnapshot, activeRidesSnapshot, programmedRidesSnapshot, paymentStatusSnapshot, driverWalletSnapshot, driverApprovalData, region] =
      await Promise.all([
        userProfilePromise,
        activeRidesPromise,
        programmedRidesPromise,
        paymentStatusPromise,
        driverWalletPromise,
        driverApprovalPromise,
        regionPromise,
      ]);

    const profile = userProfileSnapshot.exists ? userProfileSnapshot.data() : undefined;
    if (!profile) {
      throw new functions.https.HttpsError('failed-precondition', 'Perfil de usuario no disponible para preflight');
    }

    const authoritativeRole = normalizePreflightRole(profile.role);
    if (!authoritativeRole) {
      throw new functions.https.HttpsError('failed-precondition', 'Rol de usuario no disponible para preflight');
    }
    if (authoritativeRole !== requestedRole) {
      throw new functions.https.HttpsError('permission-denied', 'role no coincide con el perfil autenticado');
    }

    const activeRidesData = (activeRidesSnapshot.val() || {}) as Record<string, any>;
    const programmedRidesData = (programmedRidesSnapshot.val() || {}) as Record<string, any>;
    const paymentStatusData = (paymentStatusSnapshot || {}) as Record<string, any>;
    const terms = getTermsSummary(profile);
    const driverWalletData = driverWalletSnapshot?.val() as Record<string, any> | null;
    const driverApproval = driverApprovalData?.summary ?? null;
    const driverProfileData = driverApprovalData?.driverData ?? null;
    const activeRide = buildActiveRideSummary(requestedRole, userId, activeRidesData);
    const programmedRide = buildProgrammedRideSummary(requestedRole, userId, programmedRidesData);
    const pendingPayments = requestedRole === 'driver'
      ? buildPendingPaymentsSummary(userId, paymentStatusData)
      : null;
    const rechargeFunds = requestedRole === 'driver'
      ? buildRechargeFundsSummary(driverWalletData, driverProfileData)
      : null;

    return {
      success: true,
      role: requestedRole,
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
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('unavailable', 'No se pudo completar el preflight. Intenta nuevamente.');
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

export const acceptPreflightTerms = functions
  .runWith(regionConfig)
  .https.onCall(async (data: {
    expectedUid: string;
    version?: string;
    acceptedDocuments?: Partial<Record<TermsDocumentType, boolean>>;
  }, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
    }
    if (normalizeString(data?.expectedUid) !== context.auth.uid) {
      throw new functions.https.HttpsError('permission-denied', 'UID de aceptación no coincide con el usuario autenticado');
    }

    const version = normalizeString(data?.version);
    const acceptedDocuments = data?.acceptedDocuments;
    if (
      version !== CURRENT_TERMS_VERSION ||
      !TERMS_DOCUMENTS.every((documentType) => acceptedDocuments?.[documentType] === true)
    ) {
      throw new functions.https.HttpsError('invalid-argument', 'Debes aceptar todos los documentos vigentes');
    }

    const userRef = firestore.collection('users').doc(context.auth.uid);
    const userSnapshot = await userRef.get();
    if (!userSnapshot.exists) {
      throw new functions.https.HttpsError('failed-precondition', 'Perfil de usuario no disponible');
    }

    const acceptedAt = admin.firestore.Timestamp.now();
    const documents = TERMS_DOCUMENTS.reduce((result, documentType) => {
      result[documentType] = {
        accepted: true,
        version,
        acceptedAt,
      };
      return result;
    }, {} as Record<TermsDocumentType, { accepted: boolean; version: string; acceptedAt: admin.firestore.Timestamp }>);

    await userRef.update({
      termsVersion: version,
      termsAcceptedAt: acceptedAt,
      termsAcceptance: {
        type: 'by_document',
        version,
        acceptedAt,
        documents,
      },
      updatedAt: acceptedAt,
    });

    return { success: true, acceptedAt: acceptedAt.toMillis() };
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
      if (code === 'failed-precondition') {
        res.status(412).json({ error: message, code });
        return;
      }
      if (code === 'unavailable') {
        res.status(503).json({ error: message, code });
        return;
      }
      console.error('❌ [getPreflightDataHttp] Error:', error);
      res.status(500).json({ error: message, code: code || 'internal' });
    }
  });
