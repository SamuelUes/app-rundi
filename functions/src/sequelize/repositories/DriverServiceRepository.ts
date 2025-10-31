/**
 * DriverServiceRepository - Operaciones de servicios de conductores
 */

import DriverService from '../models/DriverService';

export class DriverServiceRepository {
  async create(data: any): Promise<DriverService> {
    return await DriverService.create(data);
  }

  async findById(id: string): Promise<DriverService | null> {
    return await DriverService.findByPk(id);
  }

  async findByDriverId(driverId: string): Promise<DriverService[]> {
    return await DriverService.findAll({ where: { driver_id: driverId } });
  }

  async findByServiceId(serviceId: string): Promise<DriverService[]> {
    return await DriverService.findAll({ where: { service_id: serviceId } });
  }

  async findByStatus(status: string): Promise<DriverService[]> {
    return await DriverService.findAll({ where: { status } });
  }

  async findAll(): Promise<DriverService[]> {
    return await DriverService.findAll();
  }

  async findActive(): Promise<DriverService[]> {
    return await DriverService.findAll({ where: { status: 'active' } });
  }

  async update(id: string, data: any): Promise<DriverService> {
    const driverService = await DriverService.findByPk(id);
    if (!driverService) throw new Error('Servicio de conductor no encontrado');
    return await driverService.update(data);
  }

  async delete(id: string): Promise<boolean> {
    const result = await DriverService.destroy({ where: { id } });
    return result > 0;
  }

  async findByDriverAndService(driverId: string, serviceId: string): Promise<DriverService | null> {
    return await DriverService.findOne({ where: { driver_id: driverId, service_id: serviceId } });
  }
}
