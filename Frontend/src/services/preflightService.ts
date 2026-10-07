import { getFirebaseFunctions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import type { GetPreflightDataRequest, GetPreflightDataResponse, TermsDocumentType } from '../types/preflight';
import { waitForFirebaseAuthUser } from '../utils/firebaseAuthReady';
import client from '../api/client';

function isUnauthenticatedError(error: any): boolean {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code === 'unauthenticated' || code.endsWith('/unauthenticated') || message.includes('unauthenticated');
}

function isRetryableHttpError(error: any): boolean {
  const status = Number(error?.response?.status || 0);
  return status === 429 || status >= 500 || (status === 0 && error?.isAxiosError === true);
}

function isRetryableCallableError(error: any): boolean {
  const code = String(error?.code || '').toLowerCase();
  return (
    isUnauthenticatedError(error) ||
    code.endsWith('/unavailable') ||
    code.endsWith('/deadline-exceeded') ||
    code.endsWith('/network-request-failed')
  );
}

function isHttpUnauthenticated(error: any): boolean {
  const status = Number(error?.response?.status || 0);
  const code = String(error?.response?.data?.code || '').toLowerCase();
  return status === 401 || code.includes('unauthenticated');
}

function isHttpNotFound(error: any): boolean {
  const status = Number(error?.response?.status || 0);
  return status === 404;
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
    let useCallable = false;
    let forceTokenRefresh = false;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        if (forceTokenRefresh) {
          await authUser.getIdToken(true);
          forceTokenRefresh = false;
        }

        let result: GetPreflightDataResponse;
        if (useCallable) {
          result = (await callable(payload)).data;
        } else {
          try {
            const response = await client.post('/getPreflightDataHttp', payload);
            result = response.data as GetPreflightDataResponse;
          } catch (httpError: any) {
            const shouldFallbackToCallable =
              isHttpNotFound(httpError) ||
              isRetryableHttpError(httpError) ||
              (attempt === maxAttempts && isHttpUnauthenticated(httpError));
            if (!shouldFallbackToCallable) {
              throw httpError;
            }
            // Fallback temporal mientras se despliega el endpoint HTTP
            useCallable = true;
            result = (await callable(payload)).data;
          }
        }

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
        const retryable = isHttpUnauthenticated(error) || isRetryableHttpError(error) || isRetryableCallableError(error);
        if (!retryable || attempt === maxAttempts) {
          throw error;
        }
        forceTokenRefresh = isHttpUnauthenticated(error) || isUnauthenticatedError(error);
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
    const result = await callable({ expectedUid, version, acceptedDocuments });

    if (result.data?.success !== true) {
      throw new Error('No se pudo guardar la aceptación de términos');
    }
  },
};

export default preflightService;
