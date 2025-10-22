/**
 * useGoogleAuth Hook
 * Hook personalizado para manejar autenticación con Google
 */

import { useState, useEffect } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import googleAuthService from '../services/auth/googleAuthService';

// Completar el flujo de autenticación web
WebBrowser.maybeCompleteAuthSession();

interface UseGoogleAuthReturn {
  promptAsync: () => Promise<any>;
  loading: boolean;
  error: string | null;
  loginWithGoogle: (idToken: string) => Promise<any>;
  registerWithGoogle: (
    idToken: string,
    name: string,
    email: string,
    role: string,
    driverData?: any,
    vehicleData?: any
  ) => Promise<any>;
}

/**
 * Hook para manejar autenticación con Google
 * @param clientId - Google OAuth Client ID
 * @returns Objeto con funciones y estado de Google Auth
 */
export const useGoogleAuth = (clientId: string): UseGoogleAuthReturn => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Usar useAuthRequest correctamente
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId,
    scopes: ['profile', 'email'],
  }) as any;

  // Manejar respuesta de Google Auth
  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      console.log('✅ Google Auth exitoso, token recibido');
    }
  }, [response]);

  const loginWithGoogle = async (idToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const userData = await googleAuthService.loginWithGoogle(idToken);
      return userData;
    } catch (err: any) {
      const errorMessage = err.message || 'Error al iniciar sesión con Google';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const registerWithGoogle = async (
    idToken: string,
    name: string,
    email: string,
    role: string,
    driverData?: any,
    vehicleData?: any
  ) => {
    setLoading(true);
    setError(null);
    try {
      const userData = await googleAuthService.registerWithGoogle(
        idToken,
        name,
        email,
        role,
        driverData,
        vehicleData
      );
      return userData;
    } catch (err: any) {
      const errorMessage = err.message || 'Error al registrar con Google';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    promptAsync,
    loading,
    error,
    loginWithGoogle,
    registerWithGoogle,
  };
};
