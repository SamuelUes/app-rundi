/**
 * PaymentService - Business Logic Layer para pagos
 */

import { PaymentRepository } from '../repositories/PaymentRepository';
import { RideRepository } from '../repositories/RideRepository';
import { ServiceRepository } from '../repositories/ServiceRepository';

export class PaymentService {
  private paymentRepo = new PaymentRepository();
  private rideRepo = new RideRepository();
  private serviceRepo = new ServiceRepository();

  private parseNumber(value: unknown): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    try {
      const parsed = parseFloat(String(value));
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private async computeFareAndCommission(
    ride: any,
    overrideRate?: number | null,
  ): Promise<{ fare: number; commissionRate: number; commission: number }> {
    let fare = this.parseNumber(ride?.final_fare)
      ?? this.parseNumber(ride?.estimated_price)
      ?? this.parseNumber(ride?.client_suggested_price)
      ?? 0;

    let commissionRate = overrideRate ?? null;

    if (ride?.service_id) {
      try {
        const service = await this.serviceRepo.findById(ride.service_id);

        if (service) {
          if (commissionRate === null || commissionRate === undefined) {
            const serviceRate = this.parseNumber(service.commission_rate);
            if (serviceRate !== null) {
              commissionRate = serviceRate;
            }
          }

          if (!fare || fare <= 0) {
            const basePrice = this.parseNumber(service.base_price);
            if (basePrice !== null && basePrice > 0) {
              fare = basePrice;
            }
          }
        }
      } catch (serviceError) {
        console.warn('⚠️ [PaymentService] Error obteniendo servicio para comisión:', serviceError);
      }
    }

    if (fare <= 0) {
      fare = 0;
    }

    if (commissionRate === null || commissionRate === undefined) {
      commissionRate = 0.11; // Fallback
    }

    const commission = Number((fare * commissionRate).toFixed(2));

    return {
      fare: Number(fare.toFixed(2)),
      commissionRate: Number(commissionRate.toFixed(4)),
      commission,
    };
  }

  async registerCashPayment(rideId: string, tip: number = 0) {
    const ride = await this.rideRepo.findById(rideId);
    if (!ride) throw new Error('Viaje no encontrado');

    // Evitar duplicados para el mismo ride
    const existingPayment = await this.paymentRepo.findByRideId(rideId);
    if (existingPayment) {
      console.log(`ℹ️ Pago existente encontrado para ride ${rideId}: ${existingPayment.id}`);
      return existingPayment;
    }

    const { fare, commissionRate, commission } = await this.computeFareAndCommission(ride);

    const payment = await this.paymentRepo.create({
      ride_id: rideId,
      amount: fare,
      tip: tip,
      commission: commission,
      commission_rate_applied: commissionRate,
      payment_method: 'cash',
      status: 'pending',
      commission_status: 'pending',
      created_at: new Date(),
    });

    console.log(`💵 Pago en efectivo registrado: ${payment.id}`);
    return payment;
  }

  async completeCashPayment(rideId: string) {
    const payment = await this.paymentRepo.findByRideId(rideId);
    if (!payment) throw new Error('Pago no encontrado');

    if (String(payment.status || '').toLowerCase() === 'completed') {
      console.log(`ℹ️ [PaymentService] Pago ${payment.id} ya estaba completado`);
      return payment;
    }

    // ⚠️ Si el viaje tiene tarifa final, sincronizarla antes de completar
    const ride = await this.rideRepo.findById(rideId);
    const existingRate = this.parseNumber(payment.commission_rate_applied);
    const { fare, commissionRate, commission } = await this.computeFareAndCommission(ride, existingRate ?? undefined);

    const updated = await this.paymentRepo.update(payment.id, {
      amount: fare,
      commission,
      commission_rate_applied: commissionRate,
      status: 'completed',
      commission_status: 'pending',
      paid_at: new Date(),
    });

    console.log(`✅ Pago completado: ${payment.id}`);

    return updated;
  }

  async getDriverPendingCommissionSummary(driverId: string, excludeRideIds: Set<string> = new Set()) {
    const payments = await this.paymentRepo.findDriverPendingCommissionPayments(driverId);

    const filtered = payments.filter((payment: any) => {
      const rideId = String(payment.ride_id || payment.ride?.id || '');
      if (!rideId) {
        return true;
      }
      return !excludeRideIds.has(rideId);
    });

    const detail = filtered.map((payment: any) => {
      const commission = this.parseNumber(payment.commission) || 0;
      const amount = this.parseNumber(payment.amount) || 0;
      const tip = this.parseNumber(payment.tip) || 0;
      return {
        id: payment.id,
        rideId: payment.ride_id || payment.ride?.id || null,
        driverId: payment.ride?.driver_id || null,
        commission,
        amount,
        tip,
        total: Number((amount + tip).toFixed(2)),
        paymentMethod: payment.payment_method,
        commissionRate: this.parseNumber(payment.commission_rate_applied),
        paidAt: payment.paid_at || null,
        commissionPaidAt: payment.commission_paid_at || null,
        commissionStatus: payment.commission_status,
        status: payment.status,
        createdAt: payment.created_at || null,
        updatedAt: payment.updated_at || null,
      };
    });

    const totalAmount = detail.reduce((sum: number, item: any) => sum + (item.commission || 0), 0);

    return {
      count: detail.length,
      amount: Number(totalAmount.toFixed(2)),
      payments: detail,
    };
  }

  async markDriverCommissionPaymentsAsPaid(paymentIds: string[], paidAt: Date = new Date()) {
    if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
      return { updated: 0 };
    }

    const updated = await this.paymentRepo.markCommissionsAsPaid(paymentIds, paidAt);
    return {
      updated,
      paidAt,
    };
  }

  async cancelPayment(rideId: string, reason: string) {
    await this.paymentRepo.updateByRideId(rideId, {
      status: 'canceled',
      cancel_reason: reason,
    });

    console.log(`❌ Pago cancelado: ${rideId} - ${reason}`);
  }

  async getPaymentByRide(rideId: string) {
    return await this.paymentRepo.findByRideId(rideId);
  }
}
