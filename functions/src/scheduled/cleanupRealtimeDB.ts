/**
 * Cleanup Realtime Database - Scheduled Functions
 * Limpia automáticamente nodos antiguos de Realtime Database
 * Reemplaza la extensión "Limit Child Nodes"
 */

import * as functions from 'firebase-functions';
import admin from 'firebase-admin';

const DEFAULT_SERVICE_AREA_ID = 'ni-managua';
const PROGRAMMED_RIDE_CANCELED_RETENTION_MS = 24 * 60 * 60 * 1000;
const PROGRAMMED_RIDE_STALE_RETENTION_MS = 48 * 60 * 60 * 1000;

const parseEpochMs = (value: any): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return null;
};

/**
 * Limpia ubicaciones antiguas de conductores
 * Se ejecuta cada hora
 * Mantiene solo las últimas 100 ubicaciones por conductor
 */
export const cleanupDriverLocations = functions.pubsub
  .schedule('every 1 hours')  // Cada hora en punto (00:00, 01:00, 02:00...)
  .timeZone('America/Managua')
  .onRun(async (context) => {
    console.log('🧹 Iniciando limpieza de ubicaciones de conductores...');
    
    try {
      const db = admin.database();
      const locationsRef = db.ref('/driverLocations');
      
      // Obtener todos los conductores
      const snapshot = await locationsRef.once('value');
      
      if (!snapshot.exists()) {
        console.log('ℹ️ No hay ubicaciones de conductores para limpiar');
        return null;
      }
      
      const drivers = snapshot.val();
      let totalCleaned = 0;
      
      // Procesar cada conductor
      for (const driverId in drivers) {
        const driverLocations = drivers[driverId];
        
        // Convertir a array y ordenar por timestamp
        const locationsArray = Object.entries(driverLocations)
          .map(([key, value]: [string, any]) => ({
            key,
            timestamp: value.timestamp || 0
          }))
          .sort((a, b) => b.timestamp - a.timestamp);
        
        // Si hay más de 100, eliminar las más antiguas
        if (locationsArray.length > 100) {
          const toDelete = locationsArray.slice(100);
          
          console.log(`🗑️ Conductor ${driverId}: ${toDelete.length} ubicaciones a eliminar`);
          
          // Eliminar en batch
          const updates: any = {};
          toDelete.forEach(loc => {
            updates[`/driverLocations/${driverId}/${loc.key}`] = null;
          });
          
          await db.ref().update(updates);
          totalCleaned += toDelete.length;
        }
      }
      
      console.log(`✅ Limpieza completada: ${totalCleaned} ubicaciones eliminadas`);
      return { success: true, cleaned: totalCleaned };
      
    } catch (error: any) {
      console.error('❌ Error limpiando ubicaciones:', error);
      return { success: false, error: error.message };
    }
  });

/**
 * Limpia ubicaciones antiguas de viajes activos
 * Se ejecuta cada 30 minutos
 * Mantiene solo las últimas 500 ubicaciones por viaje
 */
export const cleanupRideLocations = functions.pubsub
  .schedule('every 30 minutes')  // Cada 30 minutos (00:00, 00:30, 01:00...)
  .timeZone('America/Managua')
  .onRun(async (context) => {
    console.log('🧹 Iniciando limpieza de ubicaciones de viajes...');
    
    try {
      const db = admin.database();
      const ridesRef = db.ref('/activeRides');
      
      const snapshot = await ridesRef.once('value');
      
      if (!snapshot.exists()) {
        console.log('ℹ️ No hay viajes activos para limpiar');
        return null;
      }
      
      const rides = snapshot.val();
      let totalCleaned = 0;
      
      for (const rideId in rides) {
        const ride = rides[rideId];
        
        if (!ride.locations) continue;
        
        const locationsArray = Object.entries(ride.locations)
          .map(([key, value]: [string, any]) => ({
            key,
            timestamp: value.timestamp || 0
          }))
          .sort((a, b) => b.timestamp - a.timestamp);
        
        if (locationsArray.length > 500) {
          const toDelete = locationsArray.slice(500);
          
          console.log(`🗑️ Viaje ${rideId}: ${toDelete.length} ubicaciones a eliminar`);
          
          const updates: any = {};
          toDelete.forEach(loc => {
            updates[`/activeRides/${rideId}/locations/${loc.key}`] = null;
          });
          
          await db.ref().update(updates);
          totalCleaned += toDelete.length;
        }
      }
      
      console.log(`✅ Limpieza completada: ${totalCleaned} ubicaciones eliminadas`);
      return { success: true, cleaned: totalCleaned };
      
    } catch (error: any) {
      console.error('❌ Error limpiando ubicaciones de viajes:', error);
      return { success: false, error: error.message };
    }
  });

/**
 * Limpia mensajes antiguos de chats
 * Se ejecuta cada 6 horas
 * Mantiene solo los últimos 100 mensajes por chat
 */
export const cleanupChatMessages = functions.pubsub
  .schedule('every 6 hours')  // Cada 6 horas (00:00, 06:00, 12:00, 18:00)
  .timeZone('America/Managua')
  .onRun(async (context) => {
    console.log('🧹 Iniciando limpieza de mensajes de chat...');
    
    try {
      const db = admin.database();
      const chatsRef = db.ref('/chats');
      
      const snapshot = await chatsRef.once('value');
      
      if (!snapshot.exists()) {
        console.log('ℹ️ No hay chats para limpiar');
        return null;
      }
      
      const chats = snapshot.val();
      let totalCleaned = 0;
      
      for (const chatId in chats) {
        const chat = chats[chatId];
        
        if (!chat.messages) continue;
        
        const messagesArray = Object.entries(chat.messages)
          .map(([key, value]: [string, any]) => ({
            key,
            timestamp: value.timestamp || 0
          }))
          .sort((a, b) => b.timestamp - a.timestamp);
        
        if (messagesArray.length > 100) {
          const toDelete = messagesArray.slice(100);
          
          console.log(`🗑️ Chat ${chatId}: ${toDelete.length} mensajes a eliminar`);
          
          const updates: any = {};
          toDelete.forEach(msg => {
            updates[`/chats/${chatId}/messages/${msg.key}`] = null;
          });
          
          await db.ref().update(updates);
          totalCleaned += toDelete.length;
        }
      }
      
      console.log(`✅ Limpieza completada: ${totalCleaned} mensajes eliminados`);
      return { success: true, cleaned: totalCleaned };
      
    } catch (error: any) {
      console.error('❌ Error limpiando mensajes:', error);
      return { success: false, error: error.message };
    }
  });

/**
 * Limpia notificaciones antiguas
 * Se ejecuta diariamente
 * Mantiene solo las últimas 20 notificaciones por usuario
 */
export const cleanupNotifications = functions.pubsub
  .schedule('0 0 * * *')  // Diario a medianoche (00:00)
  .timeZone('America/Managua')
  .onRun(async (context) => {
    console.log('🧹 Iniciando limpieza de notificaciones...');
    
    try {
      const db = admin.database();
      const notificationsRef = db.ref('/notifications');
      
      const snapshot = await notificationsRef.once('value');
      
      if (!snapshot.exists()) {
        console.log('ℹ️ No hay notificaciones para limpiar');
        return null;
      }
      
      const notifications = snapshot.val();
      let totalCleaned = 0;
      
      for (const userId in notifications) {
        const userNotifications = notifications[userId];
        
        const notificationsArray = Object.entries(userNotifications)
          .map(([key, value]: [string, any]) => ({
            key,
            timestamp: value.timestamp || 0
          }))
          .sort((a, b) => b.timestamp - a.timestamp);
        
        if (notificationsArray.length > 20) {
          const toDelete = notificationsArray.slice(20);
          
          console.log(`🗑️ Usuario ${userId}: ${toDelete.length} notificaciones a eliminar`);
          
          const updates: any = {};
          toDelete.forEach(notif => {
            updates[`/notifications/${userId}/${notif.key}`] = null;
          });
          
          await db.ref().update(updates);
          totalCleaned += toDelete.length;
        }
      }
      
      console.log(`✅ Limpieza completada: ${totalCleaned} notificaciones eliminadas`);
      return { success: true, cleaned: totalCleaned };
      
    } catch (error: any) {
      console.error('❌ Error limpiando notificaciones:', error);
      return { success: false, error: error.message };
    }
  });

/**
 * Limpia historial de presencia
 * Se ejecuta diariamente
 * Mantiene solo los últimos 10 registros por usuario
 */
export const cleanupPresenceHistory = functions.pubsub
  .schedule('0 2 * * *')  // Diario a las 2 AM (02:00)
  .timeZone('America/Managua')
  .onRun(async (context) => {
    console.log('🧹 Iniciando limpieza de historial de presencia...');
    
    try {
      const db = admin.database();
      const presenceRef = db.ref('/presence');
      
      const snapshot = await presenceRef.once('value');
      
      if (!snapshot.exists()) {
        console.log('ℹ️ No hay historial de presencia para limpiar');
        return null;
      }
      
      const presence = snapshot.val();
      let totalCleaned = 0;
      
      for (const userId in presence) {
        const userPresence = presence[userId];
        
        if (!userPresence.history) continue;
        
        const historyArray = Object.entries(userPresence.history)
          .map(([key, value]: [string, any]) => ({
            key,
            timestamp: value.timestamp || 0
          }))
          .sort((a, b) => b.timestamp - a.timestamp);
        
        if (historyArray.length > 10) {
          const toDelete = historyArray.slice(10);
          
          console.log(`🗑️ Usuario ${userId}: ${toDelete.length} registros de presencia a eliminar`);
          
          const updates: any = {};
          toDelete.forEach(record => {
            updates[`/presence/${userId}/history/${record.key}`] = null;
          });
          
          await db.ref().update(updates);
          totalCleaned += toDelete.length;
        }
      }
      
      console.log(`✅ Limpieza completada: ${totalCleaned} registros eliminados`);
      return { success: true, cleaned: totalCleaned };
      
    } catch (error: any) {
      console.error('❌ Error limpiando presencia:', error);
      return { success: false, error: error.message };
    }
  });

/**
 * Limpia viajes programados cancelados/obsoletos y shards huérfanos
 * Se ejecuta cada 6 horas
 */
export const cleanupProgrammedRides = functions.pubsub
  .schedule('every 6 hours')
  .timeZone('America/Managua')
  .onRun(async () => {
    console.log('🧹 Iniciando limpieza de programmedRides...');

    try {
      const db = admin.database();
      const programmedRef = db.ref('/programmedRides');
      const shardsRef = db.ref('/programmedRidesByArea');
      const now = Date.now();

      const programmedSnapshot = await programmedRef.once('value');
      const programmedRides = programmedSnapshot.val() || {};

      const updates: Record<string, null> = {};
      let deletedProgrammedRides = 0;
      let deletedShardEntries = 0;

      for (const [rideId, rideData] of Object.entries<any>(programmedRides)) {
        const status = String(rideData?.status || '').trim().toLowerCase();
        const scheduledAt = parseEpochMs(rideData?.scheduledAt ?? rideData?.scheduled_at);
        const canceledAt = parseEpochMs(rideData?.canceledAt ?? rideData?.canceled_at);
        const updatedAt = parseEpochMs(rideData?.updatedAt ?? rideData?.updated_at);
        const createdAt = parseEpochMs(rideData?.createdAt ?? rideData?.created_at);
        const serviceAreaId =
          typeof rideData?.serviceAreaId === 'string' && rideData.serviceAreaId.trim().length > 0
            ? rideData.serviceAreaId.trim()
            : null;

        let shouldDelete = false;

        if (status === 'canceled') {
          const refTs = canceledAt ?? updatedAt ?? createdAt ?? scheduledAt;
          if (refTs && refTs < now - PROGRAMMED_RIDE_CANCELED_RETENTION_MS) {
            shouldDelete = true;
          }
        } else if (scheduledAt && scheduledAt < now - PROGRAMMED_RIDE_STALE_RETENTION_MS) {
          shouldDelete = true;
        } else if (!scheduledAt) {
          const refTs = updatedAt ?? createdAt;
          if (refTs && refTs < now - PROGRAMMED_RIDE_STALE_RETENTION_MS) {
            shouldDelete = true;
          }
        }

        if (!shouldDelete) {
          continue;
        }

        updates[`/programmedRides/${rideId}`] = null;
        deletedProgrammedRides += 1;

        if (serviceAreaId) {
          updates[`/programmedRidesByArea/${serviceAreaId}/${rideId}`] = null;
        }
      }

      const shardsSnapshot = await shardsRef.once('value');
      const shardsByArea = shardsSnapshot.val() || {};

      for (const [areaId, ridesMap] of Object.entries<any>(shardsByArea)) {
        if (!ridesMap || typeof ridesMap !== 'object') {
          continue;
        }

        for (const rideId of Object.keys(ridesMap)) {
          if (updates[`/programmedRides/${rideId}`] === null) {
            updates[`/programmedRidesByArea/${areaId}/${rideId}`] = null;
            deletedShardEntries += 1;
            continue;
          }

          const rideData = programmedRides[rideId];
          if (!rideData) {
            updates[`/programmedRidesByArea/${areaId}/${rideId}`] = null;
            deletedShardEntries += 1;
            continue;
          }

          const rideServiceAreaId =
            typeof rideData?.serviceAreaId === 'string' && rideData.serviceAreaId.trim().length > 0
              ? rideData.serviceAreaId.trim()
              : null;

          if (rideServiceAreaId && rideServiceAreaId !== areaId) {
            updates[`/programmedRidesByArea/${areaId}/${rideId}`] = null;
            deletedShardEntries += 1;
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
      }

      console.log('✅ Limpieza programmedRides completada', {
        deletedProgrammedRides,
        deletedShardEntries,
      });

      return {
        success: true,
        deletedProgrammedRides,
        deletedShardEntries,
      };
    } catch (error: any) {
      console.error('❌ Error limpiando programmedRides:', error);
      return {
        success: false,
        error: error?.message || String(error),
      };
    }
  });

export const cleanupInactiveUsers = functions.pubsub
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
