/**
 * Calculadora de precios para viajes
 * DriveAngel.ni
 * 
 * COMISIONES:
 * - Moto: 7.5%
 * - Auto Normal: 11%
 * - Conductor Designado: 25%
 * 
 * FÓRMULA FINAL:
 * Precio = (Distancia × Multiplicador según tipo) + (Tiempo en bloques de 5min × C$3)
 * 
 * HORA PICO EN MANAGUA (6am-8am y 5pm-8pm):
 * Se agregan 15 minutos adicionales al tiempo calculado
 * 
 * Fórmula de precios por tramos de distancia para AUTO NORMAL:
 * - 0.2 km a 0.4 km   → multiplicar por 10 C$
 * - 0.401 km a 1 km   → multiplicar por 15 C$
 * - 1.01 km a 2 km    → multiplicar por 20 C$
 * - 2.01 km a 4 km    → multiplicar por 25 C$
 * - Mayor a 4.01 km   → multiplicar por 30 C$
 * 
 * Fórmula de precios por tramos de distancia para MOTO:
 * - 0.2 km a 0.4 km   → multiplicar por 8 C$
 * - 0.401 km a 1 km   → multiplicar por 12 C$
 * - 1.01 km a 2 km    → multiplicar por 18 C$
 * - 2.01 km a 4 km    → multiplicar por 22 C$
 * - Mayor a 4.01 km   → multiplicar por 26 C$
 * 
 * Fórmula de precios por tramos de distancia para CONDUCTOR DESIGNADO:
 * - 0.2 km a 0.4 km   → multiplicar por 13 C$
 * - 0.401 km a 1 km   → multiplicar por 18 C$
 * - 1.01 km a 2 km    → multiplicar por 24 C$
 * - 2.01 km a 4 km    → multiplicar por 30 C$
 * - Mayor a 4.01 km   → multiplicar por 35 C$
 */

export type VehicleType = 'car' | 'motorcycle';
export type RideType = 'normal' | 'designated_driver';

export interface PriceCalculationResult {
  distancePrice: number;
  timePrice: number;
  basePrice: number;
  distanceKm: number;
  durationMinutes: number;
  multiplier: number;
  finalPrice: number;
  breakdown: string;
  isPeakHour: boolean;
  peakHourAdjustment: number;
  vehicleType: VehicleType;
  rideType: RideType;
  commissionRate: number;
  commission: number;
}

/**
 * Obtener multiplicador según distancia y tipo de vehículo/viaje
 */
function getMultiplier(distanceKm: number, vehicleType: VehicleType, rideType: RideType): { multiplier: number; tramo: string } {
  let multiplier: number;
  let tramo: string;
  
  // Determinar multiplicadores según tipo
  if (rideType === 'designated_driver') {
    // CONDUCTOR DESIGNADO
    if (distanceKm >= 0.2 && distanceKm <= 0.4) {
      multiplier = 13;
      tramo = '0.2-0.4 km';
    } else if (distanceKm >= 0.401 && distanceKm <= 1) {
      multiplier = 18;
      tramo = '0.401-1 km';
    } else if (distanceKm >= 1.01 && distanceKm <= 2) {
      multiplier = 24;
      tramo = '1.01-2 km';
    } else if (distanceKm >= 2.01 && distanceKm <= 4) {
      multiplier = 30;
      tramo = '2.01-4 km';
    } else if (distanceKm >= 4.01) {
      multiplier = 35;
      tramo = 'Mayor a 4.01 km';
    } else {
      multiplier = 13;
      tramo = 'Menor a 0.2 km (mínimo)';
    }
  } else if (vehicleType === 'motorcycle') {
    // MOTO
    if (distanceKm >= 0.2 && distanceKm <= 0.4) {
      multiplier = 8;
      tramo = '0.2-0.4 km';
    } else if (distanceKm >= 0.401 && distanceKm <= 1) {
      multiplier = 12;
      tramo = '0.401-1 km';
    } else if (distanceKm >= 1.01 && distanceKm <= 2) {
      multiplier = 18;
      tramo = '1.01-2 km';
    } else if (distanceKm >= 2.01 && distanceKm <= 4) {
      multiplier = 22;
      tramo = '2.01-4 km';
    } else if (distanceKm >= 4.01) {
      multiplier = 26;
      tramo = 'Mayor a 4.01 km';
    } else {
      multiplier = 8;
      tramo = 'Menor a 0.2 km (mínimo)';
    }
  } else {
    // AUTO NORMAL
    if (distanceKm >= 0.2 && distanceKm <= 0.4) {
      multiplier = 10;
      tramo = '0.2-0.4 km';
    } else if (distanceKm >= 0.401 && distanceKm <= 1) {
      multiplier = 15;
      tramo = '0.401-1 km';
    } else if (distanceKm >= 1.01 && distanceKm <= 2) {
      multiplier = 20;
      tramo = '1.01-2 km';
    } else if (distanceKm >= 2.01 && distanceKm <= 4) {
      multiplier = 25;
      tramo = '2.01-4 km';
    } else if (distanceKm >= 4.01) {
      multiplier = 30;
      tramo = 'Mayor a 4.01 km';
    } else {
      multiplier = 10;
      tramo = 'Menor a 0.2 km (mínimo)';
    }
  }
  
  return { multiplier, tramo };
}

/**
 * Obtener tasa de comisión según tipo de vehículo y viaje
 * DEPRECATED: Usar getCommissionFromDatabase() en su lugar
 * Esta función se mantiene solo para compatibilidad con código legacy
 */
export function getCommissionRate(vehicleType: VehicleType, rideType: RideType): number {
  // Valores por defecto (fallback si falla la BD)
  if (rideType === 'designated_driver') {
    return 0.15; // 15%
  } else if (vehicleType === 'motorcycle') {
    return 0.08; // 8%
  } else {
    return 0.10; // 10%
  }
}

/**
 * Obtener tasa de comisión desde la base de datos
 * Usa la tabla services para obtener la comisión correcta
 */
export async function getCommissionFromDatabase(
  driverId: string,
  serviceCode: string
): Promise<number> {
  const pool = (await import('../config/database')).default;
  const client = await pool.connect();
  
  try {
    // Usar la función helper de PostgreSQL
    const result = await client.query(
      'SELECT get_driver_commission_rate($1, $2) as commission_rate',
      [driverId, serviceCode]
    );
    
    const commissionRate = parseFloat(result.rows[0].commission_rate);
    
    console.log(`💰 Comisión desde BD: ${commissionRate * 100}% (Driver: ${driverId}, Service: ${serviceCode})`);
    
    return commissionRate;
  } catch (error) {
    console.error('❌ Error obteniendo comisión desde BD:', error);
    // Fallback a valores por defecto
    return serviceCode === 'designated_driver' ? 0.15 : 0.10;
  } finally {
    client.release();
  }
}

/**
 * Mapear tipo de viaje legacy a service code
 */
export function mapRideTypeToServiceCode(vehicleType: VehicleType, rideType: RideType): string {
  if (rideType === 'designated_driver') {
    return 'designated_driver';
  } else if (vehicleType === 'motorcycle') {
    return 'motorcycle';
  } else {
    return 'normal';
  }
}

/**
 * Verificar si es hora pico en Managua
 * Hora pico: 6am-8am y 5pm-8pm
 */
export function isPeakHour(date: Date = new Date()): boolean {
  const hour = date.getHours();
  return (hour >= 6 && hour < 8) || (hour >= 17 && hour < 20);
}

/**
 * Detectar si una ubicación está en Managua
 * Basado en coordenadas aproximadas de Managua
 */
export function isInManagua(lat: number, lng: number): boolean {
  // Límites aproximados de Managua
  const MANAGUA_BOUNDS = {
    north: 12.20,
    south: 12.05,
    east: -86.15,
    west: -86.35
  };
  
  return lat >= MANAGUA_BOUNDS.south && 
         lat <= MANAGUA_BOUNDS.north && 
         lng >= MANAGUA_BOUNDS.west && 
         lng <= MANAGUA_BOUNDS.east;
}

/**
 * Calcular precio por tiempo
 * C$3 por cada 5 minutos
 */
function calculateTimePrice(durationMinutes: number): number {
  const PRICE_PER_5_MIN = 3;
  const blocks = Math.ceil(durationMinutes / 5);
  return blocks * PRICE_PER_5_MIN;
}

/**
 * Calcula el precio del viaje según distancia, tiempo y tipo
 * @param distanceInMeters - Distancia en metros
 * @param durationInSeconds - Duración estimada en segundos
 * @param vehicleType - Tipo de vehículo ('car' | 'motorcycle')
 * @param rideType - Tipo de viaje ('normal' | 'designated_driver')
 * @param originLat - Latitud del origen
 * @param originLng - Longitud del origen
 * @returns Resultado del cálculo con desglose completo
 */
export function calculateRidePrice(
  distanceInMeters: number,
  durationInSeconds: number,
  vehicleType: VehicleType = 'car',
  rideType: RideType = 'normal',
  originLat?: number,
  originLng?: number
): PriceCalculationResult {
  // Convertir metros a kilómetros
  const distanceKm = distanceInMeters / 1000;
  
  // Convertir segundos a minutos
  let durationMinutes = Math.ceil(durationInSeconds / 60);
  
  // Verificar hora pico en Managua
  const isPeak = isPeakHour();
  const inManagua = originLat && originLng ? isInManagua(originLat, originLng) : false;
  const peakHourAdjustment = (isPeak && inManagua) ? 15 : 0;
  
  // Ajustar tiempo si es hora pico en Managua
  if (peakHourAdjustment > 0) {
    durationMinutes += peakHourAdjustment;
  }
  
  // Obtener multiplicador según tipo
  const { multiplier } = getMultiplier(distanceKm, vehicleType, rideType);
  
  // Calcular precio por distancia
  const distancePrice = distanceKm * multiplier;
  
  // Calcular precio por tiempo
  const timePrice = calculateTimePrice(durationMinutes);
  
  // Precio base (distancia + tiempo)
  const basePrice = distancePrice + timePrice;
  
  // Precio mínimo de C$50
  const MINIMUM_FARE = 50;
  const finalPrice = Math.max(Math.round(basePrice), MINIMUM_FARE);
  
  // Calcular comisión
  const commissionRate = getCommissionRate(vehicleType, rideType);
  const commission = Math.round(finalPrice * commissionRate);
  
  // Crear desglose legible
  let breakdown = `Distancia: ${distanceKm.toFixed(2)} km × C$${multiplier} = C$${distancePrice.toFixed(2)}\n`;
  breakdown += `Tiempo: ${durationMinutes} min (${Math.ceil(durationMinutes / 5)} bloques × C$3) = C$${timePrice}\n`;
  
  if (peakHourAdjustment > 0) {
    breakdown += `⚠️ Hora pico en Managua: +${peakHourAdjustment} min\n`;
  }
  
  breakdown += `Subtotal: C$${basePrice.toFixed(2)}\n`;
  breakdown += `Precio final: C$${finalPrice}\n`;
  breakdown += `Comisión (${(commissionRate * 100).toFixed(1)}%): C$${commission}`;
  
  return {
    distancePrice: Math.round(distancePrice),
    timePrice,
    basePrice: Math.round(basePrice),
    distanceKm: parseFloat(distanceKm.toFixed(2)),
    durationMinutes,
    multiplier,
    finalPrice,
    breakdown,
    isPeakHour: isPeak && inManagua,
    peakHourAdjustment,
    vehicleType,
    rideType,
    commissionRate,
    commission,
  };
}

/**
 * Calcula el precio con múltiples destinos (paradas adicionales)
 * @param distanceInMeters - Distancia total en metros (incluyendo todas las paradas)
 * @param durationInSeconds - Duración estimada en segundos
 * @param extraStops - Número de paradas adicionales (0 si es directo)
 * @param vehicleType - Tipo de vehículo
 * @param rideType - Tipo de viaje
 * @param originLat - Latitud del origen
 * @param originLng - Longitud del origen
 * @returns Resultado del cálculo con recargo por paradas
 */
export function calculateRidePriceWithStops(
  distanceInMeters: number,
  durationInSeconds: number,
  extraStops: number = 0,
  vehicleType: VehicleType = 'car',
  rideType: RideType = 'normal',
  originLat?: number,
  originLng?: number
): PriceCalculationResult {
  // Calcular precio base
  const baseCalculation = calculateRidePrice(
    distanceInMeters,
    durationInSeconds,
    vehicleType,
    rideType,
    originLat,
    originLng
  );
  
  // Recargo por paradas adicionales: C$20 por cada parada extra
  const STOP_FEE = 20;
  const stopCharge = extraStops * STOP_FEE;
  
  let finalPrice = baseCalculation.finalPrice + stopCharge;
  const commission = Math.round(finalPrice * baseCalculation.commissionRate);
  
  let breakdown = baseCalculation.breakdown;
  if (extraStops > 0) {
    breakdown += `\nParadas extras: ${extraStops} × C$${STOP_FEE} = C$${stopCharge}`;
    breakdown += `\nPrecio final con paradas: C$${finalPrice}`;
    breakdown += `\nComisión actualizada: C$${commission}`;
  }
  
  return {
    ...baseCalculation,
    finalPrice,
    breakdown,
    commission,
  };
}

/**
 * Validar que el precio propuesto esté dentro de un rango razonable
 * @param proposedPrice - Precio propuesto por cliente o conductor
 * @param calculatedPrice - Precio calculado por el sistema
 * @param tolerance - Tolerancia en porcentaje (por defecto 50%)
 * @returns true si el precio está dentro del rango aceptable
 */
export function validateProposedPrice(
  proposedPrice: number,
  calculatedPrice: number,
  tolerance: number = 0.5
): { valid: boolean; message: string } {
  const MINIMUM_FARE = 50;
  
  if (proposedPrice < MINIMUM_FARE) {
    return {
      valid: false,
      message: `El precio mínimo es C$${MINIMUM_FARE}`,
    };
  }
  
  const minAcceptable = calculatedPrice * (1 - tolerance);
  const maxAcceptable = calculatedPrice * (1 + tolerance);
  
  if (proposedPrice < minAcceptable) {
    return {
      valid: false,
      message: `El precio es muy bajo. Mínimo sugerido: C$${Math.round(minAcceptable)}`,
    };
  }
  
  if (proposedPrice > maxAcceptable) {
    return {
      valid: false,
      message: `El precio es muy alto. Máximo sugerido: C$${Math.round(maxAcceptable)}`,
    };
  }
  
  return {
    valid: true,
    message: 'Precio válido',
  };
}

/**
 * Obtener información de la tarifa para mostrar al usuario
 */
export function getPricingInfo() {
  return {
    ranges: [
      { min: 0.2, max: 0.4, rate: 10, label: '0.2 - 0.4 km' },
      { min: 0.401, max: 1, rate: 15, label: '0.401 - 1 km' },
      { min: 1.01, max: 2, rate: 20, label: '1.01 - 2 km' },
      { min: 2.01, max: 4, rate: 25, label: '2.01 - 4 km' },
      { min: 4.01, max: 999999, rate: 30, label: 'Mayor a 4.01 km' }, // Usar número grande en vez de Infinity
    ],
    minimumFare: 50,
    stopFee: 20,
    currency: 'C$',
  };
}
