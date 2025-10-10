/**
 * Stripe Webhook Handler
 * Procesa eventos de Stripe (pagos, reembolsos, etc.)
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import pool from "../config/database";
import Stripe from "stripe";

// Inicializar Stripe
const stripeKey = process.env.STRIPE_SECRET_KEY || "";
const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

// Webhook Secret (obtener de Stripe Dashboard)
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

export const handler = functions.https.onRequest(async (req, res) => {
  const sig = req.headers["stripe-signature"];

  if (!sig) {
    console.error("❌ No signature header");
    res.status(400).send("No signature");
    return;
  }

  let event: Stripe.Event;

  try {
    // Verificar la firma del webhook
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      webhookSecret
    );
  } catch (err: any) {
    console.error("❌ Error verificando webhook:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  console.log(`🪝 Webhook recibido: ${event.type}`);

  const client = await pool.connect();
  try {
    // Procesar según el tipo de evento
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent, client);
        break;

      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent, client);
        break;

      case "payment_intent.canceled":
        await handlePaymentIntentCanceled(event.data.object as Stripe.PaymentIntent, client);
        break;

      case "charge.refunded":
        await handleChargeRefunded(event.data.object as Stripe.Charge, client);
        break;

      default:
        console.log(`⚠️ Evento no manejado: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error("❌ Error procesando webhook:", error);
    res.status(500).send("Error procesando webhook");
  } finally {
    client.release();
  }
});

/**
 * Manejar pago exitoso
 */
async function handlePaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent,
  client: any
) {
  console.log(`✅ Pago exitoso: ${paymentIntent.id}`);

  const rideId = paymentIntent.metadata.rideId;

  if (!rideId) {
    console.error("❌ No rideId en metadata");
    return;
  }

  // Actualizar pago en PostgreSQL
  await client.query(
    `UPDATE payments 
     SET status = 'completed', paid_at = NOW(), updated_at = NOW()
     WHERE stripe_payment_intent_id = $1`,
    [paymentIntent.id]
  );

  // Actualizar viaje
  await client.query(
    `UPDATE rides 
     SET payment_status = 'completed', updated_at = NOW()
     WHERE id = $1`,
    [rideId]
  );

  // Crear notificación para el cliente
  const ride = await client.query("SELECT client_id FROM rides WHERE id = $1", [rideId]);
  if (ride.rows.length > 0) {
    const clientId = ride.rows[0].client_id;
    
    await admin.firestore()
      .collection("notifications")
      .doc(clientId)
      .collection("items")
      .add({
        type: "payment_success",
        title: "Pago exitoso",
        body: `Tu pago de C$${paymentIntent.amount / 100} fue procesado exitosamente`,
        data: { rideId, amount: paymentIntent.amount / 100 },
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  console.log(`✅ Pago procesado para viaje ${rideId}`);
}

/**
 * Manejar pago fallido
 */
async function handlePaymentIntentFailed(
  paymentIntent: Stripe.PaymentIntent,
  client: any
) {
  console.log(`❌ Pago fallido: ${paymentIntent.id}`);

  const rideId = paymentIntent.metadata.rideId;

  if (!rideId) {
    console.error("❌ No rideId en metadata");
    return;
  }

  // Actualizar pago en PostgreSQL
  await client.query(
    `UPDATE payments 
     SET status = 'failed', updated_at = NOW()
     WHERE stripe_payment_intent_id = $1`,
    [paymentIntent.id]
  );

  // Crear notificación para el cliente
  const ride = await client.query("SELECT client_id FROM rides WHERE id = $1", [rideId]);
  if (ride.rows.length > 0) {
    const clientId = ride.rows[0].client_id;
    
    await admin.firestore()
      .collection("notifications")
      .doc(clientId)
      .collection("items")
      .add({
        type: "payment_failed",
        title: "Pago fallido",
        body: "Hubo un problema procesando tu pago. Por favor intenta de nuevo.",
        data: { rideId },
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  console.log(`❌ Pago fallido para viaje ${rideId}`);
}

/**
 * Manejar pago cancelado
 */
async function handlePaymentIntentCanceled(
  paymentIntent: Stripe.PaymentIntent,
  client: any
) {
  console.log(`🔄 Pago cancelado: ${paymentIntent.id}`);

  const rideId = paymentIntent.metadata.rideId;

  if (!rideId) {
    console.error("❌ No rideId en metadata");
    return;
  }

  // Actualizar pago en PostgreSQL
  await client.query(
    `UPDATE payments 
     SET status = 'canceled', updated_at = NOW()
     WHERE stripe_payment_intent_id = $1`,
    [paymentIntent.id]
  );

  console.log(`🔄 Pago cancelado para viaje ${rideId}`);
}

/**
 * Manejar reembolso
 */
async function handleChargeRefunded(
  charge: Stripe.Charge,
  client: any
) {
  console.log(`💸 Reembolso procesado: ${charge.id}`);

  // Buscar el payment intent asociado
  const paymentIntentId = charge.payment_intent as string;

  if (!paymentIntentId) {
    console.error("❌ No payment intent en charge");
    return;
  }

  // Actualizar pago en PostgreSQL
  await client.query(
    `UPDATE payments 
     SET status = 'refunded', updated_at = NOW()
     WHERE stripe_payment_intent_id = $1`,
    [paymentIntentId]
  );

  // Obtener rideId
  const payment = await client.query(
    "SELECT ride_id FROM payments WHERE stripe_payment_intent_id = $1",
    [paymentIntentId]
  );

  if (payment.rows.length > 0) {
    const rideId = payment.rows[0].ride_id;

    // Crear notificación
    const ride = await client.query("SELECT client_id FROM rides WHERE id = $1", [rideId]);
    if (ride.rows.length > 0) {
      const clientId = ride.rows[0].client_id;
      
      await admin.firestore()
        .collection("notifications")
        .doc(clientId)
        .collection("items")
        .add({
          type: "payment_refunded",
          title: "Reembolso procesado",
          body: `Tu reembolso de C$${charge.amount_refunded / 100} ha sido procesado`,
          data: { rideId, amount: charge.amount_refunded / 100 },
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }

    console.log(`💸 Reembolso procesado para viaje ${rideId}`);
  }
}
