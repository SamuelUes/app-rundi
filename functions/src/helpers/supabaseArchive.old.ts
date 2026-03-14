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

const normalizeCanceledBy = (value: any): "client" | "driver" | null => {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "client" || normalized === "driver") {
    return normalized as "client" | "driver";
  }

  return null;
};
const toNumber = (value: any): number | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

const pickNumber = (...values: any[]): number | null => {
  for (const value of values) {
    const num = toNumber(value);
    if (num !== null) {
      return num;
    }
  }

  return null;
};

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
  const rideStatusRaw = ride.status || "completed";
  const rideStatus = rideStatusRaw === "rating_completed" ? "completed" : rideStatusRaw;
  const normalizedCanceledBy = normalizeCanceledBy(ride.canceledBy);

  // Preparar datos FUERA del try block para poder usarlos en catch
  const estimatedDistance = pickNumber(ride.estimatedDistance);
  const estimatedDuration = pickNumber(ride.estimatedDuration);
  const actualDistance = pickNumber(ride.actualDistance, ride.estimatedDistance) ?? 0;
  const actualDuration = pickNumber(ride.actualDuration, ride.estimatedDuration) ?? 0;
  const estimatedPrice = pickNumber(ride.estimatedPrice, paymentStatus?.amount);
  const clientSuggestedPrice = pickNumber(ride.clientSuggestedPrice);
  const driverOfferedPrice = pickNumber(ride.driverOfferedPrice);
  const paymentAmount = pickNumber(paymentStatus?.finalAmount, paymentStatus?.amount);
  const rideFinalFare = pickNumber(ride.finalFare);
  const finalFare = paymentAmount ?? rideFinalFare ?? estimatedPrice ?? clientSuggestedPrice ?? driverOfferedPrice ?? 0;
  const clientVehiclePhoto = ride.clientVehiclePhoto || ride.clientVehiclePhotoUrl || null;
  const serviceId = ride.serviceId || null;
  const biometricRequired = !!ride.biometricAcceptanceRequired;
  const biometricType = ride.biometricAcceptanceType || null;
  const biometricVerified = !!ride.biometricAcceptanceVerified;
  const biometricAt = ride.biometricAcceptanceAt ? new Date(ride.biometricAcceptanceAt) : null;

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
      cancel_reason: normalizedCanceledBy ? ride.cancelReason || null : null,
      final_fare: finalFare,
      actual_distance: actualDistance,
      actual_duration: actualDuration,
      waypoints_count: ride.extraDestinations?.length || 0,
      has_multiple_stops: (ride.extraDestinations?.length || 0) > 0,
    });

    console.log(`   🔍 Ejecutando INSERT en tabla rides...`);

    const params = [
      firebaseRideId, // $1
      ride.clientId, // $2
      ride.driverId, // $3
      estimatedDistance, // $4
      estimatedDuration, // $5
      actualDistance, // $6
      actualDuration, // $7
      estimatedPrice, // $8
      finalFare, // $9
      clientSuggestedPrice, // $10
      driverOfferedPrice, // $11
      ride.passengers || 1, // $12
      ride.notes || null, // $13
      ride.rideType || "normal", // $14
      ride.vehicleType || "auto", // $15
      clientVehiclePhoto, // $16
      ride.paymentMethod || "cash", // $17
      serviceId, // $18
      biometricRequired, // $19
      biometricType, // $20
      biometricVerified, // $21
      biometricAt, // $22
      rideStatus, // $23
      normalizedCanceledBy ? ride.cancelReason || null : null, // $24
      normalizedCanceledBy, // $25
      ride.requestedAt ? new Date(ride.requestedAt) : null, // $26
      ride.acceptedAt ? new Date(ride.acceptedAt) : null, // $27
      ride.startedAt ? new Date(ride.startedAt) : null, // $28
      ride.completedAt
        ? new Date(ride.completedAt)
        : rideStatus === "completed"
        ? new Date()
        : null, // $29
      ride.canceledAt
        ? new Date(ride.canceledAt)
        : rideStatus === "canceled"
        ? new Date()
        : null, // $30
      ride.extraDestinations?.length || 0, // $31
      (ride.extraDestinations?.length || 0) > 0, // $32
      new Date(), // $33 created_at
      new Date(), // $34 updated_at
    ];

    console.log(`   📋 Parámetros del INSERT:`, {
      $1: params[0],
      $2: params[1],
      $3: params[2],
      $16: params[15],
      $17: params[16],
      $25: params[24],
      $26: params[25],
    });

    console.log(`\n   🔍 Verificando existencia previa...`);
    const existingRideResult = await client.query(
      `SELECT * FROM public.rides WHERE firebase_ride_id = $1 LIMIT 1`,
      [firebaseRideId]
    );

    let pgRideId: string | null = null;

    if (existingRideResult.rows && existingRideResult.rows.length > 0) {
      const existingRide = existingRideResult.rows[0];
      pgRideId = existingRide.id;
      console.log(`   ℹ️ Registro existente encontrado (id: ${pgRideId}), aplicando UPDATE`);

      const updateParams = [
        ride.clientId || existingRide.client_id,
        ride.driverId || existingRide.driver_id,
        estimatedDistance ?? existingRide.estimated_distance,
        estimatedDuration ?? existingRide.estimated_duration,
        actualDistance ?? existingRide.actual_distance,
        actualDuration ?? existingRide.actual_duration,
        estimatedPrice ?? toNumber(existingRide.estimated_price),
        finalFare ?? toNumber(existingRide.final_fare),
        clientSuggestedPrice ?? toNumber(existingRide.client_suggested_price),
        driverOfferedPrice ?? toNumber(existingRide.driver_offered_price),
        ride.passengers ?? existingRide.passengers ?? 1,
        ride.notes ?? existingRide.notes ?? null,
        ride.rideType || existingRide.ride_type || "normal",
        ride.vehicleType || existingRide.vehicle_type || "auto",
        clientVehiclePhoto || existingRide.client_vehicle_photo || null,
        ride.paymentMethod || existingRide.payment_type || "cash",
        serviceId || existingRide.service_id || null,
        biometricRequired ?? existingRide.biometric_acceptance_required ?? false,
        biometricType || existingRide.biometric_acceptance_type || null,
        biometricVerified ?? existingRide.biometric_acceptance_verified ?? false,
        biometricAt || (existingRide.biometric_acceptance_at ? new Date(existingRide.biometric_acceptance_at) : null),
        rideStatus || existingRide.status,
        normalizedCanceledBy ? ride.cancelReason || existingRide.cancel_reason || null : existingRide.cancel_reason || null,
        normalizedCanceledBy ?? existingRide.canceled_by,
        ride.requestedAt ? new Date(ride.requestedAt) : (existingRide.requested_at ? new Date(existingRide.requested_at) : null),
        ride.acceptedAt ? new Date(ride.acceptedAt) : (existingRide.accepted_at ? new Date(existingRide.accepted_at) : null),
        ride.startedAt ? new Date(ride.startedAt) : (existingRide.started_at ? new Date(existingRide.started_at) : null),
        ride.completedAt
          ? new Date(ride.completedAt)
          : rideStatus === "completed"
          ? new Date()
          : existingRide.completed_at
          ? new Date(existingRide.completed_at)
          : null,
        ride.canceledAt
          ? new Date(ride.canceledAt)
          : rideStatus === "canceled"
          ? new Date()
          : existingRide.canceled_at
          ? new Date(existingRide.canceled_at)
          : null,
        ride.extraDestinations?.length ?? existingRide.waypoints_count ?? 0,
        (ride.extraDestinations?.length || existingRide.waypoints_count || 0) > 0,
        pgRideId,
      ];

      await client.query(
        `UPDATE public.rides
         SET client_id = $1,
             driver_id = $2,
             estimated_distance = $3,
             estimated_duration = $4,
             actual_distance = $5,
             actual_duration = $6,
             estimated_price = $7,
             final_fare = $8,
             client_suggested_price = $9,
             driver_offered_price = $10,
             passengers = $11,
             notes = $12,
             ride_type = $13,
             vehicle_type = $14,
             client_vehicle_photo = $15,
             payment_type = $16,
             service_id = $17,
             biometric_acceptance_required = $18,
             biometric_acceptance_type = $19,
             biometric_acceptance_verified = $20,
             biometric_acceptance_at = $21,
             status = $22,
             cancel_reason = $23,
             canceled_by = $24,
             requested_at = $25,
             accepted_at = $26,
             started_at = $27,
             completed_at = $28,
             canceled_at = $29,
             waypoints_count = $30,
             has_multiple_stops = $31,
             updated_at = NOW()
         WHERE id = $32`,
        updateParams
      );

      console.log(`   ✅ Registro actualizado`);
      return pgRideId;
    } else {
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
          client_vehicle_photo,
          payment_type,
          service_id,
          biometric_acceptance_required,
          biometric_acceptance_type,
          biometric_acceptance_verified,
          biometric_acceptance_at,
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
          $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
          $31, $32, $33, $34
        )
        RETURNING id`,
        params
      );

      console.log(`   ✅ INSERT ejecutado exitosamente`);
      console.log(`   📊 Resultado:`, result);

      if (!result.rows || result.rows.length === 0) {
        console.error(`❌ [saveCompletedRideToSupabase] INSERT no retornó filas`);
        return null;
      }

      pgRideId = result.rows[0].id;
      console.log(`✅ [saveCompletedRideToSupabase] Viaje guardado: ${pgRideId}`);
      console.log(`   📍 Ubicaciones: ${ride.extraDestinations?.length || 0} paradas`);
      console.log(`   💰 Monto final: ${finalFare}`);

      return pgRideId;
    }
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
    const amount = pickNumber(paymentStatus.finalAmount, paymentStatus.amount, paymentStatus.total, paymentStatus.calculatedAmount, paymentStatus.estimatedPrice) || 0;
    const tip = pickNumber(paymentStatus.tip) || 0;
    const commission = calculateCommission(amount); // 15% de comisión

    const biometricAuthenticated = !!paymentStatus.biometric_authenticated;
    const biometricType = paymentStatus.biometric_type || null;
    const authenticationMethod = paymentStatus.authentication_method || (biometricAuthenticated ? 'biometric' : 'manual');
    const smsCodeVerified = !!paymentStatus.sms_code_verified;
    const smsVerificationId = paymentStatus.sms_verification_id || null;

    // Si el método en paymentStatus es "code", en Supabase debe seguir siendo "cash"
    const rawMethod = paymentStatus.method || 'cash';
    const paymentMethodForSupabase = rawMethod === 'code' ? 'cash' : rawMethod;

    console.log(`\n💳 [savePaymentToSupabase] Guardando pago para ride: ${pgRideId} (status: ${paymentStatusValue})`);

    console.log(`   📊 Datos a guardar:`, {
      ride_id: pgRideId,
      amount: amount,
      tip: tip,
      commission: commission,
      payment_method: paymentMethodForSupabase,
      status: paymentStatusValue,
      cancel_reason: paymentStatus.cancelReason || null,
      biometric_authenticated: biometricAuthenticated,
      biometric_type: biometricType,
      authentication_method: authenticationMethod,
      sms_code_verified: smsCodeVerified,
      sms_verification_id: smsVerificationId,
    });

    const existingPaymentResult = await client.query(
      `SELECT id FROM public.payments WHERE ride_id = $1 LIMIT 1`,
      [pgRideId]
    );

    if (existingPaymentResult.rows && existingPaymentResult.rows.length > 0) {
      const paymentId = existingPaymentResult.rows[0].id;
      console.log(`   ℹ️ Pago existente encontrado (${paymentId}), aplicando UPDATE`);

      await client.query(
        `UPDATE public.payments
         SET amount = $1,
             tip = $2,
             commission = $3,
             payment_method = $4,
             payment_provider = $5,
             status = $6,
             cancel_reason = $7,
             biometric_authenticated = $8,
             biometric_type = $9,
             authentication_method = $10,
             sms_code_verified = $11,
             sms_verification_id = $12,
             paid_at = $13,
             updated_at = NOW()
         WHERE id = $14`,
        [
          amount,
          tip,
          commission,
          paymentMethodForSupabase,
          'cash',
          paymentStatusValue,
          paymentStatus.cancelReason || null,
          biometricAuthenticated,
          biometricType,
          authenticationMethod,
          smsCodeVerified,
          smsVerificationId,
          paymentStatusValue === 'completed' ? new Date() : null,
          paymentId,
        ]
      );

      console.log(`✅ [savePaymentToSupabase] Pago actualizado (status: ${paymentStatusValue})`);
    } else {
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
          biometric_authenticated,
          biometric_type,
          authentication_method,
          sms_code_verified,
          sms_verification_id,
          paid_at,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        )`,
        [
          pgRideId,
          amount,
          tip,
          commission,
          paymentMethodForSupabase,
          'cash',
          paymentStatusValue,
          paymentStatus.cancelReason || null,
          biometricAuthenticated,
          biometricType,
          authenticationMethod,
          smsCodeVerified,
          smsVerificationId,
          paymentStatusValue === 'completed' ? new Date() : null,
          new Date(),
          new Date(),
        ]
      );

      console.log(`✅ [savePaymentToSupabase] Pago guardado (status: ${paymentStatusValue})`);
    }

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
  const normalizedCanceledBy = normalizeCanceledBy(ride.canceledBy);

  const normalizedCancelReason = normalizedCanceledBy
    ? ride.cancelReason || null
    : null;
  const estimatedDistance = pickNumber(ride.estimatedDistance);
  const estimatedDuration = pickNumber(ride.estimatedDuration);
  const estimatedPrice = pickNumber(ride.estimatedPrice, ride.finalFare, ride.clientSuggestedPrice);
  const finalFare = pickNumber(ride.finalFare, ride.estimatedPrice);

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
      cancel_reason: normalizedCancelReason,
      canceled_by: normalizedCanceledBy,
    });

    // ✅ Verificar existencia previa
    console.log(`   🔍 Verificando existencia previa...`);
    const existingRideResult = await client.query(
      `SELECT id FROM public.rides WHERE firebase_ride_id = $1 LIMIT 1`,
      [firebaseRideId]
    );

    let pgRideId: string | null = null;

    if (existingRideResult.rows && existingRideResult.rows.length > 0) {
      pgRideId = existingRideResult.rows[0].id;
      console.log(`   ℹ️ Registro existente encontrado (id: ${pgRideId}), aplicando UPDATE`);

      await client.query(
        `UPDATE public.rides
         SET driver_id = $1,
             estimated_distance = $2,
             estimated_duration = $3,
             estimated_price = $4,
             final_fare = $5,
             passengers = $6,
             ride_type = $7,
             vehicle_type = $8,
             payment_type = $9,
             status = 'canceled',
             cancel_reason = $10,
             canceled_by = $11,
             requested_at = $12,
             accepted_at = $13,
             canceled_at = $14,
             waypoints_count = $15,
             has_multiple_stops = $16,
             updated_at = NOW()
         WHERE id = $17`,
        [
          ride.driverId || null,
          estimatedDistance,
          estimatedDuration,
          estimatedPrice,
          finalFare,
          ride.passengers || 1,
          ride.rideType || 'normal',
          ride.vehicleType || 'auto',
          ride.paymentMethod || 'cash',
          'canceled',
          normalizedCancelReason,
          normalizedCanceledBy,
          ride.requestedAt ? new Date(ride.requestedAt) : null,
          ride.acceptedAt ? new Date(ride.acceptedAt) : null,
          ride.canceledAt ? new Date(ride.canceledAt) : new Date(),
          ride.extraDestinations?.length || 0,
          (ride.extraDestinations?.length || 0) > 0,
          pgRideId,
        ]
      );

      console.log(`   ✅ Registro cancelado actualizado`);
    } else {
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
          firebaseRideId,
          ride.clientId,
          ride.driverId || null,
          estimatedDistance,
          estimatedDuration,
          estimatedPrice,
          finalFare,
          ride.passengers || 1,
          ride.rideType || 'normal',
          ride.vehicleType || 'auto',
          ride.paymentMethod || 'cash',
          'canceled',
          normalizedCancelReason,
          normalizedCanceledBy,
          ride.requestedAt ? new Date(ride.requestedAt) : null,
          ride.acceptedAt ? new Date(ride.acceptedAt) : null,
          ride.canceledAt ? new Date(ride.canceledAt) : new Date(),
          ride.extraDestinations?.length || 0,
          (ride.extraDestinations?.length || 0) > 0,
          new Date(),
          new Date(),
        ]
      );
      
      console.log(`   ✅ INSERT ejecutado exitosamente`);
      console.log(`   📊 Resultado:`, result);

      if (!result.rows || result.rows.length === 0) {
        console.error(`❌ [saveCanceledRideToSupabase] INSERT no retornó filas`);
        console.error(`   Resultado:`, result);
        return null;
      }

      pgRideId = result.rows[0].id;
      console.log(`✅ [saveCanceledRideToSupabase] Viaje cancelado guardado: ${pgRideId}`);
    }

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

    // Limpiar ubicaciones anteriores para evitar duplicados
    await client.query(`DELETE FROM public.ride_locations WHERE ride_id = $1`, [pgRideId]);

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
 * Calcular comisión (15% para viajes normales)
 */
function calculateCommission(amount: number): number {
  return Math.round(amount * 0.15 * 100) / 100; // 15%
}
