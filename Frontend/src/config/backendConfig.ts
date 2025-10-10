/**
 * Configuración del Backend
 * Soporta modo dual: Firebase o NestJS local
 */

export type BackendMode = 'firebase' | 'local';

export const backendConfig = {
  // Modo actual (desde .env)
  mode: (process.env.BACKEND_MODE || 'firebase') as BackendMode,
  
  // URLs de NestJS local (respaldo)
  local: {
    apiUrl: process.env.API_BASE_URL_LOCAL || 'http://192.168.1.18:3000/api',
    wsUrl: process.env.WS_URL_LOCAL || 'http://192.168.1.18:3000',
  },
  
  // URLs de Firebase
  firebase: {
    functionsUrl: process.env.API_BASE_URL_FIREBASE || 'https://us-central1-driveangel-ni.cloudfunctions.net',
    realtimeDbUrl: process.env.WS_URL_FIREBASE || 'https://driveangel-ni-default-rtdb.firebaseio.com',
    useEmulators: process.env.USE_FIREBASE_EMULATORS === 'true',
  },
  
  // Helper para saber qué backend usar
  isFirebase(): boolean {
    return this.mode === 'firebase';
  },
  
  isLocal(): boolean {
    return this.mode === 'local';
  },
  
  // Obtener URL base según el modo
  getApiUrl(): string {
    return this.isFirebase() 
      ? this.firebase.functionsUrl 
      : this.local.apiUrl;
  },
  
  getWsUrl(): string {
    return this.isFirebase() 
      ? this.firebase.realtimeDbUrl 
      : this.local.wsUrl;
  },
};

// Log de configuración
console.log('🔧 Backend Config:', {
  mode: backendConfig.mode,
  apiUrl: backendConfig.getApiUrl(),
  wsUrl: backendConfig.getWsUrl(),
  useEmulators: backendConfig.firebase.useEmulators,
});

export default backendConfig;
