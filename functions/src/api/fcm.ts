import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { firestore, messaging } from "../config/firebase";

const TOKENS_SUBCOLLECTION = "fcmTokens";

interface RegisterTokenPayload {
  fcmToken?: string;
  platform?: string;
}

export const registerFCMToken = functions.https.onCall(async (data: RegisterTokenPayload, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const token = data?.fcmToken;
  if (!token || typeof token !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "Se requiere un token FCM válido");
  }

  const platform = data?.platform ?? "unknown";
  const tokenRef = firestore
    .collection("users")
    .doc(context.auth.uid)
    .collection(TOKENS_SUBCOLLECTION)
    .doc(token);

  await tokenRef.set(
    {
      token,
      platform,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { success: true };
});

interface ClearTokenPayload {
  fcmToken?: string;
}

export const clearFCMToken = functions.https.onCall(async (data: ClearTokenPayload, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const token = data?.fcmToken;
  if (!token || typeof token !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "Se requiere un token FCM válido");
  }

  await firestore
    .collection("users")
    .doc(context.auth.uid)
    .collection(TOKENS_SUBCOLLECTION)
    .doc(token)
    .delete()
    .catch(() => undefined);

  return { success: true };
});

export const sendTestNotification = functions.https.onCall(async (_data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const snapshot = await firestore
    .collection("users")
    .doc(context.auth.uid)
    .collection(TOKENS_SUBCOLLECTION)
    .get();

  if (snapshot.empty) {
    throw new functions.https.HttpsError("not-found", "No se encontraron tokens FCM para el usuario");
  }

  const tokens = snapshot.docs.map((doc) => doc.id).filter(Boolean);
  if (!tokens.length) {
    throw new functions.https.HttpsError("not-found", "No se encontraron tokens FCM para el usuario");
  }

  await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: "Notificación de prueba",
      body: "¡Todo está funcionando correctamente!",
    },
    data: {
      type: "general",
    },
  });

  await Promise.all(
    tokens.map((token) =>
      firestore
        .collection("users")
        .doc(context.auth!.uid)
        .collection(TOKENS_SUBCOLLECTION)
        .doc(token)
        .set({ lastSentAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
    )
  );

  return { success: true };
});
