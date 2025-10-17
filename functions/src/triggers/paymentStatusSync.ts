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
        
        // Calcular comisión según tipo de viaje
        // designated_driver: 15%, normal: 10%
        const rideType = ride.rideType || ride.isDesignatedDriver ? 'designated_driver' : 'normal';
        const commissionRate = rideType === 'designated_driver' ? 0.15 : 0.10;
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
