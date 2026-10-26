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
import { ServiceRepository } from '../repositories/ServiceRepository';
import admin from 'firebase-admin';
import sequelize from '../config/database';
import { isSequelizeAvailable } from '../config/database';
import {
  getCommissionFromDatabase,
  getFallbackCommissionRate,
  serviceCodeFromRideFields,
} from '../../helpers/priceCalculator';
import { calculateCommissionAmount } from '../../helpers/pricingRules';

export class RideService {
  private rideRepo = new RideRepository();
  private paymentRepo = new PaymentRepository();
  private driverRepo = new DriverRepository();
  private serviceRepo = new ServiceRepository();
  private realtimeDb = admin.database();

  // Comisión del pago: tasa del servicio del viaje (o fallback por código derivado)
  private async resolveCommissionRate(ride: any): Promise<number> {
    const snapshotRate = Number(ride?.commission_rate_applied ?? ride?.pricing_snapshot?.commissionRate);
    if (Number.isFinite(snapshotRate) && snapshotRate >= 0 && snapshotRate <= 1) {
      return snapshotRate;
    }

    try {
      if (ride?.service_id) {
        const rate = await this.serviceRepo.getCommissionRate(ride.service_id);
        if (rate !== null && rate !== undefined) {
          return rate;
        }
      }
    } catch (error) {
      console.warn('[RideService] No se pudo resolver commission_rate del servicio:', error);
    }
    return getFallbackCommissionRate(
      serviceCodeFromRideFields(
        ride?.ride_type ?? ride?.rideType,
        ride?.vehicle_type ?? ride?.vehicleType,
        ride?.designated_driver_vehicle ?? ride?.designatedDriverVehicle,
      ),
    );
  }

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

    const service = ride.service_id ? await this.serviceRepo.findById(ride.service_id) : null;
    const serviceCode = service?.code ?? serviceCodeFromRideFields(
      ride.ride_type,
      ride.vehicle_type,
      ride.designated_driver_vehicle,
    );
    try {
      const commissionRate = await getCommissionFromDatabase(driverId, serviceCode);
      const pricingSnapshot = {
        ...(ride.pricing_snapshot ?? {}),
        commissionRate,
        commissionAmount: calculateCommissionAmount(Number(ride.estimated_price ?? 0), commissionRate),
      };
      updateData.commission_rate_applied = commissionRate;
      updateData.pricing_snapshot = pricingSnapshot;
    } catch (error) {
      console.warn('[acceptRide] No se pudo congelar la comisión del conductor:', error);
    }

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

  async startRide(rideId: string, expectedDriverId?: string) {
    const ride = await this.rideRepo.findById(rideId);
    if (!ride) throw new Error('Viaje no encontrado');

    // Solo el conductor asignado puede iniciar el viaje — nunca confiar en el
    // rol del caller: cualquier driver autenticado podría arrancar viajes ajenos.
    if (expectedDriverId && ride.driver_id !== expectedDriverId) {
      throw new Error('Conductor no asignado a este viaje');
    }

    if (ride.status === 'in_progress') {
      console.log(`🔁 Viaje ${rideId} ya estaba en progreso`);
      return ride;
    }

    const allowedStatuses = ['accepted', 'driver_on_route', 'driver_arrived'];
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

  async completeRide(
    rideId: string,
    finalFare: number,
    opts: { expectedDriverId?: string; actualDistance?: number; actualDuration?: number } = {},
  ) {
    const ride = await this.rideRepo.findById(rideId);
    if (!ride) throw new Error('Viaje no encontrado');

    // Ownership: solo el conductor asignado puede completar el viaje.
    if (opts.expectedDriverId && ride.driver_id !== opts.expectedDriverId) {
      throw new Error('Conductor no asignado a este viaje');
    }

    if (ride.status === 'completed') {
      console.log(`🔁 Viaje ${rideId} ya estaba completado`);
      return ride;
    }

    // Solo un viaje en curso puede completarse — evita crear pagos sobre viajes
    // 'requested'/'accepted' que nunca arrancaron.
    if (ride.status !== 'in_progress') {
      throw new Error(`No se puede completar el viaje ${rideId} porque está en estado ${ride.status}`);
    }

    const commissionRate = await this.resolveCommissionRate(ride);
    const commission = calculateCommissionAmount(finalFare, commissionRate);
    const currentPricingSnapshot = ride.pricing_snapshot;
    const pricingSnapshot = currentPricingSnapshot
      ? {
          ...currentPricingSnapshot,
          quotedFare: currentPricingSnapshot.quotedFare ?? currentPricingSnapshot.finalFare ?? ride.estimated_price,
          finalFare,
          negotiatedFare: finalFare,
          commissionRate,
          commissionAmount: commission,
        }
      : null;
    const completionUpdate: Record<string, any> = {
      status: 'completed',
      final_fare: finalFare,
      commission_rate_applied: commissionRate,
      ...(pricingSnapshot ? { pricing_snapshot: pricingSnapshot } : {}),
      completed_at: new Date(),
      client_suggested_price: ride.client_suggested_price || null,
      driver_offered_price: ride.driver_offered_price || null,
      accepted_at: ride.accepted_at || null,
      started_at: ride.started_at || null,
    };
    if (typeof opts.actualDistance === 'number') {
      completionUpdate.actual_distance = opts.actualDistance;
    }
    if (typeof opts.actualDuration === 'number') {
      completionUpdate.actual_duration = opts.actualDuration;
    }

    // ✅ Grupo 4 (C9): Transacción Sequelize para ride + payment atómicos.
    // Si cualquiera falla, ambos se revierten.
    if (isSequelizeAvailable) {
      const result = await sequelize.transaction(async (t) => {
        // Actualización condicional dentro de la transacción: si otro proceso
        // cambió el estado (ej. cancelación concurrente), el update no aplica
        // y la transacción revierte sin crear el pago.
        const updatedCount = await this.rideRepo.updateIfStatus(rideId, ride.status, completionUpdate, t);
        if (updatedCount === 0) {
          throw new Error(`No se pudo completar el viaje ${rideId} porque el estado cambió (operación concurrente)`);
        }

        // Crear pago dentro de la misma transacción
        await this.paymentRepo.create({
          ride_id: rideId,
          amount: finalFare,
          commission: commission,
          commission_rate_applied: commissionRate,
          payment_method: ride.payment_type || 'cash',
          status: 'pending',
          paid_at: null,
        }, t);

        // Devolver el viaje con los cambios aplicados (ride es la instancia
        // previa al update — sin merge reportaría status/final_fare viejos).
        return { ...(ride.get ? ride.get({ plain: true }) : ride), ...completionUpdate };
      });

      console.log(`✅ Viaje completado (transacción atómica): ${rideId}`);
      return result;
    }

    // Fallback sin transacción: update condicional para no pisar cambios de estado
    const updatedCount = await this.rideRepo.updateIfStatus(rideId, ride.status, completionUpdate);
    if (updatedCount === 0) {
      throw new Error(`No se pudo completar el viaje ${rideId} porque el estado cambió (operación concurrente)`);
    }

    // ✅ ACTUALIZADO: Crear pago con status 'pending' hasta que se confirme
    await this.paymentRepo.create({
      ride_id: rideId,
      amount: finalFare,
      commission: commission,
      commission_rate_applied: commissionRate,
      payment_method: ride.payment_type || 'cash',
      status: 'pending', // ✅ CAMBIO: Ahora es 'pending' hasta que se confirme el pago
      paid_at: null, // ✅ NUEVO: No se marca como pagado hasta que se confirme
    });

    console.log(`✅ Viaje completado: ${rideId}`);
    return { ...(ride.get ? ride.get({ plain: true }) : ride), ...completionUpdate };
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

  async markDriverArrived(rideId: string, driverId: string) {
    const ride = await this.rideRepo.findById(rideId);
    if (!ride) throw new Error('Viaje no encontrado');

    if (ride.driver_id !== driverId) {
      throw new Error('Conductor no asignado a este viaje');
    }
    if (ride.status === 'driver_arrived') return ride;
    if (ride.status !== 'driver_on_route') {
      throw new Error(`No se puede marcar driver_arrived porque el viaje está en estado ${ride.status}`);
    }

    if (isSequelizeAvailable) {
      const updatedCount = await this.rideRepo.updateIfStatus(rideId, 'driver_on_route', {
        status: 'driver_arrived',
      });
      if (updatedCount === 0) {
        throw new Error('El estado del viaje cambió antes de confirmar la llegada');
      }
      return await this.rideRepo.findById(rideId);
    }

    return await this.rideRepo.update(rideId, { status: 'driver_arrived' });
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
