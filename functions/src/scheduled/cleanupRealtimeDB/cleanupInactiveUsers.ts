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
