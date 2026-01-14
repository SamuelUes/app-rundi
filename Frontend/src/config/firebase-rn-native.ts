/**
 * Configuración para React Native Firebase (módulos nativos)
 * Esta configuración es necesaria para usar @react-native-firebase/*
 * 
 * IMPORTANTE: Requiere google-services.json (Android) o GoogleService-Info.plist (iOS)
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

// Configuración desde variables de entorno
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY as string,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN as string,
  databaseURL: process.env.FIREBASE_DATABASE_URL as string,
  projectId: process.env.FIREBASE_PROJECT_ID as string,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID as string,
  appId: process.env.FIREBASE_APP_ID as string,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID as string | undefined,
};

let app: FirebaseApp | null = null;

/**
 * Inicializar Firebase App para React Native Firebase
 */
export function initializeReactNativeFirebase(): FirebaseApp {
  if (app) {
    return app;
  }

  try {
    // Verificar si ya existe una app inicializada
    const existingApps = getApps();
    if (existingApps.length > 0) {
      app = existingApps[0];
      console.log('✅ React Native Firebase ya estaba inicializado');
      return app;
    }

    // Inicializar nueva app
    app = initializeApp(firebaseConfig);
    console.log('✅ React Native Firebase inicializado correctamente');

    // Inicializar Auth
    const auth = getAuth(app);
    console.log('✅ React Native Firebase Auth inicializado');

    return app;
  } catch (error) {
    console.error('❌ Error inicializando React Native Firebase:', error);
    throw error;
  }
}

/**
 * Verificar si React Native Firebase está disponible
 */
export function isReactNativeFirebaseAvailable(): boolean {
  try {
    // Verificar si los módulos nativos están disponibles
    // @ts-ignore - Verificación en runtime
    return typeof require('@react-native-firebase/app').default !== 'undefined';
  } catch (error) {
    return false;
  }
}

/**
 * Obtener instancia de Firebase App
 */
export function getReactNativeFirebaseApp(): FirebaseApp | null {
  if (!app) {
    try {
      return initializeReactNativeFirebase();
    } catch (error) {
      console.error('❌ No se pudo inicializar React Native Firebase:', error);
      return null;
    }
  }
  return app;
}

// Exportar configuración
export { firebaseConfig };
