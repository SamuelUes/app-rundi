/**
 * Helpers para limpieza de Firebase Realtime Database
 * 
 * Cuando un viaje se completa o cancela:
 * 1. Se guarda en PostgreSQL (historial permanente)
 * 2. Se elimina de Firebase Realtime (solo datos activos)
 * 
 * Esto mantiene el Realtime Database limpio y eficiente
 */

import * as admin from "firebase-admin";
import pool from "../config/database";

/**
 * Guardar viaje completado en PostgreSQL
 */
export async function saveCompletedRideToPostgres(ride: any, rideId: string): Promise<string | null> {
  const client = await pool.connect();
  try {
    console.log(`💾 Guardando viaje completado en PostgreSQL: ${rideId}`);
    
    const finalAmount = ride.finalFare || ride.estimatedPrice || 0;
    const distance = ride.actualDistance || ride.estimatedDistance || 0;
    const duration = ride.actualDuration || ride.estimatedDuration || 0;

    // Insertar viaje en PostgreSQL
    const rideResult = await client.query(
      `INSERT INTO rides (
        client_id, driver_id, 
        origin_lat, origin_lng, origin_address,
        destination_lat, destination_lng, destination_address,
        status, estimated_price, final_fare,
        estimated_distance, actual_distance,
        estimated_duration, actual_duration,
        payment_type, ride_type, passengers, notes,
        requested_at, accepted_at, started_at, completed_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        final_fare = EXCLUDED.final_fare,
        actual_distance = EXCLUDED.actual_distance,
        actual_duration = EXCLUDED.actual_duration,
        completed_at = EXCLUDED.completed_at
      RETURNING id`,
      [
        ride.clientId,
        ride.driverId,
        ride.origin?.lat || ride.origin?.latitude || 0,
        ride.origin?.lng || ride.origin?.longitude || 0,
        ride.origin?.address || '',
        ride.destination?.lat || ride.destination?.latitude || 0,
        ride.destination?.lng || ride.destination?.longitude || 0,
        ride.destination?.address || '',
        'completed',
        ride.estimatedPrice || 0,
        finalAmount,
        ride.estimatedDistance || 0,
        distance,
        ride.estimatedDuration || 0,
        duration,
        ride.paymentMethod || 'cash',
        ride.isDesignatedDriver ? 'designated_driver' : (ride.rideType || 'normal'),
        ride.passengers || 1,
        ride.notes || null,
        new Date(ride.createdAt || ride.requestedAt || Date.now()),
        ride.acceptedAt ? new Date(ride.acceptedAt) : null,
        ride.startedAt ? new Date(ride.startedAt) : null,
        new Date(ride.completedAt || Date.now())
      ]
    );

    const pgRideId = rideResult.rows[0].id;
    console.log(`✅ Viaje guardado en PostgreSQL con ID: ${pgRideId}`);
    
    return pgRideId;
  } catch (error) {
    console.error('❌ Error guardando viaje en PostgreSQL:', error);
    return null;
  } finally {
    client.release();
  }
}

/**
 * Guardar viaje cancelado en PostgreSQL
 */
export async function saveCanceledRideToPostgres(ride: any, rideId: string): Promise<string | null> {
  const client = await pool.connect();
  try {
    console.log(`💾 Guardando viaje cancelado en PostgreSQL: ${rideId}`);
    
    // Insertar viaje en PostgreSQL
    const rideResult = await client.query(
      `INSERT INTO rides (
        client_id, driver_id, 
        origin_lat, origin_lng, origin_address,
        destination_lat, destination_lng, destination_address,
        status, estimated_price, final_fare,
        estimated_distance, estimated_duration,
        payment_type, ride_type, passengers, notes,
        cancel_reason, canceled_by,
        requested_at, accepted_at, started_at, canceled_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        cancel_reason = EXCLUDED.cancel_reason,
        canceled_by = EXCLUDED.canceled_by,
        canceled_at = EXCLUDED.canceled_at
      RETURNING id`,
      [
        ride.clientId,
        ride.driverId || null,
        ride.origin?.lat || ride.origin?.latitude || 0,
        ride.origin?.lng || ride.origin?.longitude || 0,
        ride.origin?.address || '',
        ride.destination?.lat || ride.destination?.latitude || 0,
        ride.destination?.lng || ride.destination?.longitude || 0,
        ride.destination?.address || '',
        'canceled',
        ride.estimatedPrice || 0,
        ride.finalFare || ride.estimatedPrice || 0,
        ride.estimatedDistance || 0,
        ride.estimatedDuration || 0,
        ride.paymentMethod || 'cash',
        ride.isDesignatedDriver ? 'designated_driver' : (ride.rideType || 'normal'),
        ride.passengers || 1,
        ride.notes || null,
        ride.cancelReason || 'Sin razón especificada',
        ride.canceledBy || 'unknown',
        new Date(ride.createdAt || ride.requestedAt || Date.now()),
        ride.acceptedAt ? new Date(ride.acceptedAt) : null,
        ride.startedAt ? new Date(ride.startedAt) : null,
        new Date(ride.canceledAt || Date.now())
      ]
    );

    const pgRideId = rideResult.rows[0].id;
    console.log(`✅ Viaje cancelado guardado en PostgreSQL con ID: ${pgRideId}`);
    
    return pgRideId;
  } catch (error) {
    console.error('❌ Error guardando viaje cancelado en PostgreSQL:', error);
    return null;
  } finally {
    client.release();
  }
}

/**
 * Guardar payment en PostgreSQL
 * Schema completo de Supabase con todos los campos requeridos
 */
export async function savePaymentToPostgres(paymentStatus: any, rideId: string, pgRideId: string): Promise<void> {
  const client = await pool.connect();
  try {
    console.log(`💳 Guardando payment en PostgreSQL para viaje: ${rideId}`);
    
    // Calcular valores
    const amount = paymentStatus.finalAmount || paymentStatus.amount || 0;
    const tip = paymentStatus.tip || 0;
    
    // Calcular comisión (15% del monto base)
    const commission = amount * 0.15;
    
    // Mapear status de Firebase a PostgreSQL
    const status = paymentStatus.status === 'completed' ? 'completed' : 
                   paymentStatus.status === 'pending_capture' ? 'pending' : 
                   paymentStatus.status === 'authorized' ? 'pending' :
                   paymentStatus.status === 'in_progress' ? 'pending' :
                   paymentStatus.status === 'canceled' ? 'failed' : 'pending';

    // Determinar payment_provider basado en el método
    const paymentProvider = paymentStatus.method === 'stripe' ? 'stripe' :
                           paymentStatus.method === 'visanet' ? 'visanet' :
                           paymentStatus.method === 'bac' ? 'bac' :
                           paymentStatus.method === 'banpro' ? 'banpro' :
                           paymentStatus.method === 'lafise' ? 'lafise' :
                           null; // null para cash

    // Verificar si ya existe un payment para este viaje
    const existingPayment = await client.query(
      'SELECT id FROM payments WHERE ride_id = $1',
      [pgRideId]
    );

    if (existingPayment.rows.length > 0) {
      // Actualizar payment existente
      await client.query(
        `UPDATE payments SET
          amount = $2,
          tip = $3,
          commission = $4,
          status = $5,
          paid_at = $6,
          cancel_reason = $7,
          notes = $8,
          updated_at = NOW()
        WHERE ride_id = $1`,
        [
          pgRideId,
          amount,
          tip,
          commission,
          status,
          status === 'completed' ? new Date() : null,
          paymentStatus.cancelReason || null,
          paymentStatus.message || paymentStatus.notes || null,
        ]
      );
      console.log(`✅ Payment actualizado en PostgreSQL para viaje: ${pgRideId}`);
    } else {
      // Insertar nuevo payment
      await client.query(
        `INSERT INTO payments (
          ride_id, 
          amount, 
          tip,
          commission,
          payment_method, 
          payment_provider,
          status, 
          stripe_payment_intent_id,
          stripe_charge_id,
          local_transaction_id,
          local_authorization_code,
          local_bank,
          cancel_reason,
          notes,
          created_at, 
          paid_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        )`,
      [
        pgRideId, // $1
        amount, // $2
        tip, // $3
        commission, // $4 - REQUERIDO (NOT NULL)
        paymentStatus.method || 'cash', // $5
        paymentProvider, // $6
        status, // $7
        paymentStatus.paymentIntentId || null, // $8 - stripe_payment_intent_id
        paymentStatus.chargeId || null, // $9 - stripe_charge_id
        paymentStatus.localTransactionId || null, // $10 - local_transaction_id
        paymentStatus.localAuthCode || null, // $11 - local_authorization_code
        paymentStatus.localBank || null, // $12 - local_bank (bac, banpro, lafise)
        paymentStatus.cancelReason || null, // $13 - cancel_reason
        paymentStatus.message || paymentStatus.notes || null, // $14 - notes
        new Date(paymentStatus.createdAt || Date.now()), // $15
        status === 'completed' ? new Date() : null // $16
      ]
      );
      console.log(`✅ Payment guardado en PostgreSQL para viaje: ${pgRideId}`);
    }

    console.log(`   - Monto: C$${amount}, Propina: C$${tip}, Comisión: C$${commission.toFixed(2)}`);
    console.log(`   - Método: ${paymentStatus.method}, Provider: ${paymentProvider || 'N/A'}`);
    console.log(`   - Estado: ${status}`);
  } catch (error) {
    console.error('❌ Error guardando payment en PostgreSQL:', error);
    console.error('   Detalles del error:', error);
  } finally {
    client.release();
  }
}

/**
 * Limpiar viaje del Realtime Database
 * Elimina: activeRides, paymentStatus, chat, driverLocations (si aplica)
 */
export async function cleanupRideFromRealtime(rideId: string, driverId?: string): Promise<void> {
  try {
    console.log(`🧹 Limpiando viaje ${rideId} del Realtime Database...`);
    
    const updates: { [key: string]: null } = {};
    
    // Eliminar viaje de activeRides
    updates[`activeRides/${rideId}`] = null;
    
    // Eliminar paymentStatus
    updates[`paymentStatus/${rideId}`] = null;
    
    // Eliminar chat
    updates[`chats/${rideId}`] = null;
    
    // Si hay driverId, limpiar su ubicación específica para este viaje
    // (NO eliminamos driverLocations/${driverId} porque puede tener otros viajes)
    
    // Aplicar todas las eliminaciones en una sola operación
    await admin.database().ref().update(updates);
    
    console.log(`✅ Viaje ${rideId} eliminado del Realtime Database`);
  } catch (error) {
    console.error(`❌ Error limpiando viaje ${rideId} del Realtime:`, error);
    throw error;
  }
}

/**
 * Proceso completo: Guardar en PostgreSQL y limpiar Realtime
 */
export async function archiveCompletedRide(ride: any, rideId: string): Promise<void> {
  try {
    console.log(`📦 Archivando viaje completado: ${rideId}`);
    
    // 1. Guardar viaje en PostgreSQL
    const pgRideId = await saveCompletedRideToPostgres(ride, rideId);
    
    if (!pgRideId) {
      console.error(`❌ No se pudo guardar viaje en PostgreSQL, NO se limpiará del Realtime`);
      return;
    }
    
    // 2. Obtener y guardar payment
    const paymentSnapshot = await admin.database()
      .ref(`paymentStatus/${rideId}`)
      .once('value');
    
    const paymentStatus = paymentSnapshot.val();
    if (paymentStatus) {
      await savePaymentToPostgres(paymentStatus, rideId, pgRideId);
    }
    
    // 3. Esperar 5 segundos para que el frontend procese la notificación
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 4. Limpiar del Realtime Database
    await cleanupRideFromRealtime(rideId, ride.driverId);
    
    console.log(`✅ Viaje ${rideId} archivado exitosamente`);
  } catch (error) {
    console.error(`❌ Error archivando viaje ${rideId}:`, error);
    throw error;
  }
}

/**
 * Proceso completo: Guardar viaje cancelado y limpiar Realtime
 */
export async function archiveCanceledRide(ride: any, rideId: string): Promise<void> {
  try {
    console.log(`📦 Archivando viaje cancelado: ${rideId}`);
    
    // 1. Guardar viaje en PostgreSQL
    const pgRideId = await saveCanceledRideToPostgres(ride, rideId);
    
    if (!pgRideId) {
      console.error(`❌ No se pudo guardar viaje cancelado en PostgreSQL, NO se limpiará del Realtime`);
      return;
    }
    
    // 2. Obtener y guardar payment si existe
    const paymentSnapshot = await admin.database()
      .ref(`paymentStatus/${rideId}`)
      .once('value');
    
    const paymentStatus = paymentSnapshot.val();
    if (paymentStatus) {
      await savePaymentToPostgres(paymentStatus, rideId, pgRideId);
    }
    
    // 3. Esperar 3 segundos para que el frontend procese la notificación
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 4. Limpiar del Realtime Database
    await cleanupRideFromRealtime(rideId, ride.driverId);
    
    console.log(`✅ Viaje cancelado ${rideId} archivado exitosamente`);
  } catch (error) {
    console.error(`❌ Error archivando viaje cancelado ${rideId}:`, error);
    throw error;
  }
}
