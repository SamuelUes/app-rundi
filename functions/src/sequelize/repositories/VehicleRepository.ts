/**
 * VehicleRepository - Operaciones de vehículos
 */

import Vehicle from '../models/Vehicle';

export class VehicleRepository {
  async create(data: any): Promise<Vehicle> {
    return await Vehicle.create(data);
  }

  async findById(id: string): Promise<Vehicle | null> {
    return await Vehicle.findByPk(id);
  }

  async findByDriverId(driverId: string): Promise<Vehicle[]> {
    return await Vehicle.findAll({ where: { driver_id: driverId } });
  }

  async findAll(): Promise<Vehicle[]> {
    return await Vehicle.findAll();
  }

  async update(id: string, data: any): Promise<Vehicle> {
    const vehicle = await Vehicle.findByPk(id);
    if (!vehicle) throw new Error('Vehículo no encontrado');
    return await vehicle.update(data);
  }

  async delete(id: string): Promise<boolean> {
    const result = await Vehicle.destroy({ where: { id } });
    return result > 0;
  }

  async findByPlate(plate: string): Promise<Vehicle | null> {
    return await Vehicle.findOne({ where: { plate } });
  }

  async findByStatus(status: string): Promise<Vehicle[]> {
    return await Vehicle.findAll({ where: { status } });
  }

  async findByVehicleType(vehicleType: string): Promise<Vehicle[]> {
    return await Vehicle.findAll({ where: { vehicle_type: vehicleType } });
  }
}
