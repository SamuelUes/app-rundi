/**
 * Cards Management API
 * Gestión de tarjetas guardadas del usuario
 */

import * as functions from 'firebase-functions';
import { v4 as uuidv4 } from 'uuid';
import { CardRepository } from '../sequelize/repositories/CardRepository';

const SUPPORTED_BANKS = ['bac', 'banpro', 'lafise', 'ficohsa', 'avanz'];

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
      bank,
      cardBrand,
      last4,
      expMonth,
      expYear,
      setAsDefault = false,
    } = data;

    // Validar datos
    if (!bank || !cardBrand || !last4 || !expMonth || !expYear) {
      throw new functions.https.HttpsError('invalid-argument', 'Datos incompletos para guardar la tarjeta');
    }

    if (String(last4).length !== 4) {
      throw new functions.https.HttpsError('invalid-argument', 'Los últimos 4 dígitos deben tener longitud 4');
    }

    if (!SUPPORTED_BANKS.includes(bank)) {
      throw new functions.https.HttpsError('invalid-argument', 'Banco no soportado');
    }

    if (Number(expMonth) < 1 || Number(expMonth) > 12) {
      throw new functions.https.HttpsError('invalid-argument', 'Mes de expiración inválido');
    }

    if (Number(expYear) < 2000) {
      throw new functions.https.HttpsError('invalid-argument', 'Año de expiración inválido');
    }

    console.log(`💳 [addCard] Agregando tarjeta para usuario: ${userId}`);

    const localCardId = `local_${bank}_${uuidv4()}`;

    // Crear tarjeta en Supabase
    const card = await cardRepo.create({
      user_id: userId,
      local_card_id: localCardId,
      bank_name: bank,
      card_brand: cardBrand,
      last_four_digits: String(last4),
      expiration_month: Number(expMonth),
      expiration_year: Number(expYear),
      is_default: Boolean(setAsDefault),
      created_at: new Date(),
      updated_at: new Date(),
    });

    if (setAsDefault) {
      await cardRepo.setDefault(card.id, userId);
    }

    return {
      success: true,
      card: {
        id: (card as any).id,
        localCardId,
        bank,
        brand: cardBrand,
        last4: String(last4),
        expMonth: Number(expMonth),
        expYear: Number(expYear),
        isDefault: Boolean(setAsDefault),
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
        localCardId: c.local_card_id,
        bank: c.bank_name,
        brand: c.card_brand,
        last4: c.last_four_digits,
        expMonth: c.expiration_month,
        expYear: c.expiration_year,
        isDefault: c.is_default,
        isActive: c.is_active,
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

    await cardRepo.setDefault(cardId, userId);

    const updatedCard = await cardRepo.findById(cardId);
    if (!updatedCard) {
      throw new functions.https.HttpsError('not-found', 'Tarjeta no encontrada');
    }

    return {
      success: true,
      card: {
        id: updatedCard.id,
        localCardId: updatedCard.local_card_id,
        last4: updatedCard.last_four_digits,
        bank: updatedCard.bank_name,
        brand: updatedCard.card_brand,
        isDefault: updatedCard.is_default,
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

    // Eliminar tarjeta (soft delete)
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
