/**
 * PaymentRepository - Data Access Layer para pagos
 */

import Payment from '../models/Payment';
import { Op } from 'sequelize';

export class PaymentRepository {
  async create(data: any) {
    return await Payment.create(data);
  }

  async findById(id: string) {
    return await Payment.findByPk(id);
  }

  async findByRideId(rideId: string) {
    return await Payment.findOne({
      where: { ride_id: rideId },
      order: [['created_at', 'DESC']],
    });
  }

  async update(id: string, data: any) {
    const payment = await Payment.findByPk(id);
    if (!payment) throw new Error('Pago no encontrado');
    return await payment.update(data);
  }

  async updateByRideId(rideId: string, data: any) {
    return await Payment.update(data, {
      where: { ride_id: rideId },
    });
  }

  async findCompletedBetween(startDate: Date, endDate: Date) {
    return await Payment.findAll({
      where: {
        status: 'completed',
        paid_at: {
          [Op.between]: [startDate, endDate],
        },
      },
    });
  }

  async getTotalEarnings(driverId: string) {
    const result = await Payment.sum('amount', {
      where: { status: 'completed' },
    });
    return result || 0;
  }

  async getTotalCommissions(startDate: Date, endDate: Date) {
    const result = await Payment.sum('commission', {
      where: {
        status: 'completed',
        paid_at: {
          [Op.between]: [startDate, endDate],
        },
      },
    });
    return result || 0;
  }
}
