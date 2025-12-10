import * as functions from "firebase-functions";
import admin from "firebase-admin";
import { cleanupPresenceNodes } from "../helpers/cleanupHelpers-new";

const db = admin.database();

function assertRole(role: unknown): asserts role is "driver" | "client" {
  if (role !== "driver" && role !== "client") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "El parámetro role debe ser 'driver' o 'client'."
    );
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

export const markAppClosed = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const role = data?.role;
  assertRole(role);

  const uid = context.auth.uid;
  const deviceId = typeof data?.deviceId === 'string' ? data.deviceId : undefined;

  if (role === "driver") {
    await cleanupPresenceNodes({ driverIds: [uid] });
  } else {
    await cleanupPresenceNodes({ clientIds: [uid] });
  }

  // Actualizar sesión (lastSeen) si existe
  try {
    if (deviceId) {
      await db.ref(`sessions/${uid}`).update({ lastSeen: admin.database.ServerValue.TIMESTAMP });
    }
  } catch (e) {
    functions.logger.warn('[markAppClosed] No se pudo actualizar lastSeen de sesión', { uid, error: (e as any)?.message || e });
  }

  return { success: true };
});

export const markAppActive = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const role = data?.role;
  assertRole(role);

  const uid = context.auth.uid;
  const now = admin.database.ServerValue.TIMESTAMP;
  const deviceId = typeof data?.deviceId === 'string' ? data.deviceId : undefined;

  try {
    // Validar sesión activa si se envía deviceId
    if (deviceId) {
      const sessionSnap = await db.ref(`sessions/${uid}`).once('value');
      const session = sessionSnap.val();
      if (session && session.deviceId && session.deviceId !== deviceId) {
        // Considerar activa si lastSeen es reciente (<= 2 min)
        const lastSeen = typeof session.lastSeen === 'number' ? session.lastSeen : Date.now();
        if (Date.now() - lastSeen <= 2 * 60 * 1000) {
          throw new functions.https.HttpsError('failed-precondition', 'SESSION_ACTIVE_ELSEWHERE');
        }
      }
      // Mantener lastSeen actualizado
      await db.ref(`sessions/${uid}`).update({ lastSeen: now, deviceId });
    }

    if (role === "driver") {
      const location: DriverLocationPayload | undefined = data?.location;
      // No escribir 'status' en driversInfo; solo timestamps
      const driverInfoUpdate: Record<string, any> = {
        updatedAt: now,
        lastSeen: now,
      };

      const driverLocationUpdate: Record<string, any> = {
        status: "offline",
        updatedAt: now,
        lastSeen: now,
      };

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
          lastHeartbeat: now,
          role: "client",
          lastSeen: now,
        }),
      ];

      if (hasLocation && !isZeroCoordinates) {
        const clientLocationPayload: Record<string, any> = {
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
      error: error?.message || error,
    });
    throw new functions.https.HttpsError(
      "internal",
      error?.message || "Error actualizando presencia"
    );
  }

  return { success: true };
});
