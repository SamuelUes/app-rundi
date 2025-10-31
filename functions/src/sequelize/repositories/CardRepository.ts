/**
 * CardRepository - Operaciones de tarjetas guardadas
 */

import Card from '../models/Card';

export class CardRepository {
  async create(data: any): Promise<Card> {
    return await Card.create(data);
  }

  async findById(id: string): Promise<Card | null> {
    return await Card.findByPk(id);
  }

  async findByUserId(userId: string): Promise<Card[]> {
    return await Card.findAll({ where: { user_id: userId }, order: [['created_at', 'DESC']] });
  }

  async findByLocalCardId(localCardId: string): Promise<Card | null> {
    return await Card.findOne({ where: { local_card_id: localCardId } });
  }

  async findDefault(userId: string): Promise<Card | null> {
    return await Card.findOne({ where: { user_id: userId, is_default: true } });
  }

  async findAll(): Promise<Card[]> {
    return await Card.findAll();
  }

  async update(id: string, data: any): Promise<Card> {
    const card = await Card.findByPk(id);
    if (!card) throw new Error('Tarjeta no encontrada');
    return await card.update(data);
  }

  async delete(id: string): Promise<boolean> {
    const result = await Card.destroy({ where: { id } });
    return result > 0;
  }

  async setDefault(cardId: string, userId: string): Promise<void> {
    await Card.update({ is_default: false }, { where: { user_id: userId } });
    await Card.update({ is_default: true }, { where: { id: cardId } });
  }
}
