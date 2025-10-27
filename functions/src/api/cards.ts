import * as functions from 'firebase-functions';

/**
 * ✅ ACTUALIZADO: Validación local de tarjetas (sin Stripe)
 * Solo bancos locales de Nicaragua
 */

/**
 * Validar tarjeta localmente
 * ✅ Sin Stripe - Solo validación básica
 */
export const validateAndTokenizeCard = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { cardNumber, expMonth, expYear, cvv, cardholderName, bank } = data;

  // Validaciones básicas
  if (!cardNumber || !expMonth || !expYear || !cvv || !cardholderName || !bank) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Todos los campos de la tarjeta son requeridos (incluido banco)'
    );
  }

  try {
    console.log(`💳 Validando tarjeta localmente para banco: ${bank}...`);

    // Validar número de tarjeta (Algoritmo de Luhn)
    const cleaned = cardNumber.replace(/\s/g, '');
    if (!validateCardNumber(cleaned)) {
      throw new Error('Número de tarjeta inválido');
    }

    // Validar fecha de expiración
    const expMonthNum = parseInt(expMonth);
    const expYearNum = parseInt(expYear);
    
    if (expMonthNum < 1 || expMonthNum > 12) {
      throw new Error('Mes de expiración inválido');
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    if (expYearNum < currentYear || (expYearNum === currentYear && expMonthNum < currentMonth)) {
      throw new Error('Tarjeta expirada');
    }

    // Validar CVV
    const expectedCVVLength = detectCardBrand(cleaned) === 'amex' ? 4 : 3;
    if (cvv.length !== expectedCVVLength) {
      throw new Error('CVV inválido');
    }

    const brand = detectCardBrand(cleaned);
    const last4 = cleaned.slice(-4);

    console.log(`✅ Tarjeta validada: ${brand} **** ${last4}`);

    return {
      success: true,
      cardInfo: {
        brand: brand,
        last4: last4,
        expMonth: expMonthNum,
        expYear: expYearNum,
        bank: bank,
      },
      message: 'Tarjeta validada exitosamente',
    };
  } catch (error: any) {
    console.error('❌ Error validando tarjeta:', error.message);
    throw new functions.https.HttpsError('invalid-argument', error.message);
  }
});

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

/**
 * ✅ NOTA: Las funciones addCard, getCards, deleteCard, setDefaultCard
 * ahora están en cardsManagement.ts usando Supabase
 * 
 * Esta función validateAndTokenizeCard es solo para validación local
 */

// ✅ DEPRECATED: createPaymentIntentWithSavedCard - Removida completamente
// Las tarjetas se guardan en Supabase con cardsManagement.ts
