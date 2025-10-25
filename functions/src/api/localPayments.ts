/**
 * Local Payments API - Pagos con bancos locales de Nicaragua
 */

import * as functions from 'firebase-functions';
import pool from '../config/database';
import {
  createLocalPaymentAuthorization,
  LocalBank,
  LocalPaymentRequest,
} from '../utils/localPaymentUtils';

/**
 * Cambiar método de pago de Stripe a Banco Local
 */
export const switchToLocalPayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const {
    rideId,
    bank, // 'bac', 'banpro', 'lafise', 'ficohsa', 'avanz'
    cardNumber,
    cardHolder,
    expiryMonth,
    expiryYear,
    cvv,
  } = data;

  const clientId = context.auth.uid;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Obtener viaje
    const rideResult = await client.query(
      `SELECT * FROM rides WHERE id = $1 AND client_id = $2`,
      [rideId, clientId]
    );

    if (rideResult.rows.length === 0) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    const ride = rideResult.rows[0];

    // Obtener payment existente
    const paymentResult = await client.query(
      `SELECT * FROM payments WHERE ride_id = $1`,
      [rideId]
    );

    if (paymentResult.rows.length === 0) {
      throw new functions.https.HttpsError('not-found', 'Payment no encontrado');
    }

    const payment = paymentResult.rows[0];

    // Validar que el payment esté en estado 'pending'
    if (payment.status !== 'pending') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'El pago ya fue procesado o cancelado'
      );
    }

    // Cancelar pre-autorización de Stripe si existe
    if (payment.payment_provider === 'stripe' && payment.stripe_payment_intent_id) {
      console.log(`❌ Cancelando pre-autorización de Stripe: ${payment.stripe_payment_intent_id}`);
      
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (stripeSecretKey) {
        const stripe = require('stripe')(stripeSecretKey);
        await stripe.paymentIntents.cancel(payment.stripe_payment_intent_id);
        console.log(`✅ Pre-autorización de Stripe cancelada`);
      } else {
        console.warn(`⚠️ STRIPE_SECRET_KEY no configurada, no se puede cancelar pre-autorización`);
      }
    }

    // Crear pre-autorización con banco local
    console.log(`🏦 Creando pre-autorización con ${bank.toUpperCase()}...`);

    const localPaymentRequest: LocalPaymentRequest = {
      amount: payment.amount + payment.tip,
      currency: 'NIO',
      bank: bank as LocalBank,
      cardNumber,
      cardHolder,
      expiryMonth,
      expiryYear,
      cvv,
      metadata: {
        rideId,
        clientId,
        driverId: ride.driver_id,
        fare: payment.amount.toString(),
        tip: payment.tip.toString(),
        commission: payment.commission.toString(),
      },
    };

    const localPaymentResponse = await createLocalPaymentAuthorization(localPaymentRequest);

    if (!localPaymentResponse.success) {
      throw new functions.https.HttpsError(
        'internal',
        `Error creando pre-autorización con ${bank}: ${localPaymentResponse.error}`
      );
    }

    // Actualizar payment con datos del banco local
    await client.query(
      `UPDATE payments 
       SET payment_method = $1, 
           payment_provider = $2, 
           local_transaction_id = $3,
           local_authorization_code = $4,
           local_bank = $5,
           stripe_payment_intent_id = NULL,
           updated_at = NOW()
       WHERE id = $6`,
      [
        bank,
        'local',
        localPaymentResponse.transactionId,
        localPaymentResponse.authorizationCode,
        bank,
        payment.id,
      ]
    );

    await client.query('COMMIT');

    console.log(`✅ Método de pago cambiado a ${bank.toUpperCase()} para viaje ${rideId}`);

    return {
      success: true,
      message: `Método de pago cambiado a ${bank.toUpperCase()} exitosamente`,
      transactionId: localPaymentResponse.transactionId,
      authorizationCode: localPaymentResponse.authorizationCode,
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('❌ Error cambiando método de pago:', error);

    if (error.code) {
      throw error;
    }

    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

/**
 * Obtener bancos locales disponibles
 */
export const getAvailableBanks = functions.https.onCall(async (data, context) => {
  // Lista de bancos soportados en Nicaragua
  const banks = [
    {
      id: 'bac',
      name: 'BAC',
      fullName: 'Banco de América Central',
      logo: 'https://example.com/logos/bac.png',
      available: true,
    },
    {
      id: 'banpro',
      name: 'Banpro',
      fullName: 'Banco de la Producción',
      logo: 'https://example.com/logos/banpro.png',
      available: true,
    },
    {
      id: 'lafise',
      name: 'Lafise Bancentro',
      fullName: 'Lafise Bancentro',
      logo: 'https://example.com/logos/lafise.png',
      available: true,
    },
    {
      id: 'ficohsa',
      name: 'Ficohsa',
      fullName: 'Banco Ficohsa',
      logo: 'https://example.com/logos/ficohsa.png',
      available: true,
    },
    {
      id: 'avanz',
      name: 'Avanz',
      fullName: 'Banco Avanz',
      logo: 'https://example.com/logos/avanz.png',
      available: true,
    },
  ];

  return {
    success: true,
    banks,
  };
});
