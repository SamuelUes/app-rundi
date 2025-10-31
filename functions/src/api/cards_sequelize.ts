/**
 * Cards API - Versión Sequelize
 * Gestión de tarjetas guardadas
 */

import * as functions from 'firebase-functions';
import { CardRepository } from '../sequelize/repositories/CardRepository';

const cardRepo = new CardRepository();

/**
 * Agregar tarjeta
 */
export const addCard = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { localCardId, lastFour, expiryMonth, expiryYear, bankName } = data;
    const userId = context.auth.uid;

    if (!localCardId || !lastFour || !expiryMonth || !expiryYear || !bankName) {
      throw new functions.https.HttpsError('invalid-argument', 'Parámetros requeridos faltantes');
    }

    console.log(`💳 [addCard] Agregando tarjeta para usuario: ${userId}`);

    const card = await cardRepo.create({
      user_id: userId,
      local_card_id: localCardId,
      last_four_digits: lastFour,
      expiration_month: expiryMonth,
      expiration_year: expiryYear,
      bank_name: bankName,
      card_brand: 'local',
      is_default: false,
      is_active: true,
    });

    return {
      success: true,
      card: {
        id: card.id,
        lastFour: card.last_four_digits,
        bankName: card.bank_name,
        cardBrand: card.card_brand,
        isDefault: card.is_default,
        isActive: card.is_active,
        createdAt: card.created_at,
      },
    };
  } catch (error: any) {
    console.error('❌ [addCard] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener tarjetas del usuario
 */
export const getUserCards = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const userId = context.auth.uid;

    console.log(`💳 [getUserCards] Obteniendo tarjetas del usuario: ${userId}`);

    const cards = await cardRepo.findByUserId(userId);

    return {
      success: true,
      count: cards.length,
      cards: cards.map((c: any) => ({
        id: c.id,
        lastFour: c.last_four,
        expiryMonth: c.expiry_month,
        expiryYear: c.expiry_year,
        bankName: c.bank_name,
        isDefault: c.is_default,
      })),
    };
  } catch (error: any) {
    console.error('❌ [getUserCards] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Establecer tarjeta como predeterminada
 */
export const setDefaultCard = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { cardId } = data;
    const userId = context.auth.uid;

    if (!cardId) {
      throw new functions.https.HttpsError('invalid-argument', 'cardId es requerido');
    }

    console.log(`💳 [setDefaultCard] Estableciendo tarjeta predeterminada: ${cardId}`);

    await cardRepo.setDefault(cardId, userId);

    return {
      success: true,
      message: 'Tarjeta establecida como predeterminada',
    };
  } catch (error: any) {
    console.error('❌ [setDefaultCard] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Eliminar tarjeta
 */
export const deleteCard = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { cardId } = data;

    if (!cardId) {
      throw new functions.https.HttpsError('invalid-argument', 'cardId es requerido');
    }

    console.log(`🗑️ [deleteCard] Eliminando tarjeta: ${cardId}`);

    const deleted = await cardRepo.delete(cardId);

    if (!deleted) {
      throw new functions.https.HttpsError('not-found', 'Tarjeta no encontrada');
    }

    return {
      success: true,
      message: 'Tarjeta eliminada correctamente',
    };
  } catch (error: any) {
    console.error('❌ [deleteCard] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
