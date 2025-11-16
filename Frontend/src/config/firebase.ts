import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  Auth,
  connectAuthEmulator,
  // @ts-ignore - React Native persistence
  getReactNativePersistence
} from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configuración de Firebase
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyAMeFrnZTR6jspAZi3kYphj0QSksWvpM4g",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "driveangel-ni.firebaseapp.com",
  databaseURL: process.env.FIREBASE_DATABASE_URL || "https://driveangel-ni-default-rtdb.firebaseio.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "driveangel-ni",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "driveangel-ni.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "1040329608349",
  appId: process.env.FIREBASE_APP_ID || "1:1040329608349:web:d80d1f1d5934aba2291874",
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-5856MTQT2Z",
};

// Variables globales para inicialización lazy
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestore: any = null;
let database: any = null;
let functions: Functions | null = null;
let isInitialized = false;

/**
 * Inicializar Firebase de manera segura (solo cuando se necesita)
 */
export async function initializeFirebase() {
  if (isInitialized) {
    return { app, auth, firestore, database, functions };
  }

  try {
    console.log('🔧 Inicializando Firebase...');

    // Inicializar Firebase App
    app = initializeApp(firebaseConfig);

    // Inicializar Auth con persistencia de AsyncStorage
    try {
      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage)
      });
      console.log('✅ Firebase Auth inicializado con persistencia AsyncStorage');
    } catch (error) {
      console.warn('⚠️ No se pudo inicializar Auth con persistencia, usando getAuth');
      auth = getAuth(app);
    }

    // Inicializar otros servicios
    firestore = getFirestore(app);
    database = getDatabase(app);
    functions = getFunctions(app, 'us-central1'); // Especificar región

    // Conectar a emuladores si está habilitado
    const useEmulators = process.env.USE_FIREBASE_EMULATORS === 'true';
    const emulatorHost = process.env.FIREBASE_EMULATOR_HOST || 'localhost';

    if (useEmulators) {
      console.log('🔧 Conectando a Firebase Emulators...');

      connectAuthEmulator(auth, `http://${emulatorHost}:9099`);
      connectFirestoreEmulator(firestore, emulatorHost, 8080);
      connectDatabaseEmulator(database, emulatorHost, 9000);
      connectFunctionsEmulator(functions, emulatorHost, 5001);

      console.log('✅ Firebase Emulators conectados');
    }

    isInitialized = true;
    console.log('✅ Firebase inicializado correctamente');

    return { app, auth, firestore, database, functions };
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
  return { app, auth, firestore, database, functions };
}

/**
 * Obtener Auth (inicializa si es necesario)
 */
export async function getFirebaseAuth(): Promise<Auth> {
  if (!auth) {
    await initializeFirebase();
  }
  return auth!;
}

/**
 * Obtener Firestore (inicializa si es necesario)
 */
export async function getFirebaseFirestore() {
  if (!firestore) {
    await initializeFirebase();
  }
  return firestore;
}

/**
 * Obtener Database (inicializa si es necesario)
 */
export async function getFirebaseDatabase() {
  if (!database) {
    await initializeFirebase();
  }
  return database;
}

/**
 * Obtener Functions (inicializa si es necesario)
 */
export async function getFirebaseFunctions(): Promise<Functions> {
  if (!functions) {
    await initializeFirebase();
  }

  if (!functions) {
    throw new Error('Firebase Functions no inicializado');
  }

  return functions;
}

// Exportar configuración para compatibilidad
export { firebaseConfig };
export default app;
