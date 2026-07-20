/**
 * Cliente HTTP único para el backend.
 *
 * - baseURL se resuelve desde backendConfig (única fuente de verdad).
 * - En modo firebase: inyecta Bearer token desde Firebase Auth.
 * - En modo local:    inyecta Bearer token desde AsyncStorage ('authToken'),
 *                     con fallback a Firebase Auth si existe sesión.
 * - 401 → limpia token de AsyncStorage y notifica (logout delegado al AuthProvider/store).
 */

import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import backendConfig, { assertBackendConfigured } from '../config/backendConfig';
import { getFirebaseAuth } from '../config/firebase';

assertBackendConfigured();

const client: AxiosInstance = axios.create({
  baseURL: backendConfig.getApiUrl(),
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

interface AuthToken {
  value: string;
  source: 'firebase' | 'local';
}

/**
 * Resuelve el token de autenticación según el modo de backend.
 * - firebase: siempre Firebase Auth (lanza si no hay sesión).
 * - local:    AsyncStorage primero, Firebase Auth como fallback.
 */
async function resolveAuthToken(): Promise<AuthToken | null> {
  // Firebase Auth (común a ambos modos)
  try {
    const auth = await getFirebaseAuth();
    const currentUser = auth.currentUser;
    if (currentUser) {
      const token = await currentUser.getIdToken();
      if (token) return { value: token, source: 'firebase' };
    }
  } catch (error) {
    console.warn('⚠️ Error obteniendo token de Firebase Auth:', error);
  }

  // Modo local: fallback a AsyncStorage (NestJS maneja su propio token)
  if (backendConfig.isLocal()) {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) return { value: token, source: 'local' };
    } catch (error) {
      console.warn('⚠️ Error leyendo authToken de AsyncStorage:', error);
    }
  }

  return null;
}

// Request interceptor - Agregar token de autenticación
client.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await resolveAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token.value}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor - Manejo de errores
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      // Token expirado o inválido - limpiar storage local
      try {
        await AsyncStorage.removeItem('authToken');
      } catch {
        // ignore
      }
      // TODO: disparar logout vía authStore cuando se unifique (Fase 2 futura)
    }
    return Promise.reject(error);
  },
);

export default client;
