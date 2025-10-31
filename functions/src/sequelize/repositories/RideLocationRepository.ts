/**
 * RideLocationRepository - Operaciones de ubicaciones de viajes
 */

import RideLocation from '../models/RideLocation';

export class RideLocationRepository {
  async create(data: any): Promise<RideLocation> {
    return await RideLocation.create(data);
  }

  async findById(id: string): Promise<RideLocation | null> {
    return await RideLocation.findByPk(id);
  }

  async findByRideId(rideId: string): Promise<RideLocation[]> {
    return await RideLocation.findAll({ where: { ride_id: rideId }, order: [['waypoint_order', 'ASC']] });
  }

  async findAll(): Promise<RideLocation[]> {
    return await RideLocation.findAll();
  }

  async update(id: string, data: any): Promise<RideLocation> {
    const location = await RideLocation.findByPk(id);
    if (!location) throw new Error('Ubicación no encontrada');
    return await location.update(data);
  }

  async delete(id: string): Promise<boolean> {
    const result = await RideLocation.destroy({ where: { id } });
    return result > 0;
  }

  async findByLocationType(locationType: string): Promise<RideLocation[]> {
    return await RideLocation.findAll({ where: { location_type: locationType } });
  }

  async deleteByRideId(rideId: string): Promise<number> {
    return await RideLocation.destroy({ where: { ride_id: rideId } });
  }
}
