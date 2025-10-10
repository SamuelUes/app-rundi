import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

// Configuración de Firebase
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyAMeFrnZTR6jspAZi3kYphj0QSksWvpM4g",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "driveangel-ni.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "driveangel-ni",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "driveangel-ni.appspot.com",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "1040329608349",
  appId: process.env.FIREBASE_APP_ID || "1:1040329608349:web:d80d1f1d5934aba2291874",
  databaseURL: process.env.FIREBASE_DATABASE_URL || "https://driveangel-ni-default-rtdb.firebaseio.com",
};

// Debug: Verificar que la configuración se cargó correctamente
console.log('🔧 Firebase Config:', {
  apiKey: firebaseConfig.apiKey.substring(0, 10) + '...',
  projectId: firebaseConfig.projectId,
  appId: firebaseConfig.appId,
});

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar servicios
export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const database = getDatabase(app);
export const functions = getFunctions(app);

console.log('✅ Firebase inicializado correctamente');

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

export default app;
