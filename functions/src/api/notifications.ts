/**
 * NOTIFICATIONS API
 * 
 * Envía notificaciones push a usuarios
 * Integrado con Firebase Cloud Messaging (FCM)
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

interface NotificationPayload {
  title: string;
  body: string;
  rideId?: string;
  type: 'driver_found' | 'driver_accepted' | 'ride_started' | 'chat_message' | 'ride_completed' | 'general';
  data?: Record<string, any>;
}

/**
 * Obtener FCM token del usuario
 */
async function getFCMToken(userId: string): Promise<string | null> {
  try {
    const db = admin.database();
    const snapshot = await db.ref(`users/${userId}/fcmToken/token`).once('value');
    return snapshot.val();
  } catch (error) {
    console.error(`❌ Error obteniendo FCM token para ${userId}:`, error);
    return null;
  }
}

/**
 * Enviar notificación a un usuario
 */
export async function sendNotificationToUser(
  userId: string,
  payload: NotificationPayload
): Promise<boolean> {
  try {
    console.log(`📤 Enviando notificación a ${userId}:`, payload);

    const fcmToken = await getFCMToken(userId);

    if (!fcmToken) {
      console.warn(`⚠️ No hay FCM token para usuario ${userId}`);
      return false;
    }

    const message = {
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: {
        type: payload.type,
        rideId: payload.rideId || '',
        ...payload.data,
      },
      token: fcmToken,
    };

    const response = await admin.messaging().send(message);
    console.log(`✅ Notificación enviada: ${response}`);
    return true;
  } catch (error: any) {
    console.error(`❌ Error enviando notificación:`, error.message);
    return false;
  }
}

/**
 * Enviar notificación a múltiples usuarios
 */
export async function sendNotificationToUsers(
  userIds: string[],
  payload: NotificationPayload
): Promise<number> {
  let successCount = 0;

  for (const userId of userIds) {
    const success = await sendNotificationToUser(userId, payload);
    if (success) successCount++;
  }

  console.log(`📊 Notificaciones enviadas: ${successCount}/${userIds.length}`);
  return successCount;
}

/**
 * TRIGGER: Cuando se encuentra un conductor
 * Envía notificación al cliente
 */
export const onDriverFound = functions.database
  .ref('activeRides/{rideId}')
  .onWrite(async (change, context) => {
    const rideId = context.params.rideId;
    const newRide = change.after.val();
    const previousRide = change.before.val();

    // Solo procesar si el driverId cambió (conductor asignado)
    if (
      !newRide ||
      !newRide.driverId ||
      previousRide?.driverId === newRide.driverId
    ) {
      return;
    }

    try {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`🚕 [onDriverFound] ¡¡¡ CONDUCTOR ENCONTRADO !!!`);
      console.log(`${"=".repeat(60)}`);
      console.log(`   rideId: ${rideId}`);
      console.log(`   clientId: ${newRide.clientId}`);
      console.log(`   driverId: ${newRide.driverId}`);

      // Enviar notificación al cliente
      await sendNotificationToUser(newRide.clientId, {
        title: '🚕 Conductor Encontrado',
        body: `${newRide.driverName || 'Tu conductor'} está en camino`,
        rideId,
        type: 'driver_found',
        data: {
          driverId: newRide.driverId,
          driverName: newRide.driverName,
          driverRating: newRide.driverRating,
          vehiclePlate: newRide.vehiclePlate,
        },
      });

      console.log(`✅ Notificación enviada al cliente`);
    } catch (error) {
      console.error(`❌ Error en onDriverFound:`, error);
    }
  });

/**
 * TRIGGER: Cuando el conductor acepta el viaje
 * Envía notificación al cliente
 */
export const onDriverAccepted = functions.database
  .ref('activeRides/{rideId}')
  .onWrite(async (change, context) => {
    const rideId = context.params.rideId;
    const newRide = change.after.val();
    const previousRide = change.before.val();

    // Solo procesar si el status cambió a 'accepted'
    if (
      !newRide ||
      newRide.status !== 'accepted' ||
      previousRide?.status === 'accepted'
    ) {
      return;
    }

    try {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`✅ [onDriverAccepted] ¡¡¡ CONDUCTOR ACEPTÓ !!!`);
      console.log(`${"=".repeat(60)}`);
      console.log(`   rideId: ${rideId}`);
      console.log(`   clientId: ${newRide.clientId}`);

      // Enviar notificación al cliente
      await sendNotificationToUser(newRide.clientId, {
        title: '✅ Conductor Aceptó',
        body: `${newRide.driverName || 'Tu conductor'} aceptó tu viaje`,
        rideId,
        type: 'driver_accepted',
        data: {
          driverId: newRide.driverId,
          driverName: newRide.driverName,
          estimatedArrival: newRide.estimatedArrival,
        },
      });

      console.log(`✅ Notificación enviada al cliente`);
    } catch (error) {
      console.error(`❌ Error en onDriverAccepted:`, error);
    }
  });

/**
 * TRIGGER: Cuando el viaje inicia
 * Envía notificación al cliente
 */
export const onRideStartedNotification = functions.database
  .ref('activeRides/{rideId}')
  .onWrite(async (change, context) => {
    const rideId = context.params.rideId;
    const newRide = change.after.val();
    const previousRide = change.before.val();

    // Solo procesar si el status cambió a 'in_progress'
    if (
      !newRide ||
      newRide.status !== 'in_progress' ||
      previousRide?.status === 'in_progress'
    ) {
      return;
    }

    try {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`🚗 [onRideStartedNotification] ¡¡¡ VIAJE INICIADO !!!`);
      console.log(`${"=".repeat(60)}`);
      console.log(`   rideId: ${rideId}`);
      console.log(`   clientId: ${newRide.clientId}`);

      // Enviar notificación al cliente
      await sendNotificationToUser(newRide.clientId, {
        title: '🚗 Viaje Iniciado',
        body: `${newRide.driverName || 'Tu conductor'} comenzó el viaje`,
        rideId,
        type: 'ride_started',
        data: {
          driverId: newRide.driverId,
          estimatedDuration: newRide.estimatedDuration,
        },
      });

      console.log(`✅ Notificación enviada al cliente`);
    } catch (error) {
      console.error(`❌ Error en onRideStartedNotification:`, error);
    }
  });

/**
 * TRIGGER: Cuando el viaje se completa
 * Envía notificación al cliente
 */
export const onRideCompletedNotification = functions.database
  .ref('activeRides/{rideId}')
  .onWrite(async (change, context) => {
    const rideId = context.params.rideId;
    const newRide = change.after.val();
    const previousRide = change.before.val();

    // Solo procesar si el status cambió a 'completed'
    if (
      !newRide ||
      newRide.status !== 'completed' ||
      previousRide?.status === 'completed'
    ) {
      return;
    }

    try {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`✅ [onRideCompletedNotification] ¡¡¡ VIAJE COMPLETADO !!!`);
      console.log(`${"=".repeat(60)}`);
      console.log(`   rideId: ${rideId}`);
      console.log(`   clientId: ${newRide.clientId}`);

      // Enviar notificación al cliente
      await sendNotificationToUser(newRide.clientId, {
        title: '✅ Viaje Completado',
        body: `Tu viaje ha finalizado. ¡Califica tu experiencia!`,
        rideId,
        type: 'ride_completed',
        data: {
          finalFare: newRide.finalFare,
          distance: newRide.actualDistance,
          duration: newRide.actualDuration,
        },
      });

      console.log(`✅ Notificación enviada al cliente`);
    } catch (error) {
      console.error(`❌ Error en onRideCompletedNotification:`, error);
    }
  });

/**
 * TRIGGER: Cuando hay un nuevo mensaje en el chat
 * Envía notificación al otro usuario
 */
export const onChatMessageNotification = functions.database
  .ref('chats/{rideId}/messages/{messageId}')
  .onCreate(async (snapshot, context) => {
    const { rideId } = context.params;
    const message = snapshot.val();

    try {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`💬 [onChatMessageNotification] ¡¡¡ NUEVO MENSAJE !!!`);
      console.log(`${"=".repeat(60)}`);
      console.log(`   rideId: ${rideId}`);
      console.log(`   senderId: ${message.senderId}`);
      console.log(`   message: ${message.text}`);

      // Obtener datos del viaje para saber a quién enviar la notificación
      const rideSnapshot = await admin
        .database()
        .ref(`activeRides/${rideId}`)
        .once('value');

      const ride = rideSnapshot.val();

      if (!ride) {
        console.warn(`⚠️ Viaje no encontrado: ${rideId}`);
        return;
      }

      // Determinar a quién enviar la notificación
      const recipientId =
        message.senderId === ride.clientId ? ride.driverId : ride.clientId;

      if (!recipientId) {
        console.warn(`⚠️ No se puede determinar el destinatario`);
        return;
      }

      // Enviar notificación
      await sendNotificationToUser(recipientId, {
        title: '💬 Nuevo Mensaje',
        body: message.text.substring(0, 100),
        rideId,
        type: 'chat_message',
        data: {
          senderId: message.senderId,
          senderName: message.senderName,
          messageId: context.params.messageId,
        },
      });

      console.log(`✅ Notificación enviada al destinatario`);
    } catch (error) {
      console.error(`❌ Error en onChatMessageNotification:`, error);
    }
  });
