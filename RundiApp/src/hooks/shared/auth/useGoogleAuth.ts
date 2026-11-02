/**
 * useGoogleAuth Hook
 * Hook personalizado para manejar autenticación con Google
 */

import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { AuthSessionResult } from 'expo-auth-session';
import Constants from 'expo-constants';
import googleAuthService from '../../../services/auth/googleAuthService';

// Completar el flujo de autenticación web
WebBrowser.maybeCompleteAuthSession();

interface UseGoogleAuthReturn {
  promptAsync: () => Promise<any>;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  getGoogleIdToken: () => Promise<string>;
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
  const pendingPromiseRef = useRef<{ resolve: (token: string) => void; reject: (error: Error) => void } | null>(null);

  const androidClientId =
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
    process.env.REACT_APP_GOOGLE_CLIENT_ID_ANDROID_AUTO_GOOGLE ||
    process.env.REACT_APP_GOOGLE_CLIENT_ID_ANDROID ||
    clientId || '';

  const iosClientId =
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
    process.env.REACT_APP_GOOGLE_CLIENT_ID_IOS_AUTO_GOOGLE ||
    process.env.REACT_APP_GOOGLE_CLIENT_ID_IOS ||
    undefined;

  const webClientId =
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
    process.env.REACT_APP_GOOGLE_CLIENT_AUTO_ID ||
    process.env.REACT_APP_GOOGLE_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    undefined;

  if (!androidClientId) {
    console.error('❌ Google Client ID no configurado. Verifica las variables de entorno de Google OAuth');
  }

  // En iOS, Google OAuth solo acepta redirect_uri con el esquema
  // "reversed client id" (com.googleusercontent.apps.<client-id>:).
  // El default de expo-auth-session usa el bundle id, que provoca
  // Error 400: redirect_uri_mismatch con clientes tipo iOS.
  const nativeRedirectUri =
    Platform.OS === 'ios' && iosClientId
      ? `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}:/oauthredirect`
      : undefined;

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(
    {
      androidClientId,
      iosClientId,
      webClientId,
      scopes: ['profile', 'email'],
    },
    nativeRedirectUri ? { native: nativeRedirectUri } : {}
  ) as any;

  console.log('🔐 Google OAuth redirectUri:', request?.redirectUri, '| iosClientId:', iosClientId);

  // Manejar respuesta de Google Auth
  useEffect(() => {
    if (!response) {
      return;
    }

    if (response.type === 'success') {
      const idToken = extractIdToken(response);
      if (idToken) {
        console.log('✅ Google Auth exitoso, token recibido');
        pendingPromiseRef.current?.resolve(idToken);
      } else {
        const message = 'No se recibió ID Token de Google';
        console.error(`❌ ${message}`);
        setError(message);
        pendingPromiseRef.current?.reject(new Error(message));
      }
    } else if (response.type === 'error') {
      const message = response.params?.error || 'Error en Google Sign-In';
      console.error('❌ Error en Google Auth:', message);
      setError(message);
      pendingPromiseRef.current?.reject(new Error(message));
    } else if (response.type === 'dismiss') {
      pendingPromiseRef.current?.reject(new Error('Autenticación cancelada por el usuario'));
    }

    pendingPromiseRef.current = null;
  }, [response]);

  const getGoogleIdToken = async (): Promise<string> => {
    setLoading(true);
    try {
      if (Platform.OS === 'android') {
        const nativeWebClientId = Constants.expoConfig?.extra?.androidGoogleWebClientId;
        if (typeof nativeWebClientId !== 'string' || !nativeWebClientId) {
          throw new Error('Falta el cliente web de Google en google-services.json');
        }
        const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
        GoogleSignin.configure({ webClientId: nativeWebClientId });
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        const result = await GoogleSignin.signIn();
        if (result.type !== 'success') {
          throw new Error('Autenticación cancelada por el usuario');
        }
        if (!result.data.idToken) {
          throw new Error('No se recibió ID Token de Google');
        }
        return result.data.idToken;
      }

      const result = await promptAsync();

      if (!result || result.type === 'dismiss' || result.type === 'cancel') {
        throw new Error('Autenticación cancelada por el usuario');
      }

      if (result.type === 'error') {
        const message = (result as any)?.error || 'Error en Google Sign-In';
        throw new Error(message);
      }

      const immediateToken = extractIdToken(result);
      if (immediateToken) {
        return immediateToken;
      }

      return await new Promise<string>((resolve, reject) => {
        pendingPromiseRef.current = { resolve, reject };
      });
    } finally {
      setLoading(false);
    }
  };

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
    getGoogleIdToken,
    loginWithGoogle,
    registerWithGoogle,
  };
};

const extractIdToken = (result: AuthSessionResult | null) => {
  if (!result || result.type !== 'success') return null;
  return result.authentication?.idToken || (result.params as any)?.id_token || null;
};
