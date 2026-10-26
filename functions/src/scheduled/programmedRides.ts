import * as functions from 'firebase-functions/v1';
import admin from 'firebase-admin';
import { notifyUserSafe } from '../services/notifyUserSafe';
import { RideRepository } from '../sequelize/repositories/RideRepository';
import { RideLocationRepository } from '../sequelize/repositories/RideLocationRepository';
import {
  getCommissionFromDatabase,
  serviceCodeFromRideFields,
} from '../helpers/priceCalculator';
import { calculateCommissionAmount } from '../helpers/pricingRules';

const db = admin.database();

const rideRepo = new RideRepository();
const locationRepo = new RideLocationRepository();

const CONFIRM_WINDOW_MS = 10 * 60 * 1000;
const PROMOTION_GRACE_MS = 2 * 60 * 1000;

const parseEpochMs = (value: any): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
};

const programmedNotify = (
  userId: string | null | undefined,
  title: string,
  body: string,
  data: Record<string, string | number | boolean | null | undefined> = {},
) => {
  const { type, ...restData } = data;
  return notifyUserSafe(userId, title, body, restData, {
    type: (type as any) ?? 'programmed_ride_reminder',
    notificationKeyPrefix: 'programmed-ride',
    androidChannelId: 'rundi-default-v2',
    expiresInMs: 15 * 60 * 1000,
  });
};

const upsertRideInSupabase = async (rideId: string, ride: any, status: string) => {
  const existing = await rideRepo.findById(rideId);
  const createdAt = new Date();

  if (!existing) {
    let pricingSnapshot = ride.pricingSnapshot ?? null;
    let commissionRate = pricingSnapshot?.commissionRate ?? null;
    if (ride.driverId && pricingSnapshot) {
      const serviceCode = pricingSnapshot.serviceCode ?? serviceCodeFromRideFields(
        ride.rideType,
        ride.vehicleType,
        ride.designatedDriverVehicle,
      );
      commissionRate = await getCommissionFromDatabase(ride.driverId, serviceCode);
      pricingSnapshot = {
        ...pricingSnapshot,
        commissionRate,
        commissionAmount: calculateCommissionAmount(
          Number(pricingSnapshot.finalFare ?? ride.estimatedPrice ?? 0),
          commissionRate,
        ),
      };
    }
    const record = await rideRepo.create({
      id: rideId,
      firebase_ride_id: rideId,
      client_id: ride.clientId,
      driver_id: ride.driverId || null,
      estimated_distance: ride.estimatedDistance ?? null,
      estimated_duration: ride.estimatedDuration ?? null,
      estimated_price: ride.estimatedPrice ?? null,
      pricing_snapshot: pricingSnapshot,
      feature_codes: Array.isArray(ride.featureCodes) ? ride.featureCodes : [],
      surge_multiplier: ride.surgeMultiplier ?? 1,
      commission_rate_applied: commissionRate,
      passengers: ride.passengers ?? 1,
      notes: ride.notes || null,
      ride_type: ride.rideType || 'normal',
      vehicle_type: ride.vehicleType || 'auto',
      designated_driver_vehicle: ride.designatedDriverVehicle ?? null,
      payment_type: ride.paymentMethod || 'cash',
      status,
      cancel_reason: ride.cancelReason || null,
      canceled_by: ride.canceledBy || null,
      requested_at: createdAt,
      accepted_at: status === 'accepted' ? createdAt : null,
      canceled_at: status === 'canceled' ? createdAt : null,
      created_at: createdAt,
      updated_at: createdAt,
      service_id: ride.serviceId || null,
      client_vehicle_photo: ride.clientVehiclePhoto ?? null,
      waypoints_count: Array.isArray(ride.extraDestinations) ? ride.extraDestinations.length : 0,
      has_multiple_stops: Array.isArray(ride.extraDestinations) ? ride.extraDestinations.length > 0 : false,
    });

    const origin = ride.origin;
    const destination = ride.destination;
    const extraDestinations = Array.isArray(ride.extraDestinations) ? ride.extraDestinations : [];

    if (origin && typeof origin.lat === 'number' && typeof origin.lng === 'number') {
      let order = 1;
      const originLocation = await locationRepo.create({
        ride_id: rideId,
        location_type: 'origin',
        location_order: order++,
        latitude: origin.lat,
        longitude: origin.lng,
        address: origin.address || 'Ubicación de origen',
      });

      for (const waypoint of extraDestinations) {
        if (!waypoint || typeof waypoint.lat !== 'number' || typeof waypoint.lng !== 'number') {
          continue;
        }
        await locationRepo.create({
          ride_id: rideId,
          location_type: 'waypoint',
          location_order: order++,
          latitude: waypoint.lat,
          longitude: waypoint.lng,
          address: waypoint.address || null,
        });
      }

      const destinationLocation = destination && typeof destination.lat === 'number' && typeof destination.lng === 'number'
        ? await locationRepo.create({
          ride_id: rideId,
          location_type: 'destination',
          location_order: order++,
          latitude: destination.lat,
          longitude: destination.lng,
          address: destination.address || 'Ubicación de destino',
        })
        : null;

      await rideRepo.update(rideId, {
        origin_location_id: originLocation.id,
        destination_location_id: destinationLocation?.id ?? null,
        waypoints_count: extraDestinations.length,
        has_multiple_stops: extraDestinations.length > 0,
      });
    }

    return record;
  }

  await rideRepo.update(rideId, {
    status,
    driver_id: ride.driverId || null,
    cancel_reason: ride.cancelReason || existing.cancel_reason || null,
    canceled_by: ride.canceledBy || existing.canceled_by || null,
    updated_at: createdAt,
    accepted_at: status === 'accepted' ? (existing.accepted_at || createdAt) : existing.accepted_at,
    canceled_at: status === 'canceled' ? (existing.canceled_at || createdAt) : existing.canceled_at,
  });

  return existing;
};

const buildActiveRidePayload = (rideId: string, programmedRide: any, options: { activateWithDriver: boolean }) => {
  const origin = programmedRide.origin || null;
  const destination = programmedRide.destination || null;
  const extraDestinations = Array.isArray(programmedRide.extraDestinations) ? programmedRide.extraDestinations : [];

  const payload: Record<string, any> = {
    id: rideId,
    isProgrammed: true,
    scheduledAt: programmedRide.scheduledAt,
    clientId: programmedRide.clientId,
    clientName: programmedRide.clientName ?? null,
    clientPhone: programmedRide.clientPhone ?? null,
    clientRating: programmedRide.clientRating ?? null,
    clientTotalRatings: programmedRide.clientTotalRatings ?? null,
    status: options.activateWithDriver ? 'accepted' : 'requested',
    origin,
    destination,
    estimatedPrice: programmedRide.estimatedPrice ?? null,
    pricingSnapshot: programmedRide.pricingSnapshot ?? null,
    featureCodes: programmedRide.featureCodes ?? [],
    surgeMultiplier: programmedRide.surgeMultiplier ?? 1,
    estimatedDistance: programmedRide.estimatedDistance ?? null,
    estimatedDuration: programmedRide.estimatedDuration ?? null,
    rideType: programmedRide.rideType ?? 'normal',
    vehicleType: programmedRide.vehicleType ?? null,
    designatedDriverVehicle: programmedRide.designatedDriverVehicle ?? null,
    passengers: programmedRide.passengers ?? 1,
    paymentMethod: programmedRide.paymentMethod ?? 'cash',
    serviceId: programmedRide.serviceId ?? null,
    clientVehiclePhoto: programmedRide.clientVehiclePhoto ?? null,
    createdAt: programmedRide.createdAt ?? admin.database.ServerValue.TIMESTAMP,
    updatedAt: admin.database.ServerValue.TIMESTAMP,
  };

  if (extraDestinations.length > 0) {
    payload.extraDestinations = extraDestinations;
    payload.hasMultipleDestinations = true;
    payload.waypointsCount = extraDestinations.length;
  } else {
    payload.hasMultipleDestinations = false;
    payload.waypointsCount = 0;
  }

  if (options.activateWithDriver) {
    payload.driverId = programmedRide.driverId;
    payload.driver = programmedRide.driver ?? null;
    payload.acceptedAt = admin.database.ServerValue.TIMESTAMP;
  }

  return payload;
};

export const processProgrammedRides = functions
  .runWith({ maxInstances: 1 })
  .pubsub
  .schedule('*/1 * * * *')
  .timeZone('America/Managua')
  .onRun(async () => {
    const now = Date.now();

    // ✅ Grupo 7 (H9): Filtrar por scheduledAt en lugar de cargar TODOS los programmedRides.
    // Ventana de tiempo: desde (now - CONFIRM_WINDOW_MS - buffer) hasta (now + PROMOTION_GRACE_MS + buffer)
    // El buffer de 1 hora captura rides cancelados recientes que aún necesitan sync a Supabase.
    const windowStart = now - CONFIRM_WINDOW_MS - 60 * 60 * 1000; // 1h antes de la ventana de confirmación
    const windowEnd = now + PROMOTION_GRACE_MS + 60 * 60 * 1000;   // 1h después del grace period

    // Query 1: Rides dentro de la ventana de tiempo relevante (usa índice scheduledAt)
    const windowSnapshot = await db
      .ref('programmedRides')
      .orderByChild('scheduledAt')
      .startAt(windowStart)
      .endAt(windowEnd)
      .once('value');

    // Query 2: Rides cancelados que aún no se han sincronizado a Supabase (sin filtro de tiempo)
    // Usamos limitToFirst para no cargar demasiados a la vez
    const canceledSnapshot = await db
      .ref('programmedRides')
      .orderByChild('status')
      .equalTo('canceled')
      .limitToFirst(100)
      .once('value');

    // Query 3: Rides huérfanos cuya ventana de procesamiento ya cerró (scheduledAt < windowStart)
    // Sin este barrido, un ride no cancelado quedaría atascado para siempre en driver_assigned
    // si el scheduler estuvo caído más de 70min o si la promoción falló repetidamente.
    const staleSnapshot = await db
      .ref('programmedRides')
      .orderByChild('scheduledAt')
      .endAt(windowStart)
      .limitToFirst(100)
      .once('value');

    // Combinar resultados eliminando duplicados
    const windowRides = windowSnapshot.val() || {};
    const canceledRides = canceledSnapshot.val() || {};
    const staleRides = staleSnapshot.val() || {};
    const rides: Record<string, any> = { ...staleRides, ...canceledRides };
    for (const [key, value] of Object.entries(windowRides)) {
      if (!rides[key]) {
        rides[key] = value;
      }
    }

    if (Object.keys(rides).length === 0) {
      return null;
    }

    for (const [rideId, rawRide] of Object.entries<any>(rides)) {
      if (!rawRide) {
        continue;
      }

      const scheduledAt = parseEpochMs(rawRide.scheduledAt);
      if (!scheduledAt) {
        continue;
      }

      if (rawRide.status === 'canceled') {
        if (!rawRide.supabaseSyncedAt) {
          try {
            await upsertRideInSupabase(rideId, rawRide, 'canceled');
            await db.ref(`programmedRides/${rideId}`).update({
              supabaseSyncedAt: admin.database.ServerValue.TIMESTAMP,
              updatedAt: admin.database.ServerValue.TIMESTAMP,
            });
          } catch (error) {
            console.error('❌ [programmedRides] Error sincronizando cancelación a Supabase', {
              rideId,
              error,
            });
          }
        }
        continue;
      }

      // Ride huérfano: su ventana de procesamiento ya cerró sin ser promovido ni
      // cancelado (scheduler caído >70min o promoción fallida repetidamente).
      // Lo cancelamos para que no quede atascado indefinidamente.
      if (scheduledAt < windowStart) {
        try {
          await db.ref(`programmedRides/${rideId}`).update({
            status: 'canceled',
            cancelReason: 'missed_processing_window',
            canceledBy: 'system',
            canceledAt: admin.database.ServerValue.TIMESTAMP,
            updatedAt: admin.database.ServerValue.TIMESTAMP,
          });
          await db.ref(`programmedRideCodes/${rideId}`).remove();
          await programmedNotify(rawRide.clientId, 'Viaje programado expirado', 'Tu viaje programado no pudo procesarse a tiempo y fue cancelado.', {
            rideId,
            type: 'programmed_ride_canceled',
          });
          if (rawRide.driverId) {
            await programmedNotify(rawRide.driverId, 'Viaje programado cancelado', 'El viaje programado fue cancelado.', {
              rideId,
              type: 'programmed_ride_canceled',
            });
          }
        } catch (error) {
          console.error('❌ [programmedRides] Error cancelando ride huérfano', {
            rideId,
            error,
          });
        }
        continue;
      }

      const confirmStart = scheduledAt - CONFIRM_WINDOW_MS;
      const shouldConfirmWindow = now >= confirmStart && now < scheduledAt + PROMOTION_GRACE_MS;

      const hasClientConfirmed = Boolean(rawRide.clientConfirmedAt || rawRide.clientConfirmed);
      const hasDriverConfirmed = Boolean(rawRide.driverConfirmedAt || rawRide.driverConfirmed);

      if (shouldConfirmWindow) {
        if (!hasClientConfirmed && !rawRide.clientConfirmationRequestedAt) {
          try {
            await db.ref(`programmedRides/${rideId}`).update({
              clientConfirmationRequestedAt: admin.database.ServerValue.TIMESTAMP,
              updatedAt: admin.database.ServerValue.TIMESTAMP,
            });
            await programmedNotify(rawRide.clientId, '🕒 Confirma tu viaje programado', 'Tu viaje está por iniciar. Confirma para continuar.', {
              rideId,
              type: 'programmed_ride_client_confirm',
            });
          } catch (error) {
            console.error('❌ [programmedRides] Error notificando confirmación de cliente', {
              rideId,
              error,
            });
          }
        }

        if (
          rawRide.driverId &&
          hasClientConfirmed &&
          !hasDriverConfirmed &&
          !rawRide.driverConfirmationRequestedAt
        ) {
          try {
            await db.ref(`programmedRides/${rideId}`).update({
              driverConfirmationRequestedAt: admin.database.ServerValue.TIMESTAMP,
              updatedAt: admin.database.ServerValue.TIMESTAMP,
            });
            await programmedNotify(rawRide.driverId, '🕒 Confirma tu viaje programado', 'Tienes un viaje programado por iniciar. Confirma para reservarlo.', {
              rideId,
              type: 'programmed_ride_driver_confirm',
            });
          } catch (error) {
            console.error('❌ [programmedRides] Error notificando confirmación de conductor', {
              rideId,
              error,
            });
          }
        }
      }

      if (now < scheduledAt) {
        continue;
      }

      const programmedRef = db.ref(`programmedRides/${rideId}`);

      if (!hasClientConfirmed) {
        try {
          await programmedRef.update({
            status: 'canceled',
            cancelReason: rawRide.cancelReason || 'client_not_confirmed',
            canceledBy: rawRide.canceledBy || 'system',
            canceledAt: admin.database.ServerValue.TIMESTAMP,
            updatedAt: admin.database.ServerValue.TIMESTAMP,
          });
          await db.ref(`programmedRideCodes/${rideId}`).remove();
          await programmedNotify(rawRide.clientId, 'Viaje cancelado', 'No confirmaste tu viaje programado a tiempo.', {
            rideId,
            type: 'programmed_ride_canceled',
          });
        } catch (error) {
          console.error('❌ [programmedRides] Error cancelando viaje no confirmado', {
            rideId,
            error,
          });
        }
        continue;
      }

      const activateWithDriver = Boolean(rawRide.driverId && hasDriverConfirmed);
      const promotedRide = {
        ...rawRide,
        driverId: activateWithDriver ? rawRide.driverId : null,
      };

      try {
        if (activateWithDriver) {
          try {
            const driverInfoSnapshot = await db.ref(`driversInfo/${rawRide.driverId}`).once('value');
            const driverInfo = driverInfoSnapshot.val();
            promotedRide.driver = {
              id: rawRide.driverId,
              userId: rawRide.driverId,
              name: driverInfo?.name ?? driverInfo?.fullName ?? 'Conductor',
              rating: driverInfo?.rating ?? 0,
              profilePhoto: driverInfo?.photoURL ?? driverInfo?.photoUrl ?? null,
            };
          } catch (driverInfoErr) {
            console.warn('[programmedRides] No se pudo obtener driversInfo para promoción', {
              rideId,
              driverId: rawRide.driverId,
              error: (driverInfoErr as any)?.message || driverInfoErr,
            });
          }
        }

        const activePayload = buildActiveRidePayload(rideId, promotedRide, { activateWithDriver });
        await db.ref(`activeRides/${rideId}`).set(activePayload);

        if (activateWithDriver && rawRide.driverId) {
          try {
            await db.ref(`driverLocations/${rawRide.driverId}`).update({
              status: 'busy',
              updatedAt: admin.database.ServerValue.TIMESTAMP,
            });
          } catch (busyErr) {
            console.warn('[programmedRides] No se pudo marcar BUSY en driverLocations', {
              rideId,
              driverId: rawRide.driverId,
              error: (busyErr as any)?.message || busyErr,
            });
          }
        }

        await db.ref(`paymentStatus/${rideId}`).set({
          status: 'pending',
          amount: rawRide.estimatedPrice ?? rawRide.finalFare ?? null,
          paymentMethod: rawRide.paymentMethod || 'cash',
          createdAt: admin.database.ServerValue.TIMESTAMP,
          updatedAt: admin.database.ServerValue.TIMESTAMP,
        });

        const supabaseStatus = activateWithDriver ? 'accepted' : 'requested';
        await upsertRideInSupabase(
          rideId,
          {
            ...promotedRide,
            driverId: activateWithDriver ? rawRide.driverId : null,
          },
          supabaseStatus,
        );

        await programmedRef.remove();
        await db.ref(`programmedRideCodes/${rideId}`).remove();

        await programmedNotify(rawRide.clientId, '🚗 Tu viaje programado está listo', 'Tu viaje ha sido activado.', {
          rideId,
          type: 'programmed_ride_activated',
        });

        if (activateWithDriver) {
          await programmedNotify(rawRide.driverId, '🚗 Viaje programado activado', 'Tu viaje programado ha sido activado.', {
            rideId,
            type: 'programmed_ride_activated',
          });
        }
      } catch (error) {
        console.error('❌ [programmedRides] Error promoviendo viaje programado', {
          rideId,
          error,
        });
      }
    }

    return null;
  });
