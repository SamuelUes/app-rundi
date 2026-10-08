import admin from "firebase-admin";
import { existsSync, readdirSync } from "fs";
import * as path from "path";

const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

// iid.googleapis.com (subscribeToTopic) rechaza credenciales de usuario con
// 401; el emulador necesita una service account key real del proyecto.
const findEmulatorServiceAccount = (): string | undefined => {
  const functionsDir = path.join(__dirname, "..", "..");
  return readdirSync(functionsDir)
    .filter(
      (name) =>
        name === "firebase-service-account.json" ||
        /-firebase-adminsdk-[a-z0-9]+\.json$/i.test(name)
    )
    .map((name) => path.join(functionsDir, name))
    .find((filePath) => existsSync(filePath));
};

const serviceAccountPath = isEmulator ? findEmulatorServiceAccount() : undefined;

// fcm.googleapis.com e iid.googleapis.com no están emulados: sin una service
// account real cualquier operación de Messaging (send/subscribeToTopic) falla
// con 401. Se omite la llamada en vez de registrar un stack 401 por intento.
export const messagingCredentialsAvailable = !isEmulator || Boolean(serviceAccountPath);

// Inicializar Firebase Admin
if (!admin.apps.length) {
  if (serviceAccountPath) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccountPath) });
    console.log(`✅ [firebase] Emulador autenticado con service account: ${path.basename(serviceAccountPath)}`);
  } else {
    admin.initializeApp();
    if (isEmulator) {
      console.warn(
        "⚠️ [firebase] Emulador sin service account: operaciones de Messaging omitidas (send/subscribeToTopic fallarían con 401). " +
          "Guarda la key de rundi-dev como functions/firebase-service-account.json"
      );
    }
  }
}

// Exportar servicios
export const auth = admin.auth();
export const firestore = admin.firestore();
export const database = admin.database();
export const messaging = admin.messaging();

export default admin;
