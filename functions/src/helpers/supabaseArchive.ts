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

import { supabaseGet, supabasePost, supabaseUpdate, supabaseDelete, supabaseRpc } from "../supabase/rest";
import { getFallbackCommissionRate, serviceCodeFromRideFields } from "./priceCalculator";

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
  const rideStatusRaw = ride.status || "completed";
  const rideStatus = rideStatusRaw === "rating_completed" ? "completed" : rideStatusRaw;
  const normalizedCanceledBy = normalizeCanceledBy(ride.canceledBy);

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

    if (!ride.clientId || !ride.driverId) {
      console.error(`❌ [saveCompletedRideToSupabase] Faltan clientId o driverId`);
      return null;
    }

    const rideData: Record<string, any> = {
      firebase_ride_id: firebaseRideId,
      client_id: ride.clientId,
      driver_id: ride.driverId,
      follower_driver_id: ride.followerId || null,
      follower_status: ride.follower?.status || null,
      follower_joined_at: ride.follower?.joinedAt ? new Date(ride.follower.joinedAt) : null,
      follower_left_at: ride.follower?.leftAt ? new Date(ride.follower.leftAt) : null,
      follower_last_latitude: ride.follower?.location?.latitude ?? null,
      follower_last_longitude: ride.follower?.location?.longitude ?? null,
      arrival_vehicle_photo: ride.designatedDriverVehiclePhoto || null,
      estimated_distance: estimatedDistance,
      estimated_duration: estimatedDuration,
      actual_distance: actualDistance,
      actual_duration: actualDuration,
      estimated_price: estimatedPrice,
      final_fare: finalFare,
      client_suggested_price: clientSuggestedPrice,
      driver_offered_price: driverOfferedPrice,
      passengers: ride.passengers || 1,
      notes: ride.notes || null,
      ride_type: ride.rideType || "normal",
      vehicle_type: ride.vehicleType || "auto",
      client_vehicle_photo: clientVehiclePhoto,
      payment_type: ride.paymentMethod || "cash",
      service_id: serviceId,
      biometric_acceptance_required: biometricRequired,
      biometric_acceptance_type: biometricType,
      biometric_acceptance_verified: biometricVerified,
      biometric_acceptance_at: biometricAt,
      status: rideStatus,
      cancel_reason: normalizedCanceledBy ? ride.cancelReason || null : null,
      canceled_by: normalizedCanceledBy,
      requested_at: ride.requestedAt ? new Date(ride.requestedAt) : null,
      accepted_at: ride.acceptedAt ? new Date(ride.acceptedAt) : null,
      started_at: ride.startedAt ? new Date(ride.startedAt) : null,
      completed_at: ride.completedAt
        ? new Date(ride.completedAt)
        : rideStatus === "completed"
        ? new Date()
        : null,
      canceled_at: ride.canceledAt
        ? new Date(ride.canceledAt)
        : rideStatus === "canceled"
        ? new Date()
        : null,
      waypoints_count: ride.extraDestinations?.length || 0,
      has_multiple_stops: (ride.extraDestinations?.length || 0) > 0,
    };

    console.log(`   🔍 Verificando existencia previa vía REST...`);
    const existingRides = await supabaseGet(
      "rides",
      { firebase_ride_id: firebaseRideId },
      "id",
      { requireServiceRole: true, limit: 1 }
    );

    let pgRideId: string | null = null;

    if (existingRides && existingRides.length > 0) {
      pgRideId = existingRides[0].id;
      console.log(`   ℹ️ Registro existente encontrado (id: ${pgRideId}), aplicando UPDATE`);

      await supabaseUpdate("rides", pgRideId!, rideData);
      console.log(`   ✅ Registro actualizado`);
      return pgRideId;
    } else {
      console.log(`   ⏱️ Timestamp: ${new Date().toISOString()}`);
      rideData.created_at = new Date();
      rideData.updated_at = new Date();

      const result = await supabasePost("rides", rideData);

      if (!result || result.length === 0) {
        console.error(`❌ [saveCompletedRideToSupabase] INSERT no retornó filas`);
        return null;
      }

      pgRideId = result[0].id;
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
    console.error(`\n   Stack:`, error.stack);
    console.error(`${"=".repeat(60)}\n`);
    return null;
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
  try {
    const paymentStatusValue = paymentStatus.status || 'completed';
    const amount = pickNumber(paymentStatus.finalAmount, paymentStatus.amount, paymentStatus.total, paymentStatus.calculatedAmount, paymentStatus.estimatedPrice) || 0;
    const tip = pickNumber(paymentStatus.tip) || 0;

    const { rate: commissionRate } = await getEffectiveCommission(pgRideId);
    const commission = Math.round(amount * commissionRate * 100) / 100;

    const biometricAuthenticated = !!paymentStatus.biometric_authenticated;
    const biometricType = paymentStatus.biometric_type || null;
    const authenticationMethod = paymentStatus.authentication_method || (biometricAuthenticated ? 'biometric' : 'manual');
    const smsCodeVerified = !!paymentStatus.sms_code_verified;
    const smsVerificationId = paymentStatus.sms_verification_id || null;

    const rawMethod = paymentStatus.method || 'cash';
    const paymentMethodForSupabase = rawMethod === 'code' ? 'cash' : rawMethod;

    console.log(`\n💳 [savePaymentToSupabase] Guardando pago para ride: ${pgRideId} (status: ${paymentStatusValue})`);

    const paymentData: Record<string, any> = {
      amount,
      tip,
      commission,
      commission_rate_applied: commissionRate,
      payment_method: paymentMethodForSupabase,
      payment_provider: 'cash',
      status: paymentStatusValue,
      cancel_reason: paymentStatus.cancelReason || null,
      biometric_authenticated: biometricAuthenticated,
      biometric_type: biometricType,
      authentication_method: authenticationMethod,
      sms_code_verified: smsCodeVerified,
      sms_verification_id: smsVerificationId,
      paid_at: paymentStatusValue === 'completed' ? new Date() : null,
    };

    const existingPayments = await supabaseGet(
      "payments",
      { ride_id: pgRideId },
      "id",
      { requireServiceRole: true, limit: 1 }
    );

    if (existingPayments && existingPayments.length > 0) {
      const paymentId = existingPayments[0].id;
      console.log(`   ℹ️ Pago existente encontrado (${paymentId}), aplicando UPDATE`);
      await supabaseUpdate("payments", paymentId, paymentData);
      console.log(`✅ [savePaymentToSupabase] Pago actualizado (status: ${paymentStatusValue})`);
    } else {
      paymentData.ride_id = pgRideId;
      paymentData.created_at = new Date();
      paymentData.updated_at = new Date();
      await supabasePost("payments", paymentData);
      console.log(`✅ [savePaymentToSupabase] Pago guardado (status: ${paymentStatusValue})`);
    }

    return true;
  } catch (error: any) {
    console.error(`❌ [savePaymentToSupabase] Error:`, error.message);
    console.error(`   Stack:`, error.stack);
    return false;
  }
}

/**
 * GUARDAR VIAJE CANCELADO EN SUPABASE
 */
export async function saveCanceledRideToSupabase(
  ride: any,
  firebaseRideId: string
): Promise<string | null> {
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

    const rideData: Record<string, any> = {
      driver_id: ride.driverId || null,
      follower_driver_id: ride.followerId || null,
      follower_status: ride.follower?.status || null,
      follower_joined_at: ride.follower?.joinedAt ? new Date(ride.follower.joinedAt) : null,
      follower_left_at: ride.follower?.leftAt ? new Date(ride.follower.leftAt) : null,
      follower_last_latitude: ride.follower?.location?.latitude ?? null,
      follower_last_longitude: ride.follower?.location?.longitude ?? null,
      arrival_vehicle_photo: ride.designatedDriverVehiclePhoto || null,
      estimated_distance: estimatedDistance,
      estimated_duration: estimatedDuration,
      estimated_price: estimatedPrice,
      final_fare: finalFare,
      passengers: ride.passengers || 1,
      ride_type: ride.rideType || 'normal',
      vehicle_type: ride.vehicleType || 'auto',
      payment_type: ride.paymentMethod || 'cash',
      status: 'canceled',
      cancel_reason: normalizedCancelReason,
      canceled_by: normalizedCanceledBy,
      requested_at: ride.requestedAt ? new Date(ride.requestedAt) : null,
      accepted_at: ride.acceptedAt ? new Date(ride.acceptedAt) : null,
      canceled_at: ride.canceledAt ? new Date(ride.canceledAt) : new Date(),
      waypoints_count: ride.extraDestinations?.length || 0,
      has_multiple_stops: (ride.extraDestinations?.length || 0) > 0,
    };

    console.log(`   🔍 Verificando existencia previa vía REST...`);
    const existingRides = await supabaseGet(
      "rides",
      { firebase_ride_id: firebaseRideId },
      "id",
      { requireServiceRole: true, limit: 1 }
    );

    let pgRideId: string | null = null;

    if (existingRides && existingRides.length > 0) {
      pgRideId = existingRides[0].id;
      console.log(`   ℹ️ Registro existente encontrado (id: ${pgRideId}), aplicando UPDATE`);
      await supabaseUpdate("rides", pgRideId!, rideData);
      console.log(`   ✅ Registro cancelado actualizado`);
    } else {
      rideData.firebase_ride_id = firebaseRideId;
      rideData.client_id = ride.clientId;
      rideData.created_at = new Date();
      rideData.updated_at = new Date();

      const result = await supabasePost("rides", rideData);

      if (!result || result.length === 0) {
        console.error(`❌ [saveCanceledRideToSupabase] INSERT no retornó filas`);
        return null;
      }

      pgRideId = result[0].id;
      console.log(`✅ [saveCanceledRideToSupabase] Viaje cancelado guardado: ${pgRideId}`);
    }

    return pgRideId;
  } catch (error: any) {
    console.error(`❌ [saveCanceledRideToSupabase] Error al guardar viaje cancelado:`);
    console.error(`   Mensaje: ${error.message}`);
    console.error(`   Stack:`, error.stack);
    return null;
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
  try {
    console.log(`\n📍 [saveRideLocationsToSupabase] Guardando ubicaciones para ride: ${pgRideId}`);

    // Limpiar ubicaciones anteriores para evitar duplicados
    const existingLocations = await supabaseGet(
      "ride_locations",
      { ride_id: pgRideId },
      "id",
      { requireServiceRole: true, limit: 10000 }
    );
    if (existingLocations && existingLocations.length > 0) {
      for (const loc of existingLocations) {
        await supabaseDelete("ride_locations", loc.id);
      }
    }

    const locationIds: string[] = [];
    let locationOrder = 1;

    // 1. Guardar ORIGEN
    if (ride.origin) {
      const originResult = await supabasePost("ride_locations", {
        ride_id: pgRideId,
        location_type: 'origin',
        location_order: locationOrder,
        latitude: ride.origin.lat || ride.origin.latitude,
        longitude: ride.origin.lng || ride.origin.longitude,
        address: ride.origin.address || 'Origen',
        created_at: new Date(),
        updated_at: new Date(),
      });

      if (originResult && originResult[0]) {
        locationIds.push(originResult[0].id);
        console.log(`   ✅ Origen guardado: ${originResult[0].id}`);
        locationOrder++;
      }
    }

    // 2. Guardar PARADAS INTERMEDIAS (extraDestinations)
    if (ride.extraDestinations && ride.extraDestinations.length > 0) {
      for (const waypoint of ride.extraDestinations) {
        const waypointResult = await supabasePost("ride_locations", {
          ride_id: pgRideId,
          location_type: 'waypoint',
          location_order: locationOrder,
          latitude: waypoint.lat || waypoint.latitude,
          longitude: waypoint.lng || waypoint.longitude,
          address: waypoint.address || `Parada ${locationOrder - 1}`,
          created_at: new Date(),
          updated_at: new Date(),
        });

        if (waypointResult && waypointResult[0]) {
          locationIds.push(waypointResult[0].id);
          console.log(`   ✅ Parada ${locationOrder - 1} guardada: ${waypointResult[0].id}`);
          locationOrder++;
        }
      }
    }

    // 3. Guardar DESTINO
    if (ride.destination) {
      const destinationResult = await supabasePost("ride_locations", {
        ride_id: pgRideId,
        location_type: 'destination',
        location_order: locationOrder,
        latitude: ride.destination.lat || ride.destination.latitude,
        longitude: ride.destination.lng || ride.destination.longitude,
        address: ride.destination.address || 'Destino',
        created_at: new Date(),
        updated_at: new Date(),
      });

      if (destinationResult && destinationResult[0]) {
        locationIds.push(destinationResult[0].id);
        console.log(`   ✅ Destino guardado: ${destinationResult[0].id}`);
      }
    }

    console.log(`✅ [saveRideLocationsToSupabase] ${locationIds.length} ubicaciones guardadas`);
    return locationIds.length > 0 ? locationIds : null;
  } catch (error: any) {
    console.error(`❌ [saveRideLocationsToSupabase] Error:`, error.message);
    console.error(`   Stack:`, error.stack);
    return null;
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
  try {
    if (!locationIds || locationIds.length === 0) {
      console.warn(`⚠️ [updateRideLocationIds] No hay ubicaciones para actualizar`);
      return false;
    }

    console.log(`\n🔗 [updateRideLocationIds] Actualizando IDs de ubicaciones para ride: ${pgRideId}`);

    const locations = await supabaseGet(
      "ride_locations",
      { ride_id: pgRideId },
      "id,location_type",
      { requireServiceRole: true, limit: 10000 }
    );

    if (!locations || locations.length === 0) {
      console.warn(`⚠️ [updateRideLocationIds] No se encontraron ubicaciones`);
      return false;
    }

    const originLocation = locations.find((loc: any) => loc.location_type === 'origin');
    const destinationLocation = locations.find((loc: any) => loc.location_type === 'destination');

    if (!originLocation || !destinationLocation) {
      console.warn(`⚠️ [updateRideLocationIds] Falta origen o destino`);
      return false;
    }

    await supabaseUpdate("rides", pgRideId, {
      origin_location_id: originLocation.id,
      destination_location_id: destinationLocation.id,
    });

    console.log(`✅ [updateRideLocationIds] IDs actualizados:`);
    console.log(`   📍 Origen: ${originLocation.id}`);
    console.log(`   🎯 Destino: ${destinationLocation.id}`);

    return true;
  } catch (error: any) {
    console.error(`❌ [updateRideLocationIds] Error:`, error.message);
    console.error(`   Stack:`, error.stack);
    return false;
  }
}

/**
 * Obtener tasa de comisión efectiva desde Supabase
 * Consulta el service_id y driver_id del ride guardado,
 * luego llama a la función SQL get_driver_commission_rate.
 * Fallback: tasa por defecto del servicio (getFallbackCommissionRate).
 */
async function getEffectiveCommission(
  pgRideId: string,
  fallbackServiceCode?: string,
  fallbackDriverUid?: string
): Promise<{ commission: number; rate: number }> {
  let serviceCode = fallbackServiceCode;

  try {
    let driverUid = fallbackDriverUid;

    if (!serviceCode || !driverUid) {
      const rideRows = await supabaseGet(
        "rides",
        { id: pgRideId },
        "service_id,driver_id,ride_type,vehicle_type,designated_driver_vehicle",
        { requireServiceRole: true, limit: 1 }
      );

      if (rideRows && rideRows.length > 0) {
        driverUid = driverUid || rideRows[0].driver_id;

        if (!serviceCode && rideRows[0].service_id) {
          const serviceRows = await supabaseGet(
            "services",
            { id: rideRows[0].service_id },
            "code",
            { requireServiceRole: true, limit: 1 }
          );
          if (serviceRows && serviceRows.length > 0) {
            serviceCode = serviceRows[0].code;
          }
        }

        if (!serviceCode) {
          serviceCode = serviceCodeFromRideFields(
            rideRows[0].ride_type,
            rideRows[0].vehicle_type,
            rideRows[0].designated_driver_vehicle,
          );
        }
      }
    }

    if (serviceCode && driverUid) {
      const rateResult = await supabaseRpc("get_driver_commission_rate", {
        p_driver_uid: driverUid,
        p_service_code: serviceCode,
      });

      const rate = typeof rateResult === "number" ? rateResult : Number(rateResult);
      if (Number.isFinite(rate) && rate > 0) {
        return { rate, commission: 0 };
      }
    }

    const fallbackRate = getFallbackCommissionRate(serviceCode);
    console.warn(`⚠️ [getEffectiveCommission] No se pudo obtener tasa, usando fallback ${fallbackRate * 100}% (${serviceCode})`);
    return { rate: fallbackRate, commission: 0 };
  } catch (error: any) {
    console.error(`❌ [getEffectiveCommission] Error:`, error.message, "— usando fallback");
    return { rate: getFallbackCommissionRate(serviceCode), commission: 0 };
  }
}
