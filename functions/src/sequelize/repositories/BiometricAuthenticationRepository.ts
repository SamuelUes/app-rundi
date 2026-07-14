/**
 * BiometricAuthenticationRepository - Operaciones de autenticación biométrica
 */

import BiometricAuthentication from '../models/BiometricAuthentication';

export class BiometricAuthenticationRepository {
  async create(data: any): Promise<BiometricAuthentication> {
    return await BiometricAuthentication.create(data);
  }

  async findById(id: string): Promise<BiometricAuthentication | null> {
    return await BiometricAuthentication.findByPk(id);
  }

  async findByUserId(userId: string): Promise<BiometricAuthentication[]> {
    return await BiometricAuthentication.findAll({ where: { user_id: userId }, order: [['created_at', 'DESC']] });
  }

  async findByRideId(rideId: string): Promise<BiometricAuthentication | null> {
    return await BiometricAuthentication.findOne({ where: { ride_id: rideId } });
  }

  async findByStatus(status: string): Promise<BiometricAuthentication[]> {
    const normalized = String(status || '').trim().toLowerCase();
    const success = normalized === 'completed' || normalized === 'success' || normalized === 'true';
    return await BiometricAuthentication.findAll({ where: { success } });
  }

  async findAll(): Promise<BiometricAuthentication[]> {
    return await BiometricAuthentication.findAll();
  }

  async update(id: string, data: any): Promise<BiometricAuthentication> {
    const auth = await BiometricAuthentication.findByPk(id);
    if (!auth) throw new Error('Autenticación biométrica no encontrada');
    return await auth.update(data);
  }

  async delete(id: string): Promise<boolean> {
    const result = await BiometricAuthentication.destroy({ where: { id } });
    return result > 0;
  }
}
