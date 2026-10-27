/**
 * TRIGGER: ARCHIVO DE SESIONES DE LLAMADA
 *
 * onUpdate sobre calls/{callId}: cuando el status entra por primera vez en un
 * estado terminal (ended | rejected | missed), inserta/actualiza la fila en
 * support_call_sessions (llamadas de soporte cliente<->operador) o en
 * ride_call_sessions (llamadas de viaje cliente<->conductor, callType "ride").
 *
 * signaling_notes guarda el timeline de events y metadatos de señalización.
 */
import * as functions from "firebase-functions/v1";
import { supabaseGet, supabasePost, supabaseUpdate } from "../supabase/client";

const TERMINAL_STATUSES = new Set(["ended", "rejected", "missed"]);
const CALL_ROOM_PREFIX = "support-call-";
const RIDE_CALL_ROOM_PREFIX = "ride-call-";
const RIDE_CALL_DIRECTIONS = new Set(["client_to_driver", "driver_to_client"]);

const toIso = (value: unknown): string | null => {
  const ms = typeof value === "number" ? value : NaN;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString();
};

export const onCallEnded = functions.database
  .ref("calls/{callId}")
  .onUpdate(async (change, context) => {
    const callId = context.params.callId as string;
    const before = change.before.val() || {};
    const after = change.after.val();

    if (!after) return null;

    const newStatus = String(after.status || "").toLowerCase();
    const oldStatus = String(before.status || "").toLowerCase();

    if (!TERMINAL_STATUSES.has(newStatus) || TERMINAL_STATUSES.has(oldStatus)) {
      return null;
    }

    const clientUid = typeof after.clientUid === "string" ? after.clientUid : null;
    if (!clientUid) {
      functions.logger.warn("[onCallEnded] Llamada sin clientUid, se omite archivo", { callId });
      return null;
    }

    const isRideCall =
      after.callType === "ride" ||
      typeof after.driverUid === "string" ||
      RIDE_CALL_DIRECTIONS.has(String(after.direction || ""));

    const table = isRideCall ? "ride_call_sessions" : "support_call_sessions";
    const livekitRoom = `${isRideCall ? RIDE_CALL_ROOM_PREFIX : CALL_ROOM_PREFIX}${callId}`;
    const sharedColumns = {
      call_id: callId,
      client_uid: clientUid,
      status: newStatus,
      recording_url: typeof after.recordingUrl === "string" ? after.recordingUrl : null,
      signaling_notes: {
        livekitRoom,
        acceptDeadline: typeof after.acceptDeadline === "number" ? after.acceptDeadline : null,
        acceptedByUid: typeof after.acceptedByUid === "string" ? after.acceptedByUid : null,
        acceptedAt: toIso(after.acceptedAt),
        events: after.events ?? null,
        archivedBy: "rtdb_trigger",
      },
      created_at: toIso(after.createdAt) ?? new Date().toISOString(),
      updated_at: toIso(after.updatedAt) ?? new Date().toISOString(),
      connected_at: toIso(after.connectedAt),
      ended_at: toIso(after.endedAt) ?? new Date().toISOString(),
    };

    const row = isRideCall
      ? {
          ...sharedColumns,
          ride_id: typeof after.rideId === "string" ? after.rideId : null,
          driver_uid: typeof after.driverUid === "string" ? after.driverUid : null,
          direction: after.direction === "driver_to_client" ? "driver_to_client" : "client_to_driver",
        }
      : {
          ...sharedColumns,
          complaint_id: typeof after.complaintId === "string" ? after.complaintId : null,
          ride_id: typeof after.rideId === "string" ? after.rideId : null,
          operator_uid: typeof after.operatorUid === "string" ? after.operatorUid : null,
          direction:
            after.direction === "client_to_operator" ? "client_to_operator" : "operator_to_client",
        };

    try {
      const existing = await supabaseGet(
        table,
        { call_id: callId },
        "id",
        { limit: 1, requireServiceRole: true },
      );

      if (Array.isArray(existing) && existing.length > 0 && existing[0]?.id) {
        await supabaseUpdate(table, String(existing[0].id), row);
        functions.logger.info("[onCallEnded] Sesión actualizada", { callId, table });
      } else {
        await supabasePost(table, row);
        functions.logger.info("[onCallEnded] Sesión archivada", { callId, table, status: newStatus });
      }
    } catch (error: any) {
      functions.logger.error("[onCallEnded] Error archivando sesión", {
        callId,
        table,
        status: newStatus,
        error: error?.message,
      });
    }

    return null;
  });
