/**
 * ServiceCommissionHistoryRepository - Operaciones de historial de comisiones
 */

import ServiceCommissionHistory from '../models/ServiceCommissionHistory';

export class ServiceCommissionHistoryRepository {
  async create(data: any): Promise<ServiceCommissionHistory> {
    return await ServiceCommissionHistory.create(data);
  }

  async findById(id: string): Promise<ServiceCommissionHistory | null> {
    return await ServiceCommissionHistory.findByPk(id);
  }

  async findByServiceId(serviceId: string): Promise<ServiceCommissionHistory[]> {
    return await ServiceCommissionHistory.findAll({ where: { service_id: serviceId }, order: [['changed_at', 'DESC']] });
  }

  async findAll(): Promise<ServiceCommissionHistory[]> {
    return await ServiceCommissionHistory.findAll();
  }

  async delete(id: string): Promise<boolean> {
    const result = await ServiceCommissionHistory.destroy({ where: { id } });
    return result > 0;
  }

  async getLatestRate(serviceId: string): Promise<number | null> {
    const history = await ServiceCommissionHistory.findOne({
      where: { service_id: serviceId },
      order: [['changed_at', 'DESC']],
    });
    return history ? parseFloat(history.new_commission_rate.toString()) : null;
  }

  async deleteOlderThan(days: number): Promise<number> {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return await ServiceCommissionHistory.destroy({ where: { changed_at: { [require('sequelize').Op.lt]: date } } });
  }
}
