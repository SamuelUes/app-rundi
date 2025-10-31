/**
 * Cards Service - Gestión de tarjetas guardadas
 */

import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../config/firebase';

export interface Card {
  id: string;
  cardNumber: string; // Enmascarada: ****1234
  cardHolder: string;
  expiryMonth: string;
  expiryYear: string;
  isDefault: boolean;
  createdAt: string;
}

export interface AddCardRequest {
  cardNumber: string;
  cardHolder: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  isDefault?: boolean;
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
      
      console.log(`💳 [cardsService] Agregando tarjeta para: ${cardData.cardHolder}`);
      
      const response = await addCardFn(cardData);
      const result = response.data as { success: boolean; card: Card };
      
      if (result.success) {
        console.log(`✅ Tarjeta agregada: ${result.card.cardNumber}`);
        return result.card;
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
      const result = response.data as { success: boolean; cards: Card[] };
      
      if (result.success) {
        console.log(`✅ Tarjetas obtenidas: ${result.cards.length}`);
        return result.cards;
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
      
      console.log(`💳 [cardsService] Estableciendo tarjeta por defecto: ${cardId}`);
      
      const response = await setDefaultCardFn({ cardId });
      const result = response.data as { success: boolean; card: Card };
      
      if (result.success) {
        console.log(`✅ Tarjeta por defecto actualizada`);
        return result.card;
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
  async deleteCard(cardId: string): Promise<{ success: boolean; message: string }> {
    try {
      const functions = await this.getFunctions();
      const deleteCardFn = httpsCallable(functions, 'deleteCard');
      
      console.log(`💳 [cardsService] Eliminando tarjeta: ${cardId}`);
      
      const response = await deleteCardFn({ cardId });
      const result = response.data as { success: boolean; message: string };
      
      if (result.success) {
        console.log(`✅ Tarjeta eliminada`);
        return result;
      } else {
        throw new Error('No se pudo eliminar la tarjeta');
      }
    } catch (error: any) {
      console.error('❌ Error eliminando tarjeta:', error.message);
      throw new Error(error.message || 'Error al eliminar tarjeta');
    }
  }
}

export default new CardsService();
