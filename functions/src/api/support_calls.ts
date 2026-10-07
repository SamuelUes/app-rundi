import * as functions from "firebase-functions";
import { auth, database } from "../config/firebase";
import { supabaseGet } from "../supabase/client";
import { sendToUser } from "../services/notificationCenter";

type JsonRecord = Record<string, unknown>;

const CLOSED_STATUSES = new Set(["resolved", "rejected"]);
const ACTIVE_CALL_STATUSES = new Set(["ringing_client", "accepted", "connected"]);

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

async function findExistingActiveCall(complaintId: string) {
  const snap = await database
    .ref("calls")
    .orderByChild("complaintId")
    .equalTo(complaintId)
    .limitToLast(20)
    .once("value");

  if (!snap.exists()) return null;

  const raw = snap.val() || {};
  const entries = Object.entries<any>(raw)
    .map(([callId, value]) => ({ callId, ...(value || {}) }))
    .sort((a, b) => {
      const ta = typeof a.updatedAt === "number" ? a.updatedAt : 0;
      const tb = typeof b.updatedAt === "number" ? b.updatedAt : 0;
      return tb - ta;
    });

  return entries.find((call) => ACTIVE_CALL_STATUSES.has(String(call.status || "").toLowerCase())) || null;
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

    if (!complaintId) {
      sendJson(res, 400, { error: "invalid-argument", message: "complaintId es requerido." });
      return;
    }

    const rows = await supabaseGet(
      "cms_complaints",
      { id: complaintId },
      "id,ride_id,status,created_by_user_id,client_id,driver_id,assigned_to_user_id",
      { limit: 1, requireServiceRole: true },
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      sendJson(res, 404, { error: "not-found", message: "No se encontró el caso de soporte." });
      return;
    }

    const complaint = rows[0] || {};
    const participants = [
      complaint.created_by_user_id,
      complaint.client_id,
      complaint.driver_id,
    ]
      .filter(Boolean)
      .map((id: unknown) => String(id));

    if (!participants.includes(uid)) {
      sendJson(res, 403, { error: "permission-denied", message: "No tienes permisos en este caso." });
      return;
    }

    const complaintStatus = String(complaint.status || "").toLowerCase();
    if (CLOSED_STATUSES.has(complaintStatus)) {
      sendJson(res, 409, { error: "failed-precondition", message: "El caso ya está cerrado." });
      return;
    }

    const existing = await findExistingActiveCall(complaintId);
    if (existing) {
      sendJson(res, 200, {
        success: true,
        reused: true,
        callId: existing.callId,
        complaintId,
        status: existing.status || "ringing_client",
      });
      return;
    }

    const callRef = database.ref("calls").push();
    const callId = callRef.key;
    if (!callId) {
      throw new Error("No se pudo generar callId.");
    }

    const now = Date.now();
    const acceptDeadline = now + 60_000;
    const assignedOperatorUid = complaint.assigned_to_user_id ? String(complaint.assigned_to_user_id) : null;
    const resolvedRideId = rideIdBody || (complaint.ride_id ? String(complaint.ride_id) : null);

    await callRef.set({
      callId,
      complaintId,
      rideId: resolvedRideId,
      operatorUid: assignedOperatorUid,
      clientUid: uid,
      direction: "operator_to_client",
      status: "ringing_client",
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

    if (assignedOperatorUid) {
      await sendToUser(assignedOperatorUid, "support_call", {
        fallbackTitle: "Llamada de soporte solicitada",
        fallbackBody: `Hay una nueva llamada para el caso ${complaintId}.`,
        data: {
          complaintId,
          callId,
          requestedByUserId: uid,
        },
        notificationKey: `support-call-${callId}`,
        expiresInMs: 10 * 60 * 1000,
      });
    }

    sendJson(res, 200, {
      success: true,
      callId,
      complaintId,
      status: "ringing_client",
      acceptDeadline,
      reused: false,
    });
  } catch (error: any) {
    functions.logger.error("[support_calls] Error initiating support call", {
      error: error?.message,
      stack: error?.stack,
    });

    const code = String(error?.code || "").toLowerCase();
    if (code === "unauthenticated") {
      sendJson(res, 401, { error: "unauthenticated", message: "Autenticación requerida." });
      return;
    }

    sendJson(res, 500, {
      error: "internal",
      message: "No se pudo iniciar la llamada de soporte. Intenta nuevamente.",
    });
  }
});

