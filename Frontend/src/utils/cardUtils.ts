/**
 * Utilidades para manejo de tarjetas
 * Validación y guardado de tarjetas en Supabase
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { initializeFirebase } from '../config/firebase';

interface CardValidationData {
  cardNumber: string;
  expMonth: string;
  expYear: string;
  cvv: string;
  cardholderName: string;
  bank: 'bac' | 'banpro' | 'lafise' | 'ficohsa' | 'avanz';
}

interface ValidatedCardInfo {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  bank: string;
}

/**
 * Validar tarjeta localmente
 */
export const validateCard = async (cardData: CardValidationData): Promise<ValidatedCardInfo> => {
  try {
    console.log(`🔐 Validando y tokenizando tarjeta...`);

    const { app } = await initializeFirebase();
    if (!app) throw new Error('Firebase no inicializado');

    const functions = getFunctions(app);
    const validateCardFn = httpsCallable(functions, 'validateAndTokenizeCard');

    const result = await validateCardFn({
      cardNumber: cardData.cardNumber,
      expMonth: cardData.expMonth,
      expYear: cardData.expYear,
      cvv: cardData.cvv,
      cardholderName: cardData.cardholderName,
      bank: cardData.bank,
    });

    const data = result.data as any;

    if (!data.success) {
      throw new Error(data.message || 'Error validando tarjeta');
    }

    console.log(`✅ Tarjeta validada: ${JSON.stringify(data.cardInfo)}`);

    return data.cardInfo;
  } catch (error: any) {
    console.error('❌ Error validando tarjeta:', error.message);
    throw error;
  }
};

/**
 * Guardar tarjeta validada en Supabase
 */
export const saveCard = async (
  cardInfo: ValidatedCardInfo,
  setAsDefault: boolean = false
): Promise<any> => {
  try {
    console.log(`💾 Guardando tarjeta en Supabase...`);

    const { app } = await initializeFirebase();
    if (!app) throw new Error('Firebase no inicializado');

    const functions = getFunctions(app);
    const addCardFn = httpsCallable(functions, 'addCard');

    const result = await addCardFn({
      bank: cardInfo.bank,
      cardBrand: cardInfo.brand,
      last4: cardInfo.last4,
      expMonth: cardInfo.expMonth,
      expYear: cardInfo.expYear,
      setAsDefault: setAsDefault,
    });

    const data = result.data as any;

    if (!data.success) {
      throw new Error(data.message || 'Error guardando tarjeta');
    }

    console.log(`✅ Tarjeta guardada exitosamente: ${data.card.id}`);

    return data.card;
  } catch (error: any) {
    console.error('❌ Error guardando tarjeta:', error.message);
    throw error;
  }
};

/**
 * Validar y guardar tarjeta en un solo paso
 */
export const validateAndSaveCard = async (
  cardData: CardValidationData,
  setAsDefault: boolean = false
): Promise<any> => {
  try {
    // Paso 1: Validar
    const validatedCardInfo = await validateCard(cardData);

    // Paso 2: Guardar
    const savedCard = await saveCard(validatedCardInfo, setAsDefault);

    return {
      success: true,
      card: savedCard,
    };
  } catch (error: any) {
    console.error('❌ Error en validateAndSaveCard:', error.message);
    throw error;
  }
};

/**
 * Obtener tarjetas guardadas del usuario
 */
export const getCardsList = async (): Promise<any[]> => {
  try {
    console.log(`📋 Obteniendo tarjetas guardadas...`);

    const { app } = await initializeFirebase();
    if (!app) throw new Error('Firebase no inicializado');

    const functions = getFunctions(app);
    const getCardsFn = httpsCallable(functions, 'getCards');

    const result = await getCardsFn();
    const data = result.data as any;

    if (!data.success) {
      throw new Error(data.message || 'Error obteniendo tarjetas');
    }

    console.log(`✅ ${data.cards.length} tarjetas encontradas`);

    return data.cards;
  } catch (error: any) {
    console.error('❌ Error obteniendo tarjetas:', error.message);
    throw error;
  }
};

/**
 * Eliminar tarjeta
 */
export const deleteCard = async (cardId: string): Promise<void> => {
  try {
    console.log(`🗑️ Eliminando tarjeta: ${cardId}`);

    const { app } = await initializeFirebase();
    if (!app) throw new Error('Firebase no inicializado');

    const functions = getFunctions(app);
    const deleteCardFn = httpsCallable(functions, 'deleteCard');

    const result = await deleteCardFn({ cardId });
    const data = result.data as any;

    if (!data.success) {
      throw new Error(data.message || 'Error eliminando tarjeta');
    }

    console.log(`✅ Tarjeta eliminada exitosamente`);
  } catch (error: any) {
    console.error('❌ Error eliminando tarjeta:', error.message);
    throw error;
  }
};

/**
 * Establecer tarjeta como predeterminada
 */
export const setDefaultCard = async (cardId: string): Promise<void> => {
  try {
    console.log(`⭐ Estableciendo tarjeta predeterminada: ${cardId}`);

    const { app } = await initializeFirebase();
    if (!app) throw new Error('Firebase no inicializado');

    const functions = getFunctions(app);
    const setDefaultCardFn = httpsCallable(functions, 'setDefaultCard');

    const result = await setDefaultCardFn({ cardId });
    const data = result.data as any;

    if (!data.success) {
      throw new Error(data.message || 'Error estableciendo tarjeta predeterminada');
    }

    console.log(`✅ Tarjeta predeterminada establecida`);
  } catch (error: any) {
    console.error('❌ Error estableciendo tarjeta predeterminada:', error.message);
    throw error;
  }
};

/**
 * Formatear número de tarjeta para mostrar
 */
export const formatCardNumber = (cardNumber: string): string => {
  const cleaned = cardNumber.replace(/\D/g, '');
  return cleaned.replace(/(\d{4})/g, '$1 ').trim();
};

/**
 * Formatear fecha de expiración
 */
export const formatExpiryDate = (expiryDate: string): { month: string; year: string } => {
  const parts = expiryDate.split('/');
  return {
    month: parts[0] || '',
    year: parts[1] || '',
  };
};

/**
 * Validar formato de fecha de expiración (MM/YY o MM/YYYY)
 */
export const isValidExpiryFormat = (expiryDate: string): boolean => {
  const regex = /^(0[1-9]|1[0-2])\/(\d{2}|\d{4})$/;
  return regex.test(expiryDate);
};

/**
 * Validar CVV
 */
export const isValidCVV = (cvv: string): boolean => {
  return /^\d{3,4}$/.test(cvv);
};
