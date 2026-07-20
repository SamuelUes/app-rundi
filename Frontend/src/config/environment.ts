/**
 * Punto de compatibilidad para variables de entorno derivadas.
 *
 * Toda la lógica de resolución vive en `config/backendConfig.ts` (única fuente
 * de verdad). Este archivo re-exporta los valores para no romper imports
 * existentes (`API_BASE_URL`, `WS_URL`, `DOMAIN`, `IS_PRODUCTION`).
 *
 * Nuevo código: importar directamente desde `config/backendConfig`.
 */

import Constants from 'expo-constants';
import backendConfig from './backendConfig';

const getReleaseChannel = (): string | undefined => {
  const manifest = Constants.manifest as Partial<{ releaseChannel?: string }>;
  return manifest?.releaseChannel;
};

// En EAS/standalone, releaseChannel indica producción aunque NODE_ENV no esté seteado.
const IS_PROD =
  backendConfig.isProduction || !!getReleaseChannel();

export const API_BASE_URL = backendConfig.getApiUrl();
export const WS_URL = backendConfig.getWsUrl();
export const DOMAIN = backendConfig.domain;
export const IS_PRODUCTION = IS_PROD;
export const IS_DEVELOPMENT = !IS_PROD;

export default {
  apiUrl: API_BASE_URL,
  wsUrl: WS_URL,
  domain: DOMAIN,
} as const;

if (__DEV__) {
  console.log('🌍 Environment:', IS_PROD ? 'PRODUCTION' : 'DEVELOPMENT');
  console.log('🔗 API URL:', API_BASE_URL || '(vacío)');
  console.log('🔌 WebSocket URL:', WS_URL || '(vacío)');
  console.log('🌐 Domain:', DOMAIN);
}
