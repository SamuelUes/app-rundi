import * as functions from "firebase-functions/v1";
import admin, { database } from "../config/firebase";
import { supabaseGet } from "../supabase/client";

interface ClientProfile {
  fullName?: string | null;
  phone?: string | null;
  photoUrl?: string | null;
}

const normalizeProfile = (raw: any): ClientProfile => {
  const photoUrl =
    raw?.photoUrl || raw?.photoURL || raw?.profilePhoto || raw?.profile_photo ||
    raw?.avatarUrl || raw?.avatarURL || raw?.avatar_url || raw?.photo_url || raw?.avatar;
  const fullName = raw?.clientName || raw?.client?.name || raw?.fullName || raw?.full_name || raw?.name || raw?.displayName;
  const phone = raw?.clientPhone || raw?.client?.phone || raw?.phone || raw?.phone_number || raw?.phoneNumber;

  return {
    fullName: typeof fullName === "string" ? fullName : null,
    phone: typeof phone === "string" ? phone : null,
    photoUrl: typeof photoUrl === "string" && photoUrl.trim() ? photoUrl.trim() : null,
  };
};

export const getClientProfile = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Autenticación requerida para obtener el perfil del cliente."
    );
  }

  const clientId = typeof data?.clientId === "string" ? data.clientId.trim() : "";
  if (!clientId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Se requiere un clientId válido."
    );
  }

  const requesterId = context.auth.uid;
  let isAdmin = context.auth.token.role === "admin";
  let ride: any = null;

  if (clientId !== requesterId && !isAdmin) {
    isAdmin = (await admin.firestore().doc(`cms-users/${requesterId}`).get()).get("role") === "admin";
  }

  if (clientId !== requesterId && !isAdmin) {
    const rideId = typeof data?.rideId === "string" ? data.rideId.trim() : "";
    if (!rideId) {
      throw new functions.https.HttpsError("invalid-argument", "Se requiere un rideId para consultar datos de otro usuario.");
    }

    const [rideSnapshot, requesterProfile] = await Promise.all([
      database.ref(`activeRides/${rideId}`).once("value"),
      admin.firestore().doc(`users/${requesterId}`).get(),
    ]);
    ride = rideSnapshot.val();
    const role = requesterProfile.get("role");
    const isDriver = role === "driver" || role === "designated_driver";
    const status = String(ride?.status || "").toLowerCase();
    const isOpenRequest = status === "requested" && !ride?.driverId && isDriver;
    const isAssignedRide = ride?.driverId === requesterId &&
      ["driver_offered", "pending_confirm", "driver_assigned", "accepted", "driver_on_route", "driver_arrived", "in_progress", "pending_payment", "pending_rating"].includes(status);

    if (ride?.clientId !== clientId || (!isOpenRequest && !isAssignedRide)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Solo puedes consultar los datos básicos del cliente asociado a este viaje."
      );
    }
  }

  if (clientId !== requesterId && !isAdmin) {
    const [profileSnapshot, cachedSnapshot] = await Promise.all([
      admin.firestore().doc(`users/${clientId}`).get(),
      database.ref(`clientsInfo/${clientId}`).once("value"),
    ]);
    const cachedProfile = cachedSnapshot.val();
    const profile = normalizeProfile({
      ...cachedProfile,
      ...ride,
      photoUrl: normalizeProfile(profileSnapshot.data()).photoUrl ?? cachedProfile?.photoUrl,
    });
    return profile.fullName || profile.phone || profile.photoUrl
      ? { found: true, profile }
      : { found: false };
  }

  functions.logger.info("🔍 Buscando perfil de cliente", { clientId, requester: requesterId });

  // 1) Verificar latido en clientsLocations
  const clientActiveSnapshot = await database.ref(`clientsLocations/${clientId}/lastHeartbeat`).once("value");
  let heartbeat = clientActiveSnapshot.val();
  const now = Date.now();
  const HEARTBEAT_TOLERANCE_MS = 120_000; // 2 minutos

  let isActive = typeof heartbeat === "number" && now - heartbeat <= HEARTBEAT_TOLERANCE_MS;
  let presenceHB: number | null = null;

  // 2) Fallback: verificar presencia en presence/{clientId}/lastHeartbeat
  if (!isActive) {
    const presenceSnap = await database.ref(`presence/${clientId}/lastHeartbeat`).once("value");
    const hb = presenceSnap.val();
    if (typeof hb === "number" && now - hb <= HEARTBEAT_TOLERANCE_MS) {
      isActive = true;
      presenceHB = hb;
      heartbeat = hb;
    }
  }

  if (!isActive) {
    functions.logger.info("ℹ️ Cliente no activo, rechazando solicitud", {
      clientId,
      heartbeatclientsLocations: clientActiveSnapshot.val() ?? null,
      heartbeatPresence: presenceHB,
    });
    throw new functions.https.HttpsError(
      "failed-precondition",
      "El cliente no está activo en la aplicación."
    );
  }

  let profile: ClientProfile | null = null;

  try {
    const [userSnapshot, profileSnapshot] = await Promise.all([
      admin.firestore().doc(`users/${clientId}`).get(),
      database.ref(`clientsInfo/${clientId}`).once("value"),
    ]);
    const firestoreProfile = normalizeProfile(userSnapshot.data());
    const cachedProfile = normalizeProfile(profileSnapshot.val());
    profile = {
      fullName: firestoreProfile.fullName ?? cachedProfile.fullName,
      phone: firestoreProfile.phone ?? cachedProfile.phone,
      photoUrl: firestoreProfile.photoUrl ?? cachedProfile.photoUrl,
    };
    if (profile.fullName || profile.phone || profile.photoUrl) {
      functions.logger.info("✅ Perfil encontrado en Firestore/Realtime Database", { clientId });
    }
  } catch (error: any) {
    functions.logger.warn("⚠️ Error leyendo perfil de usuario", { clientId, error: error?.message });
  }

  if (!profile?.fullName || !profile.phone || !profile.photoUrl) {
    try {
      const data = await supabaseGet(
        "profiles",
        { id: clientId },
        "id, full_name, name, display_name, phone, phone_number, photo_url, avatar_url",
        1
      );

      const record = Array.isArray(data) ? data[0] : undefined;
      if (record) {
        const supabaseProfile = normalizeProfile(record);
        profile = {
          fullName: profile?.fullName ?? supabaseProfile.fullName,
          phone: profile?.phone ?? supabaseProfile.phone,
          photoUrl: profile?.photoUrl ?? supabaseProfile.photoUrl,
        };
        functions.logger.info("✅ Perfil encontrado en Supabase", { clientId });

        // Cachear en Realtime Database para futuras lecturas
        try {
          await database.ref(`clientsInfo/${clientId}`).update({
            fullName: profile.fullName ?? null,
            phone: profile.phone ?? null,
            photoUrl: profile.photoUrl ?? null,
            updatedAt: Date.now(),
          });
          functions.logger.info("📝 Perfil cacheado en Realtime Database", { clientId });
        } catch (cacheError: any) {
          functions.logger.warn("⚠️ Error cacheando perfil en Realtime Database", {
            clientId,
            error: cacheError?.message,
          });
        }
      }
    } catch (error: any) {
      functions.logger.warn("⚠️ Error consultando Supabase", { clientId, error: error?.message });
    }
  }

  if (!profile || (!profile.fullName && !profile.phone && !profile.photoUrl)) {
    functions.logger.info("ℹ️ Perfil no encontrado", { clientId });
    return { found: false };
  }

  return { found: true, profile };
});
