import * as functions from "firebase-functions/v1";
import { auth, database, firestore } from "../config/firebase";
import { sendToUser } from "../services/notificationCenter";
import { findExistingActiveRideCall } from "../helpers/callLifecycle";

type JsonRecord = Record<string, unknown>;

/**
 * Llamadas de viaje cliente <-> conductor (LiveKit, señalización en RTDB
 * calls/{callId} con callType: "ride").
 *
 * Ventana de validez: desde que el viaje se solicita (negociación, donde el
 * conductor puede no estar asignado aún pero ya puede chatear) hasta el viaje
 * confirmado/en curso. Estados terminales o de cobro quedan fuera.
 */
const CALLABLE_RIDE_STATUSES = new Set([
  "requested",
  "searching",
  "driver_offered",
  "accepted",
  "driver_on_route",
  "driver_arrived",
  "in_progress",
]);

const CALLABLE_PROGRAMMED_STATUSES = new Set([
  "scheduled",
  "pending",
  "driver_assigned",
  "client_confirmed",
  "driver_confirmed",
  "confirmed",
  "assigned",
  "activated",
  "in_progress",
]);

function getBearerToken(authHeader: unknown): string | null {
  if (typeof authHeader !== "string") return null;
  const [scheme, token] = authHeader.split(" ");
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token.trim() || null;
}

function sendJson(res: any, status: number, payload: JsonRecord) {
  res.status(status).json(payload);
}

async function resolveAuthUid(req: any): Promise<string> {
  const token = getBearerToken(req.headers.authorization);
  if (!token) {
    throw new functions.https.HttpsError("unauthenticated", "Token de autenticación requerido.");
  }
  const decoded = await auth.verifyIdToken(token);
  const uid = String(decoded.uid || "").trim();
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "Token inválido.");
  }
  return uid;
}

interface RideSnapshot {
  ride: JsonRecord;
  source: "activeRides" | "programmedRides";
}

async function loadRide(rideId: string): Promise<RideSnapshot | null> {
  const activeSnap = await database.ref(`activeRides/${rideId}`).once("value");
  if (activeSnap.exists()) {
    return { ride: (activeSnap.val() || {}) as JsonRecord, source: "activeRides" };
  }
  const programmedSnap = await database.ref(`programmedRides/${rideId}`).once("value");
  if (programmedSnap.exists()) {
    return { ride: (programmedSnap.val() || {}) as JsonRecord, source: "programmedRides" };
  }
  return null;
}

async function isRegisteredDriver(uid: string): Promise<boolean> {
  try {
    const snap = await database.ref(`driversInfo/${uid}`).once("value");
    return snap.exists();
  } catch {
    return false;
  }
}

async function resolveDisplayName(uid: string): Promise<string> {
  try {
    const snap = await firestore.doc(`users/${uid}`).get();
    const name = snap.get("name") ?? snap.get("fullName") ?? snap.get("displayName");
    if (typeof name === "string" && name.trim()) return name.trim();
  } catch {
    // fallback abajo
  }
  try {
    const snap = await database.ref(`driversInfo/${uid}/name`).once("value");
    const name = snap.val();
    if (typeof name === "string" && name.trim()) return name.trim();
  } catch {
    // noop
  }
  return "Usuario";
}

export interface InitiateRideCallResult {
  callId: string;
  rideId: string;
  status: string;
  acceptDeadline: number | null;
  reused: boolean;
}

/**
 * Núcleo de inicio de llamada de viaje. Valida que el uid sea parte real del
 * par cliente/conductor del viaje, que el viaje esté en ventana llamable y
 * reutiliza cualquier llamada activa del mismo par.
 */
export async function initiateRideCallCore(params: {
  uid: string;
  rideId: string;
  otherUserId: string;
  source?: string;
}): Promise<InitiateRideCallResult> {
  const { uid, source = "ride_chat" } = params;
  const rideId = typeof params.rideId === "string" ? params.rideId.trim() : "";
  const otherUserId = typeof params.otherUserId === "string" ? params.otherUserId.trim() : "";

  if (!rideId || !otherUserId) {
    throw new functions.https.HttpsError("invalid-argument", "rideId y otherUserId son requeridos.");
  }
  if (otherUserId === uid) {
    throw new functions.https.HttpsError("invalid-argument", "No puedes llamarte a ti mismo.");
  }

  const snapshot = await loadRide(rideId);
  if (!snapshot) {
    throw new functions.https.HttpsError("not-found", "El viaje no existe o ya fue archivado.");
  }
  const { ride, source: rideSource } = snapshot;

  const rideStatus = String(ride.status || "").toLowerCase();
  const callableStatuses =
    rideSource === "programmedRides" ? CALLABLE_PROGRAMMED_STATUSES : CALLABLE_RIDE_STATUSES;
  if (!callableStatuses.has(rideStatus)) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "El viaje ya no admite llamadas (finalizado o cobrado).",
    );
  }

  const clientUid = typeof ride.clientId === "string" ? ride.clientId : null;
  if (!clientUid) {
    throw new functions.https.HttpsError("failed-precondition", "El viaje no tiene cliente asociado.");
  }
  const assignedDriverUid = typeof ride.driverId === "string" && ride.driverId ? ride.driverId : null;
  const offers = (ride.offers || {}) as Record<string, unknown>;

  // Rol del llamante dentro del viaje:
  // - client: es el cliente del viaje.
  // - driver: conductor asignado; o durante la negociación (sin driverId), un
  //   conductor con oferta en el viaje o registrado en driversInfo (mismo
  //   criterio con el que las reglas RTDB le abren el chat del viaje).
  let callerRole: "client" | "driver" | null = null;
  if (uid === clientUid) {
    callerRole = "client";
  } else if (assignedDriverUid && uid === assignedDriverUid) {
    callerRole = "driver";
  } else if (!assignedDriverUid && (!!offers[uid] || (await isRegisteredDriver(uid)))) {
    callerRole = "driver";
  }

  if (!callerRole) {
    throw new functions.https.HttpsError("permission-denied", "No eres participante de este viaje.");
  }

  // La contraparte debe ser el otro participante válido del par.
  let driverUid: string;
  if (callerRole === "client") {
    if (assignedDriverUid) {
      if (otherUserId !== assignedDriverUid) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Solo puedes llamar al conductor asignado del viaje.",
        );
      }
    } else if (!offers[otherUserId] && !(await isRegisteredDriver(otherUserId))) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "El destinatario no es un conductor de este viaje.",
      );
    }
    driverUid = assignedDriverUid || otherUserId;
  } else {
    if (otherUserId !== clientUid) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Solo puedes llamar al cliente del viaje.",
      );
    }
    driverUid = uid;
  }

  const existing = await findExistingActiveRideCall(rideId, clientUid, driverUid);
  if (existing) {
    return {
      callId: existing.callId,
      rideId,
      status: existing.status || "ringing_driver",
      acceptDeadline: typeof existing.acceptDeadline === "number" ? existing.acceptDeadline : null,
      reused: true,
    };
  }

  const callRef = database.ref("calls").push();
  const callId = callRef.key;
  if (!callId) {
    throw new Error("No se pudo generar callId.");
  }

  const now = Date.now();
  const acceptDeadline = now + 60_000;
  const direction = callerRole === "client" ? "client_to_driver" : "driver_to_client";
  const status = callerRole === "client" ? "ringing_driver" : "ringing_client";
  const calleeUid = callerRole === "client" ? driverUid : clientUid;

  await callRef.set({
    callId,
    callType: "ride",
    rideId,
    clientUid,
    driverUid,
    direction,
    status,
    acceptDeadline,
    createdAt: now,
    updatedAt: now,
    events: {
      initiated: {
        at: now,
        by: uid,
        type: "initiated",
        source,
      },
    },
  });

  const callerName = await resolveDisplayName(uid);
  sendToUser(calleeUid, "ride_call", {
    fallbackTitle: "Llamada entrante",
    fallbackBody: `${callerName} te está llamando sobre tu viaje.`,
    data: {
      rideId,
      callId,
      callerUid: uid,
      callerName,
      otherUserId: uid,
      otherUserName: callerName,
    },
    notificationKey: `ride-call-${callId}`,
    expiresInMs: 90_000,
  }).catch((error: any) =>
    functions.logger.warn("[ride_calls] No se pudo notificar la llamada entrante", {
      callId,
      error: error?.message,
    }),
  );

  return {
    callId,
    rideId,
    status,
    acceptDeadline,
    reused: false,
  };
}

/**
 * HTTP endpoint: initiateRideCallHttp
 * Crea/reutiliza una sesión de llamada cliente<->conductor en RTDB.
 */
export const initiateRideCallHttp = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method-not-allowed", message: "Solo se permite POST." });
    return;
  }

  try {
    const uid = await resolveAuthUid(req);
    const rideId = typeof req.body?.rideId === "string" ? req.body.rideId.trim() : "";
    const otherUserId = typeof req.body?.otherUserId === "string" ? req.body.otherUserId.trim() : "";
    const source = typeof req.body?.source === "string" ? req.body.source.trim() : "ride_chat";

    const result = await initiateRideCallCore({ uid, rideId, otherUserId, source });

    sendJson(res, 200, { success: true, ...result });
  } catch (error: any) {
    functions.logger.error("[ride_calls] Error initiating ride call", {
      error: error?.message,
      stack: error?.stack,
    });

    const code = String(error?.code || "").toLowerCase();
    const statusByCode: Record<string, number> = {
      unauthenticated: 401,
      "invalid-argument": 400,
      "not-found": 404,
      "permission-denied": 403,
      "failed-precondition": 409,
    };
    const status = statusByCode[code];

    if (status) {
      sendJson(res, status, {
        error: code,
        message: error?.message || "No se pudo iniciar la llamada.",
      });
      return;
    }

    sendJson(res, 500, {
      error: "internal",
      message: "No se pudo iniciar la llamada del viaje. Intenta nuevamente.",
    });
  }
});
