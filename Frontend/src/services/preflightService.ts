import { getFirebaseFunctions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import type { GetPreflightDataRequest, GetPreflightDataResponse, TermsDocumentType } from '../types/preflight';
import {
  forceRefreshIdTokenOrSignOut,
  isUnauthenticatedError,
  waitForFirebaseAuthUser,
} from '../utils/firebaseAuthReady';

function isRetryableCallableError(error: any): boolean {
  const code = String(error?.code || '').toLowerCase();
  return (
    isUnauthenticatedError(error) ||
    code.endsWith('/unavailable') ||
    code.endsWith('/deadline-exceeded') ||
    code.endsWith('/network-request-failed')
  );
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const PREFLIGHT_CACHE_TTL_MS = 30_000;

interface CacheEntry {
  data: GetPreflightDataResponse;
  timestamp: number;
  payloadKey: string;
}

const preflightCache: { entry: CacheEntry | null; generation: number } = { entry: null, generation: 0 };

function makePayloadKey(payload: GetPreflightDataRequest, authenticatedUid: string): string {
  return `${payload.role}:${authenticatedUid}:${payload.location?.lat ?? ''}:${payload.location?.lng ?? ''}`;
}

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

const preflightService = {
  clearCache() {
    preflightCache.entry = null;
    preflightCache.generation += 1;
  },

  async fetchPreflightData(payload: GetPreflightDataRequest): Promise<GetPreflightDataResponse> {
    const authUser = await waitForFirebaseAuthUser(payload.userId);
    if (!authUser) {
      throw new Error('Firebase Auth no disponible para getPreflightData');
    }
    if (payload.userId && authUser.uid !== payload.userId) {
      throw new Error('UID de Firebase Auth no coincide con userId del payload');
    }

    // The backend derives identity from the verified token; never send a client-selected UID.
    const requestPayload: GetPreflightDataRequest = {
      role: payload.role,
      platform: payload.platform,
      appVersion: payload.appVersion,
      location: payload.location,
    };

    const cacheGeneration = preflightCache.generation;
    const cacheKey = makePayloadKey(payload, authUser.uid);
    const cached = preflightCache.entry;
    if (cached !== null && cached.payloadKey === cacheKey && Date.now() - cached.timestamp < PREFLIGHT_CACHE_TTL_MS) {
      return cached.data;
    }

    const functions = await getFirebaseFunctions();
    const callable = httpsCallable<GetPreflightDataRequest, GetPreflightDataResponse>(
      functions,
      'getPreflightData',
      { timeout: 30_000 },
    );
    const maxAttempts = 3;
    let forceTokenRefresh = false;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        if (forceTokenRefresh) {
          await forceRefreshIdTokenOrSignOut(authUser);
          forceTokenRefresh = false;
        }

        const result = (await callable(requestPayload)).data;

        if (!isValidPreflightResponse(result, authUser.uid, payload.role)) {
          throw new Error('Respuesta de preflight inválida o de otro usuario');
        }
        if (cacheGeneration !== preflightCache.generation) {
          throw new Error('La sesión cambió durante el preflight');
        }

        preflightCache.entry = { data: result, timestamp: Date.now(), payloadKey: cacheKey };
        return result;
      } catch (error: any) {
        lastError = error;
        const retryable = isRetryableCallableError(error);
        if (!retryable || attempt === maxAttempts) {
          throw error;
        }
        forceTokenRefresh = isUnauthenticatedError(error);
        await delay(450 * attempt);
      }
    }

    throw lastError || new Error('No se pudo obtener getPreflightData');
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

    const functions = await getFirebaseFunctions();
    const callable = httpsCallable<
      { expectedUid: string; version: string; acceptedDocuments: Record<TermsDocumentType, boolean> },
      { success?: boolean }
    >(functions, 'acceptPreflightTerms', { timeout: 30_000 });

    const maxAttempts = 2;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        if (attempt > 1) {
          await forceRefreshIdTokenOrSignOut(authUser);
        }
        const result = await callable({ expectedUid, version, acceptedDocuments });
        if (result.data?.success !== true) {
          throw new Error('No se pudo guardar la aceptación de términos');
        }
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
