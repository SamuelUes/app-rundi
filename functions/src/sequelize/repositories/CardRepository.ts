/**
 * CardRepository - Operaciones de tarjetas guardadas
 */

import { Op } from 'sequelize';
import Card from '../models/Card';

export class CardRepository {
  async create(data: any): Promise<Card> {
    return await Card.create(data);
  }

  async findById(id: string): Promise<Card | null> {
    return await Card.findByPk(id);
  }

  async findByUserId(userId: string): Promise<Card[]> {
    return await Card.findAll({
      where: {
        user_id: userId,
        is_active: true,
      },
      order: [['created_at', 'DESC']],
    });
  }

  async findByLocalCardId(localCardId: string): Promise<Card | null> {
    return await Card.findOne({ where: { local_card_id: localCardId } });
  }

  async findDefault(userId: string): Promise<Card | null> {
    return await Card.findOne({
      where: {
        user_id: userId,
        is_default: true,
        is_active: true,
      },
    });
  }

  async findAll(): Promise<Card[]> {
    return await Card.findAll();
  }

  async update(id: string, data: any): Promise<Card> {
    const card = await Card.findByPk(id);
    if (!card) throw new Error('Tarjeta no encontrada');
    return await card.update({ ...data, updated_at: new Date() });
  }

  async delete(id: string): Promise<boolean> {
    const card = await Card.findByPk(id);
    if (!card) {
      return false;
    }

    await card.update({
      is_active: false,
      is_default: false,
      updated_at: new Date(),
    });

    return true;
  }

  async setDefault(cardId: string, userId: string): Promise<void> {
    const now = new Date();

    await Card.update(
      { is_default: false, updated_at: now },
      { where: { user_id: userId, is_active: true, id: { [Op.ne]: cardId } } }
    );

    await Card.update(
      { is_default: true, updated_at: now },
      { where: { id: cardId, user_id: userId, is_active: true } }
    );
  }
}
