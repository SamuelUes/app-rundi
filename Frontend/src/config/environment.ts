import Constants from 'expo-constants';
import backendConfig from './backendConfig';

const ENV = {
  development: {
    apiUrl: backendConfig.getApiUrl(),
    wsUrl: backendConfig.getWsUrl(),
    domain: process.env.DOMAIN || 'localhost',
  },
  production: {
    apiUrl: process.env.API_BASE_URL_PRODUCTION || 'https://api.driveangel.online',
    wsUrl: process.env.WS_URL_PRODUCTION || 'https://api.driveangel.online',
    domain: process.env.DOMAIN || 'driveangel.online',
  },
};

const getEnvVars = () => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  // Si estamos en producción o el usuario configuró NODE_ENV=production
  if (nodeEnv === 'production' || Constants.manifest?.releaseChannel) {
    return ENV.production;
  }
  
  return ENV.development;
};

export default getEnvVars();

// Exportar también las variables individuales para fácil acceso
export const API_BASE_URL = getEnvVars().apiUrl;
export const WS_URL = getEnvVars().wsUrl;
export const DOMAIN = getEnvVars().domain;
export const IS_PRODUCTION = getEnvVars() === ENV.production;
export const IS_DEVELOPMENT = !IS_PRODUCTION;

// Logging para debug
console.log('🌍 Environment:', IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT');
console.log('🔗 API URL:', API_BASE_URL);
console.log('🔌 WebSocket URL:', WS_URL);
console.log('🌐 Domain:', DOMAIN);
