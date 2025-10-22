/**
 * Payments API - Migrado de Backend/src/payments/payments.service.ts
 * Firebase Functions implementation con Stripe
 * Actualizado con Zod validation y sistema de servicios
 */

import * as functions from "firebase-functions";
import pool from "../config/database";
import Stripe from "stripe";

// Inicializar Stripe
const stripeKey = process.env.STRIPE_SECRET_KEY || "";
const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

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
 * Crear Payment Intent (PRE-AUTORIZACIÓN)
 * Migrado de: Backend/src/payments/payments.service.ts -> createPaymentIntent()
 */
export const createPaymentIntent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { rideId, tip = 0, provider = 'stripe' } = data; // Agregar provider: 'stripe' | 'visanet'

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

    // Verificar estado del viaje
    if (ride.status !== "accepted" && ride.status !== "completed") {
      throw new Error("El viaje debe estar aceptado para autorizar el pago");
    }

    // Verificar si ya existe un payment intent
    const existingPayment = await client.query(
      "SELECT * FROM payments WHERE ride_id = $1",
      [rideId]
    );

    if (existingPayment.rows.length > 0) {
      const payment = existingPayment.rows[0];
      return {
        success: true,
        clientSecret: payment.stripe_payment_intent_id,
        paymentId: payment.id,
        amount: payment.amount,
      };
    }

    // Calcular monto total
    const fare = ride.final_fare || ride.estimated_price;
    const fareAmount = Math.round(fare * 100);
    const tipAmount = Math.round(tip * 100);
    const totalAmount = fareAmount + tipAmount;

    // Calcular comisión según tipo de viaje y vehículo
    // Importar función de cálculo de comisión
    const { getCommissionRate } = await import('../helpers/priceCalculator');
    
    const rideType = ride.ride_type || 'normal';
    const vehicleType = ride.vehicle_type || 'car'; // 'car' o 'motorcycle'
    const commissionRate = getCommissionRate(
      vehicleType as 'car' | 'motorcycle',
      rideType as 'normal' | 'designated_driver'
    );
    const commission = fare * commissionRate;

    let paymentIntentId: string;
    let transactionId: string | null = null;
    let paymentProvider: string;

    // Procesar según proveedor seleccionado
    if (provider === 'visanet') {
      // **VISANET - Tarjetas de bancos locales nicaragüenses**
      console.log(`🏦 [Visanet] Creando transacción para viaje ${rideId}...`);
      
      const { VisanetService } = await import('../services/visanetService');
      const visanet = new VisanetService();
      
      if (!visanet.isConfigured()) {
        throw new Error('Visanet no está configurado. Usa Stripe o efectivo.');
      }
      
      const transaction = await visanet.createTransaction({
        amount: totalAmount,
        currency: 'NIO',
        orderId: rideId,
        description: `Viaje DriveAngel - ${rideId}`,
        metadata: {
          rideId: ride.id,
          clientId: ride.client_id,
          driverId: ride.driver_id || "",
          fare: fare.toString(),
          tip: tip.toString(),
          commission: commission.toString(),
          rideType: rideType,
        },
      });
      
      transactionId = transaction.transactionId;
      paymentIntentId = transaction.transactionId; // Usar transactionId como paymentIntentId
      paymentProvider = 'visanet';
      
      console.log(`✅ [Visanet] Transacción autorizada: ${transactionId}`);
    } else {
      // **STRIPE - Tarjetas internacionales (default)**
      console.log(`💳 [Stripe] Creando Payment Intent para viaje ${rideId}...`);
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount: totalAmount,
        currency: "nio",
        capture_method: "manual", // NO capturar automáticamente
        metadata: {
          rideId: ride.id,
          clientId: ride.client_id,
          driverId: ride.driver_id || "",
          fare: fare.toString(),
          tip: tip.toString(),
          commission: commission.toString(),
          rideType: rideType,
        },
        description: "Pre-autorización de viaje - DriveAngel.ni",
      });
      
      paymentIntentId = paymentIntent.id;
      paymentProvider = 'stripe';
      
      console.log(`✅ [Stripe] Payment Intent creado: ${paymentIntentId}`);
    }

    // Guardar en PostgreSQL
    // amount = final_fare (sin tip)
    // tip = propina
    // commission = 10% o 15%
    // total = amount + tip (calculado automáticamente por la BD)
    const paymentResult = await client.query(
      `INSERT INTO payments (
        ride_id, amount, tip, commission, payment_method, payment_provider, status, 
        stripe_payment_intent_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) 
      RETURNING *`,
      [
        rideId,
        fare, // Solo el fare, sin tip
        tip,
        commission,
        PaymentMethod.CARD,
        paymentProvider,
        PaymentStatus.PENDING,
        paymentIntentId, // Puede ser Stripe PaymentIntent ID o Visanet Transaction ID
      ]
    );

    const payment = paymentResult.rows[0];

    console.log(`💳 Pre-autorización creada para viaje ${rideId}: C$${totalAmount / 100}`);

    // Actualizar Realtime DB
    const admin = require('firebase-admin');
    await admin.database().ref(`paymentStatus/${rideId}`).update({
      status: 'authorized',
      method: 'card',
      provider: paymentProvider,
      tip: tip,
      total: totalAmount / 100,
      paymentIntentId: paymentIntentId,
      transactionId: transactionId, // Solo para Visanet
      lastUpdatedBy: 'backend',
      lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
    });

    return {
      success: true,
      paymentIntentId: paymentIntentId,
      provider: paymentProvider,
      paymentId: payment.id,
      amount: totalAmount / 100,
    };
  } catch (error: any) {
    console.error("❌ Error creando payment intent:", error);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});

/**
 * Capturar pago cuando el viaje finaliza
 * Migrado de: Backend/src/payments/payments.service.ts -> capturePayment()
 */
export const capturePayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { rideId, tip } = data;
  const tipAmount = tip || 0;

  const client = await pool.connect();
  try {
    // Obtener paymentIntentId desde Realtime DB
    const admin = require('firebase-admin');
    const paymentStatusSnapshot = await admin.database().ref(`paymentStatus/${rideId}`).once('value');
    const paymentStatus = paymentStatusSnapshot.val();

    if (!paymentStatus) {
      throw new Error("Estado de pago no encontrado");
    }

    if (paymentStatus.status === 'completed') {
      console.log(`⚠️ Pago para viaje ${rideId} ya fue capturado`);
      return { success: true, message: 'Pago ya completado' };
    }

    const paymentIntentId = paymentStatus.paymentIntentId;
    if (!paymentIntentId) {
      throw new Error("Payment Intent ID no encontrado. El pago no fue pre-autorizado correctamente.");
    }

    const provider = paymentStatus.provider || 'stripe';

    // Actualizar monto si hay propina
    let finalAmount = paymentStatus.amount;
    if (tipAmount > 0) {
      finalAmount = paymentStatus.amount + tipAmount;
    }

    let captureSuccess = false;

    // Capturar según proveedor
    if (provider === 'visanet') {
      // **VISANET - Capturar transacción**
      console.log(`🏦 [Visanet] Capturando transacción ${paymentIntentId}...`);
      
      const { VisanetService } = await import('../services/visanetService');
      const visanet = new VisanetService();
      
      const transaction = await visanet.captureTransaction(
        paymentIntentId,
        Math.round(finalAmount * 100) // Monto en centavos
      );
      
      captureSuccess = transaction.status === 'captured';
      console.log(`✅ [Visanet] Transacción capturada: ${paymentIntentId}`);
    } else {
      // **STRIPE - Capturar Payment Intent**
      console.log(`💳 [Stripe] Capturando Payment Intent ${paymentIntentId}...`);
      
      // Actualizar monto si hay propina
      if (tipAmount > 0) {
        await stripe.paymentIntents.update(paymentIntentId, {
          amount: Math.round(finalAmount * 100), // Convertir a centavos
        });
      }
      
      const paymentIntent = await stripe.paymentIntents.capture(paymentIntentId);
      captureSuccess = paymentIntent.status === "succeeded";
      console.log(`✅ [Stripe] Payment Intent capturado: ${paymentIntentId}`);
    }

    if (captureSuccess) {
      // Actualizar en PostgreSQL (si existe el registro)
      await client.query(
        `UPDATE payments 
         SET status = $1, paid_at = NOW(), updated_at = NOW(), tip = $2, amount = $3
         WHERE ride_id = $4`,
        [PaymentStatus.COMPLETED, tipAmount, finalAmount, rideId]
      );

      console.log(`✅ Pago capturado exitosamente para viaje ${rideId}: C$${finalAmount.toFixed(2)}`);

      // Actualizar Realtime DB
      await admin.database().ref(`paymentStatus/${rideId}`).update({
        status: 'completed',
        finalAmount: finalAmount,
        tip: tipAmount,
        completedAt: admin.database.ServerValue.TIMESTAMP,
        lastUpdatedBy: 'backend',
        lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
      });

      return { 
        success: true, 
        amount: finalAmount,
        tip: tipAmount,
        paymentIntentId: paymentIntentId
      };
    } else {
      throw new Error("No se pudo capturar el pago");
    }
  } catch (error: any) {
    console.error("❌ Error capturando pago:", error);

    // Marcar como fallido
    await client.query(
      "UPDATE payments SET status = $1 WHERE ride_id = $2",
      [PaymentStatus.FAILED, rideId]
    );

    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});

/**
 * Cancelar autorización de pago
 * Migrado de: Backend/src/payments/payments.service.ts -> cancelPaymentAuthorization()
 */
export const cancelPaymentAuthorization = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const {rideId } = data;

  const client = await pool.connect();
  try {
    // Obtener pago
    const paymentResult = await client.query(
      "SELECT * FROM payments WHERE ride_id = $1",
      [rideId]
    );

    if (paymentResult.rows.length === 0) {
      console.log(`⚠️ No hay pago para cancelar en viaje ${rideId}`);
      return { success: true };
    }

    const payment = paymentResult.rows[0];

    if (payment.status === PaymentStatus.COMPLETED) {
      throw new Error("No se puede cancelar un pago ya completado");
    }

    // Cancelar en Stripe
    await stripe.paymentIntents.cancel(payment.stripe_payment_intent_id);

    // Actualizar en PostgreSQL
    await client.query(
      "UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2",
      [PaymentStatus.CANCELED, payment.id]
    );

    console.log(`🔄 Autorización de pago cancelada para viaje ${rideId}`);

    return { success: true };
  } catch (error: any) {
    console.error("❌ Error cancelando autorización:", error);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});

/**
 * Obtener detalles de un pago
 * Migrado de: Backend/src/payments/payments.service.ts -> getPaymentDetails()
 */
export const getPaymentDetails = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { paymentId } = data;

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT p.*, r.client_id, r.driver_id, r.status as ride_status
       FROM payments p
       JOIN rides r ON p.ride_id = r.id
       WHERE p.id = $1`,
      [paymentId]
    );

    if (result.rows.length === 0) {
      throw new Error("Pago no encontrado");
    }

    return {
      success: true,
      payment: result.rows[0],
    };
  } catch (error: any) {
    console.error("❌ Error obteniendo pago:", error);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});

/**
 * Registrar pago en efectivo
 * Nuevo: Para pagos en efectivo al conductor
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
        PaymentStatus.PENDING, // Se marcará como COMPLETED cuando el conductor confirme
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

  // Obtener datos del pago desde paymentStatus (más confiable que activeRides)
  const admin = require('firebase-admin');
  const paymentSnapshot = await admin.database().ref(`paymentStatus/${rideId}`).once('value');
  const paymentData = paymentSnapshot.val();

  console.log(`📦 [completeCashPayment] Datos de paymentStatus:`, paymentData);

  if (!paymentData) {
    throw new functions.https.HttpsError("not-found", "Estado de pago no encontrado");
  }

  // VALIDACIÓN: Verificar que AMBOS (cliente Y conductor) hayan confirmado
  const clientConfirmed = paymentData.confirmedByClient === true;
  const driverConfirmed = paymentData.confirmedBy === 'driver' || paymentData.status === 'payment_in_progress';

  console.log(`🔍 [completeCashPayment] Validando confirmaciones - Cliente: ${clientConfirmed}, Conductor: ${driverConfirmed}`);

  if (!driverConfirmed) {
    throw new functions.https.HttpsError("failed-precondition", "El conductor no ha confirmado el pago");
  }

  // Si el cliente NO confirmó, verificar si ya pasó el timeout (5 minutos)
  if (!clientConfirmed) {
    const confirmedAt = paymentData.confirmedAt || paymentData.lastUpdatedAt || Date.now();
    const timeoutMinutes = 5;
    const timeElapsed = Date.now() - confirmedAt;
    const timeoutMs = timeoutMinutes * 60 * 1000;

    if (timeElapsed < timeoutMs) {
      // Aún no ha pasado el timeout, rechazar
      throw new functions.https.HttpsError(
        "failed-precondition", 
        `El cliente aún no ha confirmado el pago. Espera ${Math.ceil((timeoutMs - timeElapsed) / 60000)} minutos o contacta al cliente.`
      );
    } else {
      // Ya pasó el timeout, proceder pero marcar como pago problemático
      console.log(`⚠️ [completeCashPayment] Cliente no confirmó después de ${timeoutMinutes} minutos. Procesando con comisión.`);
    }
  } else {
    console.log(`✅ [completeCashPayment] Ambos confirmaron el pago`);
  }

  // Intentar obtener datos del viaje desde activeRides (puede no existir si ya se completó)
  let ride = null;
  const rideSnapshot = await admin.database().ref(`activeRides/${rideId}`).once('value');
  ride = rideSnapshot.val();

  console.log(`📦 [completeCashPayment] Viaje en activeRides:`, ride ? 'Encontrado' : 'No encontrado');

  // Si no está en activeRides, buscar en completedRides
  if (!ride) {
    console.log(`🔍 [completeCashPayment] Buscando en completedRides...`);
    const completedSnapshot = await admin.database().ref(`completedRides/${rideId}`).once('value');
    ride = completedSnapshot.val();
    console.log(`📦 [completeCashPayment] Viaje en completedRides:`, ride ? 'Encontrado' : 'No encontrado');
  }

  if (!ride) {
    throw new functions.https.HttpsError("not-found", "Viaje no encontrado en activeRides ni completedRides");
  }

  const pgRideId = ride.pgRideId;
  const finalAmount = paymentData.finalAmount || ride.finalFare || ride.estimatedPrice || 0;
  const commission = finalAmount * (ride.isDesignatedDriver ? 0.15 : 0.10);

  console.log(`💰 [completeCashPayment] Monto final: C$${finalAmount}, Comisión: C$${commission}`);

  const client = await pool.connect();
  try {
    // Verificar si ya existe un pago para este viaje
    const existingPayment = await client.query(
      `SELECT id FROM payments WHERE ride_id = $1`,
      [pgRideId]
    );

    let result;
    if (existingPayment.rows.length > 0) {
      // Actualizar pago existente
      result = await client.query(
        `UPDATE payments 
         SET status = $1, paid_at = NOW(), updated_at = NOW()
         WHERE ride_id = $2
         RETURNING *`,
        [PaymentStatus.COMPLETED, pgRideId]
      );
    } else {
      // Crear nuevo pago
      result = await client.query(
        `INSERT INTO payments (
          ride_id, amount, tip, commission, payment_method, payment_provider, status, 
          paid_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING *`,
        [
          pgRideId,
          finalAmount,
          0, // tip
          commission,
          PaymentMethod.CASH,
          'cash',
          PaymentStatus.COMPLETED
        ]
      );
    }

    const payment = result.rows[0];

    console.log(`✅ Pago en efectivo confirmado para viaje ${rideId}: C$${payment.amount}`);

    // Actualizar Realtime DB - Marcar pago como completado
    const admin = require('firebase-admin');
    await admin.database().ref(`paymentStatus/${rideId}`).update({
      status: 'completed',
      completedAt: admin.database.ServerValue.TIMESTAMP,
      confirmedBy: 'driver',
      lastUpdatedBy: 'backend',
      lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
    });

    // Actualizar estado del viaje a 'completed' (ahora sí, pago confirmado)
    const rideRefActive = admin.database().ref(`activeRides/${rideId}`);
    const rideRefCompleted = admin.database().ref(`completedRides/${rideId}`);
    
    // Obtener datos del viaje
    const rideSnapshot = await rideRefActive.once('value');
    const rideData = rideSnapshot.val();
    
    if (rideData) {
      console.log(`🔄 [completeCashPayment] Moviendo viaje ${rideId} de activeRides a completedRides`);
      
      // Actualizar status a completed
      rideData.status = 'completed';
      rideData.paymentCompletedAt = admin.database.ServerValue.TIMESTAMP;
      
      // Mover a completedRides
      await rideRefCompleted.set(rideData);
      
      // Eliminar de activeRides
      await rideRefActive.remove();
      
      console.log(`✅ [completeCashPayment] Viaje ${rideId} movido a completedRides`);
    } else {
      console.log(`⚠️ [completeCashPayment] Viaje ${rideId} no encontrado en activeRides, puede estar ya completado`);
    }

    return {
      success: true,
      payment: result.rows[0],
    };
  } catch (error: any) {
    console.error("❌ Error completando pago en efectivo:", error);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
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
    console.log(`🔄 Cancelando pago en efectivo para viaje ${rideId}: ${reason}`);

    // Actualizar Realtime DB primero
    const admin = require('firebase-admin');
    await admin.database().ref(`paymentStatus/${rideId}`).update({
      status: 'canceled',
      cancelReason: reason,
      canceledAt: admin.database.ServerValue.TIMESTAMP,
      canceledBy: 'driver',
      lastUpdatedBy: 'backend',
      lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
    });

    // Obtener pgRideId desde Firebase
    const rideSnapshot = await admin.database().ref(`activeRides/${rideId}`).once('value');
    const ride = rideSnapshot.val();
    
    if (!ride) {
      console.log(`⚠️ Viaje ${rideId} no encontrado en activeRides, puede estar archivado`);
      return {
        success: true,
        message: 'Pago cancelado en Firebase (viaje no encontrado en PostgreSQL)',
      };
    }

    const pgRideId = ride.pgRideId;
    
    if (!pgRideId) {
      console.log(`⚠️ Viaje ${rideId} no tiene pgRideId, puede no estar en PostgreSQL aún`);
      return {
        success: true,
        message: 'Pago cancelado en Firebase (viaje no tiene pgRideId)',
      };
    }

    // Actualizar en PostgreSQL si existe
    const client = await pool.connect();
    try {
      const result = await client.query(
        `UPDATE payments 
         SET status = $1, cancel_reason = $2, updated_at = NOW()
         WHERE ride_id = $3 AND payment_method = $4
         RETURNING *`,
        [PaymentStatus.CANCELED, reason, pgRideId, PaymentMethod.CASH]
      );

      if (result.rows.length === 0) {
        console.log(`⚠️ Pago no encontrado en PostgreSQL para pgRideId: ${pgRideId}`);
      } else {
        console.log(`✅ Pago en efectivo cancelado en PostgreSQL para viaje ${rideId} (pgRideId: ${pgRideId})`);
      }

      return {
        success: true,
        payment: result.rows[0] || null,
      };
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("❌ Error cancelando pago en efectivo:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});
