/**
 * DriverPenaltyRepository - Operaciones de penalizaciones
 */

import DriverPenalty from '../models/DriverPenalty';

export class DriverPenaltyRepository {
  async create(data: any): Promise<DriverPenalty> {
    return await DriverPenalty.create(data);
  }

  async findById(id: string): Promise<DriverPenalty | null> {
    return await DriverPenalty.findByPk(id);
  }

  async findByDriverId(driverId: string): Promise<DriverPenalty[]> {
    return await DriverPenalty.findAll({ where: { driver_id: driverId } });
  }

  async findByRideId(rideId: string): Promise<DriverPenalty | null> {
    return await DriverPenalty.findOne({ where: { ride_id: rideId } });
  }

  async findAll(): Promise<DriverPenalty[]> {
    return await DriverPenalty.findAll();
  }

  async update(id: string, data: any): Promise<DriverPenalty> {
    const penalty = await DriverPenalty.findByPk(id);
    if (!penalty) throw new Error('Penalización no encontrada');
    return await penalty.update(data);
  }

  async delete(id: string): Promise<boolean> {
    const result = await DriverPenalty.destroy({ where: { id } });
    return result > 0;
  }

  async findByStatus(status: string): Promise<DriverPenalty[]> {
    return await DriverPenalty.findAll({ where: { status } });
  }

  async findByPenaltyType(penaltyType: string): Promise<DriverPenalty[]> {
    return await DriverPenalty.findAll({ where: { penalty_type: penaltyType } });
  }

  async getTotalPenalties(driverId: string): Promise<number> {
    const penalties = await DriverPenalty.findAll({
      where: { driver_id: driverId, status: 'pending' },
    });
    return penalties.reduce((sum, p: any) => sum + parseFloat(p.amount), 0);
  }
}
