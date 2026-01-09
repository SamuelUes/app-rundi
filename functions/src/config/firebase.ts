import admin from "firebase-admin";

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

// Exportar servicios
export const auth = admin.auth();
export const firestore = admin.firestore();
export const database = admin.database();
export const messaging = admin.messaging();

export default admin;
