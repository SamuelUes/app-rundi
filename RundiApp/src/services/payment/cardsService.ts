/**
 * Cards Service — sin equivalente en v2: card_local va por webhook
 * PuntoExpress (sin tarjetas guardadas en el cliente). Stubs de compatibilidad.
 */

import i18n from '../../i18n';

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

const tr = (path: string) => i18n.t(`services.cardsService.${path}`) as string;
const unavailable = () => new Error(tr('errors.notAvailable') || 'Tarjetas guardadas no disponibles en esta versión');

class CardsService {
  async addCard(_cardData: AddCardRequest): Promise<Card> {
    throw unavailable();
  }

  async getCards(): Promise<Card[]> {
    return [];
  }

  async setDefaultCard(_cardId: string): Promise<Card> {
    throw unavailable();
  }

  async deleteCard(_cardId: string): Promise<void> {
    throw unavailable();
  }
}

export default new CardsService();
