import * as functions from 'firebase-functions';
import admin from 'firebase-admin';
import { sendNotificationToUser } from '../services/pushNotifications';
import { RideRepository } from '../sequelize/repositories/RideRepository';
import { RideLocationRepository } from '../sequelize/repositories/RideLocationRepository';

const db = admin.database();

const rideRepo = new RideRepository();
const locationRepo = new RideLocationRepository();

const FUNCTIONS_PUSH_NOTIFICATIONS_ENABLED =
  (process.env.FUNCTIONS_PUSH_NOTIFICATIONS ?? 'false').toLowerCase() === 'true';

const CONFIRM_WINDOW_MS = 10 * 60 * 1000;
const PROMOTION_GRACE_MS = 2 * 60 * 1000;

const parseEpochMs = (value: any): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
};

const notifyUserSafe = async (
  userId: string | null | undefined,
  title: string,
  body: string,
  data: Record<string, string | number | boolean | null | undefined> = {},
) => {
  if (!FUNCTIONS_PUSH_NOTIFICATIONS_ENABLED) {
    return;
  }

  if (!userId) {
    return;
  }

  try {
    const rideIdRaw = data?.rideId ?? data?.ride_id;
    const normalizedRideId = typeof rideIdRaw === 'string'
      ? rideIdRaw
      : typeof rideIdRaw === 'number' && Number.isFinite(rideIdRaw)
        ? String(rideIdRaw)
        : '';
    const notificationKey = normalizedRideId ? `programmed-ride-${normalizedRideId}` : undefined;

    await sendNotificationToUser(userId, {
      title,
      body,
      data: {
        ...data,
        rideId: normalizedRideId || undefined,
      },
      androidChannelId: 'default',
      notificationKey,
      expiresInMs: 15 * 60 * 1000,
    });
  } catch (error) {
    console.error('❌ [programmedRides] Error enviando notificación push:', {
      userId,
      title,
      error,
    });
  }
};

const upsertRideInSupabase = async (rideId: string, ride: any, status: string) => {
  const existing = await rideRepo.findById(rideId);
  const createdAt = new Date();

  if (!existing) {
    const record = await rideRepo.create({
      id: rideId,
      firebase_ride_id: rideId,
      client_id: ride.clientId,
      driver_id: ride.driverId || null,
      estimated_distance: ride.estimatedDistance ?? null,
      estimated_duration: ride.estimatedDuration ?? null,
      estimated_price: ride.estimatedPrice ?? null,
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

export const processProgrammedRides = functions.pubsub
  .schedule('*/1 * * * *')
  .timeZone('America/Managua')
  .onRun(async () => {
    const snapshot = await db.ref('programmedRides').once('value');
    const rides = snapshot.val();

    if (!rides) {
      return null;
    }

    const now = Date.now();

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
            await notifyUserSafe(rawRide.clientId, '🕒 Confirma tu viaje programado', 'Tu viaje está por iniciar. Confirma para continuar.', {
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
            await notifyUserSafe(rawRide.driverId, '🕒 Confirma tu viaje programado', 'Tienes un viaje programado por iniciar. Confirma para reservarlo.', {
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
          await notifyUserSafe(rawRide.clientId, 'Viaje cancelado', 'No confirmaste tu viaje programado a tiempo.', {
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

        await notifyUserSafe(rawRide.clientId, '🚗 Tu viaje programado está listo', 'Tu viaje ha sido activado.', {
          rideId,
          type: 'programmed_ride_activated',
        });

        if (activateWithDriver) {
          await notifyUserSafe(rawRide.driverId, '🚗 Viaje programado activado', 'Tu viaje programado ha sido activado.', {
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
