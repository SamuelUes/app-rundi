/**
 * RideRepository - Data Access Layer para viajes
 */

import Ride from '../models/Ride';
import { Op } from 'sequelize';

export class RideRepository {
  async create(data: any) {
    return await Ride.create(data);
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

  async findAll() {
    console.log(`🔍 [RideRepository.findAll] Obteniendo todos los viajes`);
    const rides = await Ride.findAll();
    console.log(`📦 [RideRepository.findAll] Total de viajes: ${rides.length}`);
    return rides;
  }

  async findActiveByClientId(clientId: string) {
    console.log(`🔍 [RideRepository.findActiveByClientId] Buscando viajes activos del cliente: ${clientId}`);
    const rides = await Ride.findAll({
      where: {
        client_id: clientId,
        status: {
          [Op.in]: ['requested', 'accepted', 'in_progress'],
        },
      },
    });
    console.log(`📦 [RideRepository.findActiveByClientId] Viajes activos encontrados: ${rides.length}`);
    return rides;
  }

  async update(id: string, data: any) {
    const ride = await Ride.findByPk(id);
    if (!ride) throw new Error('Viaje no encontrado');
    return await ride.update(data);
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
