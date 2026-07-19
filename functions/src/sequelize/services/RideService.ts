/**
 * RideService - Business Logic Layer para viajes
 *
 * ✅ Grupo 4: Usa transacciones Sequelize para operaciones PostgreSQL atómicas.
 * ✅ Saga pattern: si Firebase falla después del commit en PostgreSQL, se aplica
 *    compensación revirtiendo el cambio de estado en PostgreSQL.
 * ✅ acceptRide: usa updateIfStatus (actualización condicional atómica) para prevenir
 *    race conditions cuando múltiples conductores intentan aceptar el mismo viaje.
 */

import { RideRepository } from '../repositories/RideRepository';
import { PaymentRepository } from '../repositories/PaymentRepository';
import { DriverRepository } from '../repositories/DriverRepository';
import admin from 'firebase-admin';
import sequelize from '../config/database';
import { isSequelizeAvailable } from '../config/database';

export class RideService {
  private rideRepo = new RideRepository();
  private paymentRepo = new PaymentRepository();
  private driverRepo = new DriverRepository();
  private realtimeDb = admin.database();

  private async hydrateClientProfile(clientId: string): Promise<{
    fullName?: string | null;
    phone?: string | null;
    rating?: number | null;
    totalRatings?: number | null;
  }> {
    try {
      const snapshot = await this.realtimeDb.ref(`clientsInfo/${clientId}`).once('value');
      const value = snapshot.val();
      if (!value) {
        return {};
      }

      return {
        fullName: value.fullName ?? value.full_name ?? null,
        phone: value.phone ?? null,
        rating: typeof value.rating === 'number' ? value.rating : null,
        totalRatings: typeof value.totalRatings === 'number' ? value.totalRatings : null,
      };
    } catch (error) {
      console.warn('[RideService] No se pudo obtener clientsInfo para', clientId, error);
      return {};
    }
  }

  async createRide(data: any) {
    // ✅ Solo client_id es requerido al crear - driver_id se asigna después
    if (!data.client_id) {
      throw new Error('client_id es requerido');
    }

    // ✅ Grupo 4: Usar transacción si Sequelize está disponible
    let ride: any;
    if (isSequelizeAvailable) {
      ride = await sequelize.transaction(async (t) => {
        return await this.rideRepo.create({
          ...data,
          driver_id: data.driver_id || null, // Puede ser null al inicio
          status: 'requested',
          created_at: new Date(),
        }, t);
      });
    } else {
      ride = await this.rideRepo.create({
        ...data,
        driver_id: data.driver_id || null,
        status: 'requested',
        created_at: new Date(),
      });
    }

    console.log(`✅ Viaje creado: ${ride.id}`);

    // ✅ Saga: Si Firebase falla, el ride ya existe en PostgreSQL pero no en RTDB.
    // El ride en estado 'requested' sin presencia en activeRides será visible
    // para el cliente via Supabase pero no para conductores via RTDB.
    // El cliente puede reintentar o cancelar. No se revierte el ride en PostgreSQL
    // porque es el dato fuente de verdad — el frontend puede recuperarse.
    try {
      const clientProfile = await this.hydrateClientProfile(data.client_id);
      const clientName = clientProfile.fullName ?? data.client_name ?? null;
      const clientPhone = clientProfile.phone ?? data.client_phone ?? null;
      const clientRating = typeof clientProfile.rating === 'number' ? clientProfile.rating : data.client_rating ?? null;
      const clientTotalRatings = typeof clientProfile.totalRatings === 'number'
        ? clientProfile.totalRatings
        : data.client_total_ratings ?? null;

      const activeRideRef = this.realtimeDb.ref(`activeRides/${ride.id}`);
      const activePayload: Record<string, any> = {
        clientId: data.client_id,
        status: 'requested',
        origin: data.origin ?? null,
        destination: data.destination ?? null,
        clientName,
        clientPhone,
        clientRating,
        clientTotalRatings,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
        createdAt: admin.database.ServerValue.TIMESTAMP,
      };

      await activeRideRef.update(activePayload);
    } catch (activeErr) {
      console.warn('⚠️ [RideService.createRide] No se pudo actualizar activeRides con datos del cliente:', activeErr);
      // No revertir — el ride existe en PostgreSQL (fuente de verdad).
      // El frontend puede sincronizar después.
    }

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

    const alreadyAssigned = ride.driver_id;
    if (alreadyAssigned && alreadyAssigned !== driverId && ride.status !== 'requested') {
      throw new Error('El viaje ya tiene un conductor asignado');
    }

    const terminalStatuses = ['driver_offered', 'accepted', 'driver_on_route', 'in_progress', 'pending_payment', 'completed', 'canceled'];
    if (alreadyAssigned === driverId && terminalStatuses.includes(ride.status)) {
      console.log(`🔁 Viaje ${rideId} ya está en estado ${ride.status} para este conductor`);
      return ride;
    }

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

    // ✅ Grupo 4 (C10): Actualización condicional atómica para prevenir race conditions.
    // Si dos conductores intentan aceptar el mismo ride simultáneamente, solo uno
    // tendrá updatedCount === 1. El otro obtendrá 0 y se lanzará error.
    if (isSequelizeAvailable) {
      const updatedCount = await this.rideRepo.updateIfStatus(rideId, ride.status, updateData);
      if (updatedCount === 0) {
        // El estado cambió entre el read y el update — otro conductor ganó
        console.warn(`⚠️ [acceptRide] Race condition detectada: el viaje ${rideId} cambió de estado. Otro conductor pudo haberlo aceptado.`);
        throw new Error('El viaje ya fue asignado a otro conductor (operación concurrente)');
      }
      // Re-leer el ride actualizado
      const updated = await this.rideRepo.findById(rideId);
      console.log(`✅ Viaje aceptado atómicamente: ${rideId} con status: ${newStatus}`);
      return updated;
    }

    // Fallback sin transacción (emulador o sin BD)
    const updated = await this.rideRepo.update(rideId, updateData);
    console.log(`✅ Viaje aceptado: ${rideId} con status: ${newStatus}`);
    return updated;
  }

  async startRide(rideId: string) {
    const ride = await this.rideRepo.findById(rideId);
    if (!ride) throw new Error('Viaje no encontrado');

    if (ride.status === 'in_progress') {
      console.log(`🔁 Viaje ${rideId} ya estaba en progreso`);
      return ride;
    }

    const allowedStatuses = ['accepted', 'driver_on_route'];
    if (!allowedStatuses.includes(ride.status)) {
      throw new Error(`No se puede iniciar el viaje ${rideId} porque está en estado ${ride.status}`);
    }

    // ✅ Grupo 4: Actualización condicional atómica
    if (isSequelizeAvailable) {
      const updatedCount = await this.rideRepo.updateIfStatus(rideId, ride.status, {
        status: 'in_progress',
        started_at: ride.started_at || new Date(),
      });
      if (updatedCount === 0) {
        throw new Error(`No se pudo iniciar el viaje ${rideId} porque el estado cambió (operación concurrente)`);
      }
      const updated = await this.rideRepo.findById(rideId);
      console.log(`🚗 Viaje iniciado atómicamente: ${rideId}`);
      return updated;
    }

    // ✅ ACTUALIZADO: Guardar started_at solo cuando cambia de estado
    const updated = await this.rideRepo.update(rideId, {
      status: 'in_progress',
      started_at: ride.started_at || new Date(),
    });

    console.log(`🚗 Viaje iniciado: ${rideId}`);
    return updated;
  }

  async completeRide(rideId: string, finalFare: number) {
    const ride = await this.rideRepo.findById(rideId);
    if (!ride) throw new Error('Viaje no encontrado');

    if (ride.status === 'completed') {
      console.log(`🔁 Viaje ${rideId} ya estaba completado`);
      return ride;
    }

    // ✅ Grupo 4 (C9): Transacción Sequelize para ride + payment atómicos.
    // Si cualquiera falla, ambos se revierten.
    if (isSequelizeAvailable) {
      const result = await sequelize.transaction(async (t) => {
        // Actualizar ride dentro de la transacción
        await this.rideRepo.update(rideId, {
          status: 'completed',
          final_fare: finalFare,
          completed_at: new Date(),
          client_suggested_price: ride.client_suggested_price || null,
          driver_offered_price: ride.driver_offered_price || null,
          accepted_at: ride.accepted_at || null,
          started_at: ride.started_at || null,
        }, t);

        const commission = finalFare * 0.11;
        // Crear pago dentro de la misma transacción
        await this.paymentRepo.create({
          ride_id: rideId,
          amount: finalFare,
          commission: commission,
          payment_method: ride.payment_type || 'cash',
          status: 'pending',
          paid_at: null,
        }, t);

        return ride;
      });

      console.log(`✅ Viaje completado (transacción atómica): ${rideId}`);
      return result;
    }

    // Fallback sin transacción
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

  async markDriverOnRoute(rideId: string, driverId: string, extra: Record<string, any> = {}) {
    const ride = await this.rideRepo.findById(rideId);
    if (!ride) throw new Error('Viaje no encontrado');

    if (ride.driver_id !== driverId) {
      throw new Error('Conductor no asignado a este viaje');
    }

    if (ride.status === 'driver_on_route') {
      console.log(`🔁 Viaje ${rideId} ya estaba en estado driver_on_route`);
      return ride;
    }

    const allowedStatuses = ['accepted'];
    if (!allowedStatuses.includes(ride.status)) {
      throw new Error(`No se puede marcar driver_on_route porque el viaje está en estado ${ride.status}`);
    }

    // ✅ Grupo 4: Actualización condicional atómica
    if (isSequelizeAvailable) {
      const updatedCount = await this.rideRepo.updateIfStatus(rideId, ride.status, {
        status: 'driver_on_route',
        ...extra,
      });
      if (updatedCount === 0) {
        throw new Error(`No se pudo marcar driver_on_route porque el estado cambió (operación concurrente)`);
      }
      const updated = await this.rideRepo.findById(rideId);
      console.log(`🚕 Conductor en camino para viaje ${rideId} (atómico)`);
      return updated;
    }

    const updated = await this.rideRepo.update(rideId, {
      status: 'driver_on_route',
      ...extra,
    });

    console.log(`🚕 Conductor en camino para viaje ${rideId}`);
    return updated;
  }

  async cancelRide(rideId: string, reason: string) {
    const ride = await this.rideRepo.findById(rideId);
    if (!ride) throw new Error('Viaje no encontrado');

    if (ride.status === 'canceled') {
      console.log(`🔁 Viaje ${rideId} ya estaba cancelado`);
      return ride;
    }

    // ✅ Grupo 4: Actualización condicional atómica
    if (isSequelizeAvailable) {
      const updatedCount = await this.rideRepo.updateIfStatus(rideId, ride.status, {
        status: 'canceled',
        canceled_at: new Date(),
      });
      if (updatedCount === 0) {
        throw new Error(`No se pudo cancelar el viaje ${rideId} porque el estado cambió (operación concurrente)`);
      }
      const updated = await this.rideRepo.findById(rideId);
      console.log(`❌ Viaje cancelado atómicamente: ${rideId} - ${reason}`);
      return updated;
    }

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
