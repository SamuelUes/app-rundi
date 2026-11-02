import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  Auth,
  connectAuthEmulator,
  // @ts-ignore - React Native persistence
  getReactNativePersistence
} from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator, Firestore, doc, getDoc } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { FS_COL } from '../constants/firestore';
import { devTiming } from '../utils/devTiming';
import { resolveLocalEmulatorHost } from './localEmulatorHost';
import { waitForFirebaseAuthInitialization } from '../utils/firebase/firebaseAuthState';

// Configuración de Firebase (valores obtenidos únicamente desde variables de entorno)
const firebaseConfig = {
  apiKey: (Platform.select({
    ios: process.env.FIREBASE_API_KEY_IOS,
    android: process.env.FIREBASE_API_KEY_ANDROID,
  }) || process.env.FIREBASE_API_KEY) as string,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN as string,
  projectId: process.env.FIREBASE_PROJECT_ID as string,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID as string,
  appId: (Platform.select({
    ios: process.env.FIREBASE_APP_IOS_ID,
    android: process.env.FIREBASE_APP_ANDROID_ID,
  }) || process.env.FIREBASE_APP_ID) as string,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID as string | undefined,
};

// Variables globales para inicialización lazy
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestore: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let authStateInitialization: Promise<void> | null = null;
let isInitialized = false;

/**
 * Inicializar Firebase de manera segura (solo cuando se necesita)
 */
export async function initializeFirebase() {
  if (isInitialized) {
    return { app, auth, firestore, storage };
  }
  if (authStateInitialization) {
    await authStateInitialization;
    return { app, auth, firestore, storage };
  }

  try {
    if (__DEV__) console.log('🔧 Inicializando Firebase...');

    // Inicializar Firebase App
    app = initializeApp(firebaseConfig);

    // Inicializar Auth con persistencia de AsyncStorage
    try {
      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage)
      });
      if (__DEV__) console.log('✅ Firebase Auth inicializado con persistencia AsyncStorage');
    } catch (error) {
      console.warn('⚠️ No se pudo inicializar Auth con persistencia, usando getAuth');
      auth = getAuth(app);
    }

    // FIRESTORE_DATABASE_ID: named DB (p.ej. rundi-dev-2); vacío → (default)
    const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID;
    // En RN, el WebChannel de la primera conexión cuesta ~4-5 s (handshake de
    // canales + RTT alto). Long-polling hace cada op un fetch simple; medido
    // con [Firebase timing] warmup_firestore. Desactivar con =false p/ comparar.
    const forceLongPolling = (process.env.FIRESTORE_FORCE_LONG_POLLING ?? 'true') !== 'false';
    firestore = firestoreDatabaseId
      ? initializeFirestore(app, { experimentalForceLongPolling: forceLongPolling }, firestoreDatabaseId)
      : initializeFirestore(app, { experimentalForceLongPolling: forceLongPolling });
    storage = getStorage(app);

    // Conectar a emuladores si está habilitado
    const useEmulators = process.env.USE_FIREBASE_EMULATORS === 'true';
    const emulatorHost = resolveLocalEmulatorHost(
      process.env.FIREBASE_EMULATOR_HOST || 'localhost',
      Platform.OS,
    );

    if (useEmulators) {
      if (__DEV__) console.log('🔧 Conectando a Firebase Emulators...');

      connectAuthEmulator(auth, `http://${emulatorHost}:9099`);
      connectFirestoreEmulator(firestore, emulatorHost, 8080);
      connectStorageEmulator(storage, emulatorHost, 9199);
      if (__DEV__) console.log('✅ Firebase Emulators conectados');
    }

    authStateInitialization = waitForFirebaseAuthInitialization(auth);
    await authStateInitialization;

    // Calentamiento: la primera operación autenticada a Firestore paga el
    // refresh del ID token y el handshake del stream (~5 s en frío). Lanzarla
    // aquí, sin bloquear, solapa ese costo con el montaje de React; las
    // lecturas reales (perfil/sesión) se benefician del trabajo en curso.
    const currentUser = auth.currentUser;
    if (currentUser) {
      const warmupStarted = Date.now();
      void currentUser.getIdToken().then(
        () => devTiming('Firebase', 'warmup_token', warmupStarted),
        () => {},
      );
      void getDoc(doc(firestore, FS_COL.userSessions, currentUser.uid)).then(
        () => devTiming('Firebase', 'warmup_firestore', warmupStarted),
        () => {},
      );
    }

    isInitialized = true;
    if (__DEV__) console.log('✅ Firebase inicializado correctamente');

    return { app, auth, firestore, storage };
  } catch (error) {
    console.error('❌ Error inicializando Firebase:', error);
    throw error;
  }
}

/**
 * Obtener servicios Firebase (inicializa si es necesario)
 */
export async function getFirebaseServices() {
  if (!isInitialized) {
    await initializeFirebase();
  }
  return { app, auth, firestore, storage };
}

/**
 * Obtener Auth (inicializa si es necesario)
 */
export async function getFirebaseAuth(): Promise<Auth> {
  if (!isInitialized) {
    await initializeFirebase();
  }
  return auth!;
}

/**
 * Obtener Firestore (inicializa si es necesario)
 */
export async function getFirebaseFirestore(): Promise<Firestore> {
  if (!isInitialized) {
    await initializeFirebase();
  }
  return firestore!;
}

/**
 * Obtener Storage (inicializa si es necesario)
 */
export async function getFirebaseStorage(): Promise<FirebaseStorage> {
  if (!isInitialized) {
    await initializeFirebase();
  }
  return storage!;
}

// Exportar configuración para compatibilidad
export { firebaseConfig };
export default app;
