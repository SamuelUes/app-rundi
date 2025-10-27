/**
 * CARDS MANAGEMENT - Gestión de tarjetas bancarias locales
 * 
 * ✅ ACTUALIZADO: Solo bancos locales de Nicaragua (sin Stripe)
 * 
 * Funciones:
 * - addCard: Guardar una tarjeta en Supabase
 * - getCards: Obtener tarjetas del usuario
 * - deleteCard: Eliminar una tarjeta
 * - setDefaultCard: Establecer tarjeta como predeterminada
 */

import * as functions from "firebase-functions";
import pool from "../config/database";

// Bancos locales soportados
const LOCAL_BANKS = {
  bac: "BAC",
  banpro: "Banpro",
  lafise: "Lafise",
  ficohsa: "Ficohsa",
  avanz: "Avanz",
};

/**
 * Agregar una tarjeta guardada
 * Solo se guardan: últimos 4 dígitos, fecha de expiración, banco
 * ✅ Sin Stripe - Solo bancos locales
 */
export const addCard = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const userId = context.auth.uid;
  const {
    bank,
    cardBrand,
    last4,
    expMonth,
    expYear,
    setAsDefault,
  } = data;

  // Validar datos requeridos
  if (!bank || !cardBrand || !last4 || !expMonth || !expYear) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Faltan datos requeridos"
    );
  }

  // Validar que el banco sea soportado
  if (!Object.keys(LOCAL_BANKS).includes(bank)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `Banco no soportado. Bancos disponibles: ${Object.keys(LOCAL_BANKS).join(", ")}`
    );
  }

  const client = await pool.connect();
  try {
    console.log(`💳 [addCard] Guardando tarjeta para usuario: ${userId}`);
    console.log(`   Banco: ${LOCAL_BANKS[bank as keyof typeof LOCAL_BANKS]}, Marca: ${cardBrand}, Últimos 4: ${last4}`);

    // Si es la tarjeta predeterminada, desactivar otras
    if (setAsDefault) {
      console.log(`   ⭐ Estableciendo como tarjeta predeterminada`);
      await client.query(
        `UPDATE public.cards 
         SET is_default = FALSE 
         WHERE user_id = $1 AND is_active = TRUE`,
        [userId]
      );
    }

    // Insertar la nueva tarjeta
    // ✅ Sin Stripe - Solo datos locales
    const localCardId = `local_${bank}_${Date.now()}`;
    const result = await client.query(
      `INSERT INTO public.cards (
        user_id,
        local_card_id,
        last_four_digits,
        expiration_month,
        expiration_year,
        bank_name,
        card_brand,
        is_default,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, last_four_digits, expiration_month, expiration_year, bank_name, card_brand, is_default, created_at`,
      [
        userId,
        localCardId,
        last4,
        parseInt(expMonth),
        parseInt(expYear),
        LOCAL_BANKS[bank as keyof typeof LOCAL_BANKS],
        cardBrand,
        setAsDefault || false,
        true,
      ]
    );

    if (!result.rows || result.rows.length === 0) {
      throw new Error("No se pudo guardar la tarjeta");
    }

    const card = result.rows[0];
    console.log(`✅ [addCard] Tarjeta guardada: ${card.id}`);

    return {
      success: true,
      card: {
        id: card.id,
        lastFour: card.last_four_digits,
        expMonth: card.expiration_month,
        expYear: card.expiration_year,
        bank: card.bank_name,
        brand: card.card_brand,
        isDefault: card.is_default,
        createdAt: card.created_at,
      },
    };
  } catch (error: any) {
    console.error(`❌ [addCard] Error:`, error.message);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});

/**
 * Obtener tarjetas del usuario
 */
export const getCards = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const userId = context.auth.uid;

  const client = await pool.connect();
  try {
    console.log(`📋 [getCards] Obteniendo tarjetas para usuario: ${userId}`);

    const result = await client.query(
      `SELECT 
        id,
        last_four_digits,
        expiration_month,
        expiration_year,
        bank_name,
        card_brand,
        is_default,
        created_at,
        updated_at
       FROM public.cards
       WHERE user_id = $1 AND is_active = TRUE
       ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );

    const cards = result.rows.map((row) => ({
      id: row.id,
      lastFour: row.last_four_digits,
      expMonth: row.expiration_month,
      expYear: row.expiration_year,
      bank: row.bank_name,
      brand: row.card_brand,
      isDefault: row.is_default,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    console.log(`✅ [getCards] ${cards.length} tarjetas encontradas`);

    return {
      success: true,
      cards,
      count: cards.length,
    };
  } catch (error: any) {
    console.error(`❌ [getCards] Error:`, error.message);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});

/**
 * Eliminar una tarjeta (soft delete)
 */
export const deleteCard = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const userId = context.auth.uid;
  const { cardId } = data;

  if (!cardId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "cardId es requerido"
    );
  }

  const client = await pool.connect();
  try {
    console.log(`🗑️ [deleteCard] Eliminando tarjeta: ${cardId}`);

    // Verificar que la tarjeta pertenece al usuario
    const checkResult = await client.query(
      `SELECT id, is_default FROM public.cards WHERE id = $1 AND user_id = $2`,
      [cardId, userId]
    );

    if (checkResult.rows.length === 0) {
      throw new functions.https.HttpsError(
        "not-found",
        "Tarjeta no encontrada"
      );
    }

    const card = checkResult.rows[0];

    // Soft delete: marcar como inactiva
    await client.query(
      `UPDATE public.cards SET is_active = FALSE WHERE id = $1`,
      [cardId]
    );

    console.log(`✅ [deleteCard] Tarjeta eliminada: ${cardId}`);

    // Si era la tarjeta predeterminada, establecer otra como predeterminada
    if (card.is_default) {
      console.log(`   ⭐ Era la tarjeta predeterminada, buscando otra...`);
      const newDefaultResult = await client.query(
        `SELECT id FROM public.cards 
         WHERE user_id = $1 AND is_active = TRUE AND id != $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId, cardId]
      );

      if (newDefaultResult.rows.length > 0) {
        await client.query(
          `UPDATE public.cards SET is_default = TRUE WHERE id = $1`,
          [newDefaultResult.rows[0].id]
        );
        console.log(`   ✅ Nueva tarjeta predeterminada establecida`);
      }
    }

    return {
      success: true,
      message: "Tarjeta eliminada correctamente",
    };
  } catch (error: any) {
    console.error(`❌ [deleteCard] Error:`, error.message);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});

/**
 * Establecer tarjeta como predeterminada
 */
export const setDefaultCard = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const userId = context.auth.uid;
  const { cardId } = data;

  if (!cardId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "cardId es requerido"
    );
  }

  const client = await pool.connect();
  try {
    console.log(`⭐ [setDefaultCard] Estableciendo tarjeta predeterminada: ${cardId}`);

    // Verificar que la tarjeta pertenece al usuario
    const checkResult = await client.query(
      `SELECT id FROM public.cards WHERE id = $1 AND user_id = $2 AND is_active = TRUE`,
      [cardId, userId]
    );

    if (checkResult.rows.length === 0) {
      throw new functions.https.HttpsError(
        "not-found",
        "Tarjeta no encontrada"
      );
    }

    // Desactivar otras tarjetas predeterminadas
    await client.query(
      `UPDATE public.cards SET is_default = FALSE WHERE user_id = $1`,
      [userId]
    );

    // Establecer esta como predeterminada
    await client.query(
      `UPDATE public.cards SET is_default = TRUE WHERE id = $1`,
      [cardId]
    );

    console.log(`✅ [setDefaultCard] Tarjeta predeterminada establecida`);

    return {
      success: true,
      message: "Tarjeta establecida como predeterminada",
    };
  } catch (error: any) {
    console.error(`❌ [setDefaultCard] Error:`, error.message);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});
