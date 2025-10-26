/**
 * API para manejar pagos pendientes
 * 
 * Funciones:
 * - getPendingPayments: Obtener pagos pendientes de un cliente
 * - processPendingPayment: Procesar pago de una deuda pendiente
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import pool from "../config/database";

/**
 * Obtener pagos pendientes de un cliente
 */
export const getPendingPayments = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const userId = context.auth.uid;

  try {
    console.log(`📋 Obteniendo pagos pendientes para cliente: ${userId}`);

    const client = await pool.connect();
    const pendingPayments: any[] = [];
    const processedRideIds = new Set<string>(); // Para evitar duplicados

    try {
      // FUENTE PRINCIPAL: PostgreSQL (payments table con status = 'pending')
      // Esta es la fuente de verdad para el estado de los pagos
      const result = await client.query(
        `SELECT 
          p.id as payment_id,
          p.ride_id,
          p.amount,
          p.tip,
          p.payment_method,
          p.status as payment_status,
          p.created_at as payment_created_at,
          r.client_id,
          r.driver_id,
          r.status as ride_status,
          r.final_fare,
          r.requested_at,
          -- ✅ NUEVO: Obtener ubicaciones desde ride_locations
          (SELECT address FROM ride_locations WHERE ride_id = r.id AND location_type = 'origin' LIMIT 1) as origin_address,
          (SELECT address FROM ride_locations WHERE ride_id = r.id AND location_type = 'destination' LIMIT 1) as destination_address
        FROM payments p
        INNER JOIN rides r ON p.ride_id = r.id
        WHERE r.client_id = $1 
          AND p.status = 'pending'
        ORDER BY p.created_at DESC
        LIMIT 20`,
        [userId]
      );

      console.log(`💾 Encontrados ${result.rows.length} pagos pendientes en PostgreSQL`);

      // Procesar pagos de PostgreSQL
      for (const row of result.rows) {
        const rideId = row.ride_id;
        
        // Evitar duplicados
        if (processedRideIds.has(rideId)) {
          console.log(`⚠️ Viaje ${rideId} ya procesado, saltando...`);
          continue;
        }

        processedRideIds.add(rideId);

        // Intentar obtener información adicional de Firebase Realtime (opcional)
        let driverName = 'Conductor';
        try {
          const db = admin.database();
          
          // Buscar en activeRides primero
          const activeRideSnapshot = await db.ref(`activeRides/${rideId}`).once('value');
          if (activeRideSnapshot.exists()) {
            const rideData = activeRideSnapshot.val();
            driverName = rideData.driver?.name || driverName;
          } else {
            // Si no está en activeRides, buscar info del conductor en driversInfo
            if (row.driver_id) {
              const driverSnapshot = await db.ref(`driversInfo/${row.driver_id}`).once('value');
              if (driverSnapshot.exists()) {
                const driverData = driverSnapshot.val();
                driverName = driverData.name || driverName;
              }
            }
          }
        } catch (fbError) {
          console.log(`⚠️ No se pudo obtener info adicional de Firebase para ${rideId}:`, fbError);
        }

        pendingPayments.push({
          rideId,
          paymentId: row.payment_id,
          amount: parseFloat(row.amount || row.final_fare || '0'),
          tip: parseFloat(row.tip || '0'),
          paymentMethod: row.payment_method || 'cash',
          status: row.ride_status,
          paymentStatus: row.payment_status,
          driverName,
          origin: row.origin_address || 'N/A',
          destination: row.destination_address || 'N/A',
          createdAt: new Date(row.payment_created_at || row.requested_at).getTime(),
          isPending: true,
          source: 'postgres'
        });
      }

      // FUENTE SECUNDARIA: Firebase Realtime DB (solo si no está en PostgreSQL)
      // Esto captura pagos muy recientes que aún no se sincronizaron
      const db = admin.database();
      const activeRidesRef = db.ref('activeRides');
      const snapshot = await activeRidesRef
        .orderByChild('clientId')
        .equalTo(userId)
        .once('value');

      let realtimeCount = 0;
      snapshot.forEach((childSnapshot) => {
        const ride = childSnapshot.val();
        const rideId = childSnapshot.key;

        // Solo agregar si NO está ya en la lista de PostgreSQL
        if (!processedRideIds.has(rideId) && 
            (ride.status === 'pending_payment' || ride.status === 'pending_cash_payment')) {
          
          processedRideIds.add(rideId);
          realtimeCount++;

          pendingPayments.push({
            rideId,
            amount: ride.finalFare || ride.estimatedPrice || 0,
            tip: 0,
            paymentMethod: ride.paymentMethod || 'cash',
            status: ride.status,
            paymentStatus: 'pending',
            driverName: ride.driver?.name || 'Conductor',
            origin: ride.origin?.address || 'N/A',
            destination: ride.destination?.address || 'N/A',
            createdAt: ride.createdAt || Date.now(),
            isPending: true,
            source: 'realtime'
          });
        }
      });

      if (realtimeCount > 0) {
        console.log(`🔥 Encontrados ${realtimeCount} pagos adicionales en Firebase Realtime`);
      }

    } finally {
      client.release();
    }

    // Ordenar por fecha (más reciente primero)
    pendingPayments.sort((a, b) => b.createdAt - a.createdAt);

    // Calcular total de deuda
    const totalDebt = pendingPayments.reduce((sum, payment) => sum + payment.amount + payment.tip, 0);

    console.log(`✅ Total pagos pendientes: ${pendingPayments.length}, Deuda total: C$${totalDebt.toFixed(2)}`);
    console.log(`   - PostgreSQL: ${pendingPayments.filter(p => p.source === 'postgres').length}`);
    console.log(`   - Firebase: ${pendingPayments.filter(p => p.source === 'realtime').length}`);

    return {
      success: true,
      hasPendingPayments: pendingPayments.length > 0,
      totalDebt,
      count: pendingPayments.length,
      payments: pendingPayments
    };
  } catch (error: any) {
    console.error('❌ Error obteniendo pagos pendientes:', error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Procesar pago de una deuda pendiente
 */
export const processPendingPayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { rideId, paymentMethodId } = data;
  const userId = context.auth.uid;

  if (!rideId) {
    throw new functions.https.HttpsError("invalid-argument", "rideId es requerido");
  }

  try {
    console.log(`💳 Procesando pago pendiente para viaje: ${rideId}`);

    // Verificar que el viaje existe y pertenece al cliente
    const db = admin.database();
    let ride: any = null;
    let amount = 0;

    // Buscar en Realtime DB primero
    const activeRideSnapshot = await db.ref(`activeRides/${rideId}`).once('value');
    if (activeRideSnapshot.exists()) {
      ride = activeRideSnapshot.val();
      
      if (ride.clientId !== userId) {
        throw new functions.https.HttpsError("permission-denied", "No tienes permiso para pagar este viaje");
      }

      amount = ride.finalFare || ride.estimatedPrice || 0;
    } else {
      // Buscar en PostgreSQL
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM rides WHERE id = $1 AND client_id = $2',
          [rideId, userId]
        );

        if (result.rows.length === 0) {
          throw new functions.https.HttpsError("not-found", "Viaje no encontrado");
        }

        ride = result.rows[0];
        amount = parseFloat(ride.final_fare || ride.estimated_price || '0');
      } finally {
        client.release();
      }
    }

    // Crear Payment Intent con Stripe
    const stripe = require('stripe')(functions.config().stripe?.secret_key);
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convertir a centavos
      currency: 'nio',
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never'
      },
      metadata: {
        rideId,
        clientId: userId,
        type: 'pending_payment'
      }
    });

    if (paymentIntent.status === 'succeeded') {
      console.log(`✅ Pago pendiente procesado exitosamente: ${rideId}`);

      // Actualizar estado del viaje
      if (activeRideSnapshot.exists()) {
        await db.ref(`activeRides/${rideId}`).update({
          status: 'completed',
          paymentConfirmedAt: admin.database.ServerValue.TIMESTAMP,
          paymentIntentId: paymentIntent.id
        });

        await db.ref(`paymentStatus/${rideId}`).update({
          status: 'completed',
          paymentIntentId: paymentIntent.id,
          paidAt: admin.database.ServerValue.TIMESTAMP
        });
      } else {
        // Actualizar en PostgreSQL
        const client = await pool.connect();
        try {
          await client.query(
            `UPDATE payments 
             SET status = 'completed', 
                 stripe_payment_intent_id = $1,
                 paid_at = NOW()
             WHERE ride_id = $2`,
            [paymentIntent.id, rideId]
          );

          await client.query(
            `UPDATE rides 
             SET status = 'completed'
             WHERE id = $1`,
            [rideId]
          );
        } finally {
          client.release();
        }
      }

      return {
        success: true,
        message: 'Pago procesado exitosamente',
        paymentIntentId: paymentIntent.id,
        amount
      };
    } else {
      throw new functions.https.HttpsError("internal", "El pago no pudo ser procesado");
    }
  } catch (error: any) {
    console.error('❌ Error procesando pago pendiente:', error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});
