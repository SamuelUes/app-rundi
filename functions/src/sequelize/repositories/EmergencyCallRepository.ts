/**
 * EmergencyCallRepository - Operaciones de llamadas de emergencia
 */

import EmergencyCall from '../models/EmergencyCall';

export class EmergencyCallRepository {
  async create(data: any): Promise<EmergencyCall> {
    return await EmergencyCall.create(data);
  }

  async findById(id: string): Promise<EmergencyCall | null> {
    return await EmergencyCall.findByPk(id);
  }

  async findByUserId(userId: string): Promise<EmergencyCall[]> {
    return await EmergencyCall.findAll({ where: { user_id: userId }, order: [['created_at', 'DESC']] });
  }

  async findByRideId(rideId: string): Promise<EmergencyCall | null> {
    return await EmergencyCall.findOne({ where: { ride_id: rideId } });
  }

  async findByStatus(status: string): Promise<EmergencyCall[]> {
    return await EmergencyCall.findAll({ where: { status } });
  }

  async findAll(): Promise<EmergencyCall[]> {
    return await EmergencyCall.findAll();
  }

  async update(id: string, data: any): Promise<EmergencyCall> {
    const call = await EmergencyCall.findByPk(id);
    if (!call) throw new Error('Llamada de emergencia no encontrada');
    return await call.update(data);
  }

  async delete(id: string): Promise<boolean> {
    const result = await EmergencyCall.destroy({ where: { id } });
    return result > 0;
  }
}
