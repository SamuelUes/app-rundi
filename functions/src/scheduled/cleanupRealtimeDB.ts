/**
 * Cleanup Realtime Database - Scheduled Functions
 * Limpia automáticamente nodos antiguos de Realtime Database
 * Reemplaza la extensión "Limit Child Nodes"
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

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
