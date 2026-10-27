import { database } from "../config/firebase";

/**
 * Ciclo de vida de llamadas de soporte (calls/{callId} en RTDB).
 *
 * - ACTIVE: la llamada sigue viva y bloquea nuevas llamadas del mismo caso.
 * - RINGING: aún puede ser contestada; vence a los `acceptDeadline` ms.
 * - TERMINAL: archivable por el trigger onCallEnded.
 */
export const ACTIVE_CALL_STATUSES = new Set([
  "initiated",
  "ringing_client",
  "ringing_operator",
  "ringing_driver",
  "accepted",
  "connected",
]);

export const RINGING_CALL_STATUSES = new Set([
  "initiated",
  "ringing_client",
  "ringing_operator",
  "ringing_driver",
]);

export const TERMINAL_CALL_STATUSES = new Set(["ended", "rejected", "missed"]);

const CALL_ACCEPT_WINDOW_MS = 60_000;

function ringingDeadlineMs(call: Record<string, any>): number | null {
  if (typeof call?.acceptDeadline === "number") return call.acceptDeadline;
  if (typeof call?.createdAt === "number") return call.createdAt + CALL_ACCEPT_WINDOW_MS;
  return null;
}

/** Ringing cuyo plazo de aceptación ya venció: cuenta como inactiva aunque nadie la cerró. */
export function isExpiredRingingCall(call: Record<string, any>, now = Date.now()): boolean {
  const status = String(call?.status || "").toLowerCase();
  if (!RINGING_CALL_STATUSES.has(status)) return false;
  const deadline = ringingDeadlineMs(call);
  return deadline !== null && deadline <= now;
}

export function isActiveCall(call: Record<string, any>, now = Date.now()): boolean {
  const status = String(call?.status || "").toLowerCase();
  return ACTIVE_CALL_STATUSES.has(status) && !isExpiredRingingCall(call, now);
}

export async function markCallMissed(callId: string): Promise<void> {
  const now = Date.now();
  const callRef = database.ref(`calls/${callId}`);
  await callRef.update({ status: "missed", endedAt: now, updatedAt: now });
  await callRef.child("events").push({ type: "missed", at: now, source: "call_lifecycle" });
}

/**
 * Última llamada viva de un caso (para deduplicar creación). Las llamadas
 * ringing expiradas no bloquean: se marcan `missed` best-effort y se ignoran.
 */
export async function findExistingActiveCall(complaintId: string) {
  const snap = await database
    .ref("calls")
    .orderByChild("complaintId")
    .equalTo(complaintId)
    .limitToLast(20)
    .once("value");

  if (!snap.exists()) return null;

  const now = Date.now();
  const raw = snap.val() || {};
  const entries = Object.entries<any>(raw)
    .map(([callId, value]) => ({ callId, ...(value || {}) }))
    .sort((a, b) => {
      const ta = typeof a.updatedAt === "number" ? a.updatedAt : 0;
      const tb = typeof b.updatedAt === "number" ? b.updatedAt : 0;
      return tb - ta;
    });

  for (const call of entries) {
    if (isExpiredRingingCall(call, now)) {
      markCallMissed(call.callId).catch((error: any) =>
        console.warn("⚠️ [calls] No se pudo marcar missed una llamada expirada:", {
          callId: call.callId,
          error: error?.message || error,
        }),
      );
      continue;
    }
    if (ACTIVE_CALL_STATUSES.has(String(call.status || "").toLowerCase())) {
      return call;
    }
  }

  return null;
}

/**
 * Última llamada viva entre cliente y conductor de un viaje (dedup para
 * ride calls). Solo considera registros con callType === "ride" y el par
 * exacto clientUid/driverUid; las llamadas de soporte con rideId no aplican.
 */
export async function findExistingActiveRideCall(
  rideId: string,
  clientUid: string,
  driverUid: string,
) {
  const snap = await database
    .ref("calls")
    .orderByChild("rideId")
    .equalTo(rideId)
    .limitToLast(30)
    .once("value");

  if (!snap.exists()) return null;

  const now = Date.now();
  const raw = snap.val() || {};
  const entries = Object.entries<any>(raw)
    .map(([callId, value]) => ({ callId, ...(value || {}) }))
    .filter(
      (call) =>
        call.callType === "ride" &&
        call.clientUid === clientUid &&
        call.driverUid === driverUid,
    )
    .sort((a, b) => {
      const ta = typeof a.updatedAt === "number" ? a.updatedAt : 0;
      const tb = typeof b.updatedAt === "number" ? b.updatedAt : 0;
      return tb - ta;
    });

  for (const call of entries) {
    if (isExpiredRingingCall(call, now)) {
      markCallMissed(call.callId).catch((error: any) =>
        console.warn("⚠️ [ride calls] No se pudo marcar missed una llamada expirada:", {
          callId: call.callId,
          error: error?.message || error,
        }),
      );
      continue;
    }
    if (ACTIVE_CALL_STATUSES.has(String(call.status || "").toLowerCase())) {
      return call;
    }
  }

  return null;
}
