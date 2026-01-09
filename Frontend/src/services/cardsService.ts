/**
 * Cards Service - Gestión de tarjetas guardadas
 */

import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../config/firebase';

export interface Card {
  id: string;
  localCardId: string;
  bank: 'bac' | 'banpro' | 'lafise' | 'ficohsa' | 'avanz';
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
  isActive: boolean;
  createdAt?: string;
}

export interface AddCardRequest {
  bank: 'bac' | 'banpro' | 'lafise' | 'ficohsa' | 'avanz';
  cardBrand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  setAsDefault?: boolean;
}

class CardsService {
  private functions: any = null;

  private async getFunctions() {
    if (!this.functions) {
      this.functions = await getFirebaseFunctions();
    }
    return this.functions;
  }

  /**
   * Agregar nueva tarjeta
   */
  async addCard(cardData: AddCardRequest): Promise<Card> {
    try {
      const functions = await this.getFunctions();
      const addCardFn = httpsCallable(functions, 'addCard');

      console.log(`💳 [cardsService] Agregando tarjeta (${cardData.cardBrand}) banco ${cardData.bank}`);

      const response = await addCardFn(cardData);
      const result = response.data as { success: boolean; card: any };

      if (result.success) {
        const normalized: Card = {
          id: result.card.id,
          localCardId: result.card.localCardId,
          bank: result.card.bank,
          brand: result.card.brand,
          last4: result.card.last4,
          expMonth: Number(result.card.expMonth),
          expYear: Number(result.card.expYear),
          isDefault: Boolean(result.card.isDefault),
          isActive: result.card.isActive ?? true,
          createdAt: result.card.createdAt,
        };
        console.log(`✅ Tarjeta agregada: ${normalized.brand} ****${normalized.last4}`);
        return normalized;
      } else {
        throw new Error('No se pudo agregar la tarjeta');
      }
    } catch (error: any) {
      console.error('❌ Error agregando tarjeta:', error.message);
      throw new Error(error.message || 'Error al agregar tarjeta');
    }
  }

  /**
   * Obtener todas las tarjetas del usuario
   */
  async getCards(): Promise<Card[]> {
    try {
      const functions = await this.getFunctions();
      const getCardsFn = httpsCallable(functions, 'getCards');
      
      console.log(`💳 [cardsService] Obteniendo tarjetas del usuario`);
      
      const response = await getCardsFn({});
      const result = response.data as { success: boolean; cards: any[] };

      if (result.success) {
        const normalized = result.cards.map((card) => this.normalizeCard(card));
        console.log(`✅ Tarjetas obtenidas: ${normalized.length}`);
        return normalized;
      } else {
        return [];
      }
    } catch (error: any) {
      console.error('❌ Error obteniendo tarjetas:', error.message);
      // Retornar lista vacía en lugar de lanzar error
      return [];
    }
  }

  /**
   * Establecer tarjeta como por defecto
   */
  async setDefaultCard(cardId: string): Promise<Card> {
    try {
      const functions = await this.getFunctions();
      const setDefaultCardFn = httpsCallable(functions, 'setDefaultCard');


      const response = await setDefaultCardFn({ cardId });
      const result = response.data as { success: boolean; card: any };

      if (result.success) {
        const normalized = this.normalizeCard({
          ...result.card,
          expMonth: result.card.expMonth ?? 0,
          expYear: result.card.expYear ?? 0,
          isDefault: true,
        });
        console.log(`✅ Tarjeta por defecto actualizada`);
        return normalized;
      } else {
        throw new Error('No se pudo establecer la tarjeta por defecto');
      }
    } catch (error: any) {
      console.error('❌ Error estableciendo tarjeta por defecto:', error.message);
      throw new Error(error.message || 'Error al establecer tarjeta por defecto');
    }
  }

  /**
   * Eliminar tarjeta
   */
  async deleteCard(cardId: string): Promise<void> {
    try {
      const functions = await this.getFunctions();
      const deleteCardFn = httpsCallable(functions, 'deleteCard');

      console.log(`💳 [cardsService] Eliminando tarjeta: ${cardId}`);

      const response = await deleteCardFn({ cardId });
      const result = response.data as { success: boolean; message: string };

      if (!result.success) {
        throw new Error(result.message || 'No se pudo eliminar la tarjeta');
      }

      console.log(`✅ Tarjeta eliminada`);
    } catch (error: any) {
      console.error('❌ Error eliminando tarjeta:', error.message);
      throw new Error(error.message || 'Error al eliminar tarjeta');
    }
  }

  /**
   * Normalizar respuesta de tarjeta
   */
  private normalizeCard(card: any): Card {
    return {
      id: card.id,
      localCardId: card.localCardId,
      bank: card.bank,
      brand: card.brand,
      last4: card.last4,
      expMonth: Number(card.expMonth),
      expYear: Number(card.expYear),
      isDefault: Boolean(card.isDefault),
      isActive: card.isActive ?? true,
      createdAt: card.createdAt,
    };
  }
}

export default new CardsService();
