/**
 * Payments API - Migrado de Backend/src/payments/payments.service.ts
 * Firebase Functions implementation con Stripe
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
    const fareAmount = Math.round((ride.final_fare || ride.estimated_price) * 100);
    const tipAmount = Math.round(tip * 100);
    const totalAmount = fareAmount + tipAmount;

    // Crear Payment Intent en Stripe (PRE-AUTORIZACIÓN)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: "nio",
      capture_method: "manual", // NO capturar automáticamente
      metadata: {
        rideId: ride.id,
        clientId: ride.client_id,
        driverId: ride.driver_id || "",
        fare: (ride.final_fare || ride.estimated_price).toString(),
        tip: tip.toString(),
      },
      description: "Pre-autorización de viaje - DriveAngel.ni",
    });

    // Guardar en PostgreSQL
    const paymentResult = await client.query(
      `INSERT INTO payments (
        ride_id, amount, tip, payment_method, status, 
        stripe_payment_intent_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW()) 
      RETURNING *`,
      [
        rideId,
        totalAmount / 100,
        tip,
        PaymentMethod.CARD,
        PaymentStatus.PENDING,
        paymentIntent.id,
      ]
    );

    const payment = paymentResult.rows[0];

    console.log(`💳 Pre-autorización creada para viaje ${rideId}: C$${totalAmount / 100}`);

    return {
      success: true,
      clientSecret: paymentIntent.client_secret,
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

  const {rideId } = data;

  const client = await pool.connect();
  try {
    // Obtener pago
    const paymentResult = await client.query(
      "SELECT * FROM payments WHERE ride_id = $1",
      [rideId]
    );

    if (paymentResult.rows.length === 0) {
      throw new Error("Pago no encontrado para este viaje");
    }

    const payment = paymentResult.rows[0];

    if (payment.status === PaymentStatus.COMPLETED) {
      console.log(`⚠️ Pago ${payment.id} ya fue capturado`);
      return { success: true, payment };
    }

    // Capturar el pago en Stripe
    const paymentIntent = await stripe.paymentIntents.capture(
      payment.stripe_payment_intent_id
    );

    if (paymentIntent.status === "succeeded") {
      // Actualizar en PostgreSQL
      await client.query(
        `UPDATE payments 
         SET status = $1, paid_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [PaymentStatus.COMPLETED, payment.id]
      );

      console.log(`✅ Pago ${payment.id} capturado exitosamente: C$${payment.amount}`);

      return { success: true, payment };
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
