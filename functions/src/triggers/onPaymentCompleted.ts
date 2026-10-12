/**
 * TRIGGER: ON PAYMENT COMPLETED / CANCELED
 *
 * Gestiona el archivado en Supabase y limpieza en Firebase Realtime Database
 * cuando cambia el estado en `paymentStatus/{rideId}`.
 */

import * as functions from "firebase-functions/v1";
import admin from "firebase-admin";
import {
  saveCompletedRideToSupabase,
  savePaymentToSupabase,
  saveRideLocationsToSupabase,
  updateRideLocationIds,
  saveCanceledRideToSupabase,
} from "../helpers/supabaseArchive";
import { cleanupRideFromRealtime } from "../helpers/cleanupHelpers";
import { claimArchive, enqueueArchiveRetry, markArchiveDone } from "../helpers/archiveOutbox";

// Estados terminales del pago que disparan el archivado.
// 'payment_completed' es legacy — el writer canónico ahora usa 'completed'.
const TERMINAL_ARCHIVABLE_STATUSES = new Set(["completed", "payment_completed"]);

/**
 * TRIGGER: paymentStatus/{rideId}.status → completed
 */
export const onPaymentCompleted = functions.database
  .ref("paymentStatus/{rideId}")
  .onWrite(async (change, context) => {
    const rideId = context.params.rideId;
    const newPaymentStatus = change.after.val();
    const previousPaymentStatus = change.before.val();

    if (!newPaymentStatus) {
      console.log("⏭️ [onPaymentCompleted] Payment eliminado, no procesar");
      return;
    }
    if (!TERMINAL_ARCHIVABLE_STATUSES.has(newPaymentStatus.status)) {
      return;
    }
    if (TERMINAL_ARCHIVABLE_STATUSES.has(previousPaymentStatus?.status)) {
      console.log("⏭️ [onPaymentCompleted] Ya estaba completado, no procesar");
      return;
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log("🔔 [onPaymentCompleted] ¡¡¡ PAYMENT COMPLETADO !!!");
    console.log(`${"=".repeat(60)}`);
    console.log(`   rideId: ${rideId}`);
    console.log(`   amount: ${newPaymentStatus.finalAmount}`);
    console.log(`   status: ${newPaymentStatus.status}`);

    // Single-flight: RTDB entrega triggers at-least-once y el cron puede
    // procesar el mismo ride en paralelo — solo quien reclama archiva.
    const claimed = await claimArchive(rideId, "completed");
    if (!claimed) {
      console.log(`⏭️ [onPaymentCompleted] ${rideId} ya reclamado/archivado por otro proceso`);
      return;
    }

    let ride: any = null;
    try {
      const rideSnapshot = await admin
        .database()
        .ref(`activeRides/${rideId}`)
        .once("value");
      ride = rideSnapshot.val();

      if (!ride) {
        // El viaje ya fue limpiado — nada que archivar.
        await markArchiveDone(rideId, "");
        console.error(`⏭️ [onPaymentCompleted] Viaje ${rideId} ya no existe en Firebase — nada que archivar`);
        return;
      }

      const pgRideId = await saveCompletedRideToSupabase(ride, rideId, newPaymentStatus);
      if (!pgRideId) {
        console.error("❌ [onPaymentCompleted] Error guardando viaje en Supabase — encolando reintento");
        await enqueueArchiveRetry(rideId, ride, newPaymentStatus, "completed", "saveCompletedRideToSupabase retornó null");
        return;
      }

      const paymentSaved = await savePaymentToSupabase(pgRideId, newPaymentStatus);
      if (!paymentSaved) {
        console.error("❌ [onPaymentCompleted] Error guardando pago en Supabase — encolando reintento");
        await enqueueArchiveRetry(rideId, ride, newPaymentStatus, "completed", "savePaymentToSupabase retornó false");
        return;
      }

      const locationIds = await saveRideLocationsToSupabase(pgRideId, ride);
      if (locationIds && locationIds.length > 0) {
        const idsUpdated = await updateRideLocationIds(pgRideId, locationIds);
        if (!idsUpdated) {
          console.warn("⚠️ [onPaymentCompleted] Error actualizando IDs de ubicaciones");
        }
      } else {
        console.warn("⚠️ [onPaymentCompleted] No se guardaron ubicaciones");
      }

      await markArchiveDone(rideId, pgRideId);

      await admin
        .database()
        .ref(`activeRides/${rideId}`)
        .update({
          pgRideId,
          archivedAt: Date.now(),
          archivedToSupabase: true,
        });

      await admin
        .database()
        .ref(`activeRides/${rideId}`)
        .update({ status: "completed" });

      await cleanupRideFromRealtime(
        rideId,
        ride?.driverId ?? null,
        ride?.clientId ?? null
      );

      console.log(`\n${"=".repeat(60)}`);
      console.log("✅✅✅ [onPaymentCompleted] ¡¡¡ COMPLETADO EXITOSAMENTE !!!");
      console.log(`${"=".repeat(60)}\n`);
    } catch (error: any) {
      console.error(`\n❌❌❌ [onPaymentCompleted] ERROR CRÍTICO: ${error?.message || error}`);
      // Encolar para reintento en lugar de perder el dato.
      // Pasar el RIDE real (o null): el cron re-lee activeRides si falta.
      await enqueueArchiveRetry(rideId, ride, newPaymentStatus, "completed", error.message);
      // Rethrow para que Firebase marque la función como fallida y permita alertas
      throw error;
    }
  });

/**
 * TRIGGER: paymentStatus/{rideId}.status → canceled
 */
export const onPaymentCanceled = functions.database
  .ref("paymentStatus/{rideId}")
  .onWrite(async (change, context) => {
    const rideId = context.params.rideId;
    const newPaymentStatus = change.after.val();
    const previousPaymentStatus = change.before.val();

    if (!newPaymentStatus) {
      console.log("⏭️ [onPaymentCanceled] Payment eliminado, no procesar");
      return;
    }
    if (newPaymentStatus.status !== "canceled") {
      return;
    }
    if (previousPaymentStatus?.status === "canceled") {
      console.log("⏭️ [onPaymentCanceled] Ya estaba cancelado, no procesar");
      return;
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log("🔔 [onPaymentCanceled] ¡¡¡ PAYMENT CANCELADO !!!");
    console.log(`${"=".repeat(60)}`);
    console.log(`   rideId: ${rideId}`);
    console.log(`   cancelReason: ${newPaymentStatus.cancelReason || "Sin razón"}`);

    const claimed = await claimArchive(rideId, "canceled");
    if (!claimed) {
      console.log(`⏭️ [onPaymentCanceled] ${rideId} ya reclamado/archivado por otro proceso`);
      return;
    }

    let ride: any = null;
    try {
      const rideSnapshot = await admin
        .database()
        .ref(`activeRides/${rideId}`)
        .once("value");
      ride = rideSnapshot.val();

      if (!ride) {
        await markArchiveDone(rideId, "");
        console.error(`⏭️ [onPaymentCanceled] Viaje ${rideId} ya no existe en Firebase — nada que archivar`);
        return;
      }

      if (ride.status === "canceled") {
        await admin
          .database()
          .ref(`activeRides/${rideId}`)
          .update({
            paymentCanceled: true,
            cancelReason: newPaymentStatus.cancelReason || "Sin razón especificada",
            canceledAt: Date.now(),
          });
      } else {
        await admin
          .database()
          .ref(`activeRides/${rideId}`)
          .update({
            status: "completed",
            paymentCanceled: true,
            cancelReason: newPaymentStatus.cancelReason || "Sin razón especificada",
            canceledAt: Date.now(),
          });
      }

      const rideDataForSupabase = {
        ...ride,
        status: "canceled",
        cancelReason: newPaymentStatus.cancelReason || "Sin razón especificada",
        canceledBy: newPaymentStatus.canceledBy || "backend",
        canceledAt: newPaymentStatus.canceledAt || Date.now(),
      };

      const pgRideId = await saveCanceledRideToSupabase(rideDataForSupabase, rideId);
      if (!pgRideId) {
        console.error("❌ [onPaymentCanceled] Error guardando viaje en Supabase — encolando reintento");
        await enqueueArchiveRetry(rideId, rideDataForSupabase, newPaymentStatus, "canceled", "saveCanceledRideToSupabase retornó null");
        return;
      }

      const locationIds = await saveRideLocationsToSupabase(pgRideId, ride);
      if (locationIds && locationIds.length > 0) {
        const idsUpdated = await updateRideLocationIds(pgRideId, locationIds);
        if (!idsUpdated) {
          console.warn("⚠️ [onPaymentCanceled] Error actualizando IDs de ubicaciones");
        }
      } else {
        console.warn("⚠️ [onPaymentCanceled] No se guardaron ubicaciones");
      }

      const paymentSaved = await savePaymentToSupabase(pgRideId, newPaymentStatus);
      if (!paymentSaved) {
        console.error("❌ [onPaymentCanceled] Error guardando pago cancelado en Supabase — encolando reintento");
        await enqueueArchiveRetry(rideId, rideDataForSupabase, newPaymentStatus, "canceled", "savePaymentToSupabase retornó false");
        return;
      }

      await markArchiveDone(rideId, pgRideId);

      await admin
        .database()
        .ref(`activeRides/${rideId}`)
        .update({
          pgRideId,
          archivedAt: Date.now(),
          archivedToSupabase: true,
        });

      await cleanupRideFromRealtime(
        rideId,
        ride?.driverId ?? null,
        ride?.clientId ?? null
      );

      console.log(`\n${"=".repeat(60)}`);
      console.log("✅✅✅ [onPaymentCanceled] ¡¡¡ COMPLETADO EXITOSAMENTE !!!");
      console.log("✅ Viaje disponible para RATING aunque pago fue cancelado");
      console.log(`${"=".repeat(60)}\n`);
    } catch (error: any) {
      console.error(`\n❌❌❌ [onPaymentCanceled] ERROR CRÍTICO: ${error?.message || error}`);
      // Pasar el RIDE enriquecido (con datos de cancelación), no el paymentStatus.
      const rideForRetry = ride
        ? {
            ...ride,
            status: "canceled",
            cancelReason: newPaymentStatus.cancelReason || "Sin razón especificada",
            canceledBy: newPaymentStatus.canceledBy || "backend",
            canceledAt: newPaymentStatus.canceledAt || Date.now(),
          }
        : null;
      await enqueueArchiveRetry(rideId, rideForRetry, newPaymentStatus, "canceled", error.message);
      throw error;
    }
  });
