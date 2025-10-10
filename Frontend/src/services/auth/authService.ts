/**
 * Auth Service - Modo Dual
 * Soporta Firebase Auth y NestJS local
 */

import backendConfig from '../../config/backendConfig';
import FirebaseAuthService from './firebaseAuthService';
import LocalAuthService from './localAuthService';

class AuthService {
  /**
   * Registrar usuario
   */
  async register(email: string, password: string, name: string, phone: string, role: string) {
    if (backendConfig.isFirebase()) {
      return FirebaseAuthService.register(email, password, name, phone, role);
    } else {
      return LocalAuthService.register(email, password, name, phone, role);
    }
  }

  /**
   * Iniciar sesión
   */
  async login(email: string, password: string) {
    if (backendConfig.isFirebase()) {
      return FirebaseAuthService.login(email, password);
    } else {
      return LocalAuthService.login(email, password);
    }
  }

  /**
   * Cerrar sesión
   */
  async logout() {
    if (backendConfig.isFirebase()) {
      return FirebaseAuthService.logout();
    } else {
      return LocalAuthService.logout();
    }
  }

  /**
   * Obtener usuario actual
   */
  getCurrentUser() {
    if (backendConfig.isFirebase()) {
      return FirebaseAuthService.getCurrentUser();
    } else {
      return LocalAuthService.getCurrentUser();
    }
  }

  /**
   * Obtener token de autenticación
   */
  async getToken() {
    if (backendConfig.isFirebase()) {
      return FirebaseAuthService.getIdToken();
    } else {
      return LocalAuthService.getToken();
    }
  }

  /**
   * Escuchar cambios en autenticación
   */
  onAuthStateChange(callback: (user: any) => void) {
    if (backendConfig.isFirebase()) {
      return FirebaseAuthService.onAuthStateChange(callback);
    } else {
      return LocalAuthService.onAuthStateChange(callback);
    }
  }
}

export default new AuthService();
