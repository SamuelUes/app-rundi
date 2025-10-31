/**
 * Cards Management API
 * Gestión de tarjetas guardadas del usuario
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
    const userId = context.auth.uid;
    const {
      cardNumber,
      cardHolder,
      expiryMonth,
      expiryYear,
      cvv,
      isDefault = false,
    } = data;

    // Validar datos
    if (!cardNumber || !cardHolder || !expiryMonth || !expiryYear || !cvv) {
      throw new functions.https.HttpsError('invalid-argument', 'Todos los campos de la tarjeta son requeridos');
    }

    console.log(`💳 [addCard] Agregando tarjeta para usuario: ${userId}`);

    // Crear tarjeta en Supabase
    const card = await cardRepo.create({
      user_id: userId,
      card_number: cardNumber,
      card_holder: cardHolder,
      expiry_month: expiryMonth,
      expiry_year: expiryYear,
      cvv: cvv,
      is_default: isDefault,
      created_at: new Date(),
    });

    return {
      success: true,
      card: {
        id: (card as any).id,
        cardNumber: `****${cardNumber.slice(-4)}`,
        cardHolder: (card as any).card_holder,
        expiryMonth: (card as any).expiry_month,
        expiryYear: (card as any).expiry_year,
        isDefault: (card as any).is_default,
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
export const getCards = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  try {
    const userId = context.auth.uid;
    console.log(`💳 [getCards] Obteniendo tarjetas para usuario: ${userId}`);

    const cards = await cardRepo.findByUserId(userId);

    return {
      success: true,
      cards: cards.map((c: any) => ({
        id: c.id,
        cardNumber: `****${c.card_number.slice(-4)}`,
        cardHolder: c.card_holder,
        expiryMonth: c.expiry_month,
        expiryYear: c.expiry_year,
        isDefault: c.is_default,
        createdAt: c.created_at,
      })),
    };
  } catch (error: any) {
    console.error('❌ [getCards] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Establecer tarjeta por defecto
 */
export const setDefaultCard = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  try {
    const userId = context.auth.uid;
    const { cardId } = data;

    if (!cardId) {
      throw new functions.https.HttpsError('invalid-argument', 'cardId es requerido');
    }

    console.log(`💳 [setDefaultCard] Estableciendo tarjeta por defecto: ${cardId}`);

    // Obtener todas las tarjetas del usuario
    const cards = await cardRepo.findByUserId(userId);

    // Desmarcar todas como por defecto
    for (const card of cards) {
      if (card.is_default) {
        await cardRepo.update(card.id, { is_default: false });
      }
    }

    // Marcar la seleccionada como por defecto
    const updatedCard = await cardRepo.update(cardId, { is_default: true });

    return {
      success: true,
      card: {
        id: (updatedCard as any).id,
        cardNumber: `****${(updatedCard as any).card_number.slice(-4)}`,
        isDefault: (updatedCard as any).is_default,
      },
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
    const userId = context.auth.uid;
    const { cardId } = data;

    if (!cardId) {
      throw new functions.https.HttpsError('invalid-argument', 'cardId es requerido');
    }

    console.log(`💳 [deleteCard] Eliminando tarjeta: ${cardId}`);

    // Verificar que la tarjeta pertenece al usuario
    const card = await cardRepo.findById(cardId);
    if (!card || card.user_id !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'No tienes permiso para eliminar esta tarjeta');
    }

    // Eliminar tarjeta
    await cardRepo.delete(cardId);

    return {
      success: true,
      message: 'Tarjeta eliminada correctamente',
    };
  } catch (error: any) {
    console.error('❌ [deleteCard] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
