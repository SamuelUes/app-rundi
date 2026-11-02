/**
 * Configuración del Backend — shim de compatibilidad v2.
 *
 * En la arquitectura v2 hay UN solo backend: la API Go (functions-v2 /
 * Cloud Run) con Firebase Auth. Ya no existen modos 'firebase' vs 'local'
 * ni WebSocket propio — `getApiUrl()` devuelve la URL base del API v2 y
 * `isLocal()` siempre es false.
 *
 * Nuevo código: importar `apiConfig`/`apiUrl` desde `src/config/apiConfig`.
 */

import { apiConfig } from '../config/apiConfig';

export type BackendMode = 'firebase' | 'local';
export type BackendEnvironment = 'development' | 'production';

const NODE_ENV = (process.env.NODE_ENV || 'development') as BackendEnvironment;
const IS_PRODUCTION = NODE_ENV === 'production';
const USE_FIREBASE_EMULATORS = process.env.USE_FIREBASE_EMULATORS === 'true';

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
  mode: 'firebase',
  environment: NODE_ENV,
  isProduction: IS_PRODUCTION,
  isDevelopment: !IS_PRODUCTION,
  useEmulators: USE_FIREBASE_EMULATORS,
  domain: DOMAIN,

  local: {
    apiUrl: '',
    wsUrl: '',
  },

  firebase: {
    functionsUrl: apiConfig.apiUrl,
    realtimeDbUrl: '',
    useEmulators: USE_FIREBASE_EMULATORS,
  },

  isFirebase(): boolean {
    return true;
  },

  isLocal(): boolean {
    return false;
  },

  getApiUrl(): string {
    return apiConfig.apiUrl;
  },

  getWsUrl(): string {
    return '';
  },
};

/** Lanza en desarrollo si la URL del backend no está configurada. */
export function assertBackendConfigured(): void {
  const apiUrl = backendConfig.getApiUrl();
  if (!apiUrl) {
    const msg =
      `Backend URL no configurada (env=${backendConfig.environment}). ` +
      `Define API_BASE_URL_V2 en .env`;
    if (backendConfig.isDevelopment) {
      throw new Error(msg);
    }
    console.error(`[backendConfig] ${msg}`);
  }
}

// Validación temprana en desarrollo
if (__DEV__) {
  console.log('🔧 Backend Config (v2):', {
    env: backendConfig.environment,
    apiUrl: backendConfig.getApiUrl() || '(vacío)',
    useEmulators: backendConfig.useEmulators,
  });
  if (!backendConfig.getApiUrl()) {
    console.warn('[backendConfig] API URL vacía — verifica API_BASE_URL_V2 en .env');
  }
}

export default backendConfig;
