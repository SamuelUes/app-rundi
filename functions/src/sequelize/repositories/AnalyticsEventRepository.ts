/**
 * AnalyticsEventRepository - Operaciones de eventos de analytics
 */

import AnalyticsEvent from '../models/AnalyticsEvent';

export class AnalyticsEventRepository {
  async create(data: any): Promise<AnalyticsEvent> {
    return await AnalyticsEvent.create(data);
  }

  async findById(id: string): Promise<AnalyticsEvent | null> {
    return await AnalyticsEvent.findByPk(id);
  }

  async findByUserId(userId: string): Promise<AnalyticsEvent[]> {
    return await AnalyticsEvent.findAll({ where: { user_id: userId }, order: [['timestamp', 'DESC']] });
  }

  async findByEventType(eventType: string): Promise<AnalyticsEvent[]> {
    return await AnalyticsEvent.findAll({ where: { event_type: eventType } });
  }

  async findAll(): Promise<AnalyticsEvent[]> {
    return await AnalyticsEvent.findAll();
  }

  async delete(id: string): Promise<boolean> {
    const result = await AnalyticsEvent.destroy({ where: { id } });
    return result > 0;
  }

  async deleteOlderThan(days: number): Promise<number> {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return await AnalyticsEvent.destroy({ where: { timestamp: { [require('sequelize').Op.lt]: date } } });
  }
}
