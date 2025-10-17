/**
 * Rides API - Migrado de Backend/src/rides/rides.service.ts
 * Firebase Functions implementation
 * 
 * ARQUITECTURA HÍBRIDA:
 * - Firebase Realtime DB: activeRides (datos en tiempo real)
 * - Supabase PostgreSQL: rides (historial completo)
 * 
 * FLUJO DE VIAJE:
 * 1. requestRide() → Cliente solicita viaje (REQUESTED)
 * 2. acceptRide() → Conductor crea oferta
 * 3. confirmDriver() → Cliente selecciona conductor (ACCEPTED)
 * 4. startRide() → Conductor inicia viaje (IN_PROGRESS)
 * 5. completeRide() → Conductor completa viaje (COMPLETED)
 * 6. cancelRide() → Cliente/Conductor cancela (CANCELED)
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import pool from "../config/database";
import { calculateRidePriceWithStops } from "../helpers/priceCalculator";
import { logRideEvent, AnalyticsEvents } from "../utils/analyticsUtils";
import { archiveCompletedRide, archiveCanceledRide } from "../helpers/cleanupHelpers";

/**
 * Calcular distancia entre dos puntos (Haversine formula)
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radio de la Tierra en km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distancia en km
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * 1. SOLICITAR VIAJE
 * Cliente solicita un viaje
 * Crea registro en Firebase Realtime DB (activeRides)
 */
export const requestRide = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const {
    origin,
    destination,
    estimatedDistance,
    estimatedDuration,
    estimatedPrice,
    paymentMethod,
    extraStops,
    isDesignatedDriver,
    clientSuggestedPrice,
  } = data;

  const clientId = context.auth.uid;

  try {
    // Validaciones
    if (!origin || !destination) {
      throw new functions.https.HttpsError("invalid-argument", "Origen y destino son requeridos");
    }

    if (estimatedDistance < 100) {
      throw new functions.https.HttpsError("invalid-argument", "La distancia mínima es 100 metros");
    }

    // Generar ID único para el viaje
    const rideId = admin.database().ref().child('activeRides').push().key;

    if (!rideId) {
      throw new functions.https.HttpsError("internal", "Error generando ID del viaje");
    }

    // Crear viaje en Firebase Realtime DB
    const rideData = {
      id: rideId,
      clientId,
      origin,
      destination,
      estimatedDistance,
      estimatedDuration,
      estimatedPrice,
      clientSuggestedPrice: clientSuggestedPrice || estimatedPrice,
      paymentMethod: paymentMethod || 'cash',
      extraStops: extraStops || [],
      isDesignatedDriver: isDesignatedDriver || false,
      status: 'requested',
      createdAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      offers: {},
      offersCount: 0,
      rejectedDrivers: [],
    };

    await admin.database().ref(`activeRides/${rideId}`).set(rideData);

    // Crear paymentStatus en Firebase Realtime DB
    await admin.database().ref(`paymentStatus/${rideId}`).set({
      method: paymentMethod || 'cash',
      status: 'pending',
      amount: estimatedPrice,
      createdAt: admin.database.ServerValue.TIMESTAMP,
      lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
      lastUpdatedBy: 'client',
    });

    console.log(`✅ Viaje creado: ${rideId}`);

    // Log analytics
    await logRideEvent(AnalyticsEvents.RIDE_REQUESTED, rideId, clientId, {
      estimatedPrice,
      estimatedDistance,
      paymentMethod,
    });

    return {
      success: true,
      rideId,
      ride: rideData,
    };
  } catch (error: any) {
    console.error("❌ Error solicitando viaje:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * 2. ACEPTAR VIAJE (Sistema de Ofertas)
 * Conductor crea una oferta para el viaje
 * NO asigna directamente, cliente elige después
 */
export const acceptRide = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { rideId, offeredPrice } = data;
  const driverId = context.auth.uid;

  try {
    // Obtener viaje desde Firebase
    const rideSnapshot = await admin.database()
      .ref(`activeRides/${rideId}`)
      .once('value');

    const ride = rideSnapshot.val();

    if (!ride) {
      throw new functions.https.HttpsError("not-found", "Viaje no encontrado");
    }

    if (ride.status !== 'requested') {
      throw new functions.https.HttpsError("failed-precondition", "El viaje ya no está disponible");
    }

    // Verificar si el conductor fue rechazado previamente
    if (ride.rejectedDrivers && ride.rejectedDrivers.includes(driverId)) {
      throw new functions.https.HttpsError("permission-denied", "No puedes ofertar para este viaje");
    }

    // Verificar si el conductor ya tiene una oferta activa
    const existingOfferSnapshot = await admin.database()
      .ref(`activeRides/${rideId}/offers/${driverId}`)
      .once('value');

    if (existingOfferSnapshot.exists()) {
      throw new functions.https.HttpsError(
        "already-exists",
        "Ya tienes una oferta activa para este viaje"
      );
    }

    // Obtener datos del conductor desde Firestore
    const driverDoc = await admin.firestore().collection('users').doc(driverId).get();
    const driverData = driverDoc.data();

    if (!driverData) {
      throw new functions.https.HttpsError("not-found", "Datos del conductor no encontrados");
    }

    // Obtener datos del vehículo desde driversInfo en Realtime Database
    const driverInfoSnapshot = await admin.database()
      .ref(`driversInfo/${driverId}`)
      .once('value');
    
    const driverInfo = driverInfoSnapshot.val();
    const vehicleData = driverInfo?.vehicle || null;

    // Calcular distancia al punto de recogida
    const driverLocationSnapshot = await admin.database()
      .ref(`driverLocations/${driverId}`)
      .once('value');
    
    const driverLocation = driverLocationSnapshot.val();
    let distanceToPickup = 0;

    if (driverLocation && driverLocation.lat && driverLocation.lng) {
      distanceToPickup = calculateDistance(
        driverLocation.lat,
        driverLocation.lng,
        ride.origin.latitude,
        ride.origin.longitude
      );
    }

    // Crear oferta
    const offer = {
      driverId,
      driver: {
        name: driverData.name || 'Conductor',
        rating: driverData.rating || 0,
        totalRides: driverData.totalRides || 0,
        phone: driverData.phone || '',
        id: driverId,
      },
      vehicle: vehicleData,  // ✅ Usar vehicleData de driversInfo
      offeredPrice: offeredPrice || ride.estimatedPrice,
      distanceToPickup,
      status: 'pending',
      createdAt: admin.database.ServerValue.TIMESTAMP,
    };

    // Guardar oferta en Firebase
    await admin.database()
      .ref(`activeRides/${rideId}/offers/${driverId}`)
      .set(offer);

    // Incrementar contador de ofertas
    await admin.database()
      .ref(`activeRides/${rideId}/offersCount`)
      .set(admin.database.ServerValue.increment(1));

    console.log(`✅ Oferta creada: Conductor ${driverId} para viaje ${rideId}`);

    // Notificar al cliente
    const clientDoc = await admin.firestore().collection('users').doc(ride.clientId).get();
    const fcmToken = clientDoc.data()?.fcmToken;

    if (fcmToken) {
      await admin.messaging().send({
        token: fcmToken,
        notification: {
          title: '🚗 Nueva Oferta',
          body: `${driverData.name} ofrece C$${offeredPrice.toFixed(2)} (${distanceToPickup.toFixed(1)}km de distancia)`,
        },
        data: {
          type: 'new_offer',
          rideId,
          driverId,
        },
      });
    }

    return {
      success: true,
      message: 'Oferta creada exitosamente',
    };
  } catch (error: any) {
    console.error("❌ Error aceptando viaje:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * 3. CONFIRMAR CONDUCTOR
 * Cliente selecciona un conductor de las ofertas disponibles
 */
export const confirmDriver = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { rideId, selectedDriverId } = data;
  const clientId = context.auth.uid;

  try {
    // Verificar que el viaje existe
    const rideSnapshot = await admin.database()
      .ref(`activeRides/${rideId}`)
      .once('value');

    const ride = rideSnapshot.val();

    if (!ride) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    if (ride.clientId !== clientId) {
      throw new functions.https.HttpsError('permission-denied', 'No tienes permiso para confirmar este viaje');
    }

    // Permitir confirmar si está en 'requested' o 'driver_assigned' (legacy)
    // El sistema de ofertas múltiples usa 'requested', pero el frontend puede usar 'driver_assigned'
    if (ride.status !== 'requested' && ride.status !== 'driver_assigned' && ride.status !== 'pending_confirm') {
      throw new functions.https.HttpsError('failed-precondition', `El viaje no puede ser confirmado. Estado actual: ${ride.status}`);
    }

    // Obtener la oferta seleccionada (buscar en offers O driverOffers)
    let selectedOffer: any = null;
    let offersPath = '';

    const offerSnapshot = await admin.database()
      .ref(`activeRides/${rideId}/offers/${selectedDriverId}`)
      .once('value');

    if (offerSnapshot.val()) {
      selectedOffer = offerSnapshot.val();
      offersPath = 'offers';
    } else {
      const driverOfferSnapshot = await admin.database()
        .ref(`activeRides/${rideId}/driverOffers/${selectedDriverId}`)
        .once('value');

      if (driverOfferSnapshot.val()) {
        selectedOffer = driverOfferSnapshot.val();
        offersPath = 'driverOffers';
      }
    }

    if (!selectedOffer) {
      throw new functions.https.HttpsError('not-found', 'Oferta del conductor no encontrada');
    }

    // Si la oferta no tiene vehículo, buscarlo en 'offers' si existe
    if (!selectedOffer.vehicle && offersPath === 'driverOffers') {
      const vehicleOfferSnapshot = await admin.database()
        .ref(`activeRides/${rideId}/offers/${selectedDriverId}`)
        .once('value');

      if (vehicleOfferSnapshot.val()?.vehicle) {
        selectedOffer.vehicle = vehicleOfferSnapshot.val().vehicle;
      }
    }

    // Actualizar oferta seleccionada como aceptada
    await admin.database()
      .ref(`activeRides/${rideId}/${offersPath}/${selectedDriverId}/status`)
      .set('accepted');

    // Obtener todas las ofertas para rechazar las demás
    const allOffersSnapshot = await admin.database()
      .ref(`activeRides/${rideId}/${offersPath}`)
      .once('value');

    const allOffers = allOffersSnapshot.val() || {};
    const rejectedDriverIds: string[] = [];

    for (const driverId of Object.keys(allOffers)) {
      if (driverId !== selectedDriverId) {
        await admin.database()
          .ref(`activeRides/${rideId}/${offersPath}/${driverId}/status`)
          .set('rejected');
        rejectedDriverIds.push(driverId);
      }
    }

    // Actualizar viaje en Firebase
    const updateData: any = {
      driverId: selectedDriverId,
      driver: selectedOffer.driver,
      status: 'accepted',
      finalFare: selectedOffer.offeredPrice,
      driverOfferedPrice: selectedOffer.offeredPrice,
      clientConfirmedAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      rejectedDrivers: rejectedDriverIds,
    };

    if (selectedOffer.vehicle) {
      updateData.vehicle = selectedOffer.vehicle;
    }

    await admin.database().ref(`activeRides/${rideId}`).update(updateData);

    // Actualizar paymentStatus cuando cliente confirma conductor
    await admin.database().ref(`paymentStatus/${rideId}`).update({
      status: ride.paymentMethod === 'cash' ? 'pending' : 'authorized',
      driverId: selectedDriverId,
      finalAmount: selectedOffer.offeredPrice,
      lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
      lastUpdatedBy: 'client',
    });

    console.log(`✅ Conductor confirmado: ${selectedDriverId} para viaje ${rideId}`);

    // Notificar al conductor seleccionado
    const driverDoc = await admin.firestore().collection('users').doc(selectedDriverId).get();
    const fcmToken = driverDoc.data()?.fcmToken;

    if (fcmToken) {
      await admin.messaging().send({
        token: fcmToken,
        notification: {
          title: '✅ ¡Cliente Te Eligió!',
          body: `El cliente aceptó tu oferta de C$${selectedOffer.offeredPrice.toFixed(2)}. Dirígete al punto de recogida.`,
        },
        data: {
          type: 'offer_accepted',
          rideId,
        },
      });
    }

    // Log analytics
    await logRideEvent(AnalyticsEvents.RIDE_ACCEPTED, rideId, clientId, {
      driverId: selectedDriverId,
    });

    return {
      success: true,
      message: 'Conductor confirmado exitosamente',
    };
  } catch (error: any) {
    console.error('❌ Error confirmando conductor:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * 4. INICIAR VIAJE
 * Conductor inicia el viaje (cambia estado a IN_PROGRESS)
 */
export const startRide = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { rideId } = data;
  const driverId = context.auth.uid;

  try {
    // Verificar que el viaje existe
    const rideSnapshot = await admin.database()
      .ref(`activeRides/${rideId}`)
      .once('value');

    const ride = rideSnapshot.val();

    if (!ride) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    if (ride.driverId !== driverId) {
      throw new functions.https.HttpsError('permission-denied', 'No tienes permiso para iniciar este viaje');
    }

    if (ride.status !== 'accepted') {
      throw new functions.https.HttpsError('failed-precondition', `El viaje no puede ser iniciado. Estado actual: ${ride.status}`);
    }

    // Actualizar en Firebase Realtime Database
    await admin.database().ref(`activeRides/${rideId}`).update({
      status: 'in_progress',
      startedAt: admin.database.ServerValue.TIMESTAMP,
      lastUpdate: admin.database.ServerValue.TIMESTAMP,
    });

    // Actualizar paymentStatus
    await admin.database().ref(`paymentStatus/${rideId}`).update({
      status: 'in_progress',
      lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
      lastUpdatedBy: 'backend'
    });

    console.log(`✅ Viaje iniciado: ${rideId}`);

    return {
      success: true,
      ride: {
        ...ride,
        status: 'in_progress',
        startedAt: Date.now(),
      },
    };
  } catch (error: any) {
    console.error("❌ Error iniciando viaje:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * 5. CANCELAR VIAJE
 * Cliente o conductor cancela el viaje
 * Maneja pagos según el progreso del viaje
 */
export const cancelRide = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { rideId, reason } = data;
  const userId = context.auth.uid;

  try {
    // Obtener viaje desde Firebase
    const rideSnapshot = await admin.database()
      .ref(`activeRides/${rideId}`)
      .once('value');

    const ride = rideSnapshot.val();

    if (!ride) {
      throw new functions.https.HttpsError("not-found", "Viaje no encontrado");
    }

    // Verificar permisos
    if (ride.clientId !== userId && ride.driverId !== userId) {
      throw new functions.https.HttpsError("permission-denied", "No tienes permiso para cancelar este viaje");
    }

    // Validar estado
    if (ride.status === 'completed') {
      throw new functions.https.HttpsError("failed-precondition", "No se puede cancelar un viaje completado");
    }

    if (ride.status === 'canceled') {
      throw new functions.https.HttpsError("failed-precondition", "El viaje ya está cancelado");
    }

    // Calcular progreso del viaje
    let progressPercentage = 0;

    if (ride.status === 'in_progress' && ride.startedAt) {
      const driverLocationSnapshot = await admin.database()
        .ref(`driverLocations/${ride.driverId}`)
        .once('value');

      const driverLocation = driverLocationSnapshot.val();

      if (driverLocation && driverLocation.lat && driverLocation.lng && ride.destination) {
        const remainingDistance = calculateDistance(
          driverLocation.lat,
          driverLocation.lng,
          ride.destination.lat || ride.destination.latitude,
          ride.destination.lng || ride.destination.longitude
        );

        const totalDistance = ride.estimatedDistance || 0;
        if (totalDistance > 0) {
          const traveledDistance = totalDistance - remainingDistance;
          progressPercentage = (traveledDistance / totalDistance) * 100;
        }
      }
    }

    // Validar justificación si progreso >= 20%
    if (progressPercentage >= 20 && (!reason || reason.trim().length < 10)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `El viaje lleva ${progressPercentage.toFixed(0)}% de progreso. Debes proporcionar una razón de cancelación de al menos 10 caracteres.`
      );
    }

    // Determinar quién cancela
    const canceledBy = ride.clientId === userId ? 'client' : 'driver';

    // Actualizar estado en Firebase
    await admin.database().ref(`activeRides/${rideId}`).update({
      status: 'canceled',
      canceledAt: admin.database.ServerValue.TIMESTAMP,
      cancelReason: reason || 'Sin razón especificada',
      canceledBy,
    });

    // Limpiar chat
    await admin.database().ref(`chats/${rideId}`).remove();

    // Notificar a la otra parte
    const notificationMessage = canceledBy === 'client'
      ? `El cliente ha cancelado el viaje. Razón: ${reason || 'Sin razón'}`
      : `El conductor ha cancelado el viaje. Razón: ${reason || 'Sin razón'}`;

    const recipientId = canceledBy === 'client' ? ride.driverId : ride.clientId;

    if (recipientId) {
      await admin.firestore()
        .collection('users')
        .doc(recipientId)
        .collection('notifications')
        .add({
          type: 'ride_canceled',
          title: 'Viaje Cancelado',
          message: notificationMessage,
          rideId,
          canceledBy,
          reason: reason || 'Sin razón especificada',
          progressPercentage: progressPercentage.toFixed(2),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          read: false,
        });
    }

    // Actualizar paymentStatus
    try {
      await admin.database().ref(`paymentStatus/${rideId}`).update({
        status: 'canceled',
        canceledAt: admin.database.ServerValue.TIMESTAMP,
        cancelReason: reason || 'Sin razón especificada',
        canceledBy,
        progressPercentage: progressPercentage.toFixed(2),
        lastUpdatedBy: 'backend',
        lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
      });
    } catch (error) {
      console.error('❌ Error actualizando paymentStatus:', error);
    }

    // Log analytics
    await logRideEvent(AnalyticsEvents.RIDE_CANCELED, rideId, userId, {
      canceledBy,
      reason,
      progressPercentage: progressPercentage.toFixed(2),
    });

    // Archivar viaje cancelado: Guardar en PostgreSQL y limpiar Realtime Database
    // Esto se hace en background para no bloquear la respuesta
    archiveCanceledRide({
      ...ride,
      status: 'canceled',
      canceledAt: Date.now(),
      cancelReason: reason || 'Sin razón especificada',
      canceledBy,
    }, rideId).catch(error => {
      console.error(`❌ Error archivando viaje cancelado ${rideId}:`, error);
    });

    // **MANEJAR PAGO SEGÚN PROGRESO**
    try {
      const paymentStatusSnapshot = await admin.database()
        .ref(`paymentStatus/${rideId}`)
        .once('value');

      const paymentStatus = paymentStatusSnapshot.val();

      if (paymentStatus && paymentStatus.method) {
        const method = paymentStatus.method;
        const originalAmount = ride.finalFare || ride.estimatedPrice || 0;

        // CASO 1: Cliente cancela con ≥60% de progreso
        if (canceledBy === 'client' && progressPercentage >= 60) {
          const chargePercentage = Math.min(progressPercentage, 100) / 100;
          const chargedAmount = originalAmount * chargePercentage;

          console.log(`💰 Cliente canceló con ${progressPercentage.toFixed(0)}% progreso`);
          console.log(`💵 Monto a cobrar: C$${chargedAmount.toFixed(2)}`);

          if (method === 'cash') {
            // Efectivo: Registrar deuda
            await admin.database().ref(`paymentStatus/${rideId}`).update({
              status: 'pending_cash_payment',
              chargedAmount,
              message: `Debes pagar C$${chargedAmount.toFixed(2)} en efectivo por cancelación tardía`,
              lastUpdatedBy: 'backend',
              lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
            });
          } else if (method === 'stripe' || method === 'card') {
            // Tarjeta: Capturar porcentaje
            await admin.database().ref(`paymentStatus/${rideId}`).update({
              status: 'pending_partial_capture',
              chargedAmount,
              message: `Se cobrará C$${chargedAmount.toFixed(2)} por cancelación tardía`,
              lastUpdatedBy: 'backend',
              lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
            });
          }

          await logRideEvent(AnalyticsEvents.PAYMENT_COMPLETED, rideId, userId, {
            type: 'cancellation_charge',
            progress: progressPercentage,
            amount: chargedAmount,
            method,
          });
        }
        // CASO 2: Cliente cancela con <60% progreso
        else if (canceledBy === 'client' && progressPercentage < 60) {
          console.log(`✅ Cancelación sin cargo: Progreso < 60%`);
        }
        // CASO 3: Conductor cancela
        else if (canceledBy === 'driver') {
          console.log(`❌ Conductor canceló el viaje`);

          // Penalización si progreso >= 25%
          if (progressPercentage >= 25) {
            const penaltyAmount = originalAmount * 0.15;

            await admin.database().ref(`driverPenalties/${ride.driverId}/${rideId}`).set({
              rideId,
              penaltyType: 'cancellation',
              amount: penaltyAmount,
              reason: `Canceló viaje con ${progressPercentage.toFixed(0)}% de progreso`,
              progressPercentage,
              status: 'pending',
              createdAt: admin.database.ServerValue.TIMESTAMP,
            });

            console.log(`⚠️ Penalización: C$${penaltyAmount.toFixed(2)}`);
          }
        }
      }
    } catch (paymentError: any) {
      console.error('❌ Error manejando pago:', paymentError);
    }

    return {
      success: true,
      message: 'Viaje cancelado exitosamente',
      canceledBy,
      progressPercentage: progressPercentage.toFixed(2),
    };
  } catch (error: any) {
    console.error('❌ Error cancelando viaje:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * 6. OBTENER DETALLES DE VIAJE
 * Obtiene información COMPLETA de un viaje desde PostgreSQL
 * Incluye: viaje, cliente, conductor, vehículo, pago, cronología
 */
export const getRideDetails = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { rideId } = data;

  const client = await pool.connect();
  try {
    // 1. Obtener viaje desde PostgreSQL
    const rideResult = await client.query(
      `SELECT 
        r.id,
        r.client_id as "clientId",
        r.driver_id as "driverId",
        r.status,
        r.origin_lat as "originLat",
        r.origin_lng as "originLng",
        r.origin_address as "originAddress",
        r.destination_lat as "destinationLat",
        r.destination_lng as "destinationLng",
        r.destination_address as "destinationAddress",
        r.estimated_distance as "estimatedDistance",
        r.actual_distance as "actualDistance",
        r.estimated_duration as "estimatedDuration",
        r.actual_duration as "actualDuration",
        r.estimated_price as "estimatedPrice",
        r.final_fare as "finalFare",
        r.client_suggested_price as "clientSuggestedPrice",
        r.driver_offered_price as "driverOfferedPrice",
        r.passengers,
        r.notes,
        r.ride_type as "rideType",
        r.payment_type as "paymentType",
        r.cancel_reason as "cancelReason",
        r.canceled_by as "canceledBy",
        r.requested_at as "requestedAt",
        r.accepted_at as "acceptedAt",
        r.started_at as "startedAt",
        r.completed_at as "completedAt",
        r.canceled_at as "canceledAt",
        r.created_at as "createdAt"
       FROM rides r
       WHERE r.id = $1 AND (r.client_id = $2 OR r.driver_id = $2)`,
      [rideId, context.auth.uid]
    );

    if (rideResult.rows.length === 0) {
      throw new functions.https.HttpsError("not-found", "Viaje no encontrado");
    }

    const ride = rideResult.rows[0];

    // 2. Obtener datos del cliente desde Firebase Auth
    let clientData = null;
    if (ride.clientId) {
      try {
        const clientRecord = await admin.auth().getUser(ride.clientId);
        clientData = {
          id: clientRecord.uid,
          name: clientRecord.displayName || "Cliente",
          email: clientRecord.email || "",
          phone: clientRecord.phoneNumber || "",
        };
      } catch (error) {
        console.error(`Error obteniendo cliente ${ride.clientId}:`, error);
        clientData = {
          id: ride.clientId,
          name: "Cliente",
          email: "",
          phone: "",
        };
      }
    }

    // 3. Obtener datos del conductor desde Firebase Auth + PostgreSQL
    let driverData = null;
    let vehicleData = null;
    if (ride.driverId) {
      try {
        // Auth data
        const driverRecord = await admin.auth().getUser(ride.driverId);
        
        // Driver data desde PostgreSQL
        const driverResult = await client.query(
          `SELECT d.license_number, d.average_rating
           FROM drivers d
           WHERE d.user_id = $1`,
          [ride.driverId]
        );

        const driverInfo = driverResult.rows[0] || {};

        driverData = {
          id: driverRecord.uid,
          name: driverRecord.displayName || "Conductor",
          email: driverRecord.email || "",
          phone: driverRecord.phoneNumber || "",
          licenseNumber: driverInfo.license_number || null,
          rating: driverInfo.average_rating ? parseFloat(driverInfo.average_rating) : 0,
        };

        // 4. Obtener vehículo del conductor
        const vehicleResult = await client.query(
          `SELECT v.plate, v.brand, v.model, v.year, v.color, v.type, v.registration_number
           FROM vehicles v
           INNER JOIN drivers d ON v.driver_id = d.id
           WHERE d.user_id = $1 AND v.is_active = true
           LIMIT 1`,
          [ride.driverId]
        );

        if (vehicleResult.rows.length > 0) {
          const vehicle = vehicleResult.rows[0];
          vehicleData = {
            plate: vehicle.plate ? String(vehicle.plate) : '',
            brand: vehicle.brand ? String(vehicle.brand) : '',
            model: vehicle.model ? String(vehicle.model) : '',
            year: vehicle.year ? parseInt(vehicle.year) : 0,
            color: vehicle.color ? String(vehicle.color) : '',
            type: vehicle.type ? String(vehicle.type) : 'sedan',
            registrationNumber: vehicle.registration_number ? String(vehicle.registration_number) : '',
          };
        }
      } catch (error) {
        console.error(`Error obteniendo conductor ${ride.driverId}:`, error);
        driverData = {
          id: ride.driverId,
          name: "Conductor",
          email: "",
          phone: "",
          licenseNumber: null,
          rating: 0,
        };
      }
    }

    // 5. Obtener información de pago
    let paymentData = null;
    const paymentResult = await client.query(
      `SELECT p.id, p.amount, p.tip, p.commission, p.total, p.payment_method, p.status, p.paid_at
       FROM payments p
       WHERE p.ride_id = $1
       LIMIT 1`,
      [rideId]
    );

    // Helper para convertir fechas a ISO string
    const toISOStringOrNull = (date: any) => {
      if (!date) return null;
      try {
        return new Date(date).toISOString();
      } catch {
        return null;
      }
    };

    if (paymentResult.rows.length > 0) {
      const payment = paymentResult.rows[0];
      paymentData = {
        id: payment.id,
        amount: parseFloat(payment.amount),
        tip: parseFloat(payment.tip || 0),
        commission: parseFloat(payment.commission || 0),
        total: parseFloat(payment.total),
        paymentMethod: payment.payment_method,
        status: payment.status,
        paidAt: toISOStringOrNull(payment.paid_at),
      };
    }

    // 6. Construir respuesta completa
    const rideDetails = {
      id: ride.id,
      clientId: ride.clientId,
      driverId: ride.driverId,
      status: ride.status,
      
      // Ubicaciones
      originLat: parseFloat(ride.originLat) || 0,
      originLng: parseFloat(ride.originLng) || 0,
      originAddress: ride.originAddress ? String(ride.originAddress) : '',
      destinationLat: parseFloat(ride.destinationLat) || 0,
      destinationLng: parseFloat(ride.destinationLng) || 0,
      destinationAddress: ride.destinationAddress ? String(ride.destinationAddress) : '',
      
      // Métricas
      estimatedDistance: parseInt(ride.estimatedDistance),
      actualDistance: ride.actualDistance ? parseInt(ride.actualDistance) : null,
      estimatedDuration: parseInt(ride.estimatedDuration),
      actualDuration: ride.actualDuration ? parseInt(ride.actualDuration) : null,
      
      // Precios
      estimatedPrice: parseFloat(ride.estimatedPrice),
      finalFare: ride.finalFare ? parseFloat(ride.finalFare) : null,
      clientSuggestedPrice: ride.clientSuggestedPrice ? parseFloat(ride.clientSuggestedPrice) : null,
      driverOfferedPrice: ride.driverOfferedPrice ? parseFloat(ride.driverOfferedPrice) : null,
      
      // Info adicional
      passengers: parseInt(ride.passengers) || 1,
      notes: ride.notes ? String(ride.notes) : null,
      rideType: ride.rideType ? String(ride.rideType) : 'normal',
      paymentType: ride.paymentType ? String(ride.paymentType) : 'cash',
      cancelReason: ride.cancelReason ? String(ride.cancelReason) : null,
      canceledBy: ride.canceledBy ? String(ride.canceledBy) : null,
      
      // Fechas (convertidas a ISO strings)
      requestedAt: toISOStringOrNull(ride.requestedAt),
      acceptedAt: toISOStringOrNull(ride.acceptedAt),
      startedAt: toISOStringOrNull(ride.startedAt),
      completedAt: toISOStringOrNull(ride.completedAt),
      canceledAt: toISOStringOrNull(ride.canceledAt),
      createdAt: toISOStringOrNull(ride.createdAt),
      
      // Datos relacionados
      client: clientData,
      driver: driverData,
      vehicle: vehicleData,
      payment: paymentData,
    };

    console.log(`✅ Detalles del viaje ${rideId} obtenidos correctamente`);

    return {
      success: true,
      ride: rideDetails,
    };
  } catch (error: any) {
    console.error("❌ Error obteniendo detalles del viaje:", error);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});

/**
 * 7. OBTENER VIAJES DISPONIBLES
 * Conductores ven viajes disponibles cerca de su ubicación
 */
export const getAvailableRides = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { latitude, longitude, radius = 10 } = data;
  const driverId = context.auth.uid;

  try {
    // Obtener todos los viajes activos desde Firebase
    const ridesSnapshot = await admin.database()
      .ref('activeRides')
      .orderByChild('status')
      .equalTo('requested')
      .once('value');

    const rides = ridesSnapshot.val() || {};
    const availableRides: any[] = [];

    // Filtrar viajes por distancia
    for (const [rideId, ride] of Object.entries(rides) as [string, any][]) {
      // Verificar que el conductor no fue rechazado
      if (ride.rejectedDrivers && ride.rejectedDrivers.includes(driverId)) {
        continue;
      }

      // Calcular distancia al punto de recogida
      const distance = calculateDistance(
        latitude,
        longitude,
        ride.origin.latitude,
        ride.origin.longitude
      );

      if (distance <= radius) {
        availableRides.push({
          ...ride,
          id: rideId,
          distanceToPickup: distance,
        });
      }
    }

    // Ordenar por distancia
    availableRides.sort((a, b) => a.distanceToPickup - b.distanceToPickup);

    return {
      success: true,
      rides: availableRides,
    };
  } catch (error: any) {
    console.error("❌ Error obteniendo viajes disponibles:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * 8. CALCULAR PRECIO
 * Calcula el precio estimado de un viaje
 */
export const calculatePrice = functions.https.onCall(async (data, context) => {
  const { distanceInMeters, extraStops, isDesignatedDriver } = data;

  try {
    const pricing = await calculateRidePriceWithStops(
      distanceInMeters,
      extraStops || [],
      isDesignatedDriver || false
    );

    // Retornar en el formato que espera el frontend
    return {
      success: true,
      price: pricing.finalPrice,
      basePrice: pricing.basePrice,
      distanceKm: pricing.distanceKm,
      multiplier: pricing.multiplier,
      breakdown: pricing.breakdown,
      pricingInfo: pricing,
    };
  } catch (error: any) {
    console.error("❌ Error calculando precio:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * 9. RECHAZAR CONDUCTOR
 * Cliente rechaza un conductor específico
 */
export const rejectDriver = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { rideId, driverId, reason } = data;
  const clientId = context.auth.uid;

  try {
    // Verificar que el viaje existe
    const rideSnapshot = await admin.database()
      .ref(`activeRides/${rideId}`)
      .once('value');

    const ride = rideSnapshot.val();

    if (!ride) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    if (ride.clientId !== clientId) {
      throw new functions.https.HttpsError('permission-denied', 'No tienes permiso para rechazar conductores en este viaje');
    }

    // Validar que el viaje esté en estado 'requested'
    // Solo se pueden rechazar ofertas cuando el viaje aún no ha sido confirmado
    if (ride.status !== 'requested') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `No se puede rechazar conductor. Estado actual del viaje: ${ride.status}`
      );
    }

    // Verificar que exista una oferta del conductor y marcarla como rechazada
    const offerPath = `activeRides/${rideId}/offers/${driverId}`;
    const offerSnapshot = await admin.database().ref(offerPath).once('value');

    if (!offerSnapshot.exists()) {
      throw new functions.https.HttpsError(
        'not-found',
        'No existe una oferta de este conductor para este viaje'
      );
    }

    // Marcar la oferta como rechazada
    await admin.database().ref(`${offerPath}/status`).set('rejected');

    // Agregar conductor a la lista de rechazados
    const rejectedDrivers = ride.rejectedDrivers || [];
    if (!rejectedDrivers.includes(driverId)) {
      rejectedDrivers.push(driverId);
      await admin.database()
        .ref(`activeRides/${rideId}/rejectedDrivers`)
        .set(rejectedDrivers);
    }

    console.log(`✅ Conductor ${driverId} rechazado para viaje ${rideId}`);

    // Notificar al conductor
    const driverDoc = await admin.firestore().collection('users').doc(driverId).get();
    const fcmToken = driverDoc.data()?.fcmToken;

    if (fcmToken) {
      await admin.messaging().send({
        token: fcmToken,
        notification: {
          title: '❌ Oferta Rechazada',
          body: reason || 'El cliente ha rechazado tu oferta',
        },
        data: {
          type: 'offer_rejected',
          rideId,
        },
      });
    }

    return {
      success: true,
      message: 'Conductor rechazado exitosamente',
    };
  } catch (error: any) {
    console.error('❌ Error rechazando conductor:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * 10. COMPLETAR VIAJE
 * Conductor completa el viaje y captura el pago
 */
export const completeRide = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { rideId, finalFare, actualDistance, actualDuration } = data;
  const driverId = context.auth.uid;

  try {
    // Verificar que el viaje existe
    const rideSnapshot = await admin.database()
      .ref(`activeRides/${rideId}`)
      .once('value');

    const ride = rideSnapshot.val();

    if (!ride) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    if (ride.driverId !== driverId) {
      throw new functions.https.HttpsError('permission-denied', 'No tienes permiso para completar este viaje');
    }

    if (ride.status !== 'in_progress') {
      throw new functions.https.HttpsError('failed-precondition', `El viaje no puede ser completado. Estado actual: ${ride.status}`);
    }

    // Actualizar viaje en Firebase - cambiar a pending_rating en lugar de completed
    // El viaje permanecerá en activeRides hasta que ambas partes califiquen
    await admin.database().ref(`activeRides/${rideId}`).update({
      status: 'pending_rating',
      completedAt: admin.database.ServerValue.TIMESTAMP,
      finalFare: finalFare || ride.finalFare || ride.estimatedPrice,
      actualDistance: actualDistance || ride.estimatedDistance,
      actualDuration: actualDuration || ride.estimatedDuration,
      lastUpdate: admin.database.ServerValue.TIMESTAMP,
      // Inicializar campos de rating
      clientRated: false,
      driverRated: false,
    });

    // Actualizar paymentStatus según el método de pago
    const paymentMethod = ride.paymentMethod || 'cash';
    const finalAmount = finalFare || ride.finalFare || ride.estimatedPrice;
    
    if (paymentMethod === 'cash') {
      // Para efectivo, marcar como completado inmediatamente
      await admin.database().ref(`paymentStatus/${rideId}`).update({
        status: 'completed',
        finalAmount: finalAmount,
        lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
        lastUpdatedBy: 'backend',
        message: 'Pago en efectivo completado'
      });
    } else if (paymentMethod === 'card') {
      // Para tarjeta, dejar en pending_capture para que se procese después
      await admin.database().ref(`paymentStatus/${rideId}`).update({
        status: 'pending_capture',
        finalAmount: finalAmount,
        lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
        lastUpdatedBy: 'backend',
        message: 'Esperando captura de pago con tarjeta'
      });
    }

    console.log(`✅ Viaje completado: ${rideId}`);

    // Notificar al cliente
    const clientDoc = await admin.firestore().collection('users').doc(ride.clientId).get();
    const fcmToken = clientDoc.data()?.fcmToken;

    if (fcmToken) {
      await admin.messaging().send({
        token: fcmToken,
        notification: {
          title: '✅ Viaje Completado',
          body: `Has llegado a tu destino. Total: C$${(finalFare || ride.finalFare || ride.estimatedPrice).toFixed(2)}`,
        },
        data: {
          type: 'ride_completed',
          rideId,
        },
      });
    }

    // Guardar en PostgreSQL para historial permanente
    const client = await pool.connect();
    try {
      const finalAmount = finalFare || ride.finalFare || ride.estimatedPrice;
      const distance = actualDistance || ride.estimatedDistance || 0;
      const duration = actualDuration || ride.estimatedDuration || 0;

      // Debug: Ver qué datos tiene el ride
      console.log('📊 Datos del viaje para guardar:', {
        origin: ride.origin,
        destination: ride.destination,
        estimatedPrice: ride.estimatedPrice,
        finalAmount,
        distance,
        duration
      });

      // Insertar viaje en PostgreSQL
      // Nota: Usamos gen_random_uuid() para el ID de PostgreSQL
      // y guardamos el pgRideId en Firebase para futuras referencias
      const rideResult = await client.query(
        `INSERT INTO rides (
          client_id, driver_id, 
          origin_lat, origin_lng, origin_address,
          destination_lat, destination_lng, destination_address,
          status, estimated_price, final_fare,
          estimated_distance, actual_distance,
          estimated_duration, actual_duration,
          payment_type, ride_type,
          requested_at, started_at, completed_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        )
        RETURNING id`,
        [
          ride.clientId,
          driverId,
          ride.origin?.lat || ride.origin?.latitude || 0,
          ride.origin?.lng || ride.origin?.longitude || 0,
          ride.origin?.address || '',
          ride.destination?.lat || ride.destination?.latitude || 0,
          ride.destination?.lng || ride.destination?.longitude || 0,
          ride.destination?.address || '',
          'completed',
          ride.estimatedPrice || 0,
          finalAmount,
          ride.estimatedDistance || 0,
          distance,
          ride.estimatedDuration || 0,
          duration,
          ride.paymentMethod || 'cash',
          ride.isDesignatedDriver ? 'designated_driver' : 'normal',
          new Date(ride.createdAt || Date.now()),
          new Date(ride.startedAt || Date.now()),
          new Date()
        ]
      );

      const pgRideId = rideResult.rows[0].id;

      // Guardar el pgRideId en Firebase para futuras referencias
      await admin.database().ref(`activeRides/${rideId}`).update({
        pgRideId: pgRideId
      });

      console.log(`💾 Viaje guardado en PostgreSQL: ${rideId} (PG ID: ${pgRideId})`);
    } catch (pgError) {
      console.error('❌ Error guardando en PostgreSQL:', pgError);
      // No lanzar error, continuar con el flujo
    } finally {
      client.release();
    }

    // Log analytics
    await logRideEvent(AnalyticsEvents.RIDE_COMPLETED, rideId, driverId, {
      finalFare: finalFare || ride.finalFare,
      actualDistance,
      actualDuration,
    });

    // Archivar viaje: Guardar en PostgreSQL y limpiar Realtime Database
    // Esto se hace en background para no bloquear la respuesta
    archiveCompletedRide({
      ...ride,
      status: 'completed',
      completedAt: Date.now(),
      finalFare: finalFare || ride.finalFare || ride.estimatedPrice,
      actualDistance: actualDistance || ride.estimatedDistance,
      actualDuration: actualDuration || ride.estimatedDuration,
    }, rideId).catch(error => {
      console.error(`❌ Error archivando viaje ${rideId}:`, error);
    });

    return {
      success: true,
      message: 'Viaje completado exitosamente',
      ride: {
        ...ride,
        status: 'completed',
        finalFare: finalFare || ride.finalFare,
      },
    };
  } catch (error: any) {
    console.error("❌ Error completando viaje:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * 11. OBTENER VIAJE ACTIVO
 * Obtiene el viaje activo del usuario (cliente o conductor)
 */
export const getActiveRide = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const userId = context.auth.uid;

  try {
    // Buscar viaje activo donde el usuario es cliente
    const clientRidesSnapshot = await admin.database()
      .ref('activeRides')
      .orderByChild('clientId')
      .equalTo(userId)
      .once('value');

    const clientRides = clientRidesSnapshot.val();

    if (clientRides) {
      // Buscar el primer viaje que no esté completado o cancelado
      for (const [rideId, ride] of Object.entries(clientRides) as [string, any][]) {
        if (ride.status !== 'completed' && ride.status !== 'canceled') {
          return {
            success: true,
            ride: {
              ...ride,
              id: rideId,
            },
            role: 'client',
          };
        }
      }
    }

    // Buscar viaje activo donde el usuario es conductor
    const driverRidesSnapshot = await admin.database()
      .ref('activeRides')
      .orderByChild('driverId')
      .equalTo(userId)
      .once('value');

    const driverRides = driverRidesSnapshot.val();

    if (driverRides) {
      // Buscar el primer viaje que no esté completado o cancelado
      for (const [rideId, ride] of Object.entries(driverRides) as [string, any][]) {
        if (ride.status !== 'completed' && ride.status !== 'canceled') {
          return {
            success: true,
            ride: {
              ...ride,
              id: rideId,
            },
            role: 'driver',
          };
        }
      }
    }

    // No hay viaje activo
    return {
      success: true,
      message: 'No hay viajes activos',
    };
  } catch (error: any) {
    console.error('❌ Error obteniendo viaje activo:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * 12. ACTUALIZAR ESTADO DEL VIAJE (Wrapper)
 * Función unificada para actualizar estado del viaje
 * Llama a startRide o completeRide según el estado
 */
export const updateRideStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { rideId, status, finalFare, actualDistance, actualDuration } = data;

  try {
    if (status === 'in_progress') {
      // Llamar a startRide
      return await startRide.run({ rideId }, context);
    } else if (status === 'completed') {
      // Llamar a completeRide
      return await completeRide.run({ rideId, finalFare, actualDistance, actualDuration }, context);
    } else {
      throw new functions.https.HttpsError('invalid-argument', `Estado no soportado: ${status}`);
    }
  } catch (error: any) {
    console.error('❌ Error actualizando estado del viaje:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
