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
 * Procesar pago con Banco Local
 * ✅ ACTUALIZADO: Solo bancos locales (sin Stripe)
 * ✅ VALIDACIONES: Número, CVV, Fecha de expiración
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

  // ✅ VALIDACIONES DE TARJETA (ANTES de conectar a BD)
  try {
    // Validar que todos los datos estén presentes
    if (!cardNumber || !expiryMonth || !expiryYear || !cvv || !cardHolder || !bank) {
      throw new Error('Todos los campos de la tarjeta son requeridos');
    }

    // Validar número de tarjeta (Luhn)
    const cleaned = cardNumber.replace(/\s/g, '');
    if (!validateCardNumber(cleaned)) {
      throw new Error('Número de tarjeta inválido');
    }

    // Validar CVV
    const cardBrand = detectCardBrand(cleaned);
    const expectedCVVLength = cardBrand === 'amex' ? 4 : 3;
    if (cvv.length !== expectedCVVLength) {
      throw new Error(`CVV inválido. ${cardBrand === 'amex' ? 'Amex requiere 4 dígitos' : 'Otros requieren 3 dígitos'}`);
    }

    // Validar fecha de expiración
    const expMonthNum = parseInt(expiryMonth);
    const expYearNum = parseInt(expiryYear);
    
    if (expMonthNum < 1 || expMonthNum > 12) {
      throw new Error('Mes de expiración inválido (1-12)');
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    if (expYearNum < currentYear || (expYearNum === currentYear && expMonthNum < currentMonth)) {
      throw new Error('Tarjeta expirada');
    }

    console.log(`✅ Tarjeta validada: ${cardBrand} ****${cleaned.slice(-4)}`);
  } catch (validationError: any) {
    throw new functions.https.HttpsError('invalid-argument', validationError.message);
  }

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
           updated_at = NOW()
       WHERE id = $6`,
      [
        'card',
        'local',
        localPaymentResponse.transactionId,
        localPaymentResponse.authorizationCode,
        bank,
        payment.id,
      ]
    );

    await client.query('COMMIT');

    console.log(`✅ Pago procesado con ${bank.toUpperCase()} para viaje ${rideId}`);

    return {
      success: true,
      message: `Pago procesado con ${bank.toUpperCase()} exitosamente`,
      transactionId: localPaymentResponse.transactionId,
      authorizationCode: localPaymentResponse.authorizationCode,
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('❌ Error procesando pago:', error);

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

// ============================================
// FUNCIONES DE VALIDACIÓN
// ============================================

/**
 * Validar número de tarjeta usando Algoritmo de Luhn
 */
function validateCardNumber(number: string): boolean {
  if (!/^\d{13,19}$/.test(number)) return false;

  let sum = 0;
  let isEven = false;

  for (let i = number.length - 1; i >= 0; i--) {
    let digit = parseInt(number[i]);

    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

/**
 * Detectar marca de tarjeta por número
 */
function detectCardBrand(cardNumber: string): string {
  const cleaned = cardNumber.replace(/\s/g, '');
  
  if (/^4/.test(cleaned)) return 'visa';
  if (/^5[1-5]/.test(cleaned)) return 'mastercard';
  if (/^3[47]/.test(cleaned)) return 'amex';
  if (/^6(?:011|5)/.test(cleaned)) return 'discover';
  
  return 'unknown';
}
