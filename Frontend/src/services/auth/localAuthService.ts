/**
 * Local Auth Service (NestJS Backend)
 * Implementación de autenticación con backend NestJS local
 */

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import backendConfig from '../../config/backendConfig';

const API_URL = backendConfig.local.apiUrl;

class LocalAuthService {
  /**
   * Registrar usuario
   */
  async register(email: string, password: string, name: string, phone: string, role: string, driverData?: any, vehicleData?: any) {
    try {
      const response = await axios.post(`${API_URL}/auth/register`, {
        email,
        password,
        name,
        phone,
        role,
      });

      const { user, token } = response.data;

      // Guardar token
      await AsyncStorage.setItem('authToken', token);
      await AsyncStorage.setItem('user', JSON.stringify(user));

      console.log('✅ Usuario registrado (Local):', user.id);

      return user;
    } catch (error: any) {
      console.error('❌ Error en registro (Local):', error);
      throw new Error(error.response?.data?.message || 'Error al registrar usuario');
    }
  }

  /**
   * Iniciar sesión
   */
  async login(email: string, password: string) {
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        email,
        password,
      });

      const { user, token } = response.data;

      // Guardar token
      await AsyncStorage.setItem('authToken', token);
      await AsyncStorage.setItem('user', JSON.stringify(user));

      console.log('✅ Login exitoso (Local):', user.id);

      return user;
    } catch (error: any) {
      console.error('❌ Error en login (Local):', error);
      throw new Error(error.response?.data?.message || 'Error al iniciar sesión');
    }
  }

  /**
   * Cerrar sesión
   */
  async logout() {
    try {
      await AsyncStorage.removeItem('authToken');
      await AsyncStorage.removeItem('user');
      console.log('✅ Sesión cerrada (Local)');
    } catch (error: any) {
      console.error('❌ Error cerrando sesión (Local):', error);
      throw error;
    }
  }

  /**
   * Obtener usuario actual
   */
  async getCurrentUser() {
    try {
      const userStr = await AsyncStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Obtener token
   */
  async getToken() {
    try {
      return await AsyncStorage.getItem('authToken');
    } catch (error) {
      return null;
    }
  }

  /**
   * Escuchar cambios en autenticación
   * (No hay soporte en tiempo real con NestJS, solo retorna el usuario actual)
   */
  onAuthStateChange(callback: (user: any) => void) {
    this.getCurrentUser().then(callback);
    return () => {}; // No-op unsubscribe
  }
}

export default new LocalAuthService();
