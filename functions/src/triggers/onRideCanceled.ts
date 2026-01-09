/**
 * TRIGGER: ON RIDE CANCELED
 * 
 * Se dispara AUTOMÁTICAMENTE cuando:
 * activeRides/{rideId}.status = 'canceled'
 * 
 * Guarda el viaje cancelado en Supabase con status 'canceled'
 * (NO confundir con cancelación de pago)
 */

import * as functions from "firebase-functions";
import admin from "firebase-admin";
import {
  saveCanceledRideToSupabase,
  savePaymentToSupabase,
  saveRideLocationsToSupabase,
  updateRideLocationIds,
} from "../helpers/supabaseArchive.old";

export const onRideCanceled = functions.database
  .ref("activeRides/{rideId}")
  .onWrite(async (change, context) => {
    const rideId = context.params.rideId;
    const newRide = change.after.val();
    const previousRide = change.before.val();

    // ✅ VALIDACIÓN 1: Solo procesar si existe nuevo ride
    if (!newRide) {
      console.log(`⏭️ [onRideCanceled] Ride eliminado, no procesar`);
      return;
    }

    // ✅ VALIDACIÓN 2: Solo procesar si status = 'canceled'
    if (newRide.status !== "canceled") {
      return;
    }

    // ✅ VALIDACIÓN 3: No procesar si ya estaba cancelado
    if (previousRide?.status === "canceled") {
      console.log(`⏭️ [onRideCanceled] Ya estaba cancelado, no procesar`);
      return;
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`🚫 [onRideCanceled] ¡¡¡ VIAJE CANCELADO !!!`);
    console.log(`${"=".repeat(60)}`);
    console.log(`   rideId: ${rideId}`);
    console.log(`   cancelReason: ${newRide.cancelReason || 'Sin razón'}`);
    console.log(`   canceledBy: ${newRide.canceledBy || 'unknown'}`);
    console.log(`   status: ${newRide.status}`);

    try {
      // PASO 1: Obtener paymentStatus si existe
      console.log(`\n1️⃣ Obteniendo paymentStatus...`);
      const paymentStatusSnapshot = await admin
        .database()
        .ref(`paymentStatus/${rideId}`)
        .once("value");

      const paymentStatus = paymentStatusSnapshot.val();

      if (!paymentStatus) {
        console.warn(`⚠️ [onRideCanceled] No hay paymentStatus para ${rideId}`);
      }

      // PASO 2: Guardar viaje cancelado en Supabase con status 'canceled'
      console.log(`\n2️⃣ Guardando viaje cancelado en Supabase con status 'canceled'...`);
      
      // ✅ IMPORTANTE: Guardar con status 'canceled' en Supabase
      const rideDataForSupabase = {
        ...newRide,
        cancelReason: newRide.cancelReason || "Sin razón especificada",
        canceledBy: newRide.canceledBy || "unknown",
        canceledAt: newRide.canceledAt || Date.now(),
      };

      const pgRideId = await saveCanceledRideToSupabase(rideDataForSupabase, rideId);

      if (!pgRideId) {
        console.error(`❌ [onRideCanceled] Error guardando viaje en Supabase`);
        return;
      }

      console.log(`✅ Viaje cancelado guardado en Supabase: ${pgRideId}`);

      // ✅ PASO 2.5: Guardar ubicaciones en Supabase
      console.log(`\n2️⃣.5️⃣ Guardando ubicaciones en Supabase...`);
      const locationIds = await saveRideLocationsToSupabase(pgRideId, newRide);
      
      if (locationIds && locationIds.length > 0) {
        console.log(`✅ ${locationIds.length} ubicaciones guardadas en Supabase`);
        
        // ✅ PASO 2.6: Actualizar IDs de origen y destino en rides
        console.log(`\n2️⃣.6️⃣ Actualizando IDs de ubicaciones en rides...`);
        const idsUpdated = await updateRideLocationIds(pgRideId, locationIds);
        if (idsUpdated) {
          console.log(`✅ IDs de ubicaciones actualizados`);
        } else {
          console.warn(`⚠️ Error actualizando IDs de ubicaciones`);
        }
      } else {
        console.warn(`⚠️ No se guardaron ubicaciones`);
      }

      // PASO 3: Guardar pago cancelado en Supabase (si existe)
      if (paymentStatus) {
        console.log(`\n3️⃣ Guardando pago cancelado en Supabase...`);
        const paymentDataForSupabase = {
          ...paymentStatus,
          status: paymentStatus.status || 'canceled',
          cancelReason: newRide.cancelReason || paymentStatus.cancelReason || "Sin razón especificada",
          canceledBy: newRide.canceledBy || paymentStatus.canceledBy || "unknown",
        };
        
        const paymentSaved = await savePaymentToSupabase(pgRideId, paymentDataForSupabase);

        if (!paymentSaved) {
          console.error(`❌ [onRideCanceled] Error guardando pago en Supabase`);
          return;
        }

        console.log(`✅ Pago cancelado guardado en Supabase`);
      }

      // PASO 4: Actualizar Firebase con pgRideId
      console.log(`\n4️⃣ Actualizando Firebase con pgRideId...`);
      await admin
        .database()
        .ref(`activeRides/${rideId}`)
        .update({
          pgRideId: pgRideId,
          archivedAt: Date.now(),
          archivedToSupabase: true,
        });

      console.log(`✅ Firebase actualizado`);

      console.log(`\n${"=".repeat(60)}`);
      console.log(`✅✅✅ [onRideCanceled] ¡¡¡ COMPLETADO EXITOSAMENTE !!!`);
      console.log(`✅ Viaje guardado como 'canceled' en Supabase`);
      console.log(`${"=".repeat(60)}\n`);
    } catch (error: any) {
      console.error(`\n❌❌❌ [onRideCanceled] ERROR CRÍTICO`);
      console.error(`   Mensaje: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
      // No lanzar error - el trigger no debe fallar
    }
  });
