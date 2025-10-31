/**
 * DesignatedDriverInspectionRepository - Operaciones de inspecciones
 */

import DesignatedDriverInspection from '../models/DesignatedDriverInspection';

export class DesignatedDriverInspectionRepository {
  async create(data: any): Promise<DesignatedDriverInspection> {
    return await DesignatedDriverInspection.create(data);
  }

  async findById(id: string): Promise<DesignatedDriverInspection | null> {
    return await DesignatedDriverInspection.findByPk(id);
  }

  async findByRideId(rideId: string): Promise<DesignatedDriverInspection | null> {
    return await DesignatedDriverInspection.findOne({ where: { ride_id: rideId } });
  }

  async findByDriverId(driverId: string): Promise<DesignatedDriverInspection[]> {
    return await DesignatedDriverInspection.findAll({ where: { driver_id: driverId } });
  }

  async findByStatus(status: string): Promise<DesignatedDriverInspection[]> {
    return await DesignatedDriverInspection.findAll({ where: { status } });
  }

  async findAll(): Promise<DesignatedDriverInspection[]> {
    return await DesignatedDriverInspection.findAll();
  }

  async update(id: string, data: any): Promise<DesignatedDriverInspection> {
    const inspection = await DesignatedDriverInspection.findByPk(id);
    if (!inspection) throw new Error('Inspección no encontrada');
    return await inspection.update(data);
  }

  async delete(id: string): Promise<boolean> {
    const result = await DesignatedDriverInspection.destroy({ where: { id } });
    return result > 0;
  }
}
