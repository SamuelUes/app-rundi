import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/environment';
import { getFirebaseAuth } from '../config/firebase';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Agregar token de autenticación
client.interceptors.request.use(
  async (config) => {
    try {
      // Intentar obtener token de Firebase Auth
      const auth = await getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (currentUser) {
        const token = await currentUser.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
        return config;
      }
      
      // Fallback: Intentar obtener token de AsyncStorage (para NestJS)
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.warn('⚠️ Error obteniendo token:', error);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - Manejo de errores
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expirado o inválido - logout
      await AsyncStorage.removeItem('authToken');
      // TODO: Navegar a login
    }
    
    return Promise.reject(error);
  }
);

export default client;
