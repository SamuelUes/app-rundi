/**
 * Limpia usuarios inactivos
 * Se ejecuta cada hora
 * Elimina sesiones y nodos de presencia de usuarios inactivos por más de 24h
 */

import * as functions from 'firebase-functions/v1';
import admin from 'firebase-admin';
import { DEFAULT_SERVICE_AREA_ID } from '../../config/constants';

export const cleanupInactiveUsers = functions
  .runWith({ memory: '256MB', maxInstances: 1 })
  .pubsub
  .schedule('every 1 hours')
  .timeZone('America/Managua')
  .onRun(async () => {
    try {
      const db = admin.database();
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const batchSize = 500;

      const snapshot = await db
        .ref('/sessions')
        .orderByChild('lastSeen')
        .endAt(cutoff)
        .limitToFirst(batchSize)
        .once('value');

      if (!snapshot.exists()) {
        return { success: true, cleanedUsers: 0 };
      }

      const sessions = snapshot.val() || {};
      const userIds = Object.keys(sessions);
      if (userIds.length === 0) {
        return { success: true, cleanedUsers: 0 };
      }

      const updates: Record<string, null> = {};
      let cleanedUsers = 0;

      for (const userId of userIds) {
        const session = sessions[userId] || {};
        const lastSeen = typeof session.lastSeen === 'number' ? session.lastSeen : null;
        if (!lastSeen || lastSeen > cutoff) {
          continue;
        }

        cleanedUsers += 1;

        const serviceAreaId =
          typeof session.serviceAreaId === 'string' && session.serviceAreaId.trim()
            ? session.serviceAreaId.trim()
            : DEFAULT_SERVICE_AREA_ID;

        updates[`/driversInfo/${userId}`] = null;
        updates[`/driverLocations/${userId}`] = null;
        updates[`/clientsInfo/${userId}`] = null;
        updates[`/clientsLocations/${userId}`] = null;
        updates[`/presence/${userId}`] = null;

        updates[`/driverLocationsByArea/${serviceAreaId}/${userId}`] = null;
        updates[`/driverLocationsByArea/${DEFAULT_SERVICE_AREA_ID}/${userId}`] = null;
        updates[`/clientsLocationsByArea/${serviceAreaId}/${userId}`] = null;
        updates[`/clientsLocationsByArea/${DEFAULT_SERVICE_AREA_ID}/${userId}`] = null;

        updates[`/sessions/${userId}`] = null;
      }

      if (Object.keys(updates).length === 0) {
        return { success: true, cleanedUsers: 0 };
      }

      await db.ref().update(updates);
      return { success: true, cleanedUsers };
    } catch (error: any) {
      console.error('❌ Error limpiando usuarios inactivos:', error);
      return { success: false, error: error.message };
    }
  });

const STALE_DRIVER_HEARTBEAT_MS = 2 * 60 * 1000;

export const expireStaleDriverAvailability = functions
  .runWith({ memory: '256MB', timeoutSeconds: 60, maxInstances: 1 })
  .pubsub
  .schedule('every 1 minutes')
  .timeZone('America/Managua')
  .onRun(async () => {
    try {
      const db = admin.database();
      const cutoff = Date.now() - STALE_DRIVER_HEARTBEAT_MS;
      const snapshot = await db
        .ref('/driverLocations')
        .orderByChild('status')
        .equalTo('available')
        .once('value');

      if (!snapshot.exists()) {
        return { success: true, offlineDrivers: 0 };
      }

      const drivers = snapshot.val() || {};
      const results = await Promise.all(
        Object.entries(drivers).map(async ([driverId, location]: [string, any]) => {
          try {
            const expectedDeviceId = typeof location?.deviceId === 'string' ? location.deviceId : null;
            if (!expectedDeviceId) return false;

            const sessionRef = db.ref(`sessions/${driverId}`);
            const sessionSnapshot = await sessionRef.once('value');
            const session = sessionSnapshot.val();
            if (session?.deviceId && session.deviceId !== expectedDeviceId) return false;
            const lastSeen = typeof session?.lastSeen === 'number' ? session.lastSeen : null;
            const locationLastSeen = [location?.lastSeen, location?.updatedAt, location?.lastUpdate]
              .find((value) => typeof value === 'number') as number | undefined;

            if (
              session?.deviceId === expectedDeviceId &&
              session?.isActive !== false &&
              lastSeen !== null &&
              lastSeen > cutoff
            ) {
              return false;
            }

            if (
              (!session || lastSeen === null) &&
              typeof locationLastSeen === 'number' &&
              locationLastSeen > cutoff
            ) {
              return false;
            }

            if (session?.deviceId === expectedDeviceId && session.isActive !== false) {
              const sessionResult = await sessionRef.transaction((current) => {
                const currentLastSeen = typeof current?.lastSeen === 'number' ? current.lastSeen : null;
                if (
                  !current ||
                  current.deviceId !== expectedDeviceId ||
                  current.isActive === false ||
                  (currentLastSeen !== null && currentLastSeen > cutoff)
                ) {
                  return;
                }
                return {
                  ...current,
                  isActive: false,
                  lastSeen: admin.database.ServerValue.TIMESTAMP,
                };
              }, undefined, false);

              if (!sessionResult.committed) {
                const latestSession = (await sessionRef.once('value')).val();
                if (
                  latestSession?.deviceId === expectedDeviceId &&
                  latestSession?.isActive !== false &&
                  typeof latestSession?.lastSeen === 'number' &&
                  latestSession.lastSeen > cutoff
                ) {
                  return false;
                }
              }
            }

            const latestSession = (await sessionRef.once('value')).val();
            if (
              latestSession?.deviceId === expectedDeviceId &&
              latestSession?.isActive !== false &&
              typeof latestSession?.lastSeen === 'number' &&
              latestSession.lastSeen > cutoff
            ) {
              return false;
            }

            const locationRef = db.ref(`driverLocations/${driverId}`);
            const offlineResult = await locationRef.transaction((current) => {
              if (
                !current ||
                current.deviceId !== expectedDeviceId ||
                current.status !== 'available'
              ) {
                return;
              }
              return {
                ...current,
                status: 'offline',
                lat: null,
                lng: null,
                updatedAt: admin.database.ServerValue.TIMESTAMP,
                lastSeen: admin.database.ServerValue.TIMESTAMP,
              };
            }, undefined, false);

            if (!offlineResult.committed) return false;

            const serviceAreaId =
              typeof session?.serviceAreaId === 'string' && session.serviceAreaId.trim()
                ? session.serviceAreaId.trim()
                : DEFAULT_SERVICE_AREA_ID;
            const updates: Record<string, null> = {
              [`driverLocationsByArea/${serviceAreaId}/${driverId}`]: null,
              [`driverLocationsByArea/${DEFAULT_SERVICE_AREA_ID}/${driverId}`]: null,
              [`presence/${driverId}`]: null,
            };
            await db.ref().update(updates);
            return true;
          } catch (error: any) {
            functions.logger.warn('[expireStaleDriverAvailability] No se pudo expirar conductor', {
              driverId,
              error: error?.message || error,
            });
            return false;
          }
        }),
      );

      return { success: true, offlineDrivers: results.filter(Boolean).length };
    } catch (error: any) {
      functions.logger.error('[expireStaleDriverAvailability] Error limpiando conductores obsoletos', {
        error: error?.message || error,
      });
      return { success: false, error: error?.message || String(error) };
    }
  });
