/**
 * TRIGGER: ON PAYMENT COMPLETED / CANCELED
 *
 * Gestiona el archivado en Supabase y limpieza en Firebase Realtime Database
 * cuando cambia el estado en `paymentStatus/{rideId}`.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {
  saveCompletedRideToSupabase,
  savePaymentToSupabase,
  saveRideLocationsToSupabase,
  updateRideLocationIds,
  saveCanceledRideToSupabase,
} from "../helpers/supabaseArchive.old";
import { cleanupRideFromRealtime } from "../helpers/cleanupHelpers-new";

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
    if (newPaymentStatus.status !== "completed") {
      return;
    }
    if (previousPaymentStatus?.status === "completed") {
      console.log("⏭️ [onPaymentCompleted] Ya estaba completado, no procesar");
      return;
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log("🔔 [onPaymentCompleted] ¡¡¡ PAYMENT COMPLETADO !!!");
    console.log(`${"=".repeat(60)}`);
    console.log(`   rideId: ${rideId}`);
    console.log(`   amount: ${newPaymentStatus.finalAmount}`);
    console.log(`   status: ${newPaymentStatus.status}`);

    try {
      const rideSnapshot = await admin
        .database()
        .ref(`activeRides/${rideId}`)
        .once("value");
      const ride = rideSnapshot.val();

      if (!ride) {
        console.error(`❌ [onPaymentCompleted] Viaje no encontrado en Firebase: ${rideId}`);
        return;
      }

      const pgRideId = await saveCompletedRideToSupabase(ride, rideId, newPaymentStatus);
      if (!pgRideId) {
        console.error("❌ [onPaymentCompleted] Error guardando viaje en Supabase");
        return;
      }

      const paymentSaved = await savePaymentToSupabase(pgRideId, newPaymentStatus);
      if (!paymentSaved) {
        console.error("❌ [onPaymentCompleted] Error guardando pago en Supabase");
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

    try {
      const rideSnapshot = await admin
        .database()
        .ref(`activeRides/${rideId}`)
        .once("value");
      const ride = rideSnapshot.val();

      if (!ride) {
        console.error(`❌ [onPaymentCanceled] Viaje no encontrado en Firebase: ${rideId}`);
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
        console.error("❌ [onPaymentCanceled] Error guardando viaje en Supabase");
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
        console.error("❌ [onPaymentCanceled] Error guardando pago cancelado en Supabase");
        return;
      }

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
    }
  });
