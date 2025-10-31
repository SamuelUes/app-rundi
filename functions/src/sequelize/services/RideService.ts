/**
 * RideService - Business Logic Layer para viajes
 */

import { RideRepository } from '../repositories/RideRepository';
import { PaymentRepository } from '../repositories/PaymentRepository';
import { DriverRepository } from '../repositories/DriverRepository';

export class RideService {
  private rideRepo = new RideRepository();
  private paymentRepo = new PaymentRepository();
  private driverRepo = new DriverRepository();

  async createRide(data: any) {
    // ✅ Solo client_id es requerido al crear - driver_id se asigna después
    if (!data.client_id) {
      throw new Error('client_id es requerido');
    }

    const ride = await this.rideRepo.create({
      ...data,
      driver_id: data.driver_id || null, // Puede ser null al inicio
      status: 'requested',
      created_at: new Date(),
    });

    console.log(`✅ Viaje creado: ${ride.id}`);
    return ride;
  }

  async acceptRide(rideId: string, driverId: string, serviceId?: string) {
    console.log(`🚗 [acceptRide] Aceptando viaje: ${rideId} por conductor: ${driverId}, serviceId: ${serviceId || 'no especificado'}`);
    
    // Validar que el viaje existe
    const ride = await this.rideRepo.findById(rideId);
    if (!ride) {
      throw new Error('Viaje no encontrado');
    }
    console.log(`✅ Viaje encontrado: ${rideId}, status: ${ride.status}`);

    // Validar que el viaje está en un estado que permita nuevas ofertas
    const offerableStatuses = ['requested', 'driver_offered', 'pending_confirm'];
    if (!offerableStatuses.includes(ride.status)) {
      throw new Error(`Viaje no puede ser aceptado. Estado actual: ${ride.status}`);
    }

    // Validar que el conductor existe y está activo
    console.log(`🔍 Validando conductor: ${driverId}`);
    const driver = await this.driverRepo.findByUserId(driverId);
    if (!driver) {
      throw new Error('Conductor no encontrado');
    }
    console.log(`✅ Conductor encontrado: ${driver.id}, status: ${driver.status}`);

    if (driver.status !== 'active') {
      throw new Error(`Conductor no está activo. Estado: ${driver.status}`);
    }

    // Actualizar el viaje con el conductor y cambiar estado
    console.log(`📝 Asignando conductor ${driverId} al viaje ${rideId}`);
    
    // ✅ ACTUALIZADO: Determinar estado basado en si hay negociación
    // Si hay negociación, estado es 'accepted'
    // Si no hay negociación, estado es 'driver_offered' para que cliente confirme
    let newStatus = 'accepted';
    if (!ride.client_suggested_price && !ride.driver_offered_price) {
      newStatus = 'driver_offered';
      console.log(`✅ Sin negociación previa, estado: 'driver_offered'`);
    } else {
      console.log(`✅ Con negociación previa, estado: 'accepted'`);
    }
    
    const updateData: any = {
      driver_id: driverId,
      status: newStatus,
      accepted_at: new Date(),
    };
    
    // ✅ NUEVO: Agregar service_id si se proporciona
    if (serviceId) {
      updateData.service_id = serviceId;
      console.log(`✅ Service ID asignado: ${serviceId}`);
    }
    
    // Agregar campos de negociación si existen en el viaje actual
    if (ride.client_suggested_price) {
      updateData.client_suggested_price = ride.client_suggested_price;
    }
    if (ride.driver_offered_price) {
      updateData.driver_offered_price = ride.driver_offered_price;
    }
    
    const updated = await this.rideRepo.update(rideId, updateData);

    console.log(`✅ Viaje aceptado: ${rideId} con status: ${newStatus}`);
    return updated;
  }

  async startRide(rideId: string) {
    const ride = await this.rideRepo.findById(rideId);
    if (!ride) throw new Error('Viaje no encontrado');

    // ✅ ACTUALIZADO: Guardar started_at
    const updated = await this.rideRepo.update(rideId, {
      status: 'in_progress',
      started_at: new Date(),
    });

    console.log(`🚗 Viaje iniciado: ${rideId}`);
    return updated;
  }

  async completeRide(rideId: string, finalFare: number) {
    const ride = await this.rideRepo.findById(rideId);
    if (!ride) throw new Error('Viaje no encontrado');

    // ✅ ACTUALIZADO: Guardar todos los campos necesarios
    await this.rideRepo.update(rideId, {
      status: 'completed',
      final_fare: finalFare,
      completed_at: new Date(),
      // ✅ NUEVO: Preservar campos de negociación si existen
      client_suggested_price: ride.client_suggested_price || null,
      driver_offered_price: ride.driver_offered_price || null,
      accepted_at: ride.accepted_at || null,
      started_at: ride.started_at || null,
    });

    const commission = finalFare * 0.11;
    // ✅ ACTUALIZADO: Crear pago con status 'pending' hasta que se confirme
    await this.paymentRepo.create({
      ride_id: rideId,
      amount: finalFare,
      commission: commission,
      payment_method: ride.payment_type || 'cash',
      status: 'pending', // ✅ CAMBIO: Ahora es 'pending' hasta que se confirme el pago
      paid_at: null, // ✅ NUEVO: No se marca como pagado hasta que se confirme
    });

    console.log(`✅ Viaje completado: ${rideId}`);
    return ride;
  }

  async cancelRide(rideId: string, reason: string) {
    const ride = await this.rideRepo.findById(rideId);
    if (!ride) throw new Error('Viaje no encontrado');

    await this.rideRepo.update(rideId, {
      status: 'canceled',
      canceled_at: new Date(),
    });

    console.log(`❌ Viaje cancelado: ${rideId} - ${reason}`);
    return ride;
  }

  async getRidesByClient(clientId: string) {
    return await this.rideRepo.findByClientId(clientId);
  }

  async getRidesByDriver(driverId: string) {
    return await this.rideRepo.findByDriverId(driverId);
  }
}
