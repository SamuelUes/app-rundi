import {
  acceptPreflightTerms,
  getPreflightData as getPlatformPreflight,
  getRegionAvailability,
} from '../../api/platform';
import { getMyDriverProfile, getMyVehicles } from '../../api/drivers';
import { getPendingPayments } from '../../api/payments';
import { getMyProgrammedRides } from '../../api/programmed';
import { getMyRides } from '../../api/rides';
import type { GetPreflightDataRequest, GetPreflightDataResponse, TermsDocumentType } from '../../types/preflight';
import {
  forceRefreshIdTokenOrSignOut,
  isUnauthenticatedError,
  requireFirebaseAuthUser,
  waitForFirebaseAuthUser,
} from '../../utils/firebase/firebaseAuthReady';

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

let generation = 0;

// La parte independiente de ubicación se comparte solo mientras está en vuelo.
const inflightRequests = new Map<string, {
  authUser: Awaited<ReturnType<typeof requireFirebaseAuthUser>>;
  request: Promise<GetPreflightDataResponse>;
}>();

function isValidPreflightResponse(
  response: GetPreflightDataResponse,
  userId: string,
  role: GetPreflightDataRequest['role'],
): boolean {
  return Boolean(
    response?.success === true &&
    response.userId === userId &&
    response.role === role &&
    typeof response.terms?.acceptedAllDocuments === 'boolean' &&
    'activeRide' in response &&
    'programmedRide' in response &&
    'pendingPayments' in response &&
    (role !== 'driver' || (typeof response.driverApproval?.allowed === 'boolean' && 'rechargeFunds' in response)),
  );
}

const ACTIVE_RIDE_STATUSES = new Set([
  'requested',
  'driver_offered',
  'accepted',
  'driver_on_route',
  'driver_arrived',
  'in_progress',
]);

// En v2 el backend solo expone terms en /platform/preflight. El resumen rico
// que consume PreflightCheckScreen se compone aquí desde las primitivas v2.
async function composePreflightResponse(
  role: GetPreflightDataRequest['role'],
  uid: string,
): Promise<GetPreflightDataResponse> {
  const [termsData, rides, programmed, pending, driverProfile, vehicles] = await Promise.all([
    getPlatformPreflight(),
    getMyRides({ role: role === 'driver' ? 'driver' : 'client', limit: 20 }),
    getMyProgrammedRides({ role }),
    getPendingPayments(),
    role === 'driver' ? getMyDriverProfile() : Promise.resolve(null),
    role === 'driver' ? getMyVehicles() : Promise.resolve([]),
  ]);

  const active = (rides ?? []).find((r: any) => ACTIVE_RIDE_STATUSES.has(r.status));
  const activeRide: GetPreflightDataResponse['activeRide'] = active
    ? {
        rideId: (active as any).firebaseRideId || active.id,
        status: active.status,
        roleView:
          role === 'driver'
            ? 'driver'
            : active.status === 'requested' || active.status === 'driver_offered'
              ? 'client_waiting'
              : 'client_tracking',
        routeHint:
          role === 'driver'
            ? 'active'
            : active.status === 'requested' || active.status === 'driver_offered'
              ? 'waiting'
              : 'tracking',
      }
    : null;

  const programmedRide: GetPreflightDataResponse['programmedRide'] = (() => {
    for (const r of programmed) {
      if (r.status !== 'scheduled' && r.status !== 'client_confirmed') continue;
      if (role === 'client' && !r.clientConfirmed) {
        return { type: 'programmed_ride_client_confirm', rideId: r.id, scheduledAt: r.scheduledAt };
      }
      if (role === 'driver' && r.driverId === uid && !r.driverConfirmed) {
        return { type: 'programmed_ride_driver_confirm', rideId: r.id, scheduledAt: r.scheduledAt };
      }
    }
    return null;
  })();

  const pendingPayments: GetPreflightDataResponse['pendingPayments'] =
    pending && pending.payments.length > 0
      ? {
          type: role,
          count: pending.payments.length,
          amount: pending.totalDebt,
          firstRideId: pending.payments[0].rideId,
          firstAmount: pending.payments[0].total,
        }
      : null;

  const driverApproval: GetPreflightDataResponse['driverApproval'] = driverProfile
    ? {
        allowed: driverProfile.accountStatus === 'active',
        accountStatus: driverProfile.accountStatus as any,
        documentsStatus: (driverProfile.documentsStatus || 'pending') as any,
        hasActiveVehicle: vehicles.length > 0,
      }
    : null;

  const rechargeFunds: GetPreflightDataResponse['rechargeFunds'] = driverProfile
    ? {
        availableBalance: driverProfile.rechargeBalance ?? 0,
        blocked: (driverProfile.rechargeBalance ?? 0) <= 0,
      }
    : null;

  return {
    success: true,
    role,
    userId: uid,
    timestamp: Date.now(),
    region: null,
    terms: termsData
      ? {
          currentVersion: termsData.termsVersion,
          acceptedVersion: termsData.acceptedVersion || undefined,
          acceptedAllDocuments: !termsData.needsTerms,
        }
      : null,
    driverApproval,
    activeRide,
    programmedRide,
    pendingPayments,
    penalties: null,
    rechargeFunds,
  };
}

const preflightService = {
  clearCache() {
    generation += 1;
  },

  async fetchPreflightData(payload: GetPreflightDataRequest): Promise<GetPreflightDataResponse> {
    const authUser = await waitForFirebaseAuthUser(payload.userId);
    if (!authUser) {
      throw new Error('Firebase Auth no disponible para getPreflightData');
    }
    if (payload.userId && authUser.uid !== payload.userId) {
      throw new Error('UID de Firebase Auth no coincide con userId del payload');
    }

    if (await requireFirebaseAuthUser(authUser.uid) !== authUser) {
      throw new Error('La sesión cambió durante el preflight');
    }
    const requestGeneration = generation;
    const inflightKey = `${payload.role}:${authUser.uid}:${requestGeneration}`;
    const existing = inflightRequests.get(inflightKey);
    const request = existing?.authUser === authUser ? existing.request : (async () => {
      const maxAttempts = 2;
      let forceTokenRefresh = false;
      let lastError: any = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          if (await requireFirebaseAuthUser(authUser.uid) !== authUser) {
            throw new Error('La sesión cambió durante el preflight');
          }
          if (forceTokenRefresh) {
            await forceRefreshIdTokenOrSignOut(authUser);
            forceTokenRefresh = false;
          }

          const result = await composePreflightResponse(payload.role, authUser.uid);
          if (await requireFirebaseAuthUser(authUser.uid) !== authUser) {
            throw new Error('La sesión cambió durante el preflight');
          }

          if (!isValidPreflightResponse(result, authUser.uid, payload.role)) {
            throw new Error('Respuesta de preflight inválida o de otro usuario');
          }
          if (requestGeneration !== generation) {
            const staleError: any = new Error('La sesión cambió durante el preflight');
            staleError.code = 'preflight/session-changed';
            throw staleError;
          }

          return result;
        } catch (error: any) {
          lastError = error;
          const retryable = isUnauthenticatedError(error);
          if (!retryable || attempt === maxAttempts) {
            throw error;
          }
          forceTokenRefresh = isUnauthenticatedError(error);
          await delay(450 * attempt);
        }
      }

      throw lastError || new Error('No se pudo obtener getPreflightData');
    })();

    if (existing?.authUser !== authUser) {
      inflightRequests.set(inflightKey, { authUser, request });
      const cleanup = () => {
        if (inflightRequests.get(inflightKey)?.request === request) inflightRequests.delete(inflightKey);
      };
      void request.then(cleanup, cleanup);
    }
    const [result, region] = await Promise.all([
      request,
      payload.location
        ? getRegionAvailability(payload.location.lat, payload.location.lng)
        : Promise.resolve(null),
    ]);
    if (requestGeneration !== generation || await requireFirebaseAuthUser(authUser.uid) !== authUser) {
      throw new Error('La sesión cambió durante el preflight');
    }
    return {
      ...result,
      region: region && payload.location ? {
        allowed: region.available,
        serviceAreaId: region.areaId ?? null,
        areaName: region.areaName,
        isFallback: region.isFallback,
        latitude: payload.location.lat,
        longitude: payload.location.lng,
      } : null,
    };
  },

  // No se retienen resultados terminados: viajes y pagos pueden cambiar.
  async warmPreflightData(payload: GetPreflightDataRequest): Promise<void> {
    try {
      await preflightService.fetchPreflightData(payload);
    } catch {
 // warm-up best-effort; la pantalla realiza la llamada autoritativa
    }
  },

  async acceptTerms(
    expectedUid: string,
    version: string,
    acceptedDocuments: Record<TermsDocumentType, boolean>,
  ): Promise<void> {
    const authUser = await waitForFirebaseAuthUser(expectedUid);
    if (!authUser || authUser.uid !== expectedUid) {
      throw new Error('Firebase Auth no coincide con el usuario que acepta los términos');
    }

    const maxAttempts = 2;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        if (attempt > 1) {
          await forceRefreshIdTokenOrSignOut(authUser);
        }
        await acceptPreflightTerms();
        return;
      } catch (error: any) {
        lastError = error;
        if (!isUnauthenticatedError(error) || attempt === maxAttempts) {
          throw error;
        }
        await delay(450 * attempt);
      }
    }

    throw lastError || new Error('No se pudo guardar la aceptación de términos');
  },
};

export default preflightService;
