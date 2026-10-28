import * as functions from "firebase-functions/v1";
import admin from "firebase-admin";
import { firestore } from "../config/firebase";
import { sendNotificationToUserWithTokens, subscribeTokenToTopics, unsubscribeTokenFromTopics } from "../services/pushNotifications";
import { requireDriver } from "../utils/sessionUtils";
import { FeatureRepository } from "../sequelize/repositories/FeatureRepository";
import { getFeaturePoliciesForService, getRideFeatureCapabilitiesForDriver } from "../helpers/rideFeatureService";
import { resolveRideFeatureEligibility } from "../helpers/featureEligibility";
import { serviceCodeFromRideFields } from "../helpers/priceCalculator";

const TOKENS_SUBCOLLECTION = "fcmTokens";
const featureRepository = new FeatureRepository();

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
  const driverId = await requireDriver(context);
  const requestedRideId = typeof data?.ride?.id === 'string' ? data.ride.id : '';
  if (!requestedRideId) {
    throw new functions.https.HttpsError("invalid-argument", "ride.id es requerido");
  }

  const rideSnapshot = await admin.database().ref(`activeRides/${requestedRideId}`).once('value');
  const ride = rideSnapshot.val();
  if (
    !ride ||
    String(ride.status ?? '').toLowerCase() !== 'requested' ||
    ride.driverId
  ) {
    return { success: false, message: 'Ride no disponible' };
  }

  const driverInfoSnapshot = await admin.database().ref(`driversInfo/${driverId}`).once('value');
  const driverInfo = driverInfoSnapshot.val() || {};
  const driverVehicleType = String(driverInfo.vehicle?.type ?? driverInfo.vehicleType ?? '').toLowerCase();
  const driverHasMoto = driverVehicleType.includes('moto') || driverVehicleType.includes('motorcycle');
  const rideType = String(ride.rideType ?? ride.ride_type ?? 'normal').toLowerCase();
  const rideHasMoto = String(
    rideType === 'designated_driver'
      ? ride.designatedDriverVehicle ?? ride.designated_driver_vehicle ?? ''
      : ride.vehicleType ?? ride.vehicle_type ?? '',
  ).toLowerCase().includes('moto');
  if (
    (rideType === 'designated_driver' && !driverInfo.isDesignatedDriverMode) ||
    driverHasMoto !== rideHasMoto
  ) {
    return { success: false, message: 'Ride vehicle type not compatible' };
  }

  const featureCodes = Array.isArray(ride.featureCodes)
    ? ride.featureCodes.filter((code: unknown): code is string => typeof code === 'string')
    : Array.isArray(ride.pricingSnapshot?.featureCodes)
      ? ride.pricingSnapshot.featureCodes.filter((code: unknown): code is string => typeof code === 'string')
      : [];
  if (featureCodes.length > 0) {
    const serviceCode = String(
      ride.pricingSnapshot?.serviceCode ??
      ride.serviceCode ??
      serviceCodeFromRideFields(ride.rideType, ride.vehicleType, ride.designatedDriverVehicle),
    );
    const serviceId =
      (typeof ride.serviceId === 'string' && ride.serviceId) ||
      await featureRepository.findServiceIdByCode(serviceCode);
    if (!serviceId) return { success: false, message: 'Ride feature service unavailable' };

    const vehicleId = driverInfo.vehicle?.id ?? driverInfo.currentVehicle?.id ?? null;
    try {
      const capabilities = await getRideFeatureCapabilitiesForDriver(
        driverId,
        typeof vehicleId === 'string' ? vehicleId : null,
      );
      const eligibility = resolveRideFeatureEligibility(
        await getFeaturePoliciesForService(serviceId),
        featureCodes,
        {
          serviceCode,
          rideType: String(ride.rideType ?? ride.ride_type ?? 'normal'),
          vehicleType: String(ride.vehicleType ?? ride.vehicle_type ?? 'auto'),
          designatedDriverVehicle: ride.designatedDriverVehicle ?? ride.designated_driver_vehicle ?? null,
          driverFeatureCodes: capabilities.driverFeatureCodes,
          vehicleFeatureCodes: capabilities.vehicleFeatureCodes,
          vehicleFacts: capabilities.vehicleFacts,
          at: new Date(ride.scheduledAt ?? ride.createdAt ?? Date.now()),
          currentTime: new Date(),
        },
      );
      if (!eligibility.eligible) return { success: false, message: 'Ride feature not eligible' };
    } catch (error) {
      console.warn('[notifyProximityRide] No se pudo validar la elegibilidad del feature', {
        rideId: requestedRideId,
        driverId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, message: 'Ride feature eligibility unavailable' };
    }
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

  const distanceMeters = Number(data?.ride?.distanceMeters);
  const title = "🚨 Solicitud cercana";
  const body = `${Number.isFinite(distanceMeters) && distanceMeters > 0 ? Math.max(1, Math.round(distanceMeters)) + 'm' : ''} • C$${Math.round(Number(ride.estimatedPrice || 0))} • ${ride?.origin?.address || 'Cerca de ti'}`;
  const notificationRide = {
    id: requestedRideId,
    clientId: ride.clientId ?? null,
    clientName: ride.clientName ?? null,
    status: ride.status,
    origin: ride.origin ?? null,
    destination: ride.destination ?? null,
    extraDestinations: ride.extraDestinations ?? null,
    estimatedPrice: ride.estimatedPrice ?? null,
    estimatedDistance: ride.estimatedDistance ?? null,
    estimatedDuration: ride.estimatedDuration ?? null,
    clientSuggestedPrice: ride.clientSuggestedPrice ?? null,
    featureCodes,
    serviceCode: ride.pricingSnapshot?.serviceCode ?? ride.serviceCode ?? null,
    rideType: ride.rideType ?? null,
    vehicleType: ride.vehicleType ?? null,
    designatedDriverVehicle: ride.designatedDriverVehicle ?? null,
    passengers: ride.passengers ?? null,
    paymentMethod: ride.paymentMethod ?? null,
    distanceMeters: Number.isFinite(distanceMeters) && distanceMeters > 0 ? Math.round(distanceMeters) : undefined,
  };

  await sendNotificationToUserWithTokens(driverId, tokens, {
    title,
    body,
    data: {
      type: "proximity_ride",
      ride: JSON.stringify(notificationRide),
      nearbyRides: JSON.stringify([notificationRide]),
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
