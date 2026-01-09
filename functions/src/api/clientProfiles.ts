import * as functions from "firebase-functions";
import { database } from "../config/firebase";
import { supabaseGet } from "../supabase/client";

interface ClientProfile {
  fullName?: string | null;
  photoUrl?: string | null;
  phone?: string | null;
}

const normalizeProfile = (raw: any): ClientProfile => ({
  fullName: raw?.fullName || raw?.full_name || raw?.name || raw?.displayName || null,
  photoUrl: raw?.photoUrl || raw?.photo_url || raw?.avatar_url || raw?.avatarUrl || null,
  phone: raw?.phone || raw?.phone_number || raw?.phoneNumber || null,
});

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

  functions.logger.info("🔍 Buscando perfil de cliente", { clientId, requester: context.auth.uid });

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
    const snapshot = await database.ref(`clientsInfo/${clientId}`).once("value");
    if (snapshot.exists()) {
      profile = normalizeProfile(snapshot.val());
      functions.logger.info("✅ Perfil encontrado en Realtime Database", { clientId });
    }
  } catch (error: any) {
    functions.logger.warn("⚠️ Error leyendo clientsInfo", { clientId, error: error?.message });
  }

  if (!profile) {
    try {
      const data = await supabaseGet(
        "profiles",
        { id: clientId },
        "id, full_name, name, display_name, avatar_url, photo_url, phone, phone_number",
        1
      );

      const record = Array.isArray(data) ? data[0] : undefined;
      if (record) {
        profile = normalizeProfile(record);
        functions.logger.info("✅ Perfil encontrado en Supabase", { clientId });

        // Cachear en Realtime Database para futuras lecturas
        try {
          await database.ref(`clientsInfo/${clientId}`).update({
            fullName: profile.fullName ?? null,
            photoUrl: profile.photoUrl ?? null,
            phone: profile.phone ?? null,
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

  if (!profile) {
    functions.logger.info("ℹ️ Perfil no encontrado", { clientId });
    return { found: false };
  }

  return { found: true, profile };
});
