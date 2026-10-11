/**
 * DriverRepository - Data Access Layer para conductores
 */

import Driver from '../models/Driver';
import { Op, Transaction } from 'sequelize';

export class DriverRepository {
  async create(data: any, transaction?: Transaction) {
    return await Driver.create(data, transaction ? { transaction } : undefined);
  }

  async findById(id: string) {
    console.log(`🔍 [DriverRepository.findById] Buscando conductor por ID: ${id}`);
    const driver = await Driver.findByPk(id);
    console.log(`📦 [DriverRepository.findById] Resultado:`, driver ? driver.toJSON() : null);
    return driver;
  }

  async findPreflightByUserId(userId: string) {
    return await Driver.findOne({
      attributes: ['id', 'user_id', 'status', 'documents_status', 'current_recharge_balance'],
      where: { user_id: userId },
    });
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

  // Los callers identifican al conductor por su Firebase Auth UID (user_id),
  // igual que rides.driver_id — drivers.id es un UUID interno distinto.
  async incrementTotalRides(userId: string, transaction?: Transaction) {
    const driver = await Driver.findOne({
      where: { user_id: userId },
      ...(transaction ? { transaction } : {}),
    });
    if (!driver) throw new Error('Conductor no encontrado');
    return await driver.increment('total_rides', transaction ? { transaction } : undefined);
  }

  async incrementEarnings(userId: string, amount: number, transaction?: Transaction) {
    const driver = await Driver.findOne({
      where: { user_id: userId },
      ...(transaction ? { transaction } : {}),
    });
    if (!driver) throw new Error('Conductor no encontrado');
    return await driver.increment('total_earnings', { by: amount, ...(transaction ? { transaction } : {}) });
  }

  async findByDepartment(department: string) {
    return await Driver.findAll({
      where: { department },
    });
  }

  async findByStatus(status: string, options?: { limit?: number; offset?: number }) {
    return await Driver.findAll({
      where: { status },
      ...(options?.limit ? { limit: options.limit } : {}),
      ...(options?.offset ? { offset: options.offset } : {}),
    });
  }

  async findAll(options?: { limit?: number; offset?: number; where?: any }) {
    return await Driver.findAll({
      ...(options?.limit ? { limit: options.limit } : {}),
      ...(options?.offset ? { offset: options.offset } : {}),
      ...(options?.where ? { where: options.where } : {}),
    });
  }

  async count(where?: any): Promise<number> {
    return await Driver.count(where ? { where } : undefined);
  }
}
