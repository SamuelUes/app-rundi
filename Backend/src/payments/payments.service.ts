import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { Payment, PaymentStatus, PaymentMethod } from './entities/payment.entity';
import { Ride } from '../rides/entities/ride.entity';

@Injectable()
export class PaymentsService {
  private stripe: Stripe;

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(Ride)
    private rideRepository: Repository<Ride>,
  ) {
    const key = process.env.STRIPE_SECRET_KEY || 'sk_test_51SEkQKHVOBNC1WbUcQQAYs6FDD0dYO3wMA8dQzzHFTLFkEJsNpgBXe9V7ZOfQ85uvhivpzT88ntqoITyLoadFDGd00hoCYtolH';
    this.stripe = new Stripe(key, { apiVersion: '2023-10-16' });
  }

  /**
   * Crear Payment Intent para un viaje (PRE-AUTORIZACIÓN)
   * Se crea cuando el conductor acepta, pero NO se captura hasta finalizar
   */
  async createPaymentIntent(rideId: string, tip: number = 0) {
    const ride = await this.rideRepository.findOne({ 
      where: { id: rideId },
      relations: ['client', 'driver'],
    });

    if (!ride) {
      throw new BadRequestException('Viaje no encontrado');
    }

    // Permitir crear payment intent cuando el viaje es aceptado
    if (ride.status !== 'accepted' && ride.status !== 'completed') {
      throw new BadRequestException('El viaje debe estar aceptado para autorizar el pago');
    }

    // Verificar si ya existe un payment intent para este viaje
    const existingPayment = await this.paymentRepository.findOne({
      where: { rideId: ride.id },
    });

    if (existingPayment) {
      return {
        clientSecret: existingPayment.stripePaymentIntentId,
        paymentId: existingPayment.id,
        amount: existingPayment.amount,
      };
    }

    // Calcular monto total (tarifa + propina)
    const fareAmount = Math.round((ride.finalFare || ride.estimatedFare) * 100); // Convertir a centavos
    const tipAmount = Math.round(tip * 100);
    const totalAmount = fareAmount + tipAmount;

    // Crear Payment Intent en Stripe con capture_method: manual
    // Esto autoriza el pago pero NO lo captura hasta que llamemos capture()
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: totalAmount,
      currency: 'nio', // Córdobas nicaragüenses
      capture_method: 'manual', // ⭐ CLAVE: No capturar automáticamente
      metadata: {
        rideId: ride.id,
        clientId: ride.clientId,
        driverId: ride.driverId || '',
        fare: (ride.finalFare || ride.estimatedFare).toString(),
        tip: tip.toString(),
      },
      description: `Pre-autorización de viaje - DriveAngel.ni`,
    });

    // Crear registro de pago en BD
    const payment = this.paymentRepository.create({
      rideId: ride.id,
      amount: totalAmount / 100, // Volver a córdobas
      tip: tip,
      paymentMethod: PaymentMethod.CARD,
      status: PaymentStatus.PENDING,
      stripePaymentIntentId: paymentIntent.id,
    });

    await this.paymentRepository.save(payment);

    console.log(`💳 Pre-autorización creada para viaje ${rideId}: C$${totalAmount / 100}`);

    return {
      clientSecret: paymentIntent.client_secret,
      paymentId: payment.id,
      amount: totalAmount / 100,
    };
  }

  /**
   * Capturar pago cuando el viaje finaliza
   */
  async capturePayment(rideId: string) {
    const payment = await this.paymentRepository.findOne({
      where: { rideId },
      relations: ['ride'],
    });

    if (!payment) {
      throw new BadRequestException('Pago no encontrado para este viaje');
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      console.log(`⚠️ Pago ${payment.id} ya fue capturado`);
      return { success: true, payment };
    }

    try {
      // Capturar el pago en Stripe
      const paymentIntent = await this.stripe.paymentIntents.capture(
        payment.stripePaymentIntentId
      );

      if (paymentIntent.status === 'succeeded') {
        payment.status = PaymentStatus.COMPLETED;
        payment.paidAt = new Date();
        await this.paymentRepository.save(payment);

        console.log(`✅ Pago ${payment.id} capturado exitosamente: C$${payment.amount}`);
        return { success: true, payment };
      } else {
        throw new BadRequestException('No se pudo capturar el pago');
      }
    } catch (error) {
      console.error(`❌ Error capturando pago ${payment.id}:`, error);
      payment.status = PaymentStatus.FAILED;
      await this.paymentRepository.save(payment);
      throw error;
    }
  }

  /**
   * Cancelar autorización de pago (si el viaje se cancela)
   */
  async cancelPaymentAuthorization(rideId: string) {
    const payment = await this.paymentRepository.findOne({
      where: { rideId },
    });

    if (!payment) {
      console.log(`⚠️ No hay pago para cancelar en viaje ${rideId}`);
      return { success: true };
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      throw new BadRequestException('No se puede cancelar un pago ya completado');
    }

    try {
      // Cancelar el payment intent en Stripe
      await this.stripe.paymentIntents.cancel(payment.stripePaymentIntentId);

      payment.status = PaymentStatus.FAILED;
      await this.paymentRepository.save(payment);

      console.log(`🔄 Autorización de pago cancelada para viaje ${rideId}`);
      return { success: true };
    } catch (error) {
      console.error(`❌ Error cancelando autorización:`, error);
      throw error;
    }
  }

  /**
   * Confirmar pago exitoso
   */
  async confirmPayment(paymentId: string) {
    const payment = await this.paymentRepository.findOne({ 
      where: { id: paymentId },
      relations: ['ride'],
    });

    if (!payment) {
      throw new BadRequestException('Pago no encontrado');
    }

    // Verificar estado en Stripe
    const paymentIntent = await this.stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      payment.status = PaymentStatus.COMPLETED;
      payment.paidAt = new Date();
      await this.paymentRepository.save(payment);

      console.log(`✅ Pago ${paymentId} confirmado exitosamente`);
      return { success: true, payment };
    } else {
      payment.status = PaymentStatus.FAILED;
      await this.paymentRepository.save(payment);
      
      throw new BadRequestException('El pago no se completó exitosamente');
    }
  }

  /**
   * Procesar pago en efectivo
   */
  async processCashPayment(rideId: string, tip: number = 0) {
    const ride = await this.rideRepository.findOne({ where: { id: rideId } });

    if (!ride) {
      throw new BadRequestException('Viaje no encontrado');
    }

    if (ride.status !== 'completed') {
      throw new BadRequestException('El viaje debe estar completado para procesar el pago');
    }

    const totalAmount = (ride.finalFare || ride.estimatedFare) + tip;

    const payment = this.paymentRepository.create({
      rideId: ride.id,
      amount: totalAmount,
      tip: tip,
      paymentMethod: PaymentMethod.CASH,
      status: PaymentStatus.COMPLETED,
      paidAt: new Date(),
    });

    await this.paymentRepository.save(payment);

    console.log(`💵 Pago en efectivo procesado para viaje ${rideId}`);
    return payment;
  }

  /**
   * Obtener detalles de un pago
   */
  async getPaymentDetails(paymentId: string) {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
      relations: ['ride', 'ride.client', 'ride.driver'],
    });

    if (!payment) {
      throw new BadRequestException('Pago no encontrado');
    }

    return payment;
  }

  /**
   * Generar recibo digital
   */
  async generateReceipt(paymentId: string) {
    const payment = await this.getPaymentDetails(paymentId);
    const ride = payment.ride;

    return {
      receiptNumber: `REC-${payment.id.substring(0, 8).toUpperCase()}`,
      date: payment.paidAt,
      ride: {
        origin: ride.originAddress,
        destination: ride.destinationAddress,
        distance: `${(ride.estimatedDistance / 1000).toFixed(1)} km`,
        duration: `${Math.round(ride.estimatedDuration / 60)} min`,
      },
      payment: {
        fare: ride.finalFare || ride.estimatedFare,
        tip: payment.tip,
        total: payment.amount,
        method: payment.paymentMethod,
      },
      driver: {
        name: ride.driver?.name || 'N/A',
      },
      client: {
        name: ride.client?.name || 'N/A',
      },
    };
  }

  /**
   * Manejar webhook de Stripe
   */
  async handleStripeWebhook(signature: string, rawBody: Buffer) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('⚠️ STRIPE_WEBHOOK_SECRET no configurado');
      return { received: true };
    }

    try {
      // Verificar firma del webhook
      const event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret
      );

      console.log(`🔔 Webhook recibido: ${event.type}`);

      // Manejar diferentes tipos de eventos
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(event.data.object);
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(event.data.object);
          break;

        case 'charge.refunded':
          await this.handleChargeRefunded(event.data.object);
          break;

        default:
          console.log(`Evento no manejado: ${event.type}`);
      }

      return { received: true };
    } catch (error) {
      console.error('❌ Error procesando webhook:', error);
      throw new BadRequestException('Webhook signature verification failed');
    }
  }

  /**
   * Manejar pago exitoso
   */
  private async handlePaymentIntentSucceeded(paymentIntent: any) {
    const payment = await this.paymentRepository.findOne({
      where: { stripePaymentIntentId: paymentIntent.id },
    });

    if (payment) {
      payment.status = PaymentStatus.COMPLETED;
      payment.paidAt = new Date();
      await this.paymentRepository.save(payment);

      console.log(`✅ Pago ${payment.id} confirmado automáticamente vía webhook`);
    }
  }

  /**
   * Manejar pago fallido
   */
  private async handlePaymentIntentFailed(paymentIntent: any) {
    const payment = await this.paymentRepository.findOne({
      where: { stripePaymentIntentId: paymentIntent.id },
    });

    if (payment) {
      payment.status = PaymentStatus.FAILED;
      await this.paymentRepository.save(payment);

      console.log(`❌ Pago ${payment.id} falló`);
    }
  }

  /**
   * Manejar reembolso
   */
  private async handleChargeRefunded(charge: any) {
    const payment = await this.paymentRepository.findOne({
      where: { stripePaymentIntentId: charge.payment_intent },
    });

    if (payment) {
      payment.status = PaymentStatus.REFUNDED;
      await this.paymentRepository.save(payment);

      console.log(`💰 Pago ${payment.id} reembolsado`);
    }
  }
}
