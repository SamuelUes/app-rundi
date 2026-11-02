/**
 * Config del API — baseURL del backend Go (Cloud Run / functions-v2).
 *
 * Env: API_BASE_URL_V2 (dev) / API_BASE_URL_V2_PRODUCTION (prod).
 * En emulador local de desarrollo apuntar al servidor Go local (p.ej. :8080).
 */

import { Platform } from 'react-native';
import { resolveLocalEmulatorHost } from './localEmulatorHost';

const IS_PRODUCTION = (process.env.NODE_ENV || 'development') === 'production';
const USE_FIREBASE_EMULATORS = process.env.USE_FIREBASE_EMULATORS === 'true';

const LOCAL_API_URL = USE_FIREBASE_EMULATORS
  ? `http://${resolveLocalEmulatorHost(process.env.FIREBASE_EMULATOR_HOST || 'localhost', Platform.OS)}:8080`
  : '';

export const apiConfig = {
  /** Base URL del API v1 del servicio Go (functions-v2/cmd/api). */
  apiUrl:
    (IS_PRODUCTION
      ? process.env.API_BASE_URL_V2_PRODUCTION || process.env.API_BASE_URL_V2
      : process.env.API_BASE_URL_V2) ||
    LOCAL_API_URL,
  /** Prefijo de versión montado en el router Go. */
  apiPrefix: '/v1',
} as const;

export function apiUrl(path: string): string {
  const base = apiConfig.apiUrl.replace(/\/$/, '');
  const prefix = path.startsWith(apiConfig.apiPrefix) ? '' : apiConfig.apiPrefix;
  return `${base}${prefix}${path}`;
}
