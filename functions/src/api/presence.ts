import * as functions from "firebase-functions/v1";
import admin from "firebase-admin";
import { cleanupPresenceNodes } from "../helpers/cleanupHelpers";
import { DEFAULT_SERVICE_AREA_ID } from '../config/constants';
import { runSessionTransaction } from '../utils/sessionUtils';

const db = admin.database();

// Runtime options for presence functions - increased timeout for database operations
const presenceRuntimeOpts: functions.RuntimeOptions = {
  memory: '256MB',
  timeoutSeconds: 60,
  minInstances: 1,
  maxInstances: 50,
};

async function getSessionServiceAreaId(uid: string): Promise<string> {
  try {
    const snap = await db.ref(`sessions/${uid}/serviceAreaId`).once("value");
    const value = snap.val();
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  } catch (err) {
    functions.logger.warn("[presence] No se pudo leer serviceAreaId de sesión", {
      uid,
      error: (err as any)?.message || err,
    });
  }
  return DEFAULT_SERVICE_AREA_ID;
}

function assertRole(role: unknown): asserts role is "driver" | "client" {
  if (role !== "driver" && role !== "client") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "El parámetro role debe ser 'driver' o 'client'."
    );
  }
}

async function updateSessionActivity(uid: string, deviceId: string | undefined, isActive: boolean) {
  if (!deviceId) {
    throw new functions.https.HttpsError('invalid-argument', 'deviceId requerido');
  }

  const result = await runSessionTransaction(db.ref(`sessions/${uid}`), (session) => {
    if (!session || session.deviceId !== deviceId) return;
    return {
      ...session,
      isActive,
      lastSeen: admin.database.ServerValue.TIMESTAMP,
    };
  });

  if (!result.committed) {
    try {
      const latest = (await db.ref(`sessions/${uid}`).once('value')).val();
      const idType = (value: unknown): string | null =>
        typeof value === 'string' && value.includes('-') ? value.split('-')[0] : null;
      functions.logger.warn('[presence] updateSessionActivity rechazado', {
        uid,
        isActive,
        sessionExists: Boolean(latest),
        sameDevice: latest?.deviceId === deviceId,
        incomingIdType: idType(deviceId),
        ownerIdType: idType(latest?.deviceId),
        sessionActive: latest?.isActive ?? null,
        sessionPlatform: latest?.platform ?? null,
        sessionModel: latest?.model ?? null,
      });
    } catch {
      // diagnóstico best-effort
    }
    throw new functions.https.HttpsError('failed-precondition', 'SESSION_ACTIVE_ELSEWHERE');
  }
}

type DriverLocationPayload = {
  latitude?: number;
  longitude?: number;
};

type ClientLocationPayload = {
  latitude?: number;
  longitude?: number;
  isManual?: boolean;
};

export const markAppClosed = functions.runWith(presenceRuntimeOpts).https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const role = data?.role;
  assertRole(role);

  const uid = context.auth.uid;
  const deviceId = typeof data?.deviceId === 'string' ? data.deviceId : undefined;

  await updateSessionActivity(uid, deviceId, false);

  if (role === "driver") {
    await cleanupPresenceNodes({ driverIds: [uid] });
  } else {
    await cleanupPresenceNodes({ clientIds: [uid] });
  }

  return { success: true };
});

export const markAppActive = functions.runWith(presenceRuntimeOpts).https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const role = data?.role;
  assertRole(role);

  const uid = context.auth.uid;
  const now = admin.database.ServerValue.TIMESTAMP;
  const deviceId = typeof data?.deviceId === 'string' ? data.deviceId : undefined;
  const keepAvailability = data?.keepAvailability === true;

  try {
    await updateSessionActivity(uid, deviceId, true);

    if (role === "driver") {
      try {
        const serviceAreaId = await getSessionServiceAreaId(uid);
        await db.ref().update({
          [`clientsLocations/${uid}`]: null,
          [`clientsInfo/${uid}`]: null,
          [`presence/${uid}`]: null,
          [`clientsLocationsByArea/${serviceAreaId}/${uid}`]: null,
          [`clientsLocationsByArea/${DEFAULT_SERVICE_AREA_ID}/${uid}`]: null,
        });
      } catch (cleanupErr: any) {
        functions.logger.warn("[markAppActive] No se pudo limpiar nodos de cliente al activar conductor", {
          uid,
          error: cleanupErr?.message || cleanupErr,
        });
      }

      const location: DriverLocationPayload | undefined = data?.location;
      // No escribir 'status' en driversInfo; solo timestamps
      const driverInfoUpdate: Record<string, any> = {
        updatedAt: now,
        lastSeen: now,
      };

      const driverLocationUpdate: Record<string, any> = {
        deviceId,
        updatedAt: now,
        lastSeen: now,
      };

      // Conductor con disponibilidad activada manualmente: no resetear a
      // 'offline' al volver a foreground (el cliente reafirma 'available')
      if (!keepAvailability) {
        driverLocationUpdate.status = "offline";
      }

      if (typeof location?.latitude === "number") {
        driverLocationUpdate.lat = location.latitude;
      }
      if (typeof location?.longitude === "number") {
        driverLocationUpdate.lng = location.longitude;
      }

      let profileData: Record<string, any> | null = null;
      try {
        const userDoc = await admin.firestore().collection("users").doc(uid).get();
        profileData = userDoc.exists ? userDoc.data() ?? null : null;
      } catch (firestoreError: any) {
        functions.logger.warn("[markAppActive] No se pudo leer usuario en Firestore", {
          uid,
          error: firestoreError?.message || firestoreError,
        });
      }

      const normalizedProfile = {
        fullName:
          profileData?.fullName ??
          profileData?.name ??
          profileData?.displayName ??
          profileData?.firstName ??
          null,
        photoUrl:
          profileData?.photoUrl ??
          profileData?.photoURL ??
          profileData?.avatarUrl ??
          profileData?.avatar ??
          null,
        phone:
          profileData?.phone ??
          profileData?.phoneNumber ??
          profileData?.phone_number ??
          null,
        updatedAt: now,
        cachedFrom: profileData ? "firestore" : "bootstrap",
      } as const;

      driverInfoUpdate.fullName = normalizedProfile.fullName;
      driverInfoUpdate.photoUrl = normalizedProfile.photoUrl;
      driverInfoUpdate.phone = normalizedProfile.phone;

      await Promise.all([
        db.ref(`driversInfo/${uid}`).update(driverInfoUpdate),
        db.ref(`driverLocations/${uid}`).update(driverLocationUpdate),
      ]);
    } else {
      try {
        const serviceAreaId = await getSessionServiceAreaId(uid);
        await db.ref().update({
          [`driverLocationsByArea/${serviceAreaId}/${uid}`]: null,
          [`driverLocationsByArea/${DEFAULT_SERVICE_AREA_ID}/${uid}`]: null,
          [`driverLocations/${uid}/status`]: "offline",
          [`driverLocations/${uid}/lat`]: null,
          [`driverLocations/${uid}/lng`]: null,
          [`driverLocations/${uid}/updatedAt`]: now,
          [`driverLocations/${uid}/lastSeen`]: now,
          [`driversInfo/${uid}/updatedAt`]: now,
          [`driversInfo/${uid}/lastSeen`]: now,
        });
      } catch (cleanupErr: any) {
        functions.logger.warn("[markAppActive] No se pudo limpiar nodos de conductor al activar cliente", {
          uid,
          error: cleanupErr?.message || cleanupErr,
        });
      }

      const location: ClientLocationPayload | undefined = data?.location;
      const hasLocation =
        typeof location?.latitude === "number" &&
        typeof location?.longitude === "number";
      const isZeroCoordinates =
        hasLocation &&
        location!.latitude === 0 &&
        location!.longitude === 0;

      const updates: Promise<unknown>[] = [
        db.ref(`presence/${uid}`).update({
          deviceId,
          lastHeartbeat: now,
          role: "client",
          lastSeen: now,
        }),
      ];

      if (hasLocation && !isZeroCoordinates) {
        const clientLocationPayload: Record<string, any> = {
          deviceId,
          latitude: location!.latitude as number,
          longitude: location!.longitude as number,
          isManual: typeof location?.isManual === "boolean" ? location.isManual : false,
          timestamp: now,
          lastHeartbeat: now,
        };

        updates.push(db.ref(`clientsLocations/${uid}`).update(clientLocationPayload));
      }

      try {
        const clientInfoRef = db.ref(`clientsInfo/${uid}`);
        const clientInfoSnapshot = await clientInfoRef.once("value");

        if (!clientInfoSnapshot.exists()) {
          functions.logger.info("[markAppActive] Creando clientsInfo inicial", { uid });

          let profileData: Record<string, any> | null = null;
          try {
            const userDoc = await admin.firestore().collection("users").doc(uid).get();
            profileData = userDoc.exists ? userDoc.data() ?? null : null;
          } catch (firestoreError: any) {
            functions.logger.warn("[markAppActive] No se pudo leer usuario en Firestore", {
              uid,
              error: firestoreError?.message || firestoreError,
            });
          }

          const normalizedProfile = {
            fullName:
              profileData?.fullName ??
              profileData?.name ??
              profileData?.displayName ??
              profileData?.firstName ??
              null,
            photoUrl:
              profileData?.photoUrl ??
              profileData?.photoURL ??
              profileData?.avatarUrl ??
              profileData?.avatar ??
              null,
            phone:
              profileData?.phone ??
              profileData?.phoneNumber ??
              profileData?.phone_number ??
              null,
            updatedAt: now,
            cachedFrom: profileData ? "firestore" : "bootstrap",
          } as const;

          updates.push(
            clientInfoRef
              .set(normalizedProfile)
              .catch((err) =>
                functions.logger.warn("[markAppActive] Error guardando clientsInfo", {
                  uid,
                  error: err?.message || err,
                })
              )
          );
        }
      } catch (clientInfoError: any) {
        functions.logger.warn("[markAppActive] Error verificando clientsInfo", {
          uid,
          error: clientInfoError?.message || clientInfoError,
        });
      }

      await Promise.all(updates);
    }
  } catch (error: any) {
    functions.logger.error("[markAppActive] Error actualizando presencia", {
      uid,
      role,
      source: typeof data?.source === 'string' ? data.source : undefined,
      error: error?.message || error,
    });
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError(
      "internal",
      error?.message || "Error actualizando presencia"
    );
  }

  return { success: true };
});
