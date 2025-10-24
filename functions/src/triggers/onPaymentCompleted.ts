/**
 * TRIGGER: ON PAYMENT COMPLETED / CANCELED
 * 
 * Se dispara AUTOMÁTICAMENTE cuando:
 * 1. paymentStatus.status = 'completed' → Archiva viaje en Supabase
 * 2. paymentStatus.status = 'canceled' → Marca viaje como completado para rating
 * 
 * NO depende del Frontend - es 100% automático
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {
  saveCompletedRideToSupabase,
  savePaymentToSupabase,
} from "../helpers/supabaseArchive";

/**
 * TRIGGER: Cuando paymentStatus/{rideId}.status = 'completed'
 */
export const onPaymentCompleted = functions.database
  .ref("paymentStatus/{rideId}")
  .onWrite(async (change, context) => {
    const rideId = context.params.rideId;
    const newPaymentStatus = change.after.val();
    const previousPaymentStatus = change.before.val();

    // ✅ VALIDACIÓN 1: Solo procesar si existe nuevo status
    if (!newPaymentStatus) {
      console.log(`⏭️ [onPaymentCompleted] Payment eliminado, no procesar`);
      return;
    }

    // ✅ VALIDACIÓN 2: Solo procesar si status = 'completed'
    if (newPaymentStatus.status !== "completed") {
      return;
    }

    // ✅ VALIDACIÓN 3: No procesar si ya estaba completado
    if (previousPaymentStatus?.status === "completed") {
      console.log(`⏭️ [onPaymentCompleted] Ya estaba completado, no procesar`);
      return;
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`🔔 [onPaymentCompleted] ¡¡¡ PAYMENT COMPLETADO !!!`);
    console.log(`${"=".repeat(60)}`);
    console.log(`   rideId: ${rideId}`);
    console.log(`   amount: ${newPaymentStatus.finalAmount}`);
    console.log(`   status: ${newPaymentStatus.status}`);

    try {
      // PASO 1: Obtener viaje de Firebase
      console.log(`\n1️⃣ Obteniendo viaje de Firebase...`);
      const rideSnapshot = await admin
        .database()
        .ref(`activeRides/${rideId}`)
        .once("value");

      const ride = rideSnapshot.val();

      if (!ride) {
        console.error(`❌ [onPaymentCompleted] Viaje no encontrado en Firebase: ${rideId}`);
        return;
      }

      console.log(`✅ Viaje encontrado en Firebase`);
      console.log(`   clientId: ${ride.clientId}`);
      console.log(`   driverId: ${ride.driverId}`);
      console.log(`   status: ${ride.status}`);

      // PASO 2: Guardar viaje en Supabase
      console.log(`\n2️⃣ Guardando viaje en Supabase...`);
      const pgRideId = await saveCompletedRideToSupabase(
        ride,
        rideId,
        newPaymentStatus
      );

      if (!pgRideId) {
        console.error(`❌ [onPaymentCompleted] Error guardando viaje en Supabase`);
        return;
      }

      console.log(`✅ Viaje guardado en Supabase: ${pgRideId}`);

      // PASO 3: Guardar pago en Supabase
      console.log(`\n3️⃣ Guardando pago en Supabase...`);
      const paymentSaved = await savePaymentToSupabase(pgRideId, newPaymentStatus);

      if (!paymentSaved) {
        console.error(`❌ [onPaymentCompleted] Error guardando pago en Supabase`);
        return;
      }

      console.log(`✅ Pago guardado en Supabase`);

      // PASO 4: Actualizar Firebase con pgRideId (para referencia)
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

      // PASO 5: Cambiar status a 'completed' en Firebase (antes de eliminar)
      console.log(`\n5️⃣ Actualizando status a 'completed' en Firebase...`);
      await admin
        .database()
        .ref(`activeRides/${rideId}`)
        .update({
          status: "completed",
        });

      console.log(`✅ Status actualizado a 'completed'`);

      // PASO 6: Limpiar Firebase (eliminar de activeRides)
      console.log(`\n6️⃣ Limpiando Firebase (eliminando de activeRides)...`);
      await admin
        .database()
        .ref(`activeRides/${rideId}`)
        .remove();

      console.log(`✅ Eliminado de activeRides`);

      console.log(`\n${"=".repeat(60)}`);
      console.log(`✅✅✅ [onPaymentCompleted] ¡¡¡ COMPLETADO EXITOSAMENTE !!!`);
      console.log(`${"=".repeat(60)}\n`);
    } catch (error: any) {
      console.error(`\n❌❌❌ [onPaymentCompleted] ERROR CRÍTICO`);
      console.error(`   Mensaje: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
      // No lanzar error - el trigger no debe fallar
    }
  });

/**
 * TRIGGER: Cuando paymentStatus/{rideId}.status = 'canceled'
 * 
 * Marca el viaje como 'completed' para que se muestre el rating
 * aunque el pago haya sido cancelado
 */
export const onPaymentCanceled = functions.database
  .ref("paymentStatus/{rideId}")
  .onWrite(async (change, context) => {
    const rideId = context.params.rideId;
    const newPaymentStatus = change.after.val();
    const previousPaymentStatus = change.before.val();

    // ✅ VALIDACIÓN 1: Solo procesar si existe nuevo status
    if (!newPaymentStatus) {
      console.log(`⏭️ [onPaymentCanceled] Payment eliminado, no procesar`);
      return;
    }

    // ✅ VALIDACIÓN 2: Solo procesar si status = 'canceled'
    if (newPaymentStatus.status !== "canceled") {
      return;
    }

    // ✅ VALIDACIÓN 3: No procesar si ya estaba cancelado
    if (previousPaymentStatus?.status === "canceled") {
      console.log(`⏭️ [onPaymentCanceled] Ya estaba cancelado, no procesar`);
      return;
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`🔔 [onPaymentCanceled] ¡¡¡ PAYMENT CANCELADO !!!`);
    console.log(`${"=".repeat(60)}`);
    console.log(`   rideId: ${rideId}`);
    console.log(`   cancelReason: ${newPaymentStatus.cancelReason || 'Sin razón'}`);
    console.log(`   status: ${newPaymentStatus.status}`);

    try {
      // PASO 1: Obtener viaje de Firebase
      console.log(`\n1️⃣ Obteniendo viaje de Firebase...`);
      const rideSnapshot = await admin
        .database()
        .ref(`activeRides/${rideId}`)
        .once("value");

      const ride = rideSnapshot.val();

      if (!ride) {
        console.error(`❌ [onPaymentCanceled] Viaje no encontrado en Firebase: ${rideId}`);
        return;
      }

      console.log(`✅ Viaje encontrado en Firebase`);
      console.log(`   clientId: ${ride.clientId}`);
      console.log(`   driverId: ${ride.driverId}`);
      console.log(`   status: ${ride.status}`);

      // ✅ VALIDACIÓN: Si el viaje ya está cancelado, NO sobrescribir
      if (ride.status === 'canceled') {
        console.log(`⏭️ [onPaymentCanceled] Viaje ya está cancelado, no sobrescribir status`);
        // Solo actualizar paymentCanceled sin cambiar el status
        await admin
          .database()
          .ref(`activeRides/${rideId}`)
          .update({
            paymentCanceled: true,
            cancelReason: newPaymentStatus.cancelReason || "Sin razón especificada",
            canceledAt: Date.now(),
          });
        console.log(`✅ Viaje actualizado (paymentCanceled: true, status: canceled)`);
      } else {
        // PASO 2: Marcar viaje como 'completed' en Firebase
        // Esto permite que el frontend muestre el rating aunque el pago fue cancelado
        // ✅ IMPORTANTE: Solo si el viaje NO está cancelado
        console.log(`\n2️⃣ Marcando viaje como 'completed' para rating en Firebase...`);
        await admin
          .database()
          .ref(`activeRides/${rideId}`)
          .update({
            status: "completed",
            paymentCanceled: true,
            cancelReason: newPaymentStatus.cancelReason || "Sin razón especificada",
            canceledAt: Date.now(),
          });

        console.log(`✅ Viaje marcado como 'completed' en Firebase (con paymentCanceled: true)`);
      }

      // PASO 3: Guardar viaje en Supabase con status 'canceled' (NO 'completed')
      console.log(`\n3️⃣ Guardando viaje cancelado en Supabase con status 'canceled'...`);
      
      // ✅ IMPORTANTE: Guardar con status 'canceled' en Supabase
      const rideDataForSupabase = {
        ...ride,
        status: "canceled",  // ✅ Status debe ser 'canceled' en Supabase
        cancelReason: newPaymentStatus.cancelReason || "Sin razón especificada",
        canceledBy: newPaymentStatus.canceledBy || "backend",
        canceledAt: newPaymentStatus.canceledAt || Date.now(),
      };
      
      const pgRideId = await saveCompletedRideToSupabase(
        rideDataForSupabase,
        rideId,
        newPaymentStatus
      );

      if (!pgRideId) {
        console.error(`❌ [onPaymentCanceled] Error guardando viaje en Supabase`);
        return;
      }

      console.log(`✅ Viaje guardado en Supabase: ${pgRideId}`);

      // PASO 4: Guardar pago cancelado en Supabase
      console.log(`\n4️⃣ Guardando pago cancelado en Supabase...`);
      const paymentSaved = await savePaymentToSupabase(pgRideId, newPaymentStatus);

      if (!paymentSaved) {
        console.error(`❌ [onPaymentCanceled] Error guardando pago en Supabase`);
        return;
      }

      console.log(`✅ Pago cancelado guardado en Supabase`);

      // PASO 5: Actualizar Firebase con pgRideId
      console.log(`\n5️⃣ Actualizando Firebase con pgRideId...`);
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
      console.log(`✅✅✅ [onPaymentCanceled] ¡¡¡ COMPLETADO EXITOSAMENTE !!!`);
      console.log(`✅ Viaje disponible para RATING aunque pago fue cancelado`);
      console.log(`${"=".repeat(60)}\n`);
    } catch (error: any) {
      console.error(`\n❌❌❌ [onPaymentCanceled] ERROR CRÍTICO`);
      console.error(`   Mensaje: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
      // No lanzar error - el trigger no debe fallar
    }
  });
