/**
 * SUPABASE ARCHIVE - Sistema completo de guardado en Supabase
 * 
 * Responsable de:
 * 1. Guardar viajes completados en tabla rides
 * 2. Guardar pagos en tabla payments
 * 3. Guardar calificaciones en tabla ratings
 * 
 * Basado en esquema de supabase-only.sql
 */

import pool from "../config/database";

/**
 * GUARDAR VIAJE EN SUPABASE
 * 
 * Inserta en tabla rides con TODOS los campos requeridos
 * ✅ Acepta status como parámetro (completed, canceled, etc)
 */
export async function saveCompletedRideToSupabase(
  ride: any,
  firebaseRideId: string,
  paymentStatus: any
): Promise<string | null> {
  const client = await pool.connect();
  try {
    // ✅ Usar status del ride si existe, sino usar 'completed'
    const rideStatus = ride.status || 'completed';
    
    console.log(`\n💾 [saveCompletedRideToSupabase] Guardando viaje: ${firebaseRideId} (status: ${rideStatus})`);

    // Validar datos requeridos
    if (!ride.clientId || !ride.driverId) {
      console.error(`❌ [saveCompletedRideToSupabase] Faltan clientId o driverId`);
      return null;
    }

    // Preparar datos
    const finalFare = paymentStatus?.finalAmount || ride.finalFare || ride.estimatedPrice || 0;
    const actualDistance = ride.actualDistance || ride.estimatedDistance || 0;
    const actualDuration = ride.actualDuration || ride.estimatedDuration || 0;

    console.log(`   📊 Datos a guardar:`, {
      firebase_ride_id: firebaseRideId,
      client_id: ride.clientId,
      driver_id: ride.driverId,
      status: rideStatus,
      cancel_reason: ride.cancelReason || null,
      final_fare: finalFare,
      actual_distance: actualDistance,
      actual_duration: actualDuration,
    });

    // Insertar en tabla rides
    const result = await client.query(
      `INSERT INTO public.rides (
        firebase_ride_id,
        client_id,
        driver_id,
        origin_lat,
        origin_lng,
        origin_address,
        destination_lat,
        destination_lng,
        destination_address,
        estimated_distance,
        estimated_duration,
        actual_distance,
        actual_duration,
        estimated_price,
        final_fare,
        client_suggested_price,
        driver_offered_price,
        passengers,
        notes,
        ride_type,
        vehicle_type,
        payment_type,
        status,
        cancel_reason,
        canceled_by,
        requested_at,
        accepted_at,
        started_at,
        completed_at,
        canceled_at,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32
      )
      RETURNING id`,
      [
        firebaseRideId,                                    // $1
        ride.clientId,                                     // $2
        ride.driverId,                                     // $3
        ride.origin?.lat || ride.origin?.latitude || null,// $4
        ride.origin?.lng || ride.origin?.longitude || null,// $5
        ride.origin?.address || null,                      // $6
        ride.destination?.lat || ride.destination?.latitude || null, // $7
        ride.destination?.lng || ride.destination?.longitude || null, // $8
        ride.destination?.address || null,                 // $9
        ride.estimatedDistance || null,                    // $10
        ride.estimatedDuration || null,                    // $11
        actualDistance,                                    // $12
        actualDuration,                                    // $13
        ride.estimatedPrice || null,                       // $14
        finalFare,                                         // $15
        ride.clientSuggestedPrice || null,                 // $16
        ride.driverOfferedPrice || null,                   // $17
        ride.passengers || 1,                              // $18
        ride.notes || null,                                // $19
        ride.rideType || 'normal',                         // $20
        ride.vehicleType || 'auto',                        // $21
        ride.paymentMethod || 'cash',                      // $22
        rideStatus,                                        // $23 ✅ Usar rideStatus dinámico
        ride.cancelReason || null,                         // $24 ✅ Agregar cancel_reason
        ride.canceledBy || null,                           // $25 ✅ Agregar canceled_by
        ride.requestedAt ? new Date(ride.requestedAt) : null, // $26
        ride.acceptedAt ? new Date(ride.acceptedAt) : null,   // $27
        ride.startedAt ? new Date(ride.startedAt) : null,     // $28
        ride.completedAt ? new Date(ride.completedAt) : (rideStatus === 'completed' ? new Date() : null), // $29
        ride.canceledAt ? new Date(ride.canceledAt) : (rideStatus === 'canceled' ? new Date() : null), // $30
        new Date(),                                        // $31 created_at
        new Date(),                                        // $32 updated_at
      ]
    );

    if (!result.rows || result.rows.length === 0) {
      console.error(`❌ [saveCompletedRideToSupabase] INSERT no retornó filas`);
      return null;
    }

    const pgRideId = result.rows[0].id;
    console.log(`✅ [saveCompletedRideToSupabase] Viaje guardado: ${pgRideId}`);

    return pgRideId;
  } catch (error: any) {
    console.error(`❌ [saveCompletedRideToSupabase] Error:`, error.message);
    console.error(`   Stack:`, error.stack);
    return null;
  } finally {
    client.release();
  }
}

/**
 * GUARDAR PAGO EN SUPABASE
 * 
 * Inserta en tabla payments con TODOS los campos requeridos
 * ✅ Acepta status como parámetro (completed, canceled, etc)
 */
export async function savePaymentToSupabase(
  pgRideId: string,
  paymentStatus: any
): Promise<boolean> {
  const client = await pool.connect();
  try {
    // ✅ Usar status del paymentStatus (completed, canceled, etc)
    const paymentStatusValue = paymentStatus.status || 'completed';
    
    console.log(`\n💳 [savePaymentToSupabase] Guardando pago para ride: ${pgRideId} (status: ${paymentStatusValue})`);

    const amount = paymentStatus.finalAmount || 0;
    const tip = paymentStatus.tip || 0;
    const commission = calculateCommission(amount); // 10% de comisión

    console.log(`   📊 Datos a guardar:`, {
      ride_id: pgRideId,
      amount: amount,
      tip: tip,
      commission: commission,
      payment_method: paymentStatus.method || 'cash',
      status: paymentStatusValue,
      cancel_reason: paymentStatus.cancelReason || null,
    });

    // Insertar en tabla payments
    await client.query(
      `INSERT INTO public.payments (
        ride_id,
        amount,
        tip,
        commission,
        payment_method,
        payment_provider,
        status,
        cancel_reason,
        paid_at,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      )`,
      [
        pgRideId,                              // $1
        amount,                                // $2
        tip,                                   // $3
        commission,                            // $4
        paymentStatus.method || 'cash',        // $5
        'cash',                                // $6 payment_provider
        paymentStatusValue,                    // $7 ✅ Usar status dinámico
        paymentStatus.cancelReason || null,    // $8 ✅ Agregar cancel_reason
        paymentStatusValue === 'completed' ? new Date() : null, // $9 paid_at
        new Date(),                            // $10 created_at
        new Date(),                            // $11 updated_at
      ]
    );

    console.log(`✅ [savePaymentToSupabase] Pago guardado (status: ${paymentStatusValue})`);
    return true;
  } catch (error: any) {
    console.error(`❌ [savePaymentToSupabase] Error:`, error.message);
    console.error(`   Stack:`, error.stack);
    return false;
  } finally {
    client.release();
  }
}

/**
 * GUARDAR VIAJE CANCELADO EN SUPABASE
 */
export async function saveCanceledRideToSupabase(
  ride: any,
  firebaseRideId: string
): Promise<string | null> {
  const client = await pool.connect();
  try {
    console.log(`\n💾 [saveCanceledRideToSupabase] Guardando viaje cancelado: ${firebaseRideId}`);

    if (!ride.clientId) {
      console.error(`❌ [saveCanceledRideToSupabase] Falta clientId`);
      return null;
    }

    const result = await client.query(
      `INSERT INTO public.rides (
        firebase_ride_id,
        client_id,
        driver_id,
        origin_lat,
        origin_lng,
        origin_address,
        destination_lat,
        destination_lng,
        destination_address,
        estimated_distance,
        estimated_duration,
        estimated_price,
        final_fare,
        passengers,
        ride_type,
        vehicle_type,
        payment_type,
        status,
        cancel_reason,
        canceled_by,
        requested_at,
        accepted_at,
        canceled_at,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25
      )
      RETURNING id`,
      [
        firebaseRideId,                                    // $1
        ride.clientId,                                     // $2
        ride.driverId || null,                             // $3
        ride.origin?.lat || null,                          // $4
        ride.origin?.lng || null,                          // $5
        ride.origin?.address || null,                      // $6
        ride.destination?.lat || null,                     // $7
        ride.destination?.lng || null,                     // $8
        ride.destination?.address || null,                 // $9
        ride.estimatedDistance || null,                    // $10
        ride.estimatedDuration || null,                    // $11
        ride.estimatedPrice || null,                       // $12
        ride.finalFare || null,                            // $13
        ride.passengers || 1,                              // $14
        ride.rideType || 'normal',                         // $15
        ride.vehicleType || 'auto',                        // $16
        ride.paymentMethod || 'cash',                      // $17
        'canceled',                                        // $18
        ride.cancelReason || null,                         // $19
        ride.canceledBy || null,                           // $20
        ride.requestedAt ? new Date(ride.requestedAt) : null, // $21
        ride.acceptedAt ? new Date(ride.acceptedAt) : null,   // $22
        ride.canceledAt ? new Date(ride.canceledAt) : new Date(), // $23
        new Date(),                                        // $24 created_at
        new Date(),                                        // $25 updated_at
      ]
    );

    if (!result.rows || result.rows.length === 0) {
      console.error(`❌ [saveCanceledRideToSupabase] INSERT no retornó filas`);
      return null;
    }

    const pgRideId = result.rows[0].id;
    console.log(`✅ [saveCanceledRideToSupabase] Viaje cancelado guardado: ${pgRideId}`);

    return pgRideId;
  } catch (error: any) {
    console.error(`❌ [saveCanceledRideToSupabase] Error:`, error.message);
    return null;
  } finally {
    client.release();
  }
}

/**
 * ✅ NUEVO: GUARDAR UBICACIONES DEL VIAJE EN SUPABASE
 * 
 * Inserta en tabla ride_locations todas las paradas del viaje
 * (origen, paradas intermedias, destino)
 */
export async function saveRideLocationsToSupabase(
  pgRideId: string,
  ride: any
): Promise<string[] | null> {
  const client = await pool.connect();
  try {
    console.log(`\n📍 [saveRideLocationsToSupabase] Guardando ubicaciones para ride: ${pgRideId}`);

    const locationIds: string[] = [];
    let locationOrder = 1;

    // 1. Guardar ORIGEN
    if (ride.origin) {
      const originResult = await client.query(
        `INSERT INTO public.ride_locations (
          ride_id,
          location_type,
          location_order,
          latitude,
          longitude,
          address,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id`,
        [
          pgRideId,                                    // $1
          'origin',                                    // $2
          locationOrder,                               // $3
          ride.origin.lat || ride.origin.latitude,    // $4
          ride.origin.lng || ride.origin.longitude,   // $5
          ride.origin.address || 'Origen',             // $6
          new Date(),                                  // $7
          new Date(),                                  // $8
        ]
      );
      
      if (originResult.rows && originResult.rows[0]) {
        locationIds.push(originResult.rows[0].id);
        console.log(`   ✅ Origen guardado: ${originResult.rows[0].id}`);
        locationOrder++;
      }
    }

    // 2. Guardar PARADAS INTERMEDIAS (extraDestinations)
    if (ride.extraDestinations && ride.extraDestinations.length > 0) {
      for (const waypoint of ride.extraDestinations) {
        const waypointResult = await client.query(
          `INSERT INTO public.ride_locations (
            ride_id,
            location_type,
            location_order,
            latitude,
            longitude,
            address,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id`,
          [
            pgRideId,                                  // $1
            'waypoint',                                // $2
            locationOrder,                             // $3
            waypoint.lat || waypoint.latitude,        // $4
            waypoint.lng || waypoint.longitude,       // $5
            waypoint.address || `Parada ${locationOrder - 1}`, // $6
            new Date(),                                // $7
            new Date(),                                // $8
          ]
        );
        
        if (waypointResult.rows && waypointResult.rows[0]) {
          locationIds.push(waypointResult.rows[0].id);
          console.log(`   ✅ Parada ${locationOrder - 1} guardada: ${waypointResult.rows[0].id}`);
          locationOrder++;
        }
      }
    }

    // 3. Guardar DESTINO
    if (ride.destination) {
      const destinationResult = await client.query(
        `INSERT INTO public.ride_locations (
          ride_id,
          location_type,
          location_order,
          latitude,
          longitude,
          address,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id`,
        [
          pgRideId,                                      // $1
          'destination',                                // $2
          locationOrder,                                // $3
          ride.destination.lat || ride.destination.latitude, // $4
          ride.destination.lng || ride.destination.longitude, // $5
          ride.destination.address || 'Destino',        // $6
          new Date(),                                   // $7
          new Date(),                                   // $8
        ]
      );
      
      if (destinationResult.rows && destinationResult.rows[0]) {
        locationIds.push(destinationResult.rows[0].id);
        console.log(`   ✅ Destino guardado: ${destinationResult.rows[0].id}`);
      }
    }

    console.log(`✅ [saveRideLocationsToSupabase] ${locationIds.length} ubicaciones guardadas`);
    return locationIds.length > 0 ? locationIds : null;
  } catch (error: any) {
    console.error(`❌ [saveRideLocationsToSupabase] Error:`, error.message);
    console.error(`   Stack:`, error.stack);
    return null;
  } finally {
    client.release();
  }
}

/**
 * Calcular comisión (10% para viajes normales)
 */
function calculateCommission(amount: number): number {
  return Math.round(amount * 0.1 * 100) / 100; // 10%
}
