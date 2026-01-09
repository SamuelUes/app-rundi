/**
 * Auth Service - Modo Dual
 * Soporta Firebase Auth y NestJS local
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENDPOINTS } from '../../api/endpoints';
import backendConfig from '../../config/backendConfig';
import client from '../../api/client';

class AuthService {
  /**
   * Registrar usuario
   */
  async register(email: string, password: string, name: string, phone: string, role: string) {
    const payload = {
      email,
      password,
      name,
      phone,
      role,
      authProvider: 'email/password',
      method: 'email',
    };

    const { data } = await client.post(ENDPOINTS.auth.register, payload);

    if (!data?.success || !data?.user) {
      throw new Error(data?.error || 'Error al registrar usuario');
    }

    if (data.token) {
      await AsyncStorage.setItem('authToken', data.token);
    }

    await AsyncStorage.setItem('user', JSON.stringify(data.user));

    return data.user;
  }

  /**
   * Iniciar sesión
   */
  async login(email: string, password: string) {
    const response = await client.post(ENDPOINTS.auth.login, { email, password });
    const { user, token } = response.data;

    await AsyncStorage.setItem('authToken', token);
    await AsyncStorage.setItem('user', JSON.stringify(user));

    return user;
  }

  /**
   * Cerrar sesión
   */
  async logout() {
    await AsyncStorage.removeItem('authToken');
    await AsyncStorage.removeItem('user');
  }

  /**
   * Obtener usuario actual
   */
  getCurrentUser() {
    return AsyncStorage.getItem('user').then((userData) => (userData ? JSON.parse(userData) : null));
  }

  /**
   * Obtener token de autenticación
   */
  async getToken() {
    return AsyncStorage.getItem('authToken');
  }

  /**
   * Escuchar cambios en autenticación
   */
  onAuthStateChange(callback: (user: any) => void) {
    this.getCurrentUser().then(callback);
    return () => {};
  }
}

export default new AuthService();
