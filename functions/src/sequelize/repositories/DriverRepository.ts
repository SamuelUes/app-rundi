/**
 * DriverRepository - Data Access Layer para conductores
 */

import Driver from '../models/Driver';
import { Op } from 'sequelize';

export class DriverRepository {
  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private async findByIdOrUserId(identifier: string) {
    if (!identifier || typeof identifier !== 'string') return null;

    const normalized = identifier.trim();
    if (!normalized) return null;

    if (this.isUuid(normalized)) {
      const byPk = await Driver.findByPk(normalized);
      if (byPk) return byPk;
    }

    return await Driver.findOne({ where: { user_id: normalized } });
  }

  async create(data: any) {
    return await Driver.create(data);
  }

  async findById(id: string) {
    console.log(`🔍 [DriverRepository.findById] Buscando conductor por ID: ${id}`);
    const driver = await Driver.findByPk(id);
    console.log(`📦 [DriverRepository.findById] Resultado:`, driver ? driver.toJSON() : null);
    return driver;
  }

  async findByUserId(userId: string) {
    console.log(`🔍 [DriverRepository.findByUserId] Buscando conductor por user_id: ${userId}`);
    const driver = await Driver.findOne({
      where: { user_id: userId },
    });
    if (driver) {
      const driverJson = driver.toJSON();
      console.log(`✅ [DriverRepository.findByUserId] Conductor encontrado:`, {
        id: driverJson.id,
        user_id: driverJson.user_id,
        first_name: (driverJson as any).first_name,
        last_name: (driverJson as any).last_name,
        email: (driverJson as any).email,
        phone: (driverJson as any).phone,
        license_number: driverJson.license_number,
        status: driverJson.status,
        total_rides: driverJson.total_rides,
        average_rating: driverJson.average_rating,
        total_earnings: driverJson.total_earnings,
      });
    } else {
      console.warn(`⚠️ [DriverRepository.findByUserId] No se encontró conductor para user_id: ${userId}`);
    }
    return driver;
  }

  async update(id: string, data: any) {
    const driver = await Driver.findByPk(id);
    if (!driver) throw new Error('Conductor no encontrado');
    return await driver.update(data);
  }

  async updateByUserId(userId: string, data: any) {
    return await Driver.update(data, {
      where: { user_id: userId },
    });
  }

  async findActive() {
    return await Driver.findAll({
      where: { status: 'active' },
    });
  }

  async findByRating(minRating: number) {
    return await Driver.findAll({
      where: {
        average_rating: {
          [Op.gte]: minRating,
        },
      },
    });
  }

  async incrementTotalRides(driverId: string) {
    const driver = await this.findByIdOrUserId(driverId);
    if (!driver) throw new Error('Conductor no encontrado');
    return await driver.increment('total_rides');
  }

  async incrementEarnings(driverId: string, amount: number) {
    const driver = await this.findByIdOrUserId(driverId);
    if (!driver) throw new Error('Conductor no encontrado');
    return await driver.increment('total_earnings', { by: amount });
  }

  async findByDepartment(department: string) {
    return await Driver.findAll({
      where: { department },
    });
  }

  async findByStatus(status: string) {
    return await Driver.findAll({
      where: { status },
    });
  }

  async findAll() {
    return await Driver.findAll();
  }
}
