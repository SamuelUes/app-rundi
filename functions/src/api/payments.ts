/**
 * Payments API - Migrado de Backend/src/payments/payments.service.ts
 * Firebase Functions implementation con Stripe
 * Actualizado con Zod validation y sistema de servicios
 */

import * as functions from "firebase-functions";
import pool from "../config/database";
import Stripe from "stripe";
import { validateData } from "../utils/validation";
import { CreateCardPaymentIntentInputSchema } from "../schemas/payment.schema";

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

  // ✅ VALIDACIÓN CON ZOD
  const validatedData = validateData(CreateCardPaymentIntentInputSchema, data);
  const { rideId, tip = 0 } = validatedData;
  const provider = 'stripe'; // Por defecto usar Stripe

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
    let paymentProvider: string = provider; // 'stripe' por defecto

    // **STRIPE - Procesador de pagos principal**
    console.log(`💳 [Stripe] Creando Payment Intent para viaje ${rideId}...`);
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: "usd",
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

    // Actualizar monto si hay propina
    let finalAmount = paymentStatus.amount;
    if (tipAmount > 0) {
      finalAmount = paymentStatus.amount + tipAmount;
    }

    let captureSuccess = false;

    // **CAPTURAR PAYMENT INTENT (Bancos Nacionales)**
    console.log(`💳 [Bancos Locales] Capturando Payment Intent ${paymentIntentId}...`);
    
    // Actualizar monto si hay propina
    if (tipAmount > 0) {
      await stripe.paymentIntents.update(paymentIntentId, {
        amount: Math.round(finalAmount * 100), // Convertir a centavos
      });
    }
    
    const paymentIntent = await stripe.paymentIntents.capture(paymentIntentId);
    captureSuccess = paymentIntent.status === "succeeded";
    console.log(`✅ [Bancos Locales] Payment Intent capturado: ${paymentIntentId}`);

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
      // ✅ NUEVO: Actualizar Firebase también cuando falla
      await admin.database().ref(`paymentStatus/${rideId}`).update({
        status: 'failed',
        failureReason: 'Stripe capture failed',
        failedAt: admin.database.ServerValue.TIMESTAMP,
        lastUpdatedBy: 'backend',
        lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
      });
      
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
 * ✅ NUEVO: Actualiza status en activeRides para que no aparezca como viaje activo
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

    // ✅ NUEVO: Validar que paymentIntentId existe antes de cancelar
    if (!payment.stripe_payment_intent_id) {
      console.log(`⚠️ No hay Stripe Payment Intent para cancelar en viaje ${rideId}`);
      // Continuar sin error - el pago ya no existe
    } else {
      // Cancelar en Stripe con manejo de errores
      try {
        await stripe.paymentIntents.cancel(payment.stripe_payment_intent_id);
        console.log(`✅ Payment Intent cancelado en Stripe: ${payment.stripe_payment_intent_id}`);
      } catch (stripeError: any) {
        if (stripeError.code === 'resource_missing') {
          console.log(`⚠️ Payment Intent ya no existe en Stripe: ${payment.stripe_payment_intent_id}`);
          // Continuar - el pago ya fue cancelado
        } else {
          throw stripeError;
        }
      }
    }

    // Actualizar en PostgreSQL
    await client.query(
      "UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2",
      [PaymentStatus.CANCELED, payment.id]
    );

    console.log(`🔄 Autorización de pago cancelada para viaje ${rideId}`);

    // ✅ NUEVO: Actualizar status en Firebase para que no aparezca como viaje activo
    const admin = require('firebase-admin');
    
    // Actualizar en activeRides si existe
    const rideRefActive = admin.database().ref(`activeRides/${rideId}`);
    const rideSnapshot = await rideRefActive.once('value');
    const rideData = rideSnapshot.val();
    
    if (rideData) {
      console.log(`🔄 [cancelPaymentAuthorization] Actualizando status en activeRides para ${rideId}`);
      
      // ✅ NUEVO: Marcar como 'completed' pero con paymentStatus='cancelled'
      // Esto indica que el viaje se completó pero el pago fue cancelado
      // NO aparecerá como viaje activo en los home screens
      await rideRefActive.update({
        status: 'completed',
        paymentStatus: 'cancelled',
        paymentCancelledAt: admin.database.ServerValue.TIMESTAMP,
        lastUpdatedBy: 'backend',
        lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
      });
    }

    // Actualizar paymentStatus en Firebase
    await admin.database().ref(`paymentStatus/${rideId}`).update({
      status: 'cancelled',
      cancelledAt: admin.database.ServerValue.TIMESTAMP,
      lastUpdatedBy: 'backend',
      lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
    });

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

  // ✅ NUEVO: Validar que rideId es UUID válido (no Firebase ID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(rideId)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'rideId debe ser un UUID válido de PostgreSQL, no Firebase ID. Usa pgRideId de completeRide()'
    );
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

    // ✅ NUEVO: Sincronizar a Supabase de forma NO bloqueante (registerCashPayment)
    try {
      const { syncPaymentToSupabase } = await import('./supabasePaymentSync');
      // NO esperar - ejecutar en background
      syncPaymentToSupabase(payment.id).catch((err) => {
        console.error(`❌ Error sincronizando pago a Supabase (background):`, err);
        // Registrar para monitoreo pero no afectar el flujo principal
      });
    } catch (error) {
      console.error(`❌ Error iniciando sincronización:`, error);
      // No lanzar error - el pago ya se guardó en PostgreSQL
    }

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
 * 
 * ✅ NUEVO SISTEMA (2025-10-24):
 * - Este endpoint SOLO actualiza paymentStatus en Firebase
 * - El trigger onPaymentCompleted se dispara automáticamente
 * - El trigger archiva en Supabase automáticamente
 * - NO intentes archivar aquí
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

  // ✅ NUEVO SISTEMA: SOLO actualizar Firebase
  // El trigger onPaymentCompleted se dispara automáticamente y archiva en Supabase
  
  const admin = require('firebase-admin');
  const paymentSnapshot = await admin.database().ref(`paymentStatus/${rideId}`).once('value');
  const paymentData = paymentSnapshot.val();

  console.log(`📦 [completeCashPayment] Datos de paymentStatus:`, paymentData);

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

  // ✅ ACTUALIZAR paymentStatus a 'completed' en Firebase
  // Esto dispara el trigger onPaymentCompleted automáticamente
  console.log(`🔄 [completeCashPayment] Actualizando paymentStatus.status a 'completed'...`);
  await admin.database().ref(`paymentStatus/${rideId}`).update({
    status: 'completed',
    confirmedAt: admin.database.ServerValue.TIMESTAMP,
    lastUpdatedBy: 'backend',
    lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
  });

  console.log(`✅ [completeCashPayment] paymentStatus actualizado a 'completed'`);
  console.log(`   ⏳ El trigger onPaymentCompleted se disparará automáticamente...`);
  console.log(`   ⏳ El viaje se archivará en Supabase automáticamente...`);

  return {
    success: true,
    bothConfirmed: true,
    message: "Pago completado. El viaje se archivará automáticamente.",
    status: "pending_rating",
  };
});


/**
 * Cancelar pago en efectivo (conductor reporta problema)
 * ✅ MEJORADO: Garantiza que se guarde en PostgreSQL y Supabase
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

    // Obtener datos del viaje PRIMERO (antes de actualizar Realtime)
    const admin = require('firebase-admin');
    const rideSnapshot = await admin.database().ref(`activeRides/${rideId}`).once('value');
    let ride = rideSnapshot.val();
    
    if (!ride) {
      console.warn(`⚠️ [cancelCashPayment] Viaje ${rideId} no encontrado en activeRides`);
      // Intentar en completedRides
      const completedSnapshot = await admin.database().ref(`completedRides/${rideId}`).once('value');
      const completedRide = completedSnapshot.val();
      
      if (!completedRide) {
        throw new functions.https.HttpsError("not-found", "Viaje no encontrado en activeRides ni completedRides");
      }
      
      ride = completedRide;
    }

    let pgRideId = ride?.pgRideId;
    
    // ✅ MEJORADO: Si no existe pgRideId en Firebase, buscarlo en PostgreSQL
    if (!pgRideId) {
      console.log(`⚠️ [cancelCashPayment] pgRideId no encontrado en Firebase, buscando en PostgreSQL...`);
      
      try {
        const client = await pool.connect();
        try {
          // Buscar por clientId y driverId (más confiable que por rideId)
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
          } else {
            console.warn(`⚠️ [cancelCashPayment] No se encontró viaje en PostgreSQL para clientId=${ride.clientId}, driverId=${ride.driverId}`);
          }
        } finally {
          client.release();
        }
      } catch (dbError) {
        console.error(`❌ [cancelCashPayment] Error buscando en PostgreSQL:`, dbError);
      }
    }
    
    // ✅ VALIDACIÓN FINAL: Verificar que pgRideId existe
    if (!pgRideId) {
      console.error(`❌ [cancelCashPayment] pgRideId no encontrado para rideId: ${rideId}`);
      throw new functions.https.HttpsError("failed-precondition", "El viaje no tiene pgRideId. No se puede guardar la cancelación en PostgreSQL.");
    }

    console.log(`📋 [cancelCashPayment] Datos: rideId=${rideId}, pgRideId=${pgRideId}, reason=${reason}`);

    // Actualizar en PostgreSQL PRIMERO (más importante)
    const client = await pool.connect();
    let paymentUpdated = false;
    
    try {
      // ✅ MEJORADO: Intentar UPDATE primero, si no existe INSERT
      const existingPayment = await client.query(
        `SELECT id FROM payments WHERE ride_id = $1`,
        [pgRideId]
      );

      if (existingPayment.rows.length > 0) {
        // ✅ ACTUALIZAR pago existente
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
        } else {
          console.error(`❌ [cancelCashPayment] UPDATE no retornó filas para pgRideId: ${pgRideId}`);
        }
      } else {
        // ✅ INSERTAR nuevo pago cancelado (si no existe)
        console.log(`🆕 [cancelCashPayment] Pago no existe, INSERTANDO para pgRideId: ${pgRideId}`);
        
        const finalAmount = ride?.finalFare || ride?.estimatedPrice || 0;
        const commission = finalAmount * 0.15;
        
        const result = await client.query(
          `INSERT INTO payments (
            ride_id, amount, tip, commission, payment_method, payment_provider, status, 
            cancel_reason, notes, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
          RETURNING *`,
          [
            pgRideId,
            finalAmount,
            0, // tip
            commission,
            PaymentMethod.CASH,
            'cash',
            PaymentStatus.CANCELED,
            reason,
            'Pago cancelado por conductor'
          ]
        );

        if (result.rows.length > 0) {
          console.log(`✅ [cancelCashPayment] Pago INSERTADO en PostgreSQL: ${result.rows[0].id}`);
          paymentUpdated = true;
        } else {
          console.error(`❌ [cancelCashPayment] INSERT no retornó filas para pgRideId: ${pgRideId}`);
        }
      }
    } finally {
      client.release();
    }

    // Actualizar Realtime DB DESPUÉS de guardar en PostgreSQL
    console.log(`📝 [cancelCashPayment] Actualizando paymentStatus en Realtime DB`);
    await admin.database().ref(`paymentStatus/${rideId}`).update({
      status: 'canceled',
      cancelReason: reason,
      canceledAt: admin.database.ServerValue.TIMESTAMP,
      canceledBy: 'driver',
      lastUpdatedBy: 'backend',
      lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
    });

    // ✅ NUEVO: Sincronizar a Supabase de forma NO bloqueante
    if (paymentUpdated) {
      try {
        const { syncPaymentToSupabase } = await import('./supabasePaymentSync');
        // NO esperar - ejecutar en background
        // Necesitamos obtener el ID del pago para sincronizar
        const paymentResult = await pool.query(
          `SELECT id FROM payments WHERE ride_id = $1`,
          [pgRideId]
        );
        
        if (paymentResult.rows.length > 0) {
          const paymentId = paymentResult.rows[0].id;
          syncPaymentToSupabase(paymentId).catch((err) => {
            console.error(`❌ Error sincronizando pago cancelado a Supabase (background):`, err);
          });
          console.log(`✅ [cancelCashPayment] Sincronización a Supabase iniciada para paymentId: ${paymentId}`);
        }
      } catch (error) {
        console.warn(`⚠️ [cancelCashPayment] Error iniciando sincronización a Supabase:`, error);
        // No lanzar error - el pago ya se guardó en PostgreSQL
      }
    }

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
