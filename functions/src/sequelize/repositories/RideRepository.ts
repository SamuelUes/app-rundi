/**
 * RideRepository - Data Access Layer para viajes
 */

import Ride from '../models/Ride';
import { Op, Transaction } from 'sequelize';

export class RideRepository {
  async create(data: any, transaction?: Transaction) {
    return await Ride.create(data, transaction ? { transaction } : undefined);
  }

  async findById(id: string) {
    return await Ride.findByPk(id);
  }

  async findByFirebaseId(firebaseRideId: string) {
    return await Ride.findOne({
      where: { firebase_ride_id: firebaseRideId },
    });
  }

  async findByClientId(clientId: string) {
    return await Ride.findAll({
      where: { client_id: clientId },
    });
  }

  async findByClientIdAndStatus(clientId: string, status: string) {
    return await Ride.findAll({
      where: { client_id: clientId, status },
    });
  }

  async findByDriverId(driverId: string) {
    console.log(`🔍 [RideRepository.findByDriverId] Buscando viajes del conductor: ${driverId}`);
    const rides = await Ride.findAll({
      where: { driver_id: driverId },
    });
    console.log(`📦 [RideRepository.findByDriverId] Viajes encontrados: ${rides.length}`);
    if (rides.length > 0) {
      console.log(`📋 [RideRepository.findByDriverId] Primer viaje:`, {
        id: rides[0].id,
        status: rides[0].status,
        client_id: rides[0].client_id,
        driver_id: rides[0].driver_id,
        estimated_price: rides[0].estimated_price,
        final_fare: rides[0].final_fare,
      });
    }
    return rides;
  }

  async findByDriverIdAndStatus(driverId: string, status: string) {
    console.log(`🔍 [RideRepository.findByDriverIdAndStatus] Buscando viajes del conductor ${driverId} con estado: ${status}`);
    const rides = await Ride.findAll({
      where: { driver_id: driverId, status },
    });
    console.log(`📦 [RideRepository.findByDriverIdAndStatus] Viajes encontrados: ${rides.length}`);
    return rides;
  }

  async findByStatus(status: string) {
    console.log(`🔍 [RideRepository.findByStatus] Buscando viajes con estado: ${status}`);
    const rides = await Ride.findAll({
      where: { status },
    });
    console.log(`📦 [RideRepository.findByStatus] Viajes encontrados: ${rides.length}`);
    return rides;
  }

  async findAll(options?: { limit?: number; offset?: number; attributes?: string[]; where?: any }) {
    console.log(`🔍 [RideRepository.findAll] Obteniendo viajes con options:`, JSON.stringify(options || {}));
    const rides = await Ride.findAll({
      ...(options?.limit ? { limit: options.limit } : {}),
      ...(options?.offset ? { offset: options.offset } : {}),
      ...(options?.attributes ? { attributes: options.attributes } : {}),
      ...(options?.where ? { where: options.where } : {}),
    });
    console.log(`📦 [RideRepository.findAll] Viajes obtenidos: ${rides.length}`);
    return rides;
  }

  /**
   * Agregación de estadísticas usando SQL — evita cargar todos los rides en memoria.
   */
  async getStats(): Promise<{ total: number; completed: number; canceled: number; totalRevenue: number }> {
    const total = await Ride.count();
    const completed = await Ride.count({ where: { status: 'completed' } });
    const canceled = await Ride.count({ where: { status: 'canceled' } });
    const revenueResult = await Ride.sum('final_fare', { where: { status: 'completed' } });
    return {
      total,
      completed,
      canceled,
      totalRevenue: Number(revenueResult) || 0,
    };
  }

  async findActiveByClientId(clientId: string) {
    console.log(`🔍 [RideRepository.findActiveByClientId] Buscando viajes activos del cliente: ${clientId}`);
    const rides = await Ride.findAll({
      where: {
        client_id: clientId,
        status: {
          // Solo valores válidos del enum ride_status de PG — 'pending_confirm',
          // 'pending_rating' y 'searching' son estados RTDB y no existen en la
          // columna enum (un literal inválido rompe la query con 22P02).
          [Op.in]: [
            'requested',
            'driver_offered',
            'accepted',
            'driver_on_route',
            'driver_arrived',
            'in_progress',
            'pending_payment',
          ],
        },
      },
    });
    console.log(`📦 [RideRepository.findActiveByClientId] Viajes activos encontrados: ${rides.length}`);
    return rides;
  }

  async update(id: string, data: any, transaction?: Transaction) {
    let ride: Ride | null = null;
    try {
      ride = await Ride.findByPk(id, transaction ? { transaction } : undefined);
    } catch {
      ride = null; // id no es un UUID válido — probablemente sea firebase_ride_id
    }
    // Muchos callables reciben el firebase_ride_id (key de RTDB), no el UUID de PG
    if (!ride) {
      ride = await Ride.findOne({
        where: { firebase_ride_id: id },
        ...(transaction ? { transaction } : {}),
      });
    }
    if (!ride) throw new Error('Viaje no encontrado');
    return await ride.update(data, transaction ? { transaction } : undefined);
  }

  /**
   * Actualización condicional atómica - solo actualiza si el estado actual coincide.
   * Retorna el número de filas afectadas (0 = no se actualizó, 1 = éxito).
   * Previene race conditions en acceptRide y otras operaciones concurrentes.
   */
  async updateIfStatus(id: string, expectedStatus: string, data: any, transaction?: Transaction): Promise<number> {
    const [updatedCount] = await Ride.update(data, {
      where: {
        id,
        status: expectedStatus,
      },
      ...(transaction ? { transaction } : {}),
    });
    return updatedCount;
  }

  async delete(id: string) {
    const ride = await Ride.findByPk(id);
    if (!ride) throw new Error('Viaje no encontrado');
    return await ride.destroy();
  }

  async findCompletedBetween(startDate: Date, endDate: Date) {
    return await Ride.findAll({
      where: {
        status: 'completed',
        completed_at: {
          [Op.between]: [startDate, endDate],
        },
      },
    });
  }
}
