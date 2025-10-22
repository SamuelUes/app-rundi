import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import pool from "../config/database";

/**
 * TRIGGER: Sincronizar paymentStatus de Firebase Realtime DB a PostgreSQL
 * 
 * Escucha cambios en /paymentStatus/{rideId} y guarda en tabla payments
 * cuando el estado es final (completed, canceled, partial_charged)
 */
export const syncPaymentStatusToPostgres = functions.database
  .ref('/paymentStatus/{rideId}')
  .onUpdate(async (change, context) => {
    const after = change.after.val();
    const before = change.before.val();
    const rideId = context.params.rideId;

    console.log(`💳 [syncPaymentStatusToPostgres] Cambio detectado en paymentStatus/${rideId}`);
    console.log(`📊 Estado anterior: ${before?.status} → Estado nuevo: ${after?.status}`);

    // Solo sincronizar en estados finales
    const finalStates = ['completed', 'confirmed', 'canceled', 'partial_charged', 'pending_cash_payment'];
    
    if (!finalStates.includes(after?.status)) {
      console.log(`⏸️ Estado ${after?.status} no es final, no se sincroniza`);
      return null;
    }

    // Evitar duplicados: Si ya se sincronizó antes, no volver a hacerlo
    if (before?.status === after?.status && before?.syncedToPostgres) {
      console.log(`✅ Pago ya sincronizado previamente`);
      return null;
    }

    try {
      // Obtener datos del viaje desde activeRides
      const rideSnapshot = await admin.database()
        .ref(`activeRides/${rideId}`)
        .once('value');
      
      const ride = rideSnapshot.val();

      if (!ride) {
        console.error(`❌ No se encontró el viaje ${rideId} en activeRides`);
        return null;
      }

      // Obtener pgRideId (ID del viaje en PostgreSQL)
      const pgRideId = ride.pgRideId;

      if (!pgRideId) {
        console.error(`❌ El viaje ${rideId} no tiene pgRideId (no se guardó en PostgreSQL)`);
        return null;
      }

      const client = await pool.connect();
      
      try {
        // Verificar si ya existe un pago para este viaje
        const existingPayment = await client.query(
          `SELECT id FROM payments WHERE ride_id = $1`,
          [pgRideId]
        );

        const amount = after.finalAmount || after.amount || 0;
        const tip = after.tip || 0;
        const total = amount + tip;
        const paymentMethod = after.method || 'cash';
        const paymentProvider = after.provider || (paymentMethod === 'cash' ? 'cash' : 'stripe');
        
        // Calcular comisión según tipo de viaje y vehículo
        const { getCommissionRate } = require('../helpers/priceCalculator');
        
        const rideType = ride.rideType || ride.isDesignatedDriver ? 'designated_driver' : 'normal';
        const vehicleType = ride.vehicleType || 'car'; // 'car' o 'motorcycle'
        const commissionRate = getCommissionRate(vehicleType, rideType);
        const commission = amount * commissionRate; // Comisión solo sobre amount, NO sobre propina
        
        console.log(`💰 Cálculo de pago:`, {
          rideType,
          paymentMethod,
          amount,
          tip,
          total,
          commissionRate: `${commissionRate * 100}%`,
          commission: commission.toFixed(2),
          driverReceives: paymentMethod === 'cash' ? (amount + tip).toFixed(2) : 'N/A (pago por DriveAngel)',
        });
        
        const status = after.status === 'confirmed' || after.status === 'completed' ? 'completed' : after.status;

        if (existingPayment.rows.length > 0) {
          // Actualizar pago existente
          console.log(`🔄 Actualizando pago existente para ride_id: ${pgRideId}`);
          
          await client.query(
            `UPDATE payments SET
              amount = $1,
              tip = $2,
              total = $3,
              commission = $4,
              status = $5,
              stripe_payment_intent_id = $6,
              stripe_charge_id = $7,
              paid_at = $8,
              updated_at = NOW()
            WHERE ride_id = $9`,
            [
              amount,
              tip,
              total,
              commission,
              status,
              after.paymentIntentId || null,
              after.stripeChargeId || null,
              status === 'completed' ? new Date(after.confirmedAt || after.lastUpdatedAt || Date.now()) : null,
              pgRideId
            ]
          );

          console.log(`✅ Pago actualizado en PostgreSQL para ride_id: ${pgRideId}`);
        } else {
          // Crear nuevo pago
          console.log(`➕ Creando nuevo pago para ride_id: ${pgRideId}`);
          
          await client.query(
            `INSERT INTO payments (
              ride_id, amount, tip, total, commission, 
              payment_method, payment_provider, status,
              stripe_payment_intent_id, stripe_charge_id,
              created_at, paid_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11)`,
            [
              pgRideId,
              amount,
              tip,
              total,
              commission,
              paymentMethod,
              paymentProvider,
              status,
              after.paymentIntentId || null,
              after.stripeChargeId || null,
              status === 'completed' ? new Date(after.confirmedAt || after.lastUpdatedAt || Date.now()) : null
            ]
          );

          console.log(`✅ Pago creado en PostgreSQL para ride_id: ${pgRideId}`);
        }

        // Marcar como sincronizado en Firebase
        await admin.database().ref(`paymentStatus/${rideId}`).update({
          syncedToPostgres: true,
          syncedAt: admin.database.ServerValue.TIMESTAMP
        });

        console.log(`💾 Pago sincronizado exitosamente: ${rideId} → ${pgRideId}`);

      } catch (pgError) {
        console.error(`❌ Error guardando pago en PostgreSQL:`, pgError);
        throw pgError;
      } finally {
        client.release();
      }

      return null;
    } catch (error) {
      console.error(`❌ Error en syncPaymentStatusToPostgres:`, error);
      return null;
    }
  });

/**
 * TRIGGER INVERSO: Sincronizar pagos de PostgreSQL a Firebase Realtime DB
 * 
 * Se ejecuta cada minuto y sincroniza pagos actualizados desde Supabase
 * Actualiza /paymentStatus/{rideId} y /activeRides/{rideId} en Firebase
 */
export const syncPostgresToFirebase = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async (context) => {
    console.log('🔄 [syncPostgresToFirebase] Iniciando sincronización Supabase → Firebase...');
    
    const client = await pool.connect();
    try {
      // Obtener pagos actualizados en los últimos 2 minutos
      const result = await client.query(`
        SELECT 
          p.id,
          p.ride_id,
          p.status,
          p.amount,
          p.tip,
          p.total,
          p.commission,
          p.payment_method,
          p.updated_at,
          r.firebase_ride_id
        FROM payments p
        INNER JOIN rides r ON r.id = p.ride_id
        WHERE p.updated_at >= NOW() - INTERVAL '2 minutes'
        AND p.status IN ('completed', 'canceled', 'pending_confirmation')
        AND (p.synced_to_firebase IS NULL OR p.synced_to_firebase = false)
        ORDER BY p.updated_at DESC
      `);

      console.log(`📊 [syncPostgresToFirebase] Encontrados ${result.rows.length} pagos para sincronizar`);

      for (const payment of result.rows) {
        const firebaseRideId = payment.firebase_ride_id;
        
        if (!firebaseRideId) {
          console.log(`⚠️ [syncPostgresToFirebase] Pago ${payment.id} no tiene firebase_ride_id, saltando...`);
          continue;
        }
        
        console.log(`🔄 [syncPostgresToFirebase] Sincronizando pago ${payment.id} para ride ${firebaseRideId}`);
        
        try {
          // Actualizar paymentStatus en Firebase
          const paymentStatusRef = admin.database().ref(`paymentStatus/${firebaseRideId}`);
          await paymentStatusRef.update({
            status: payment.status,
            finalAmount: payment.amount,
            tip: payment.tip || 0,
            lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
            lastUpdatedBy: 'supabase_sync',
            message: getStatusMessage(payment.status),
            syncedFromPostgres: true,
          });

          console.log(`✅ [syncPostgresToFirebase] paymentStatus actualizado para ${firebaseRideId}`);

          // Si el pago está completado, actualizar también activeRides
          if (payment.status === 'completed') {
            const activeRideRef = admin.database().ref(`activeRides/${firebaseRideId}`);
            const rideSnapshot = await activeRideRef.once('value');
            
            if (rideSnapshot.exists()) {
              await activeRideRef.update({
                status: 'completed',
                paymentConfirmed: true,
                lastUpdate: admin.database.ServerValue.TIMESTAMP,
              });
              
              console.log(`✅ [syncPostgresToFirebase] activeRide actualizado para ${firebaseRideId}`);
            } else {
              console.log(`⚠️ [syncPostgresToFirebase] activeRide no existe para ${firebaseRideId}`);
            }
          }

          // Marcar como sincronizado en PostgreSQL
          await client.query(
            `UPDATE payments 
             SET synced_to_firebase = true, 
                 firebase_synced_at = NOW()
             WHERE id = $1`,
            [payment.id]
          );

          console.log(`✅ [syncPostgresToFirebase] Pago ${payment.id} marcado como sincronizado`);

        } catch (error) {
          console.error(`❌ [syncPostgresToFirebase] Error sincronizando pago ${payment.id}:`, error);
        }
      }

      console.log('✅ [syncPostgresToFirebase] Sincronización completada');
      
    } catch (error) {
      console.error('❌ [syncPostgresToFirebase] Error en sincronización:', error);
    } finally {
      client.release();
    }
  });

/**
 * Función manual para forzar sincronización de un pago específico
 * Útil para debugging o re-sincronización
 */
export const forceSyncPaymentToFirebase = functions.https.onCall(async (data, context) => {
  // Verificar autenticación
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { rideId } = data;

  if (!rideId) {
    throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
  }

  console.log(`🔄 [forceSyncPayment] Sincronización manual solicitada para ride: ${rideId}`);

  const client = await pool.connect();
  try {
    // Obtener el pago desde PostgreSQL
    const result = await client.query(
      `SELECT 
        p.id,
        p.ride_id,
        p.status,
        p.amount,
        p.tip,
        p.total,
        p.commission,
        p.payment_method,
        r.firebase_ride_id
       FROM payments p
       INNER JOIN rides r ON r.id = p.ride_id
       WHERE r.firebase_ride_id = $1
       ORDER BY p.created_at DESC
       LIMIT 1`,
      [rideId]
    );

    if (result.rows.length === 0) {
      throw new functions.https.HttpsError('not-found', 'Pago no encontrado');
    }

    const payment = result.rows[0];
    const firebaseRideId = payment.firebase_ride_id;

    // Actualizar paymentStatus en Firebase
    const paymentStatusRef = admin.database().ref(`paymentStatus/${firebaseRideId}`);
    await paymentStatusRef.update({
      status: payment.status,
      finalAmount: payment.amount,
      tip: payment.tip || 0,
      lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
      lastUpdatedBy: 'manual_sync',
      message: getStatusMessage(payment.status),
      syncedFromPostgres: true,
    });

    // Si está completado, actualizar activeRides
    if (payment.status === 'completed') {
      const activeRideRef = admin.database().ref(`activeRides/${firebaseRideId}`);
      await activeRideRef.update({
        status: 'completed',
        paymentConfirmed: true,
        lastUpdate: admin.database.ServerValue.TIMESTAMP,
      });
    }

    // Marcar como sincronizado
    await client.query(
      `UPDATE payments 
       SET synced_to_firebase = true, 
           firebase_synced_at = NOW()
       WHERE id = $1`,
      [payment.id]
    );

    console.log(`✅ [forceSyncPayment] Sincronización manual completada para ${firebaseRideId}`);

    return {
      success: true,
      message: 'Pago sincronizado exitosamente',
      rideId: firebaseRideId,
      status: payment.status,
    };

  } catch (error: any) {
    console.error('❌ [forceSyncPayment] Error en sincronización manual:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

/**
 * Obtener mensaje descriptivo según el estado del pago
 */
function getStatusMessage(status: string): string {
  switch (status) {
    case 'completed':
      return 'Pago confirmado por cliente y conductor';
    case 'canceled':
      return 'Pago cancelado';
    case 'pending_confirmation':
      return 'Esperando confirmación de pago en efectivo';
    case 'pending':
      return 'Esperando confirmación de pago';
    default:
      return 'Estado actualizado desde Supabase';
  }
}
