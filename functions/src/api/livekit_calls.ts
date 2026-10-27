import * as functions from "firebase-functions/v1";
import { AccessToken, TrackSource, WebhookReceiver } from "livekit-server-sdk";
import { auth, database, firestore } from "../config/firebase";
import { initiateSupportCallCore } from "./support_calls";
import { requestSupportCallCore } from "./support_complaints";
import { initiateRideCallCore } from "./ride_calls";
import { sendToUser } from "../services/notificationCenter";
import { supabaseUpdate } from "../supabase/client";
import { RINGING_CALL_STATUSES, TERMINAL_CALL_STATUSES } from "../helpers/callLifecycle";

/**
 * Router HTTP `api` — un solo onRequest que enruta sub-paths.
 *
 * La app llama ${API_BASE_URL}/api/calls/livekit-token, /api/calls/initiate y
 * /api/calls/request; sin Hosting rewrites, esas rutas solo resuelven si existe
 * una función llamada `api` que despache el path interno.
 *
 * Rutas:
 *   POST /calls/livekit-token  → emite token LiveKit para un participante del call
 *   POST /calls/initiate       → crea/reutiliza sesión de llamada (mismo núcleo que initiateSupportCallHttp)
 *   POST /calls/request        → registra solicitud de llamada (mismo núcleo que requestSupportCall)
 *   POST /calls/transfer       → transfiere la llamada a otro operador (o la reclama si no tiene)
 *   POST /calls/ride/initiate  → crea/reutiliza llamada cliente<->conductor de un viaje
 *   POST /livekit/webhook      → eventos LiveKit (participant_joined → connected, room_finished → ended)
 */

type JsonRecord = Record<string, unknown>;

const LIVEKIT_URL = process.env.LIVEKIT_URL || "";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "";
const TOKEN_TTL_SECONDS = 15 * 60;
const CALL_ROOM_PREFIX = "support-call-";
const RIDE_CALL_ROOM_PREFIX = "ride-call-";

export const roomNameForCall = (callId: string, callType?: unknown): string =>
  `${callType === "ride" ? RIDE_CALL_ROOM_PREFIX : CALL_ROOM_PREFIX}${callId}`;

const callIdFromRoomName = (roomName: string): string | null => {
  if (typeof roomName !== "string") return null;
  for (const prefix of [CALL_ROOM_PREFIX, RIDE_CALL_ROOM_PREFIX]) {
    if (roomName.startsWith(prefix)) {
      const id = roomName.slice(prefix.length).trim();
      return id || null;
    }
  }
  return null;
};

function sendJson(res: functions.Response, status: number, payload: JsonRecord) {
  res.status(status).json(payload);
}

function getBearerToken(req: functions.Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader !== "string") return null;
  const [scheme, token] = authHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return null;
  return token.trim() || null;
}

async function resolveAuthUid(req: functions.Request): Promise<string> {
  const token = getBearerToken(req);
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

const httpsCodeToStatus = (code: string): number | null => {
  const map: Record<string, number> = {
    unauthenticated: 401,
    "invalid-argument": 400,
    "not-found": 404,
    "permission-denied": 403,
    "failed-precondition": 409,
    internal: 500,
  };
  return map[code] ?? null;
};

function sendErrorJson(res: functions.Response, error: any, fallbackMessage: string) {
  const code = error instanceof functions.https.HttpsError ? error.code : String(error?.code || "");
  const status = httpsCodeToStatus(code) ?? 500;
  sendJson(res, status, {
    error: code || "internal",
    message: status === 500 ? fallbackMessage : error?.message || fallbackMessage,
  });
}

/**
 * El uid debe ser participante real de la llamada. Los operadores además deben
 * ser staff CMS activo (mismo criterio que verifyCmsRequest en rundi-platform).
 */
async function getCmsStaffRole(uid: string): Promise<"admin" | "operator" | null> {
  const snap = await firestore.doc(`cms-users/${uid}`).get();
  if (!snap.exists) return null;
  const role = String(snap.get("role") || "").toLowerCase();
  return role === "admin" || role === "operator" ? (role as "admin" | "operator") : null;
}

async function isActiveCmsStaff(uid: string): Promise<boolean> {
  return (await getCmsStaffRole(uid)) !== null;
}

type ParticipantType = "client" | "operator" | "driver";

async function resolveParticipant(call: JsonRecord, uid: string): Promise<ParticipantType | null> {
  if (call.callType === "ride") {
    if (uid === call.clientUid) return "client";
    if (uid === call.driverUid) return "driver";
    return null;
  }
  if (uid === call.clientUid) return "client";
  if (uid === call.operatorUid) {
    return (await isActiveCmsStaff(uid)) ? "operator" : null;
  }
  return null;
}

async function resolveDisplayName(uid: string, participantType: ParticipantType): Promise<string> {
  try {
    const collection = participantType === "operator" ? "cms-users" : "users";
    const snap = await firestore.doc(`${collection}/${uid}`).get();
    const name = snap.get("name") ?? snap.get("fullName") ?? snap.get("displayName");
    return typeof name === "string" && name.trim() ? name.trim() : participantType;
  } catch {
    return participantType;
  }
}

async function handleLivekitToken(req: functions.Request, res: functions.Response) {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
    sendJson(res, 503, { error: "unavailable", message: "LiveKit no está configurado en el servidor." });
    return;
  }

  const uid = await resolveAuthUid(req);
  const callId = typeof req.body?.callId === "string" ? req.body.callId.trim() : "";
  if (!callId) {
    throw new functions.https.HttpsError("invalid-argument", "callId es requerido.");
  }

  const snap = await database.ref(`calls/${callId}`).once("value");
  if (!snap.exists()) {
    throw new functions.https.HttpsError("not-found", "La llamada no existe.");
  }
  const call = snap.val() as JsonRecord;

  const status = String(call.status || "").toLowerCase();
  if (TERMINAL_CALL_STATUSES.has(status)) {
    throw new functions.https.HttpsError("failed-precondition", "La llamada ya finalizó.");
  }

  const participantType = await resolveParticipant(call, uid);
  if (!participantType) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "No eres participante de esta llamada.",
    );
  }

  const name = await resolveDisplayName(uid, participantType);
  const room = roomNameForCall(callId, call.callType);

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: uid,
    name,
    ttl: `${TOKEN_TTL_SECONDS}s`,
    metadata: JSON.stringify({ callId, participantType }),
  });
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canPublishSources: [TrackSource.MICROPHONE],
  });

  const token = await at.toJwt();

  functions.logger.info("[api] LiveKit token emitido", { callId, participantType, room });

  sendJson(res, 200, {
    success: true,
    token,
    url: LIVEKIT_URL,
    room,
    expiresIn: TOKEN_TTL_SECONDS,
    callId,
    participantType,
  });
}

async function handleLivekitWebhook(req: functions.Request, res: functions.Response) {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    sendJson(res, 503, { error: "unavailable", message: "LiveKit no está configurado." });
    return;
  }

  const authHeader = req.headers.authorization;
  const rawBodyBuffer = (req as any).rawBody as Buffer | undefined;
  const rawBody = rawBodyBuffer ? rawBodyBuffer.toString("utf8") : JSON.stringify(req.body || {});

  let event;
  try {
    const receiver = new WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    event = await receiver.receive(rawBody, typeof authHeader === "string" ? authHeader : "");
  } catch (error: any) {
    functions.logger.warn("[api] Webhook LiveKit rechazado", { error: error?.message });
    sendJson(res, 401, { error: "unauthorized", message: "Firma de webhook inválida." });
    return;
  }

  const roomName = event.room?.name || "";
  const callId = callIdFromRoomName(roomName);
  if (!callId) {
    sendJson(res, 200, { success: true, ignored: true });
    return;
  }

  const callRef = database.ref(`calls/${callId}`);
  const snap = await callRef.once("value");
  if (!snap.exists()) {
    sendJson(res, 200, { success: true, ignored: true });
    return;
  }
  const call = snap.val() as JsonRecord;
  const status = String(call.status || "").toLowerCase();
  const now = Date.now();

  if (event.event === "participant_joined") {
    const joinedCount = Number(event.room?.numParticipants || 0);
    const joinable = new Set(["initiated", "ringing_client", "ringing_operator", "ringing_driver", "accepted"]);
    if (joinedCount >= 2 && joinable.has(status)) {
      await callRef.update({
        status: "connected",
        connectedAt: now,
        updatedAt: now,
      });
      await callRef.child("events").push({ type: "connected", at: now, source: "livekit_webhook" });
      functions.logger.info("[api] Llamada conectada vía webhook", { callId, joinedCount });
    }
  } else if (event.event === "room_finished" && !TERMINAL_CALL_STATUSES.has(status)) {
    await callRef.update({ status: "ended", endedAt: now, updatedAt: now });
    await callRef.child("events").push({ type: "ended", at: now, source: "livekit_webhook" });
    functions.logger.info("[api] Sala finalizada, llamada marcada ended", { callId });
  } else if (event.event === "egress_ended") {
    const file = event.egressInfo?.fileResults?.[0];
    const recordingUrl = (file as any)?.location || (file as any)?.filename || null;
    if (recordingUrl && typeof recordingUrl === "string") {
      await callRef.update({ recordingUrl, updatedAt: now });
      functions.logger.info("[api] Recording URL registrada", { callId });
    }
  }

  sendJson(res, 200, { success: true });
}

async function handleCallInitiate(req: functions.Request, res: functions.Response) {
  const uid = await resolveAuthUid(req);
  const complaintId = typeof req.body?.complaintId === "string" ? req.body.complaintId.trim() : "";
  const rideId = typeof req.body?.rideId === "string" ? req.body.rideId.trim() : "";
  const source = typeof req.body?.source === "string" ? req.body.source.trim() : "support_chat";

  const result = await initiateSupportCallCore({ uid, complaintId, rideId, source });
  sendJson(res, 200, { success: true, ...result });
}

async function handleCallRequest(req: functions.Request, res: functions.Response) {
  const uid = await resolveAuthUid(req);
  const complaintId = typeof req.body?.complaintId === "string" ? req.body.complaintId.trim() : "";

  const result = await requestSupportCallCore({ uid, complaintId });
  sendJson(res, 200, { success: true, ...result });
}

async function handleRideCallInitiate(req: functions.Request, res: functions.Response) {
  const uid = await resolveAuthUid(req);
  const rideId = typeof req.body?.rideId === "string" ? req.body.rideId.trim() : "";
  const otherUserId = typeof req.body?.otherUserId === "string" ? req.body.otherUserId.trim() : "";
  const source = typeof req.body?.source === "string" ? req.body.source.trim() : "ride_chat";

  const result = await initiateRideCallCore({ uid, rideId, otherUserId, source });
  sendJson(res, 200, { success: true, ...result });
}

/**
 * Transferencia de llamada entre operadores (handoff) sin cortar la sesión:
 * conserva callId y sala LiveKit, solo cambia operatorUid. El operador saliente
 * pierde acceso (token/acciones) y el entrante queda como participante. Si la
 * llamada no tiene operador, sirve además para que un operador la "reclame".
 */
async function handleCallTransfer(req: functions.Request, res: functions.Response) {
  const uid = await resolveAuthUid(req);
  const callId = typeof req.body?.callId === "string" ? req.body.callId.trim() : "";
  const toOperatorUid =
    typeof req.body?.toOperatorUid === "string" ? req.body.toOperatorUid.trim() : "";
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";

  if (!callId || !toOperatorUid) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "callId y toOperatorUid son requeridos.",
    );
  }

  const callerRole = await getCmsStaffRole(uid);
  if (!callerRole) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Solo staff CMS puede transferir llamadas.",
    );
  }

  const targetRole = await getCmsStaffRole(toOperatorUid);
  if (!targetRole) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "El operador destino no es staff CMS activo.",
    );
  }

  const callRef = database.ref(`calls/${callId}`);
  const snap = await callRef.once("value");
  if (!snap.exists()) {
    throw new functions.https.HttpsError("not-found", "La llamada no existe.");
  }

  const call = snap.val() as JsonRecord;
  const status = String(call.status || "").toLowerCase();
  if (TERMINAL_CALL_STATUSES.has(status)) {
    throw new functions.https.HttpsError("failed-precondition", "La llamada ya finalizó.");
  }

  const fromOperatorUid = call.operatorUid ? String(call.operatorUid) : null;
  if (fromOperatorUid === toOperatorUid) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "El operador destino ya atiende esta llamada.",
    );
  }

  // Solo el operador actual, un admin, o cualquier staff si la llamada está
  // sin operador (claim), pueden transferirla.
  const canTransfer =
    fromOperatorUid === null || fromOperatorUid === uid || callerRole === "admin";
  if (!canTransfer) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Solo el operador actual o un admin pueden transferir esta llamada.",
    );
  }

  const now = Date.now();

  // Transacción para que dos transferencias/reclamos simultáneos no pisen.
  const tx = await callRef.transaction((current: any) => {
    if (current === null) return current;
    const currentStatus = String(current.status || "").toLowerCase();
    if (TERMINAL_CALL_STATUSES.has(currentStatus)) return undefined;
    const currentOperator = current.operatorUid ? String(current.operatorUid) : null;
    if (currentOperator !== fromOperatorUid) return undefined;
    const next = { ...current, operatorUid: toOperatorUid, updatedAt: now };
    // Si aún suena, el nuevo operador recibe una ventana completa para aceptar.
    if (RINGING_CALL_STATUSES.has(currentStatus)) {
      next.acceptDeadline = now + 60_000;
    }
    return next;
  });

  if (!tx.committed || !tx.snapshot.exists()) {
    const afterSnap = await callRef.once("value");
    if (!afterSnap.exists()) {
      throw new functions.https.HttpsError("not-found", "La llamada ya no existe.");
    }
    const afterStatus = String(afterSnap.val()?.status || "").toLowerCase();
    if (TERMINAL_CALL_STATUSES.has(afterStatus)) {
      throw new functions.https.HttpsError("failed-precondition", "La llamada ya finalizó.");
    }
    throw new functions.https.HttpsError(
      "failed-precondition",
      "La llamada cambió de operador. Reintenta la transferencia.",
    );
  }

  const eventType = fromOperatorUid ? "transferred" : "operator_claimed";
  await callRef.child("events").push({
    type: eventType,
    at: now,
    by: uid,
    from: fromOperatorUid,
    to: toOperatorUid,
    ...(note ? { note } : {}),
  });

  const complaintId = call.complaintId ? String(call.complaintId) : null;

  sendToUser(toOperatorUid, "support_call", {
    fallbackTitle: "Llamada transferida",
    fallbackBody: fromOperatorUid
      ? `Te transfirieron la llamada del caso ${complaintId || callId}.`
      : `Reclamaste la llamada del caso ${complaintId || callId}.`,
    data: {
      complaintId: complaintId || undefined,
      callId,
      transferredFrom: fromOperatorUid || undefined,
    },
    notificationKey: `support-call-transfer-${callId}-${now}`,
    expiresInMs: 10 * 60 * 1000,
  }).catch((error: any) =>
    functions.logger.warn("[api] No se pudo notificar transferencia al operador", {
      callId,
      error: error?.message,
    }),
  );

  if (call.clientUid) {
    sendToUser(String(call.clientUid), "support_call", {
      fallbackTitle: "Llamada de soporte",
      fallbackBody: "Tu llamada fue transferida a otro operador.",
      data: { complaintId: complaintId || undefined, callId },
      notificationKey: `support-call-transfer-client-${callId}-${now}`,
      expiresInMs: 10 * 60 * 1000,
    }).catch((error: any) =>
      functions.logger.warn("[api] No se pudo notificar transferencia al cliente", {
        callId,
        error: error?.message,
      }),
    );
  }

  // Reasigna el caso en Supabase para que el panel muestre al nuevo operador.
  if (complaintId) {
    supabaseUpdate("cms_complaints", complaintId, {
      assigned_to_user_id: toOperatorUid,
    }).catch((error: any) =>
      functions.logger.warn("[api] No se pudo reasignar el caso tras transferencia", {
        callId,
        complaintId,
        error: error?.message,
      }),
    );
  }

  functions.logger.info("[api] Llamada transferida", {
    callId,
    fromOperatorUid,
    toOperatorUid,
    by: uid,
  });

  sendJson(res, 200, {
    success: true,
    callId,
    fromOperatorUid,
    toOperatorUid,
    status: tx.snapshot.val()?.status || status,
  });
}

export const api = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  const path = req.path || "/";

  try {
    if (req.method === "POST" && path === "/calls/livekit-token") {
      await handleLivekitToken(req, res);
      return;
    }
    if (req.method === "POST" && path === "/calls/initiate") {
      await handleCallInitiate(req, res);
      return;
    }
    if (req.method === "POST" && path === "/calls/request") {
      await handleCallRequest(req, res);
      return;
    }
    if (req.method === "POST" && path === "/calls/transfer") {
      await handleCallTransfer(req, res);
      return;
    }
    if (req.method === "POST" && path === "/calls/ride/initiate") {
      await handleRideCallInitiate(req, res);
      return;
    }
    if (req.method === "POST" && path === "/livekit/webhook") {
      await handleLivekitWebhook(req, res);
      return;
    }

    sendJson(res, 404, { error: "not-found", message: `Ruta no encontrada: ${req.method} ${path}` });
  } catch (error: any) {
    functions.logger.error("[api] Error en router", {
      path,
      method: req.method,
      error: error?.message,
      stack: error?.stack,
    });
    sendErrorJson(res, error, "Error interno del servidor.");
  }
});
