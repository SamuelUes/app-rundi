/**
 * DriverPenaltyRepository - Operaciones de penalizaciones
 * @deprecated Legacy: reemplazado por DriverRechargeRepository + current_recharge_balance.
 * Mantener solo para rollback/manual troubleshooting.
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

  async getTotalPenalties(driverId: string) {
    const result = await DriverPenalty.sum('amount', {
      where: {
        driver_id: driverId,
        status: 'pending',
      },
    });
    return result || 0;
  }

  async getPendingSummary(driverId: string) {
    const penalties = await DriverPenalty.findAll({
      where: {
        driver_id: driverId,
        status: 'pending',
      },
      attributes: ['id', 'penalty_type', 'ride_id', 'amount', 'status'],
      order: [['created_at', 'DESC']],
    });

    const total = penalties.length;
    const commissionPenaltyTypes = new Set(['cash_commission_due']);
    const commission = penalties.filter((penalty: any) => commissionPenaltyTypes.has(String(penalty.penalty_type || '').toLowerCase()));

    return {
      total,
      penalties,
      commission,
    };
  }
}
