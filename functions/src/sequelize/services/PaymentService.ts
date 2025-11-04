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
      created_at: new Date(),
    });

    console.log(`💵 Pago en efectivo registrado: ${payment.id}`);
    return payment;
  }

  async completeCashPayment(rideId: string) {
    const payment = await this.paymentRepo.findByRideId(rideId);
    if (!payment) throw new Error('Pago no encontrado');

    // ⚠️ Si el viaje tiene tarifa final, sincronizarla antes de completar
    const ride = await this.rideRepo.findById(rideId);
    const existingRate = this.parseNumber(payment.commission_rate_applied);
    const { fare, commissionRate, commission } = await this.computeFareAndCommission(ride, existingRate ?? undefined);

    const updated = await this.paymentRepo.update(payment.id, {
      amount: fare,
      commission,
      commission_rate_applied: commissionRate,
      status: 'completed',
      paid_at: new Date(),
    });

    console.log(`✅ Pago completado: ${payment.id}`);
    return updated;
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
