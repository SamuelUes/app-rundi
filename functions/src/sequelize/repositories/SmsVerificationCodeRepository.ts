/**
 * SmsVerificationCodeRepository - Operaciones de códigos SMS
 */

import SmsVerificationCode from '../models/SmsVerificationCode';

export class SmsVerificationCodeRepository {
  async create(data: any): Promise<SmsVerificationCode> {
    return await SmsVerificationCode.create(data);
  }

  async findById(id: string): Promise<SmsVerificationCode | null> {
    return await SmsVerificationCode.findByPk(id);
  }

  async findByUserId(userId: string): Promise<SmsVerificationCode[]> {
    return await SmsVerificationCode.findAll({ where: { user_id: userId }, order: [['created_at', 'DESC']] });
  }

  async findByCode(code: string): Promise<SmsVerificationCode | null> {
    return await SmsVerificationCode.findOne({ where: { code } });
  }

  async findByStatus(status: string): Promise<SmsVerificationCode[]> {
    return await SmsVerificationCode.findAll({ where: { status } });
  }

  async findAll(): Promise<SmsVerificationCode[]> {
    return await SmsVerificationCode.findAll();
  }

  async update(id: string, data: any): Promise<SmsVerificationCode> {
    const code = await SmsVerificationCode.findByPk(id);
    if (!code) throw new Error('Código SMS no encontrado');
    return await code.update(data);
  }

  async delete(id: string): Promise<boolean> {
    const result = await SmsVerificationCode.destroy({ where: { id } });
    return result > 0;
  }

  async deleteExpired(): Promise<number> {
    return await SmsVerificationCode.destroy({ where: { expires_at: { [require('sequelize').Op.lt]: new Date() } } });
  }
}
