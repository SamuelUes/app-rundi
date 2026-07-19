import { getFirebaseFunctions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import type { GetPreflightDataRequest, GetPreflightDataResponse } from '../types/preflight';
import { waitForFirebaseAuthUser } from '../utils/firebaseAuthReady';
import client from '../api/client';

function isUnauthenticatedError(error: any): boolean {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return (
    code.includes('unauthenticated') ||
    code.includes('auth') ||
    message.includes('unauthenticated') ||
    message.includes('auth')
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

const preflightCache: { entry: CacheEntry | null } = { entry: null };

function makePayloadKey(payload: GetPreflightDataRequest): string {
  return `${payload.role || ''}:${payload.userId || ''}:${payload.location?.lat || ''}:${payload.location?.lng || ''}`;
}

const preflightService = {
  async fetchPreflightData(payload: GetPreflightDataRequest): Promise<GetPreflightDataResponse> {
    const cacheKey = makePayloadKey(payload);
    const now = Date.now();
    const cached = preflightCache.entry;
    if (cached !== null && cached.payloadKey === cacheKey && (now - cached.timestamp) < PREFLIGHT_CACHE_TTL_MS) {
      return cached.data;
    }

    const functions = await getFirebaseFunctions();
    const callable = httpsCallable<GetPreflightDataRequest, GetPreflightDataResponse>(
      functions,
      'getPreflightData',
    );

    let lastError: any = null;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const authUser = await waitForFirebaseAuthUser(payload?.userId, 8000);
      if (!authUser) {
        lastError = new Error('Firebase Auth no disponible para getPreflightData');
      } else {
        if (payload?.userId && authUser.uid !== payload.userId) {
          lastError = new Error('UID de Firebase Auth no coincide con userId del payload');
          if (attempt < maxAttempts) {
            await delay(450 * attempt);
          }
          continue;
        }

        try {
          const refreshedToken = await authUser.getIdToken(true);
          if (!refreshedToken) {
            throw new Error('No se pudo obtener token Firebase para callable');
          }

          try {
            const response = await client.post('/getPreflightDataHttp', payload, {
              headers: {
                Authorization: `Bearer ${refreshedToken}`,
              },
            });
            const result = response.data as GetPreflightDataResponse;
            preflightCache.entry = { data: result, timestamp: Date.now(), payloadKey: cacheKey };
            return result;
          } catch (httpError: any) {
            lastError = httpError;

            if (isHttpNotFound(httpError)) {
              // Fallback temporal mientras se despliega el endpoint HTTP
            } else if (isHttpUnauthenticated(httpError) && attempt < maxAttempts) {
              console.warn(`⚠️ [preflightService] getPreflightDataHttp unauthenticated (intento ${attempt}/${maxAttempts}), reintentando...`);
              await delay(450 * attempt);
              continue;
            } else if (!isHttpNotFound(httpError)) {
              throw httpError;
            }
          }
        } catch (tokenError) {
          lastError = tokenError;
          if (attempt < maxAttempts) {
            console.warn(`⚠️ [preflightService] No se pudo refrescar token (intento ${attempt}/${maxAttempts}), reintentando...`);
            await delay(450 * attempt);
          }
          continue;
        }

        try {
          const callableResult = await callable(payload);
          const callableData = callableResult.data;
          preflightCache.entry = { data: callableData, timestamp: Date.now(), payloadKey: cacheKey };
          return callableData;
        } catch (error: any) {
          lastError = error;
          if (!isUnauthenticatedError(error) || attempt === maxAttempts) {
            break;
          }
          console.warn(`⚠️ [preflightService] getPreflightData unauthenticated (intento ${attempt}/${maxAttempts}), reintentando...`);
        }
      }

      if (attempt < maxAttempts) {
        await delay(450 * attempt);
      }
    }

    throw lastError || new Error('No se pudo obtener getPreflightData');
  },
};

export default preflightService;
