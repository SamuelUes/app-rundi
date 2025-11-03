/**
 * Utilidades para manejo de tarjetas
 * Validación y guardado de tarjetas en Supabase
 */

import cardsService, { Card, AddCardRequest } from '../services/cardsService';

let cardsCache: Card[] | null = null;

const normalizeCards = (cards: Card[]): Card[] => {
  cardsCache = cards;
  return cards;
};

const upsertCachedCard = (card: Card) => {
  if (!cardsCache) {
    cardsCache = [card];
    return;
  }

  const index = cardsCache.findIndex(c => c.id === card.id);
  if (index === -1) {
    cardsCache = [...cardsCache, card];
  } else {
    const updated = [...cardsCache];
    updated[index] = card;
    cardsCache = updated;
  }
};

const removeCachedCard = (cardId: string) => {
  if (!cardsCache) {
    return;
  }

  cardsCache = cardsCache.filter(card => card.id !== cardId);
};

export interface CardFormData {
  cardNumber: string;
  expMonth: string;
  expYear: string;
  cvv: string;
  cardholderName: string;
  bank: 'bac' | 'banpro' | 'lafise' | 'ficohsa' | 'avanz';
  brand: string;
}

export const saveCard = async (
  cardData: CardFormData,
  setAsDefault: boolean = false
): Promise<Card> => {
  const cleanedNumber = cardData.cardNumber.replace(/\s/g, '');

  const payload: AddCardRequest = {
    bank: cardData.bank,
    cardBrand: cardData.brand,
    last4: cleanedNumber.slice(-4),
    expMonth: Number(cardData.expMonth),
    expYear: Number(cardData.expYear),
    setAsDefault,
  };

  const savedCard = await cardsService.addCard(payload);
  upsertCachedCard(savedCard);
  return savedCard;
};

export const validateAndSaveCard = async (
  cardData: CardFormData,
  setAsDefault: boolean = false
): Promise<{ success: boolean; card: Card }> => {
  const savedCard = await saveCard(cardData, setAsDefault);

  return {
    success: true,
    card: savedCard,
  };
};

/**
 * Obtener tarjetas guardadas del usuario
 */
export const getCardsList = async (forceRefresh = false): Promise<Card[]> => {
  console.log(`📋 Obteniendo tarjetas guardadas...`);

  if (!forceRefresh && cardsCache) {
    return cardsCache;
  }

  const cards = await cardsService.getCards();
  return normalizeCards(cards);
};

export const hasSavedCard = async (forceRefresh = false): Promise<boolean> => {
  const cards = await getCardsList(forceRefresh);
  return cards.some(card => card.isActive !== false);
};

export const invalidateCardsCache = () => {
  cardsCache = null;
};

/**
 * Eliminar tarjeta
 */
export const deleteCard = async (cardId: string): Promise<void> => {
  console.log(`🗑️ Eliminando tarjeta: ${cardId}`);
  await cardsService.deleteCard(cardId);
  removeCachedCard(cardId);
};

/**
 * Establecer tarjeta como predeterminada
 */
export const setDefaultCard = async (cardId: string): Promise<void> => {
  console.log(`⭐ Estableciendo tarjeta predeterminada: ${cardId}`);
  const updatedCard = await cardsService.setDefaultCard(cardId);

  if (!cardsCache) {
    cardsCache = [updatedCard];
    return;
  }

  const updated = cardsCache.map(card =>
    card.id === updatedCard.id
      ? updatedCard
      : { ...card, isDefault: false }
  );

  cardsCache = upsertDefaults(updated, updatedCard.id);
};

const upsertDefaults = (cards: Card[], defaultCardId: string): Card[] =>
  cards.map(card => ({ ...card, isDefault: card.id === defaultCardId }));

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
