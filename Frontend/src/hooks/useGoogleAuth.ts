/**
 * useGoogleAuth Hook
 * Hook personalizado para manejar autenticación con Google
 */

import { useState, useEffect } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { AuthSessionResult } from 'expo-auth-session';
import googleAuthService from '../services/auth/googleAuthService';

// Completar el flujo de autenticación web
WebBrowser.maybeCompleteAuthSession();

interface UseGoogleAuthReturn {
  promptAsync: () => Promise<any>;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  loginWithGoogle: (idToken: string) => Promise<any>;
  registerWithGoogle: (
    idToken: string,
    name: string,
    email: string,
    role: string,
    phone?: string,
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

  const androidClientId =
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
    process.env.REACT_APP_GOOGLE_CLIENT_ID ||
    clientId || '';

  const iosClientId =
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
    process.env.REACT_APP_GOOGLE_IOS_CLIENT_ID ||
    undefined;

  const webClientId =
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    process.env.REACT_APP_GOOGLE_WEB_CLIENT_ID ||
    undefined;

  if (!androidClientId) {
    console.error('❌ Google Client ID no configurado. Verifica las variables de entorno de Google OAuth');
  }

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    androidClientId,
    iosClientId,
    webClientId,
    scopes: ['profile', 'email'],
  }) as any;

  // Manejar respuesta de Google Auth
  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = extractIdToken(response);
      if (idToken) {
        console.log('✅ Google Auth exitoso, token recibido');
      } else {
        console.error('❌ Google Auth completó sin ID Token');
        setError('No se recibió ID Token de Google');
      }
    } else if (response?.type === 'error') {
      console.error('❌ Error en Google Auth:', response.params?.error);
      setError(response.params?.error || 'Error en Google Sign-In');
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
    phone?: string,
    driverData?: any,
    vehicleData?: any
  ) => {
    if (role !== 'client') {
      const message = 'El registro con Google solo está disponible para usuarios clientes.';
      console.warn(message);
      setError(message);
      throw new Error(message);
    }

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

  const clearError = () => {
    setError(null);
  };

  return {
    promptAsync,
    loading,
    error,
    clearError,
    loginWithGoogle,
    registerWithGoogle,
  };
};

const extractIdToken = (result: AuthSessionResult | null) => {
  if (!result || result.type !== 'success') return null;
  return result.authentication?.idToken || (result.params as any)?.id_token || null;
};
