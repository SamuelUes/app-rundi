import { useEffect, useState, useCallback } from 'react';
import { getCardsList } from '../../../utils/cardUtils';
import type { Card as SavedCard } from '../../../services/cardsService';

export function useSavedCards() {
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<SavedCard | null>(null);
  const [useNewCard, setUseNewCard] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadSavedCards = useCallback(async () => {
    try {
      const cards = await getCardsList(true);

      if (cards && cards.length > 0) {
        setSavedCards(cards);
        const defaultCard = cards.find((card) => card.isDefault);
        if (defaultCard) {
          setSelectedCard(defaultCard);
          setUseNewCard(false);
        }
      } else {
        setUseNewCard(true);
      }
    } catch (error: any) {
      console.error('Error cargando tarjetas:', error);
      setUseNewCard(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSavedCards();
  }, [loadSavedCards]);

  return {
    savedCards,
    selectedCard,
    setSelectedCard,
    useNewCard,
    setUseNewCard,
    loading,
    reload: loadSavedCards,
  };
}
