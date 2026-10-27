import * as functions from "firebase-functions/v1";
import { auth, database } from "../config/firebase";
import { supabaseGet } from "../supabase/client";
import { sendToUser } from "../services/notificationCenter";
import { findExistingActiveCall } from "../helpers/callLifecycle";

type JsonRecord = Record<string, unknown>;

const CLOSED_STATUSES = new Set(["resolved", "rejected"]);

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

export interface InitiateSupportCallResult {
  callId: string;
  complaintId: string;
  status: string;
  acceptDeadline: number | null;
  reused: boolean;
}

/**
 * Núcleo compartido de inicio de llamada: valida participación en la queja,
 * reutiliza llamada activa y crea la sesión en RTDB. Usado por
 * initiateSupportCallHttp y por la ruta /api/calls/initiate del router `api`.
 */
export async function initiateSupportCallCore(params: {
  uid: string;
  complaintId: string;
  rideId?: string | null;
  source?: string;
}): Promise<InitiateSupportCallResult> {
  const { uid, complaintId, source = "support_chat" } = params;
  const rideIdBody = typeof params.rideId === "string" ? params.rideId.trim() : "";

  if (!complaintId) {
    throw new functions.https.HttpsError("invalid-argument", "complaintId es requerido.");
  }

  const rows = await supabaseGet(
    "cms_complaints",
    { id: complaintId, deleted_at: null, show: "All" },
    "id,ride_id,status,created_by_user_id,client_id,driver_id,assigned_to_user_id",
    { limit: 1, requireServiceRole: true },
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new functions.https.HttpsError("not-found", "No se encontró el caso de soporte.");
  }

  const complaint = rows[0] || {};
  const participants = [
    complaint.created_by_user_id,
    complaint.client_id,
    complaint.driver_id,
    complaint.assigned_to_user_id,
  ]
    .filter(Boolean)
    .map((id: unknown) => String(id));

  if (!participants.includes(uid)) {
    throw new functions.https.HttpsError("permission-denied", "No tienes permisos en este caso.");
  }

  const complaintStatus = String(complaint.status || "").toLowerCase();
  if (CLOSED_STATUSES.has(complaintStatus)) {
    throw new functions.https.HttpsError("failed-precondition", "El caso ya está cerrado.");
  }

  // Self-heal: registra al participante en el chat del caso por si la queja
  // se creó antes de que se registraran todos los participantes.
  database
    .ref(`supportChatParticipants/${complaintId}/${uid}`)
    .set(true)
    .catch((error: any) =>
      functions.logger.warn("[support_calls] No se pudo registrar participante del chat", {
        complaintId,
        error: error?.message,
      }),
    );

  const assignedOperatorUid = complaint.assigned_to_user_id ? String(complaint.assigned_to_user_id) : null;
  const isOperatorInitiator = assignedOperatorUid !== null && uid === assignedOperatorUid;

  const existing = await findExistingActiveCall(complaintId);
  if (existing) {
    // Si el operador asignado retoma una llamada creada sin operador, se lo
    // asigna para que pueda pedir token y actuar sobre la llamada.
    if (isOperatorInitiator && !existing.operatorUid) {
      try {
        await database
          .ref(`calls/${existing.callId}`)
          .update({ operatorUid: uid, updatedAt: Date.now() });
        existing.operatorUid = uid;
      } catch (error: any) {
        functions.logger.warn("[support_calls] No se pudo asignar operatorUid a llamada reutilizada", {
          callId: existing.callId,
          error: error?.message,
        });
      }
    }
    return {
      callId: existing.callId,
      complaintId,
      status: existing.status || "ringing_client",
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
  const resolvedRideId = rideIdBody || (complaint.ride_id ? String(complaint.ride_id) : null);
  const direction = isOperatorInitiator ? "operator_to_client" : "client_to_operator";
  const status = isOperatorInitiator ? "ringing_client" : "ringing_operator";
  const clientUid = isOperatorInitiator
    ? String(complaint.client_id || complaint.created_by_user_id || uid)
    : uid;
  const operatorUid = isOperatorInitiator ? uid : assignedOperatorUid;

  await callRef.set({
    callId,
    complaintId,
    rideId: resolvedRideId,
    operatorUid,
    clientUid,
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

  if (isOperatorInitiator) {
    await sendToUser(clientUid, "support_call", {
      fallbackTitle: "Llamada de soporte",
      fallbackBody: "Un operador de soporte quiere hablar contigo. Abre la app para responder.",
      data: {
        complaintId,
        callId,
      },
      notificationKey: `support-call-${callId}`,
      expiresInMs: 10 * 60 * 1000,
    });
  } else if (operatorUid) {
    await sendToUser(operatorUid, "support_call", {
      fallbackTitle: "Llamada entrante de usuario",
      fallbackBody: `Un usuario está llamando en el caso ${complaintId}.`,
      data: {
        complaintId,
        callId,
        requestedByUserId: uid,
      },
      notificationKey: `support-call-${callId}`,
      expiresInMs: 10 * 60 * 1000,
    });
  }

  return {
    callId,
    complaintId,
    status,
    acceptDeadline,
    reused: false,
  };
}

/**
 * HTTP endpoint: initiateSupportCallHttp
 * Crea una sesión de llamada de soporte en RTDB para que cliente/operador puedan conectar.
 */
export const initiateSupportCallHttp = functions.https.onRequest(async (req, res) => {
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
    const complaintId = typeof req.body?.complaintId === "string" ? req.body.complaintId.trim() : "";
    const rideIdBody = typeof req.body?.rideId === "string" ? req.body.rideId.trim() : "";
    const source = typeof req.body?.source === "string" ? req.body.source.trim() : "support_chat";

    const result = await initiateSupportCallCore({ uid, complaintId, rideId: rideIdBody, source });

    sendJson(res, 200, { success: true, ...result });
  } catch (error: any) {
    functions.logger.error("[support_calls] Error initiating support call", {
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
      message: "No se pudo iniciar la llamada de soporte. Intenta nuevamente.",
    });
  }
});

