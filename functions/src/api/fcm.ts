import * as functions from "firebase-functions/v1";
import admin from "firebase-admin";
import { firestore } from "../config/firebase";
import { sendNotificationToUserWithTokens, subscribeTokenToTopics, unsubscribeTokenFromTopics } from "../services/pushNotifications";

const TOKENS_SUBCOLLECTION = "fcmTokens";

const FCM_TOPICS_ALL = "all";
const FCM_TOPICS_CLIENTS = "clients";
const FCM_TOPICS_DRIVERS = "drivers";

const getRoleTopics = (role: string | null): string[] => {
  const topics = [FCM_TOPICS_ALL];
  if (role === "client") {
    topics.push(FCM_TOPICS_CLIENTS);
  } else if (role === "driver" || role === "designated_driver") {
    topics.push(FCM_TOPICS_DRIVERS);
  }
  return topics;
};

const fetchUserRole = async (uid: string): Promise<string | null> => {
  try {
    const doc = await firestore.collection("users").doc(uid).get();
    if (!doc.exists) {
      return null;
    }
    const data = doc.data() as Record<string, unknown> | undefined;
    const roleRaw = (data?.role ?? data?.userRole ?? data?.type ?? null) as string | null;
    return typeof roleRaw === "string" && roleRaw.trim().length > 0 ? roleRaw.trim() : null;
  } catch {
    return null;
  }
};

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

  const role = await fetchUserRole(context.auth.uid);
  const topics = getRoleTopics(role);
  await subscribeTokenToTopics(token, topics);

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

  const role = await fetchUserRole(context.auth.uid);
  const topics = getRoleTopics(role);
  await unsubscribeTokenFromTopics(token, topics);

  await firestore
    .collection("users")
    .doc(context.auth.uid)
    .collection(TOKENS_SUBCOLLECTION)
    .doc(token)
    .delete()
    .catch(() => undefined);

  return { success: true };
});

interface NotifyProximityPayload {
  driverId?: string;
  ride?: any;
  nearbyRides?: any[];
}

// Enviar notificación de "viaje por aproximación" a un conductor específico
export const notifyProximityRide = functions.https.onCall(async (data: NotifyProximityPayload, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const driverId = (data?.driverId || context.auth.uid) as string;
  const ride = data?.ride;
  if (!driverId || !ride?.id || !ride?.origin) {
    throw new functions.https.HttpsError("invalid-argument", "driverId y ride son requeridos");
  }

  // Obtener tokens del conductor
  const snapshot = await firestore
    .collection("users")
    .doc(driverId)
    .collection(TOKENS_SUBCOLLECTION)
    .get();

  const tokens = snapshot.docs.map((d) => d.id).filter(Boolean);
  if (!tokens.length) {
    return { success: false, message: "No hay tokens FCM para el conductor" };
  }

  const title = "🚨 Solicitud cercana";
  const body = `${ride?.distanceMeters ? Math.max(1, Math.round(Number(ride.distanceMeters))) + 'm' : ''} • C$${Math.round(Number(ride.estimatedPrice || 0))} • ${ride?.origin?.address || 'Cerca de ti'}`;

  await sendNotificationToUserWithTokens(driverId, tokens, {
    title,
    body,
    data: {
      type: "proximity_ride",
      ride: JSON.stringify(ride),
      nearbyRides: JSON.stringify(Array.isArray(data?.nearbyRides) ? data?.nearbyRides : []),
    },
    androidChannelId: "rundi-default-v2",
    notificationKey: `proximity-ride-${ride.id}`,
    expiresInMs: 10 * 1000,
  });

  // Marcar último envío
  await Promise.all(
    tokens.map((token) =>
      firestore
        .collection("users")
        .doc(driverId)
        .collection(TOKENS_SUBCOLLECTION)
        .doc(token)
        .set({ lastProximitySentAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
    )
  );

  return { success: true, sent: tokens.length };
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

  await sendNotificationToUserWithTokens(context.auth.uid, tokens, {
    title: "Notificación de prueba",
    body: "¡Todo está funcionando correctamente!",
    data: {
      type: "general",
    },
    androidChannelId: "rundi-default-v2",
    notificationKey: `test-${Date.now()}`,
    expiresInMs: 120_000,
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
