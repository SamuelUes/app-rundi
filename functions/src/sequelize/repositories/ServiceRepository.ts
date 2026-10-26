/**
 * ServiceRepository - Operaciones de servicios
 */

import Service from '../models/Service';
import { Transaction } from 'sequelize';

export class ServiceRepository {
  async create(data: any): Promise<Service> {
    return await Service.create(data);
  }

  async findById(id: string): Promise<Service | null> {
    return await Service.findByPk(id);
  }

  async findByName(name: string): Promise<Service | null> {
    return await Service.findOne({ where: { name } });
  }

  async findByStatus(status: string): Promise<Service[]> {
    const isActive = String(status).toLowerCase() === 'active';
    return await Service.findAll({ where: { is_active: isActive } });
  }

  async findAll(): Promise<Service[]> {
    return await Service.findAll();
  }

  async findActive(): Promise<Service[]> {
    return await Service.findAll({ where: { is_active: true } });
  }

  async update(id: string, data: any, transaction?: Transaction): Promise<Service> {
    const service = await Service.findByPk(id, transaction ? { transaction } : undefined);
    if (!service) throw new Error('Servicio no encontrado');
    return await service.update(data, transaction ? { transaction } : undefined);
  }

  async delete(id: string): Promise<boolean> {
    const result = await Service.destroy({ where: { id } });
    return result > 0;
  }

  async getCommissionRate(serviceId: string): Promise<number | null> {
    const service = await Service.findByPk(serviceId);
    return service ? parseFloat(service.commission_rate.toString()) : null;
  }
}
