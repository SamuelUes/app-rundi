/**
 * Firebase Cloud Messaging (FCM) Functions
 * Para notificaciones push como alternativa a WebSocket
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Inicializar FCM
const fcm = admin.messaging();

/**
 * Registrar token FCM de un usuario
 */
export const registerFCMToken = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { fcmToken } = data;

  if (!fcmToken) {
    throw new functions.https.HttpsError('invalid-argument', 'Token FCM requerido');
  }

  try {
    // Guardar token en Firestore
    await admin.firestore()
      .collection('users')
      .doc(context.auth.uid)
      .set({
        fcmToken,
        lastTokenUpdate: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

    console.log(`✅ Token FCM registrado para usuario ${context.auth.uid}`);
    return { success: true };
  } catch (error: any) {
    console.error('❌ Error registrando token FCM:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Limpiar token FCM al cerrar sesión
 */
export const clearFCMToken = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    // Remover token de Firestore
    await admin.firestore()
      .collection('users')
      .doc(context.auth.uid)
      .update({
        fcmToken: admin.firestore.FieldValue.delete(),
        lastTokenUpdate: admin.firestore.FieldValue.delete(),
      });

    console.log(`🧹 Token FCM limpiado para usuario ${context.auth.uid}`);
    return { success: true };
  } catch (error: any) {
    console.error('❌ Error limpiando token FCM:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Enviar notificación de prueba
 */
export const sendTestNotification = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    // Obtener token FCM del usuario
    const userDoc = await admin.firestore()
      .collection('users')
      .doc(context.auth.uid)
      .get();

    const userData = userDoc.data();
    const fcmToken = userData?.fcmToken;

    if (!fcmToken) {
      throw new functions.https.HttpsError('failed-precondition', 'No hay token FCM registrado');
    }

    // Enviar notificación de prueba
    const message = {
      token: fcmToken,
      notification: {
        title: '🧪 Notificación de Prueba',
        body: '¡FCM está funcionando correctamente!',
      },
      data: {
        type: 'test',
        timestamp: Date.now().toString(),
      },
    };

    const response = await fcm.send(message);
    console.log('✅ Notificación de prueba enviada:', response);

    return { success: true, messageId: response };
  } catch (error: any) {
    console.error('❌ Error enviando notificación de prueba:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Enviar notificación cuando un viaje es aceptado
 */
export const sendRideAcceptedNotification = functions.firestore
  .document('activeRides/{rideId}')
  .onUpdate(async (change, context) => {
    const rideId = context.params.rideId;
    const newData = change.after.data();
    const oldData = change.before.data();

    // Solo enviar si el estado cambió a 'accepted'
    if (oldData.status !== 'accepted' && newData.status === 'accepted') {
      try {
        // Obtener datos del viaje
        const clientId = newData.clientId;
        const driverId = newData.driverId;

        // Obtener token FCM del cliente
        const clientDoc = await admin.firestore()
          .collection('users')
          .doc(clientId)
          .get();

        const clientData = clientDoc.data();
        const fcmToken = clientData?.fcmToken;

        if (!fcmToken) {
          console.log('⚠️ Cliente no tiene token FCM registrado');
          return;
        }

        // Obtener datos del conductor
        const driverDoc = await admin.firestore()
          .collection('users')
          .doc(driverId)
          .get();

        const driverData = driverDoc.data();
        const driverName = driverData?.displayName || 'Conductor';

        // Enviar notificación
        const message = {
          token: fcmToken,
          notification: {
            title: '🚗 ¡Viaje Aceptado!',
            body: `${driverName} viene en camino`,
          },
          data: {
            type: 'ride_accepted',
            rideId,
            driverId,
            timestamp: Date.now().toString(),
          },
        };

        await fcm.send(message);
        console.log('✅ Notificación de viaje aceptado enviada al cliente:', clientId);

      } catch (error) {
        console.error('❌ Error enviando notificación de viaje aceptado:', error);
      }
    }
  });

/**
 * Enviar notificación cuando un viaje es cancelado
 */
export const sendRideCancelledNotification = functions.firestore
  .document('activeRides/{rideId}')
  .onUpdate(async (change, context) => {
    const rideId = context.params.rideId;
    const newData = change.after.data();
    const oldData = change.before.data();

    // Solo enviar si el estado cambió a 'cancelled'
    if (oldData.status !== 'cancelled' && newData.status === 'cancelled') {
      try {
        // Obtener IDs de cliente y conductor
        const clientId = newData.clientId;
        const driverId = newData.driverId;

        // Notificar al cliente
        const clientDoc = await admin.firestore()
          .collection('users')
          .doc(clientId)
          .get();

        const clientData = clientDoc.data();
        if (clientData?.fcmToken) {
          const message = {
            token: clientData.fcmToken,
            notification: {
              title: '❌ Viaje Cancelado',
              body: 'El viaje ha sido cancelado por el conductor',
            },
            data: {
              type: 'ride_cancelled',
              rideId,
              timestamp: Date.now().toString(),
            },
          };

          await fcm.send(message);
          console.log('✅ Notificación de cancelación enviada al cliente');
        }

        // Notificar al conductor (si fue cancelado por cliente)
        const driverDoc = await admin.firestore()
          .collection('users')
          .doc(driverId)
          .get();

        const driverData = driverDoc.data();
        if (driverData?.fcmToken) {
          const message = {
            token: driverData.fcmToken,
            notification: {
              title: '❌ Viaje Cancelado',
              body: 'El cliente canceló el viaje',
            },
            data: {
              type: 'ride_cancelled',
              rideId,
              timestamp: Date.now().toString(),
            },
          };

          await fcm.send(message);
          console.log('✅ Notificación de cancelación enviada al conductor');
        }

      } catch (error) {
        console.error('❌ Error enviando notificación de cancelación:', error);
      }
    }
  });
