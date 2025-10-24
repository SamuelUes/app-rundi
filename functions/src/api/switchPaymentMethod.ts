/**
 * Switch Payment Method API
 * Permite al conductor cambiar el método de pago durante el viaje
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import pool from '../config/database';

/**
 * Cambiar método de pago de un viaje
 * Solo el conductor puede cambiar el método
 */
export const switchPaymentMethod = functions.https.onCall(async (data, context) => {
  // Verificar autenticación
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { rideId, newPaymentMethod, reason } = data;

  // Validar parámetros
  if (!rideId || !newPaymentMethod) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'rideId y newPaymentMethod son requeridos'
    );
  }

  // Validar que el método sea válido
  const validMethods = ['cash', 'card'];
  if (!validMethods.includes(newPaymentMethod)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Método de pago inválido. Debe ser: ${validMethods.join(', ')}`
    );
  }

  console.log(`🔄 [switchPaymentMethod] Cambiando método de pago del viaje ${rideId} a ${newPaymentMethod}`);

  try {
    // 1. Obtener datos del viaje desde Firebase
    const rideRef = admin.database().ref(`activeRides/${rideId}`);
    const rideSnapshot = await rideRef.once('value');
    
    if (!rideSnapshot.exists()) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    const ride = rideSnapshot.val();
    const oldPaymentMethod = ride.paymentMethod;

    // 2. Verificar que el usuario sea el conductor del viaje
    if (ride.driverId !== context.auth.uid) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Solo el conductor del viaje puede cambiar el método de pago'
      );
    }

    // 3. Verificar que el viaje esté en estado válido para cambiar método
    const validStatuses = ['accepted', 'driver_assigned', 'in_progress', 'completed', 'pending_payment'];
    if (!validStatuses.includes(ride.status)) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `No se puede cambiar el método de pago en estado: ${ride.status}`
      );
    }

    // 4. Actualizar método de pago en Firebase Realtime
    await rideRef.update({
      paymentMethod: newPaymentMethod,
      paymentMethodChangedAt: admin.database.ServerValue.TIMESTAMP,
      paymentMethodChangedBy: context.auth.uid,
      previousPaymentMethod: oldPaymentMethod,
      paymentMethodChangeReason: reason || 'Cambio solicitado por conductor',
    });

    // 5. Actualizar en paymentStatus si existe
    const paymentStatusRef = admin.database().ref(`paymentStatus/${rideId}`);
    const paymentStatusSnapshot = await paymentStatusRef.once('value');
    
    if (paymentStatusSnapshot.exists()) {
      await paymentStatusRef.update({
        method: newPaymentMethod,
        previousMethod: oldPaymentMethod,
        methodChangedAt: admin.database.ServerValue.TIMESTAMP,
        methodChangedBy: context.auth.uid,
      });
    }

    // 6. Actualizar en PostgreSQL si el viaje ya existe
    // ✅ MEJORADO: Agregar timeout y mejor manejo de errores
    let client;
    try {
      // Usar timeout de 5 segundos para evitar bloqueos
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('PostgreSQL connection timeout')), 5000)
      );
      
      client = await Promise.race([pool.connect(), timeoutPromise]) as any;
      
      const result = await client.query(
        `UPDATE rides 
         SET payment_method = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id`,
        [newPaymentMethod, rideId]
      );

      if (result.rows.length > 0) {
        console.log(`✅ Método de pago actualizado en PostgreSQL: ${rideId}`);
      }
    } catch (error: any) {
      // ✅ MEJORADO: Log más detallado
      if (error.message.includes('timeout') || error.message.includes('connection slots')) {
        console.warn(`⚠️ No se pudo conectar a PostgreSQL (conexiones agotadas): ${error.message}`);
      } else {
        console.log(`⚠️ Viaje aún no existe en PostgreSQL (normal si no se ha completado): ${error.message}`);
      }
      // No lanzar error - Firebase ya fue actualizado correctamente
    } finally {
      if (client) {
        client.release();
      }
    }

    // 7. Registrar cambio en historial (opcional)
    await admin.database().ref(`paymentMethodChanges/${rideId}`).push({
      from: oldPaymentMethod,
      to: newPaymentMethod,
      changedBy: context.auth.uid,
      changedAt: admin.database.ServerValue.TIMESTAMP,
      reason: reason || 'Cambio solicitado por conductor',
    });

    console.log(`✅ [switchPaymentMethod] Método cambiado de ${oldPaymentMethod} a ${newPaymentMethod}`);

    return {
      success: true,
      message: `Método de pago cambiado de ${oldPaymentMethod} a ${newPaymentMethod}`,
      rideId,
      oldPaymentMethod,
      newPaymentMethod,
    };

  } catch (error: any) {
    console.error('❌ [switchPaymentMethod] Error:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener historial de cambios de método de pago
 */
export const getPaymentMethodHistory = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { rideId } = data;

  if (!rideId) {
    throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
  }

  try {
    const historyRef = admin.database().ref(`paymentMethodChanges/${rideId}`);
    const snapshot = await historyRef.once('value');

    if (!snapshot.exists()) {
      return {
        success: true,
        changes: [],
        message: 'No hay cambios de método de pago',
      };
    }

    const changes: any[] = [];
    snapshot.forEach((child) => {
      changes.push({
        id: child.key,
        ...child.val(),
      });
    });

    return {
      success: true,
      changes,
    };

  } catch (error: any) {
    console.error('❌ [getPaymentMethodHistory] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
