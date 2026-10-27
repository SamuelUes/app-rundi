/**
 * TRIGGER: ON ACTIVE RIDES WRITE (CONSOLIDADO)
 *
 * Reemplaza onRatingCompleted y onRideCanceled con un solo trigger onWrite
 * sobre activeRides/{rideId}, reduciendo invocaciones de Cloud Functions.
 *
 * Maneja:
 * - status → 'canceled': archiva viaje cancelado en Supabase
 * - status → 'rating_completed': espera 15s → 'completed', luego 20s → elimina
 */

import * as functions from "firebase-functions/v1";
import admin from "firebase-admin";
import { randomInt } from "crypto";
import {
  saveCanceledRideToSupabase,
  savePaymentToSupabase,
  saveRideLocationsToSupabase,
  updateRideLocationIds,
} from "../helpers/supabaseArchive";
import { scheduleDelayedTask } from "../helpers/cloudTasks";
import { claimArchive, enqueueArchiveRetry, markArchiveDone } from "../helpers/archiveOutbox";
import {
  mirrorDeletedRideToPublicTracking,
  mirrorRideToPublicTracking,
} from "../helpers/publicTrackingMirror";
import { decideCrewRideAction, isDesignatedRide } from "../helpers/designatedCrew";
import { attachFollowerToRide, releaseFollowerFromRide } from "../helpers/designatedCrewStore";

export const onActiveRidesWrite = functions.database
  .ref("activeRides/{rideId}")
  .onWrite(async (change, context) => {
    const rideId = context.params.rideId as string;
    const after = change.after.val();
    const before = change.before.val();

    // Espejo público de tracking (web /tracking por código): corre en cada
    // write —incluido el borrado— y es no-op si el viaje no tiene código
    // activo. No bloquea la lógica de archivo ante errores.
    try {
      if (after) {
        await mirrorRideToPublicTracking(rideId, after);
      } else {
        await mirrorDeletedRideToPublicTracking(rideId);
      }
    } catch (mirrorError) {
      console.warn(`⚠️ [onActiveRidesWrite] Error espejando publicTracking ${rideId}:`, mirrorError);
    }

    // Sincronización del equipo de conductores designados: adjunta al
    // seguidor cuando el capitán acepta y lo libera al completar el pago,
    // cancelar o borrar el nodo. Nunca bloquea la lógica de archivo.
    try {
      const crewAction = decideCrewRideAction(before, after);
      if (crewAction.type === "attach") {
        await attachFollowerToRide(rideId, after);
      } else if (crewAction.type === "release") {
        await releaseFollowerFromRide(rideId, after ?? before, crewAction.reason);
      }
    } catch (crewError) {
      console.error(`❌ [onActiveRidesWrite] Error sincronizando equipo designado ${rideId}:`, crewError);
    }

    if (!after) {
      return null;
    }

    const newStatus: string | undefined = after.status;
    const oldStatus: string | undefined = before?.status;

    // ── CASO 1: Viaje cancelado ──────────────────────────────────
    if (newStatus === "canceled" && oldStatus !== "canceled") {
      await handleRideCanceled(rideId, after, before);
      return null;
    }

    // ── CASO 2: Rating completado ────────────────────────────────
    if (newStatus === "rating_completed" && oldStatus !== "rating_completed") {
      await handleRatingCompleted(rideId);
      return null;
    }

    // ── CASO 3: Código de verificación para viajes normales ──────
    const entersPrePickup =
      ["accepted", "driver_on_route", "driver_arrived"].includes(
        String(newStatus || ""),
      ) && newStatus !== oldStatus;
    if (entersPrePickup) {
      await ensureRideVerificationCode(rideId, after);
      return null;
    }

    return null;
  });



/**
 * Crea el código de verificación de 4 dígitos para un viaje normal.
 * Transacción sobre el nodo: si ya existe `code`, aborta sin regenerar.
 */
async function ensureRideVerificationCode(
  rideId: string,
  ride: any,
): Promise<void> {
  if (isDesignatedRide(ride)) return;

  const code = randomInt(0, 10000).toString().padStart(4, "0");
  const result = await admin
    .database()
    .ref(`rideVerificationCodes/${rideId}`)
    .transaction((current: any) => {
      if (current && current.code) return undefined; // abort: ya existe
      return {
        code,
        clientId: ride?.clientId || null,
        driverId: ride?.driverId || null,
        createdAt: admin.database.ServerValue.TIMESTAMP,
        attempts: 0,
      };
    });

  if (result.committed) {
    console.log(
      `🔐 [onActiveRidesWrite] Código de verificación creado para ${rideId}`,
    );
  }
}

/**
 * Maneja la cancelación de un viaje: archiva en Supabase con status 'canceled'.
 */
async function handleRideCanceled(
  rideId: string,
  newRide: any,
  previousRide: any,
): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🚫 [onActiveRidesWrite] VIAJE CANCELADO`);
  console.log(`${"=".repeat(60)}`);
  console.log(`   rideId: ${rideId}`);
  console.log(`   cancelReason: ${newRide.cancelReason || "Sin razón"}`);
  console.log(`   canceledBy: ${newRide.canceledBy || "unknown"}`);

  // Single-flight compartido con onPaymentCanceled / outbox cron.
  const claimed = await claimArchive(rideId, "canceled");
  if (!claimed) {
    console.log(`⏭️ [onActiveRidesWrite] ${rideId} ya reclamado/archivado por otro proceso`);
    return;
  }

  try {
    // Obtener paymentStatus si existe
    const paymentStatusSnapshot = await admin
      .database()
      .ref(`paymentStatus/${rideId}`)
      .once("value");
    const paymentStatus = paymentStatusSnapshot.val();

    if (!paymentStatus) {
      console.warn(`⚠️ [onActiveRidesWrite] No hay paymentStatus para ${rideId}`);
    }

    // Guardar viaje cancelado en Supabase
    const rideDataForSupabase = {
      ...newRide,
      cancelReason: newRide.cancelReason || "Sin razón especificada",
      canceledBy: newRide.canceledBy || "unknown",
      canceledAt: newRide.canceledAt || Date.now(),
    };

    const pgRideId = await saveCanceledRideToSupabase(rideDataForSupabase, rideId);
    if (!pgRideId) {
      console.error(`❌ [onActiveRidesWrite] Error guardando viaje cancelado en Supabase — encolando reintento`);
      await enqueueArchiveRetry(rideId, rideDataForSupabase, paymentStatus, "canceled", "saveCanceledRideToSupabase retornó null");
      return;
    }
    console.log(`✅ Viaje cancelado guardado en Supabase: ${pgRideId}`);

    // Guardar ubicaciones
    const locationIds = await saveRideLocationsToSupabase(pgRideId, newRide);
    if (locationIds && locationIds.length > 0) {
      const idsUpdated = await updateRideLocationIds(pgRideId, locationIds);
      if (!idsUpdated) {
        console.warn(`⚠️ [onActiveRidesWrite] Error actualizando IDs de ubicaciones`);
      }
    }

    // Guardar pago cancelado si existe
    if (paymentStatus) {
      const paymentDataForSupabase = {
        ...paymentStatus,
        status: paymentStatus.status || "canceled",
        cancelReason: newRide.cancelReason || paymentStatus.cancelReason || "Sin razón especificada",
        canceledBy: newRide.canceledBy || paymentStatus.canceledBy || "unknown",
      };
      const paymentSaved = await savePaymentToSupabase(pgRideId, paymentDataForSupabase);
      if (!paymentSaved) {
        console.error(`❌ [onActiveRidesWrite] Error guardando pago cancelado en Supabase`);
      }
    }

    // Actualizar Firebase con pgRideId
    await markArchiveDone(rideId, pgRideId);
    await admin.database().ref(`activeRides/${rideId}`).update({
      pgRideId,
      archivedAt: Date.now(),
      archivedToSupabase: true,
    });

    console.log(`✅ [onActiveRidesWrite] Cancelación completada para ${rideId}`);
  } catch (error: any) {
    console.error(`❌ [onActiveRidesWrite] Error en cancelación de ${rideId}:`, error.message);
    // Encolar para reintento en lugar de perder el dato
    await enqueueArchiveRetry(rideId, newRide, null, "canceled", error.message);
    // Rethrow para que Firebase marque la función como fallida y permita alertas
    throw error;
  }
}

/**
 * Maneja rating completado: encola dos Cloud Tasks:
 * 1) A los 15s: marcar como 'completed'
 * 2) A los 35s: eliminar de activeRides
 */
async function handleRatingCompleted(rideId: string): Promise<void> {
  console.log(`⭐ [onActiveRidesWrite] rideId=${rideId} → status=rating_completed`);

  try {
    // Task 1: After 15s, mark as completed
    await scheduleDelayedTask(
      "handleDelayedRideStatus",
      { action: "mark_completed", rideId },
      15,
    );

    // Task 2: After 35s total, cleanup from activeRides
    await scheduleDelayedTask(
      "handleDelayedRideStatus",
      { action: "cleanup_active_ride", rideId },
      35,
    );

    console.log(`✅ [onActiveRidesWrite] Cloud Tasks encoladas para ${rideId}`);
  } catch (err) {
    console.error(`❌ [onActiveRidesWrite] Error encolando tasks para ${rideId}:`, err);
  }
}
