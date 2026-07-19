import Constants from 'expo-constants';
import backendConfig from './backendConfig';

const resolveApiUrl = (target: 'development' | 'production') => {
  if (backendConfig.isFirebase()) {
    return backendConfig.getApiUrl();
  }

  if (target === 'production') {
    return process.env.API_BASE_URL_PRODUCTION || backendConfig.getApiUrl();
  }

  return backendConfig.getApiUrl();
};

const resolveWsUrl = (target: 'development' | 'production') => {
  if (backendConfig.isFirebase()) {
    return backendConfig.getWsUrl();
  }

  if (target === 'production') {
    return process.env.WS_URL_PRODUCTION || backendConfig.getWsUrl();
  }

  return backendConfig.getWsUrl();
};

const ENV = {
  development: {
    apiUrl: resolveApiUrl('development'),
    wsUrl: resolveWsUrl('development'),
    domain: process.env.DOMAIN || 'localhost',
  },
  production: {
    apiUrl: resolveApiUrl('production'),
    wsUrl: resolveWsUrl('production'),
    domain: process.env.DOMAIN || 'rundiapp.com',
  },
};

const getEnvVars = () => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const manifest = Constants.manifest as Partial<{ releaseChannel?: string }>;
  const releaseChannel = manifest?.releaseChannel;
  
  // Si estamos en producción o el usuario configuró NODE_ENV=production
  if (nodeEnv === 'production' || releaseChannel) {
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

// Logging para debug (solo en desarrollo)
if (__DEV__) {
  console.log('🌍 Environment:', IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT');
  console.log('🔗 API URL:', API_BASE_URL);
  console.log('🔌 WebSocket URL:', WS_URL);
  console.log('🌐 Domain:', DOMAIN);
}
