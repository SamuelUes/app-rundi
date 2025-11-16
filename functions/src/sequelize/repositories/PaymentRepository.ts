/**
 * PaymentRepository - Data Access Layer para pagos
 */

import Payment from '../models/Payment';
import Ride from '../models/Ride';
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

  async findDriverPendingCommissionPayments(driverId: string) {
    return await Payment.findAll({
      where: {
        status: 'completed',
        commission_status: 'pending',
        commission: {
          [Op.gt]: 0,
        },
      },
      include: [
        {
          model: Ride,
          as: 'ride',
          required: true,
          attributes: ['id', 'driver_id'],
          where: { driver_id: driverId },
        },
      ],
      order: [
        ['paid_at', 'DESC'],
        ['created_at', 'DESC'],
      ],
    });
  }

  async markCommissionsAsPaid(paymentIds: string[], paidAt: Date = new Date()): Promise<number> {
    if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
      return 0;
    }

    const [updatedCount] = await Payment.update(
      {
        commission_paid_at: paidAt,
        commission_status: 'paid',
      },
      {
        where: {
          id: {
            [Op.in]: paymentIds,
          },
        },
      }
    );

    return updatedCount;
  }
}
