/**
 * Payments API - ✅ ACTUALIZADO: Sin Stripe
 * Solo pagos en efectivo y con bancos locales
 * 
 * Funciones:
 * - registerCashPayment: Registrar pago en efectivo
 * - completeCashPayment: Completar pago en efectivo
 * - cancelCashPayment: Cancelar pago en efectivo
 */

import * as functions from "firebase-functions";
import pool from "../config/database";

enum PaymentStatus {
  PENDING = "pending",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELED = "canceled",
}

enum PaymentMethod {
  CARD = "card",
  CASH = "cash",
}

/**
 * Registrar pago en efectivo
 */
export const registerCashPayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { rideId, tip = 0 } = data;

  if (!rideId) {
    throw new functions.https.HttpsError("invalid-argument", "rideId es requerido");
  }

  const client = await pool.connect();
  try {
    // Obtener viaje
    const rideResult = await client.query(
      "SELECT * FROM rides WHERE id = $1",
      [rideId]
    );

    if (rideResult.rows.length === 0) {
      throw new Error("Viaje no encontrado");
    }

    const ride = rideResult.rows[0];
    const fare = parseFloat(ride.final_fare || ride.estimated_price || "0");
    const commission = fare * 0.10; // 10% comisión

    // Registrar pago en efectivo en PostgreSQL
    const paymentResult = await client.query(
      `INSERT INTO payments (
        ride_id, amount, tip, commission, payment_method, status, 
        created_at, paid_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) 
      RETURNING *`,
      [
        rideId,
        fare,
        tip,
        commission,
        PaymentMethod.CASH,
        PaymentStatus.PENDING,
      ]
    );

    const payment = paymentResult.rows[0];

    console.log(`💵 Pago en efectivo registrado para viaje ${rideId}: C$${fare + tip}`);

    // Actualizar Realtime DB
    const admin = require('firebase-admin');
    await admin.database().ref(`paymentStatus/${rideId}`).update({
      status: 'pending_confirmation',
      method: 'cash',
      provider: 'cash',
      tip: tip,
      total: fare + tip,
      lastUpdatedBy: 'backend',
      lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
    });

    return {
      success: true,
      payment: {
        id: payment.id,
        amount: fare,
        tip: tip,
        total: fare + tip,
        method: 'cash',
      },
    };
  } catch (error: any) {
    console.error("❌ Error registrando pago en efectivo:", error);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});

/**
 * Completar pago en efectivo (conductor confirma que recibió el dinero)
 */
export const completeCashPayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { rideId } = data;

  if (!rideId) {
    throw new functions.https.HttpsError("invalid-argument", "rideId es requerido");
  }

  console.log(`💵 [completeCashPayment] Procesando pago para rideId: ${rideId}`);

  const admin = require('firebase-admin');
  const paymentSnapshot = await admin.database().ref(`paymentStatus/${rideId}`).once('value');
  const paymentData = paymentSnapshot.val();

  if (!paymentData) {
    throw new functions.https.HttpsError("not-found", "Estado de pago no encontrado");
  }

  // VALIDACIÓN: Verificar que AMBOS (cliente Y conductor) hayan confirmado
  const clientConfirmed = paymentData.confirmedByClient === true;
  const driverConfirmed = paymentData.confirmedByDriver === true;

  console.log(`🔍 [completeCashPayment] Validando confirmaciones - Cliente: ${clientConfirmed}, Conductor: ${driverConfirmed}`);

  if (!clientConfirmed || !driverConfirmed) {
    throw new functions.https.HttpsError(
      "failed-precondition", 
      `Ambos deben confirmar. Cliente: ${clientConfirmed}, Conductor: ${driverConfirmed}`
    );
  }

  console.log(`✅ [completeCashPayment] Ambos confirmaron el pago`);

  // Actualizar paymentStatus a 'completed' en Firebase
  console.log(`🔄 [completeCashPayment] Actualizando paymentStatus.status a 'completed'...`);
  await admin.database().ref(`paymentStatus/${rideId}`).update({
    status: 'completed',
    confirmedAt: admin.database.ServerValue.TIMESTAMP,
    lastUpdatedBy: 'backend',
    lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
  });

  console.log(`✅ [completeCashPayment] paymentStatus actualizado a 'completed'`);

  return {
    success: true,
    bothConfirmed: true,
    message: "Pago completado exitosamente.",
    status: "pending_rating",
  };
});

/**
 * Cancelar pago en efectivo (conductor reporta problema)
 */
export const cancelCashPayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { rideId, reason } = data;

  if (!rideId) {
    throw new functions.https.HttpsError("invalid-argument", "rideId es requerido");
  }

  try {
    console.log(`❌ [cancelCashPayment] Cancelando pago para viaje ${rideId}: ${reason}`);

    // Obtener datos del viaje
    const admin = require('firebase-admin');
    const rideSnapshot = await admin.database().ref(`activeRides/${rideId}`).once('value');
    let ride = rideSnapshot.val();
    
    if (!ride) {
      console.warn(`⚠️ [cancelCashPayment] Viaje ${rideId} no encontrado en activeRides`);
      const completedSnapshot = await admin.database().ref(`completedRides/${rideId}`).once('value');
      const completedRide = completedSnapshot.val();
      
      if (!completedRide) {
        throw new functions.https.HttpsError("not-found", "Viaje no encontrado");
      }
      
      ride = completedRide;
    }

    let pgRideId = ride?.pgRideId;
    
    // Si no existe pgRideId en Firebase, buscarlo en PostgreSQL
    if (!pgRideId) {
      console.log(`⚠️ [cancelCashPayment] pgRideId no encontrado en Firebase, buscando en PostgreSQL...`);
      
      try {
        const client = await pool.connect();
        try {
          const result = await client.query(
            `SELECT id FROM rides 
             WHERE client_id = $1 AND driver_id = $2 
             ORDER BY created_at DESC 
             LIMIT 1`,
            [ride.clientId, ride.driverId]
          );
          
          if (result.rows.length > 0) {
            pgRideId = result.rows[0].id;
            console.log(`✅ [cancelCashPayment] pgRideId encontrado en PostgreSQL: ${pgRideId}`);
          }
        } finally {
          client.release();
        }
      } catch (dbError) {
        console.error(`❌ [cancelCashPayment] Error buscando en PostgreSQL:`, dbError);
      }
    }
    
    // Validación final
    if (!pgRideId) {
      console.error(`❌ [cancelCashPayment] pgRideId no encontrado para rideId: ${rideId}`);
      throw new functions.https.HttpsError("failed-precondition", "El viaje no tiene pgRideId.");
    }

    console.log(`📋 [cancelCashPayment] Datos: rideId=${rideId}, pgRideId=${pgRideId}, reason=${reason}`);

    // Actualizar en PostgreSQL
    const client = await pool.connect();
    let paymentUpdated = false;
    
    try {
      const existingPayment = await client.query(
        `SELECT id FROM payments WHERE ride_id = $1`,
        [pgRideId]
      );

      if (existingPayment.rows.length > 0) {
        // Actualizar pago existente
        console.log(`🔄 [cancelCashPayment] Pago existe, ACTUALIZANDO para pgRideId: ${pgRideId}`);
        const result = await client.query(
          `UPDATE payments 
           SET status = $1, cancel_reason = $2, updated_at = NOW()
           WHERE ride_id = $3
           RETURNING *`,
          [PaymentStatus.CANCELED, reason, pgRideId]
        );

        if (result.rows.length > 0) {
          console.log(`✅ [cancelCashPayment] Pago ACTUALIZADO en PostgreSQL: ${result.rows[0].id}`);
          paymentUpdated = true;
        }
      } else {
        // Insertar nuevo pago cancelado
        console.log(`🆕 [cancelCashPayment] Pago no existe, INSERTANDO para pgRideId: ${pgRideId}`);
        
        const finalAmount = ride?.finalFare || ride?.estimatedPrice || 0;
        const commission = finalAmount * 0.10;
        
        const result = await client.query(
          `INSERT INTO payments (
            ride_id, amount, tip, commission, payment_method, status, 
            cancel_reason, notes, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
          RETURNING *`,
          [
            pgRideId,
            finalAmount,
            0,
            commission,
            PaymentMethod.CASH,
            PaymentStatus.CANCELED,
            reason,
            'Pago cancelado por conductor'
          ]
        );

        if (result.rows.length > 0) {
          console.log(`✅ [cancelCashPayment] Pago INSERTADO en PostgreSQL: ${result.rows[0].id}`);
          paymentUpdated = true;
        }
      }
    } finally {
      client.release();
    }

    // Actualizar Realtime DB
    console.log(`📝 [cancelCashPayment] Actualizando paymentStatus en Realtime DB`);
    await admin.database().ref(`paymentStatus/${rideId}`).update({
      status: 'canceled',
      cancelReason: reason,
      canceledAt: admin.database.ServerValue.TIMESTAMP,
      canceledBy: 'driver',
      lastUpdatedBy: 'backend',
      lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
    });

    return {
      success: true,
      message: 'Pago cancelado exitosamente',
      rideId,
      pgRideId,
      reason,
      paymentUpdated,
    };
  } catch (error: any) {
    console.error("❌ [cancelCashPayment] Error cancelando pago:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});
