/**
 * Cliente HTTP — axios + Bearer token Firebase Auth, apuntando al backend
 * Go (functions-v2).
 *
 * X-Request-ID se genera por llamada para correlación con el outbox.
 */

import axios, { type AxiosInstance } from 'axios';
import { getFirebaseAuth } from '../config/firebase';
import { apiConfig } from '../config/apiConfig';
import { loadNativeFirebaseAppCheck } from '../utils/firebase/nativeFirebase';

const client: AxiosInstance = axios.create({
  baseURL: `${apiConfig.apiUrl.replace(/\/$/, '')}${apiConfig.apiPrefix}`,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// App Check (best-effort): RNFB v26 API modular — initializeAppCheck una vez
// (providers por defecto: playIntegrity/appAttest+fallback; 'debug' en dev si
// hay APP_CHECK_DEBUG_TOKEN). getToken(false) devuelve el token cacheado del
// SDK mientras siga válido. En "monitor"/"off" el backend tolera su ausencia;
// en "enforce" sin token responde 401 — mejor fallar explícito que bloquear
// la llamada aquí (Expo Go no tiene el módulo nativo).
let appCheckInstance: any = null;
let appCheckInitFailed = false;

async function getAppCheckToken(): Promise<string | null> {
  if (appCheckInitFailed) return null;
  try {
    const mod = await loadNativeFirebaseAppCheck();
    if (!mod || typeof mod.initializeAppCheck !== 'function' || typeof mod.getToken !== 'function') {
      appCheckInitFailed = true;
      return null;
    }
    if (!appCheckInstance) {
      const debugToken = process.env.APP_CHECK_DEBUG_TOKEN;
      appCheckInstance = mod.initializeAppCheck(undefined, {
        provider: {
          providerOptions: {
            android: { provider: debugToken ? 'debug' : 'playIntegrity', debugToken },
            apple: { provider: debugToken ? 'debug' : 'appAttestWithDeviceCheckFallback', debugToken },
          },
        },
        isTokenAutoRefreshEnabled: true,
      });
    }
    const { token } = await mod.getToken(appCheckInstance, false);
    return token ?? null;
  } catch {
    // Módulo nativo ausente o provider rechazado → seguir sin el header.
    return null;
  }
}

client.interceptors.request.use(async (cfg) => {
  const [token, appCheckToken] = await Promise.all([
    getFirebaseAuth().then((auth) => auth.currentUser?.getIdToken()),
    getAppCheckToken(),
  ]);
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  if (appCheckToken) cfg.headers['X-Firebase-AppCheck'] = appCheckToken;
  cfg.headers['X-Request-ID'] = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
  return cfg;
});

export default client;
