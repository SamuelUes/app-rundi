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
  
  // ✅ Usar status del ride si existe, sino usar 'completed'
  const rideStatus = ride.status || 'completed';
  
  // Preparar datos FUERA del try block para poder usarlos en catch
  const finalFare = paymentStatus?.finalAmount || ride.finalFare || ride.estimatedPrice || 0;
  const actualDistance = ride.actualDistance || ride.estimatedDistance || 0;
  const actualDuration = ride.actualDuration || ride.estimatedDuration || 0;
  
  try {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`💾 [saveCompletedRideToSupabase] INICIANDO GUARDADO DE VIAJE`);
    console.log(`${"=".repeat(60)}`);
    console.log(`   Firebase ID: ${firebaseRideId}`);
    console.log(`   Status: ${rideStatus}`);
    console.log(`   Client ID: ${ride.clientId}`);
    console.log(`   Driver ID: ${ride.driverId}`);

    // Validar datos requeridos
    if (!ride.clientId || !ride.driverId) {
      console.error(`❌ [saveCompletedRideToSupabase] Faltan clientId o driverId`);
      return null;
    }

    console.log(`\n   📊 Datos a guardar:`, {
      firebase_ride_id: firebaseRideId,
      client_id: ride.clientId,
      driver_id: ride.driverId,
      status: rideStatus,
      cancel_reason: ride.cancelReason || null,
      final_fare: finalFare,
      actual_distance: actualDistance,
      actual_duration: actualDuration,
      waypoints_count: ride.extraDestinations?.length || 0,
      has_multiple_stops: (ride.extraDestinations?.length || 0) > 0,
    });

    // ✅ ACTUALIZADO: Insertar en tabla rides SIN campos de ubicación
    // Las ubicaciones se guardan en ride_locations
    console.log(`   🔍 Ejecutando INSERT en tabla rides...`);
    
    // Preparar parámetros para logging
    const params = [
      firebaseRideId,                                    // $1
      ride.clientId,                                     // $2
      ride.driverId,                                     // $3
      ride.estimatedDistance || null,                    // $4
      ride.estimatedDuration || null,                    // $5
      actualDistance,                                    // $6
      actualDuration,                                    // $7
      ride.estimatedPrice || null,                       // $8
      finalFare,                                         // $9
      ride.clientSuggestedPrice || null,                 // $10
      ride.driverOfferedPrice || null,                   // $11
      ride.passengers || 1,                              // $12
      ride.notes || null,                                // $13
      ride.rideType || 'normal',                         // $14
      ride.vehicleType || 'auto',                        // $15
      ride.paymentMethod || 'cash',                      // $16
      rideStatus,                                        // $17
      ride.cancelReason || null,                         // $18
      ride.canceledBy || null,                           // $19
      ride.requestedAt ? new Date(ride.requestedAt) : null, // $20
      ride.acceptedAt ? new Date(ride.acceptedAt) : null,   // $21
      ride.startedAt ? new Date(ride.startedAt) : null,     // $22
      ride.completedAt ? new Date(ride.completedAt) : (rideStatus === 'completed' ? new Date() : null), // $23
      ride.canceledAt ? new Date(ride.canceledAt) : (rideStatus === 'canceled' ? new Date() : null), // $24
      ride.extraDestinations?.length || 0,               // $25 waypoints_count
      (ride.extraDestinations?.length || 0) > 0,         // $26 has_multiple_stops
      new Date(),                                        // $27 created_at
      new Date(),                                        // $28 updated_at
    ];
    
    console.log(`   📋 Parámetros del INSERT:`, {
      $1: params[0],  // firebase_ride_id
      $2: params[1],  // client_id
      $3: params[2],  // driver_id
      $16: params[15], // payment_type
      $17: params[16], // status
      $25: params[24], // waypoints_count
      $26: params[25], // has_multiple_stops
    });
    
    console.log(`\n   🔍 Ejecutando INSERT en tabla rides...`);
    console.log(`   ⏱️ Timestamp: ${new Date().toISOString()}`);
    
    const result = await client.query(
      `INSERT INTO public.rides (
        firebase_ride_id,
        client_id,
        driver_id,
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
        waypoints_count,
        has_multiple_stops,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28
      )
      RETURNING id`,
      params
    );
    
    console.log(`   ✅ INSERT ejecutado exitosamente`);
    console.log(`   📊 Resultado:`, result);

    if (!result.rows || result.rows.length === 0) {
      console.error(`❌ [saveCompletedRideToSupabase] INSERT no retornó filas`);
      console.error(`   Resultado completo:`, JSON.stringify(result, null, 2));
      return null;
    }

    const pgRideId = result.rows[0].id;
    console.log(`✅ [saveCompletedRideToSupabase] Viaje guardado: ${pgRideId}`);
    console.log(`   📍 Ubicaciones: ${ride.extraDestinations?.length || 0} paradas`);
    console.log(`   💰 Monto final: ${finalFare}`);

    // ✅ VERIFICACIÓN: Confirmar que el registro se guardó correctamente
    console.log(`\n   🔍 Verificando que el registro se guardó...`);
    const verifyResult = await client.query(
      `SELECT id, firebase_ride_id, client_id, driver_id, status, waypoints_count, has_multiple_stops
       FROM public.rides 
       WHERE id = $1`,
      [pgRideId]
    );

    if (verifyResult.rows && verifyResult.rows.length > 0) {
      const savedRide = verifyResult.rows[0];
      console.log(`   ✅ Registro verificado en BD:`);
      console.log(`      ID: ${savedRide.id}`);
      console.log(`      Firebase ID: ${savedRide.firebase_ride_id}`);
      console.log(`      Status: ${savedRide.status}`);
      console.log(`      Waypoints: ${savedRide.waypoints_count}`);
    } else {
      console.warn(`   ⚠️ Registro NO encontrado en BD después de INSERT`);
    }

    return pgRideId;
  } catch (error: any) {
    console.error(`\n${"=".repeat(60)}`);
    console.error(`❌ [saveCompletedRideToSupabase] ERROR CRÍTICO AL GUARDAR VIAJE`);
    console.error(`${"=".repeat(60)}`);
    console.error(`   Mensaje: ${error.message}`);
    console.error(`   Código: ${error.code}`);
    console.error(`   Detalle: ${error.detail}`);
    console.error(`   Hint: ${error.hint}`);
    console.error(`   Posición: ${error.position}`);
    console.error(`   Contexto: ${error.context}`);
    console.error(`   Tabla: ${error.table}`);
    console.error(`   Columna: ${error.column}`);
    console.error(`   Constraint: ${error.constraint}`);
    console.error(`\n   Stack:`, error.stack);
    
    // Log de los datos que intentamos guardar
    console.error(`\n   📊 Datos intentados:`, {
      firebaseRideId,
      clientId: ride.clientId,
      driverId: ride.driverId,
      status: rideStatus,
      serviceId: ride.serviceId,
      estimatedPrice: ride.estimatedPrice,
      finalFare: finalFare,
      waypoints_count: ride.extraDestinations?.length || 0,
      has_multiple_stops: (ride.extraDestinations?.length || 0) > 0,
    });
    
    console.error(`${"=".repeat(60)}\n`);
    
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

    console.log(`   📊 Datos a guardar:`, {
      firebase_ride_id: firebaseRideId,
      client_id: ride.clientId,
      driver_id: ride.driverId || null,
      status: 'canceled',
      cancel_reason: ride.cancelReason || null,
      canceled_by: ride.canceledBy || null,
    });

    // ✅ ACTUALIZADO: Insertar en tabla rides SIN campos de ubicación
    // Las ubicaciones se guardan en ride_locations
    console.log(`   🔍 Ejecutando INSERT en tabla rides...`);
    console.log(`   ⏱️ Timestamp: ${new Date().toISOString()}`);
    
    const result = await client.query(
      `INSERT INTO public.rides (
        firebase_ride_id,
        client_id,
        driver_id,
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
        waypoints_count,
        has_multiple_stops,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      )
      RETURNING id`,
      [
        firebaseRideId,                                    // $1
        ride.clientId,                                     // $2
        ride.driverId || null,                             // $3
        ride.estimatedDistance || null,                    // $4
        ride.estimatedDuration || null,                    // $5
        ride.estimatedPrice || null,                       // $6
        ride.finalFare || null,                            // $7
        ride.passengers || 1,                              // $8
        ride.rideType || 'normal',                         // $9
        ride.vehicleType || 'auto',                        // $10
        ride.paymentMethod || 'cash',                      // $11
        'canceled',                                        // $12
        ride.cancelReason || null,                         // $13
        ride.canceledBy || null,                           // $14
        ride.requestedAt ? new Date(ride.requestedAt) : null, // $15
        ride.acceptedAt ? new Date(ride.acceptedAt) : null,   // $16
        ride.canceledAt ? new Date(ride.canceledAt) : new Date(), // $17
        ride.extraDestinations?.length || 0,               // $18 waypoints_count
        (ride.extraDestinations?.length || 0) > 0,         // $19 has_multiple_stops
        new Date(),                                        // $20 created_at
        new Date(),                                        // $21 updated_at
      ]
    );
    
    console.log(`   ✅ INSERT ejecutado exitosamente`);
    console.log(`   📊 Resultado:`, result);

    if (!result.rows || result.rows.length === 0) {
      console.error(`❌ [saveCanceledRideToSupabase] INSERT no retornó filas`);
      console.error(`   Resultado:`, result);
      return null;
    }

    const pgRideId = result.rows[0].id;
    console.log(`✅ [saveCanceledRideToSupabase] Viaje cancelado guardado: ${pgRideId}`);

    return pgRideId;
  } catch (error: any) {
    console.error(`❌ [saveCanceledRideToSupabase] Error al guardar viaje cancelado:`);
    console.error(`   Mensaje: ${error.message}`);
    console.error(`   Código: ${error.code}`);
    console.error(`   Detalle: ${error.detail}`);
    console.error(`   Stack:`, error.stack);
    
    // Log de los datos que intentamos guardar
    console.error(`   Datos intentados:`, {
      firebaseRideId,
      clientId: ride.clientId,
      driverId: ride.driverId,
      status: 'canceled',
    });
    
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
 * ✅ NUEVO: ACTUALIZAR IDs DE UBICACIONES EN RIDES
 * 
 * Después de guardar las ubicaciones, actualiza los IDs de origen y destino en rides
 */
export async function updateRideLocationIds(
  pgRideId: string,
  locationIds: string[]
): Promise<boolean> {
  const client = await pool.connect();
  try {
    if (!locationIds || locationIds.length === 0) {
      console.warn(`⚠️ [updateRideLocationIds] No hay ubicaciones para actualizar`);
      return false;
    }

    console.log(`\n🔗 [updateRideLocationIds] Actualizando IDs de ubicaciones para ride: ${pgRideId}`);

    // Obtener las ubicaciones para identificar origen y destino
    const locationsResult = await client.query(
      `SELECT id, location_type FROM public.ride_locations 
       WHERE ride_id = $1 
       ORDER BY location_order ASC`,
      [pgRideId]
    );

    if (!locationsResult.rows || locationsResult.rows.length === 0) {
      console.warn(`⚠️ [updateRideLocationIds] No se encontraron ubicaciones`);
      return false;
    }

    // Buscar origen y destino
    const originLocation = locationsResult.rows.find((loc: any) => loc.location_type === 'origin');
    const destinationLocation = locationsResult.rows.find((loc: any) => loc.location_type === 'destination');

    if (!originLocation || !destinationLocation) {
      console.warn(`⚠️ [updateRideLocationIds] Falta origen o destino`);
      return false;
    }

    // Actualizar rides con los IDs
    await client.query(
      `UPDATE public.rides 
       SET origin_location_id = $1, 
           destination_location_id = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [originLocation.id, destinationLocation.id, pgRideId]
    );

    console.log(`✅ [updateRideLocationIds] IDs actualizados:`);
    console.log(`   📍 Origen: ${originLocation.id}`);
    console.log(`   🎯 Destino: ${destinationLocation.id}`);

    return true;
  } catch (error: any) {
    console.error(`❌ [updateRideLocationIds] Error:`, error.message);
    console.error(`   Stack:`, error.stack);
    return false;
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
