import * as functions from 'firebase-functions';
import admin from 'firebase-admin';
import crypto from 'crypto';
import { sendNotificationToUser } from '../services/pushNotifications';
import { RideRepository } from '../sequelize/repositories/RideRepository';
import { RideLocationRepository } from '../sequelize/repositories/RideLocationRepository';

const db = admin.database();

const rideRepo = new RideRepository();
const locationRepo = new RideLocationRepository();

const FUNCTIONS_PUSH_NOTIFICATIONS_ENABLED =
  (process.env.FUNCTIONS_PUSH_NOTIFICATIONS ?? 'false').toLowerCase() === 'true';

const PROGRAMMED_RIDES_WEBHOOK_SECRET = process.env.PROGRAMMED_RIDES_WEBHOOK_SECRET ?? '';

const CONFIRM_WINDOW_MS = 10 * 60 * 1000;
const PROMOTION_GRACE_MS = 2 * 60 * 1000;
const PROCESSING_LOCK_TTL_MS = 90 * 1000;

type ProcessSource = 'scheduler' | 'webhook';

type RideProcessResult = {
  rideId: string;
  eventId: string;
  source: ProcessSource;
  status:
    | 'processed_canceled_sync'
    | 'processed_confirmation_window'
    | 'processed_canceled_unconfirmed'
    | 'processed_promoted'
    | 'processed_not_due_yet'
    | 'skipped_missing'
    | 'skipped_invalid_scheduled_at'
    | 'skipped_locked'
    | 'skipped_already_processed';
};

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

const lockRefForRide = (rideId: string) => db.ref(`programmedRidesLocks/${rideId}`);
const processedRefForRideEvent = (rideId: string, eventId: string) =>
  db.ref(`programmedRidesProcessedEvents/${rideId}/${eventId}`);

const normalizeEventId = (
  rideId: string,
  source: ProcessSource,
  nowMs: number,
  preferred?: string | null,
): string => {
  const sanitized = typeof preferred === 'string' ? preferred.trim() : '';
  if (sanitized) {
    return sanitized;
  }
  if (source === 'scheduler') {
    const minuteBucket = Math.floor(nowMs / 60_000);
    return `cron:${rideId}:${minuteBucket}`;
  }
  return `webhook:${rideId}:${nowMs}`;
};

const acquireRideLock = async (
  rideId: string,
  eventId: string,
  source: ProcessSource,
  nowMs: number,
): Promise<boolean> => {
  const lockRef = lockRefForRide(rideId);
  const tx = await lockRef.transaction(
    (current: any) => {
      const expiresAt = Number(current?.expiresAtMs ?? 0);
      const hasValidLock = Boolean(current?.eventId) && expiresAt > nowMs;
      const lockOwnedBySameEvent = current?.eventId === eventId;

      if (hasValidLock && !lockOwnedBySameEvent) {
        return;
      }

      return {
        eventId,
        source,
        acquiredAtMs: nowMs,
        expiresAtMs: nowMs + PROCESSING_LOCK_TTL_MS,
      };
    },
    undefined,
    false,
  );

  if (!tx.committed) {
    return false;
  }

  const lock = tx.snapshot.val();
  return Boolean(lock?.eventId === eventId);
};

const releaseRideLock = async (rideId: string, eventId: string): Promise<void> => {
  const lockRef = lockRefForRide(rideId);
  const lockSnap = await lockRef.once('value');
  const lock = lockSnap.val();
  if (lock?.eventId === eventId) {
    await lockRef.remove();
  }
};

const hasProcessedEvent = async (rideId: string, eventId: string): Promise<boolean> => {
  const processedSnap = await processedRefForRideEvent(rideId, eventId).once('value');
  return processedSnap.exists();
};

const markEventProcessed = async (
  rideId: string,
  eventId: string,
  source: ProcessSource,
  status: RideProcessResult['status'],
) => {
  await processedRefForRideEvent(rideId, eventId).set({
    status,
    source,
    processedAt: admin.database.ServerValue.TIMESTAMP,
  });
};

const signatureMatches = (provided: string, expected: string): boolean => {
  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');

  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuf, expectedBuf);
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

const processSingleProgrammedRide = async (
  rideId: string,
  options: {
    nowMs: number;
    source: ProcessSource;
    preferredEventId?: string | null;
  },
): Promise<RideProcessResult> => {
  const eventId = normalizeEventId(rideId, options.source, options.nowMs, options.preferredEventId);

  const locked = await acquireRideLock(rideId, eventId, options.source, options.nowMs);
  if (!locked) {
    return {
      rideId,
      eventId,
      source: options.source,
      status: 'skipped_locked',
    };
  }

  try {
    if (await hasProcessedEvent(rideId, eventId)) {
      return {
        rideId,
        eventId,
        source: options.source,
        status: 'skipped_already_processed',
      };
    }

    const programmedRef = db.ref(`programmedRides/${rideId}`);
    const rideSnapshot = await programmedRef.once('value');
    const rawRide = rideSnapshot.val();

    if (!rawRide) {
      await markEventProcessed(rideId, eventId, options.source, 'skipped_missing');
      return {
        rideId,
        eventId,
        source: options.source,
        status: 'skipped_missing',
      };
    }

    const scheduledAt = parseEpochMs(rawRide.scheduledAt);
    if (!scheduledAt) {
      await markEventProcessed(rideId, eventId, options.source, 'skipped_invalid_scheduled_at');
      return {
        rideId,
        eventId,
        source: options.source,
        status: 'skipped_invalid_scheduled_at',
      };
    }

    if (rawRide.status === 'canceled') {
      if (!rawRide.supabaseSyncedAt) {
        await upsertRideInSupabase(rideId, rawRide, 'canceled');
        await programmedRef.update({
          supabaseSyncedAt: admin.database.ServerValue.TIMESTAMP,
          updatedAt: admin.database.ServerValue.TIMESTAMP,
        });
      }

      await markEventProcessed(rideId, eventId, options.source, 'processed_canceled_sync');
      return {
        rideId,
        eventId,
        source: options.source,
        status: 'processed_canceled_sync',
      };
    }

    const confirmStart = scheduledAt - CONFIRM_WINDOW_MS;
    const shouldConfirmWindow = options.nowMs >= confirmStart && options.nowMs < scheduledAt + PROMOTION_GRACE_MS;

    const hasClientConfirmed = Boolean(rawRide.clientConfirmedAt || rawRide.clientConfirmed);
    const hasDriverConfirmed = Boolean(rawRide.driverConfirmedAt || rawRide.driverConfirmed);

    if (shouldConfirmWindow) {
      if (!hasClientConfirmed && !rawRide.clientConfirmationRequestedAt) {
        await programmedRef.update({
          clientConfirmationRequestedAt: admin.database.ServerValue.TIMESTAMP,
          updatedAt: admin.database.ServerValue.TIMESTAMP,
        });
        await notifyUserSafe(rawRide.clientId, '🕒 Confirma tu viaje programado', 'Tu viaje está por iniciar. Confirma para continuar.', {
          rideId,
          type: 'programmed_ride_client_confirm',
        });
      }

      if (
        rawRide.driverId &&
        hasClientConfirmed &&
        !hasDriverConfirmed &&
        !rawRide.driverConfirmationRequestedAt
      ) {
        await programmedRef.update({
          driverConfirmationRequestedAt: admin.database.ServerValue.TIMESTAMP,
          updatedAt: admin.database.ServerValue.TIMESTAMP,
        });
        await notifyUserSafe(rawRide.driverId, '🕒 Confirma tu viaje programado', 'Tienes un viaje programado por iniciar. Confirma para reservarlo.', {
          rideId,
          type: 'programmed_ride_driver_confirm',
        });
      }

      await markEventProcessed(rideId, eventId, options.source, 'processed_confirmation_window');
      return {
        rideId,
        eventId,
        source: options.source,
        status: 'processed_confirmation_window',
      };
    }

    if (options.nowMs < scheduledAt) {
      await markEventProcessed(rideId, eventId, options.source, 'processed_not_due_yet');
      return {
        rideId,
        eventId,
        source: options.source,
        status: 'processed_not_due_yet',
      };
    }

    if (!hasClientConfirmed) {
      const canceledPayload: Record<string, any> = {
        status: 'canceled',
        cancelReason: rawRide.cancelReason || 'client_not_confirmed',
        canceledBy: rawRide.canceledBy || 'system',
        canceledAt: admin.database.ServerValue.TIMESTAMP,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      };

      if (!rawRide.autoCancelNotifiedAt) {
        canceledPayload.autoCancelNotifiedAt = admin.database.ServerValue.TIMESTAMP;
      }

      await programmedRef.update(canceledPayload);

      if (!rawRide.autoCancelNotifiedAt) {
        await notifyUserSafe(rawRide.clientId, 'Viaje cancelado', 'No confirmaste tu viaje programado a tiempo.', {
          rideId,
          type: 'programmed_ride_canceled',
        });
      }

      await upsertRideInSupabase(
        rideId,
        {
          ...rawRide,
          status: 'canceled',
          cancelReason: rawRide.cancelReason || 'client_not_confirmed',
          canceledBy: rawRide.canceledBy || 'system',
        },
        'canceled',
      );

      await programmedRef.update({
        supabaseSyncedAt: admin.database.ServerValue.TIMESTAMP,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });

      await markEventProcessed(rideId, eventId, options.source, 'processed_canceled_unconfirmed');
      return {
        rideId,
        eventId,
        source: options.source,
        status: 'processed_canceled_unconfirmed',
      };
    }

    const activateWithDriver = Boolean(rawRide.driverId && hasDriverConfirmed);
    const promotedRide = {
      ...rawRide,
      driverId: activateWithDriver ? rawRide.driverId : null,
    };

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

    const activeRideRef = db.ref(`activeRides/${rideId}`);
    const activeRideSnapshot = await activeRideRef.once('value');
    const activeRideAlreadyExists = activeRideSnapshot.exists();

    if (!activeRideAlreadyExists) {
      const activePayload = buildActiveRidePayload(rideId, promotedRide, { activateWithDriver });
      await activeRideRef.set(activePayload);
    }

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

    if (!activeRideAlreadyExists) {
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
    }

    await programmedRef.remove();
    await markEventProcessed(rideId, eventId, options.source, 'processed_promoted');

    return {
      rideId,
      eventId,
      source: options.source,
      status: 'processed_promoted',
    };
  } finally {
    try {
      await releaseRideLock(rideId, eventId);
    } catch (releaseError) {
      console.warn('[programmedRides] No se pudo liberar lock', {
        rideId,
        eventId,
        error: (releaseError as any)?.message || releaseError,
      });
    }
  }
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

    for (const [rideId] of Object.entries<any>(rides)) {
      try {
        await processSingleProgrammedRide(rideId, {
          nowMs: now,
          source: 'scheduler',
        });
      } catch (error) {
        console.error('❌ [programmedRides] Error procesando ride en scheduler', {
          rideId,
          error,
        });
      }
    }

    return null;
  });

export const processProgrammedRidesWebhook = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, x-programmed-rides-signature');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const configuredSecret = PROGRAMMED_RIDES_WEBHOOK_SECRET.trim();
  if (!configuredSecret) {
    console.error('❌ [programmedRidesWebhook] Missing PROGRAMMED_RIDES_WEBHOOK_SECRET');
    res.status(503).json({
      success: false,
      error: 'Webhook misconfigured: missing secret',
    });
    return;
  }

  const providedSignature = String(req.get('x-programmed-rides-signature') || '').trim();
  if (!providedSignature || !signatureMatches(providedSignature, configuredSecret)) {
    res.status(401).json({ success: false, error: 'Invalid signature' });
    return;
  }

  const body = (req.body ?? {}) as {
    rideId?: string;
    eventId?: string;
  };

  const rideId = typeof body.rideId === 'string' ? body.rideId.trim() : '';
  const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : undefined;
  const now = Date.now();

  try {
    if (rideId) {
      const single = await processSingleProgrammedRide(rideId, {
        nowMs: now,
        source: 'webhook',
        preferredEventId: eventId,
      });

      res.status(200).json({
        success: true,
        mode: 'single',
        result: single,
      });
      return;
    }

    const snapshot = await db.ref('programmedRides').once('value');
    const rides = snapshot.val();
    if (!rides) {
      res.status(200).json({ success: true, mode: 'all', processed: 0, results: [] });
      return;
    }

    const results: RideProcessResult[] = [];
    for (const [iterRideId] of Object.entries<any>(rides)) {
      try {
        const result = await processSingleProgrammedRide(iterRideId, {
          nowMs: now,
          source: 'webhook',
          preferredEventId: eventId ? `${eventId}:${iterRideId}` : undefined,
        });
        results.push(result);
      } catch (error) {
        console.error('❌ [programmedRidesWebhook] Error procesando ride', {
          rideId: iterRideId,
          error,
        });
      }
    }

    res.status(200).json({
      success: true,
      mode: 'all',
      processed: results.length,
      results,
    });
  } catch (error: any) {
    console.error('❌ [programmedRidesWebhook] Error general', {
      error: error?.message || error,
    });
    res.status(500).json({
      success: false,
      error: error?.message || 'Error procesando webhook',
    });
  }
});
