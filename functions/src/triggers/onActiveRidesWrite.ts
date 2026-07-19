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

import * as functions from "firebase-functions";
import admin from "firebase-admin";
import {
  saveCanceledRideToSupabase,
  savePaymentToSupabase,
  saveRideLocationsToSupabase,
  updateRideLocationIds,
} from "../helpers/supabaseArchive";
import { scheduleDelayedTask } from "../helpers/cloudTasks";
import { enqueueArchiveRetry } from "../helpers/archiveOutbox";

export const onActiveRidesWrite = functions.database
  .ref("activeRides/{rideId}")
  .onWrite(async (change, context) => {
    const rideId = context.params.rideId as string;
    const after = change.after.val();
    const before = change.before.val();

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

    return null;
  });

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
