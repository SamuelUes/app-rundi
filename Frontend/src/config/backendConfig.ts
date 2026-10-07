/**
 * Configuración del Backend — única fuente de verdad para URLs y modo.
 *
 * Modos soportados:
 *  - 'firebase': backend serverless en Firebase Cloud Functions.
 *  - 'local':    backend NestJS local (desarrollo).
 *
 * Entornos:
 *  - development: usa las URLs de .env directamente.
 *  - production:  usa los overrides `*_PRODUCTION` si están definidos.
 *
 * Consumidores:
 *  - api/client.ts        → getApiUrl() como baseURL de axios.
 *  - services/auth/*      → isFirebase()/isLocal() para elegir implementación.
 *  - hooks/shared/calls/  → getApiUrl() para WebRTC signaling (vía environment.ts).
 */

import { Platform } from 'react-native';
import { buildFunctionsEmulatorBaseUrl, resolveLocalEmulatorHost } from './localEmulatorHost';

export type BackendMode = 'firebase' | 'local';
export type BackendEnvironment = 'development' | 'production';

const NODE_ENV = (process.env.NODE_ENV || 'development') as BackendEnvironment;
const IS_PRODUCTION = NODE_ENV === 'production';
const USE_FIREBASE_EMULATORS = process.env.USE_FIREBASE_EMULATORS === 'true';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'rundi-dev';
const FIREBASE_EMULATOR_HOST = resolveLocalEmulatorHost(
  process.env.FIREBASE_EMULATOR_HOST || 'localhost',
  Platform.OS,
);
const FUNCTIONS_EMULATOR_URL = buildFunctionsEmulatorBaseUrl(
  FIREBASE_PROJECT_ID,
  'us-central1',
  FIREBASE_EMULATOR_HOST,
  Platform.OS,
);

const rawMode = (process.env.BACKEND_MODE || 'firebase') as BackendMode;
const BACKEND_MODE: BackendMode = rawMode === 'local' ? 'local' : 'firebase';

const FIREBASE_API_URL = USE_FIREBASE_EMULATORS
  ? FUNCTIONS_EMULATOR_URL
  : (
      IS_PRODUCTION
        ? process.env.API_BASE_URL_PRODUCTION || process.env.API_BASE_URL_FIREBASE
        : process.env.API_BASE_URL_FIREBASE
    ) || '';

const FIREBASE_WS_URL = USE_FIREBASE_EMULATORS
  ? `http://${FIREBASE_EMULATOR_HOST}:9002?ns=${FIREBASE_PROJECT_ID}`
  : (
      IS_PRODUCTION
        ? process.env.WS_URL_PRODUCTION || process.env.WS_URL_FIREBASE
        : process.env.WS_URL_FIREBASE
    ) || '';

const LOCAL_API_URL = (
  IS_PRODUCTION
    ? process.env.API_BASE_URL_PRODUCTION || process.env.API_BASE_URL_LOCAL
    : process.env.API_BASE_URL_LOCAL
) || '';

const LOCAL_WS_URL = (
  IS_PRODUCTION
    ? process.env.WS_URL_PRODUCTION || process.env.WS_URL_LOCAL
    : process.env.WS_URL_LOCAL
) || '';

const DOMAIN = process.env.DOMAIN || (IS_PRODUCTION ? 'rundiapp.com' : 'localhost');

interface BackendConfig {
  readonly mode: BackendMode;
  readonly environment: BackendEnvironment;
  readonly isProduction: boolean;
  readonly isDevelopment: boolean;
  readonly useEmulators: boolean;
  readonly domain: string;
  readonly local: { readonly apiUrl: string; readonly wsUrl: string };
  readonly firebase: {
    readonly functionsUrl: string;
    readonly realtimeDbUrl: string;
    readonly useEmulators: boolean;
  };
  isFirebase(): boolean;
  isLocal(): boolean;
  getApiUrl(): string;
  getWsUrl(): string;
}

export const backendConfig: BackendConfig = {
  mode: BACKEND_MODE,
  environment: NODE_ENV,
  isProduction: IS_PRODUCTION,
  isDevelopment: !IS_PRODUCTION,
  useEmulators: USE_FIREBASE_EMULATORS,
  domain: DOMAIN,

  local: {
    apiUrl: LOCAL_API_URL,
    wsUrl: LOCAL_WS_URL,
  },

  firebase: {
    functionsUrl: FIREBASE_API_URL,
    realtimeDbUrl: FIREBASE_WS_URL,
    useEmulators: USE_FIREBASE_EMULATORS,
  },

  isFirebase(): boolean {
    return this.mode === 'firebase';
  },

  isLocal(): boolean {
    return this.mode === 'local';
  },

  getApiUrl(): string {
    return this.isFirebase() ? this.firebase.functionsUrl : this.local.apiUrl;
  },

  getWsUrl(): string {
    return this.isFirebase() ? this.firebase.realtimeDbUrl : this.local.wsUrl;
  },
};

/** Lanza en desarrollo si la URL del backend no está configurada. */
export function assertBackendConfigured(): void {
  const apiUrl = backendConfig.getApiUrl();
  if (!apiUrl) {
    const msg =
      `Backend URL no configurada (mode=${backendConfig.mode}, env=${backendConfig.environment}). ` +
      `Define API_BASE_URL_${backendConfig.mode === 'firebase' ? 'FIREBASE' : 'LOCAL'} en .env`;
    if (backendConfig.isDevelopment) {
      throw new Error(msg);
    }
    console.error(`[backendConfig] ${msg}`);
  }
}

// Validación temprana en desarrollo
if (__DEV__) {
  console.log('🔧 Backend Config:', {
    mode: backendConfig.mode,
    env: backendConfig.environment,
    apiUrl: backendConfig.getApiUrl() || '(vacío)',
    wsUrl: backendConfig.getWsUrl() || '(vacío)',
    useEmulators: backendConfig.useEmulators,
  });
  if (!backendConfig.getApiUrl()) {
    console.warn(
      `[backendConfig] API URL vacía para mode=${backendConfig.mode}. ` +
        `Verifica API_BASE_URL_${backendConfig.mode === 'firebase' ? 'FIREBASE' : 'LOCAL'} en .env`,
    );
  }
}

export default backendConfig;
