/**
 * PaymentService - Business Logic Layer para pagos
 */

import { PaymentRepository } from '../repositories/PaymentRepository';
import { RideRepository } from '../repositories/RideRepository';

export class PaymentService {
  private paymentRepo = new PaymentRepository();
  private rideRepo = new RideRepository();

  async registerCashPayment(rideId: string, tip: number = 0) {
    const ride = await this.rideRepo.findById(rideId);
    if (!ride) throw new Error('Viaje no encontrado');

    // Evitar duplicados para el mismo ride
    const existingPayment = await this.paymentRepo.findByRideId(rideId);
    if (existingPayment) {
      console.log(`ℹ️ Pago existente encontrado para ride ${rideId}: ${existingPayment.id}`);
      return existingPayment;
    }

    const fare = ride.final_fare ?? ride.estimated_price ?? 0;
    const commission = fare * 0.11;

    const payment = await this.paymentRepo.create({
      ride_id: rideId,
      amount: fare,
      tip: tip,
      commission: commission,
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
    const finalFare = ride?.final_fare ?? ride?.estimated_price ?? payment.amount;

    const updated = await this.paymentRepo.update(payment.id, {
      amount: finalFare,
      commission: finalFare * 0.11,
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
