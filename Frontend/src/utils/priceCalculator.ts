/**
 * Calculadora de precios para viajes - Frontend
 * DriveAngel.ni
 * 
 * Replica la lógica del backend para mostrar precios en tiempo real
 */

export type VehicleType = 'car' | 'motorcycle';
export type RideType = 'normal' | 'designated_driver';

export interface PriceBreakdown {
  distancePrice: number;
  timePrice: number;
  basePrice: number;
  distanceKm: number;
  durationMinutes: number;
  multiplier: number;
  finalPrice: number;
  isPeakHour: boolean;
  peakHourAdjustment: number;
  vehicleType: VehicleType;
  rideType: RideType;
  commissionRate: number;
  commission: number;
  extraStopsCharge: number;
}

/**
 * Obtener multiplicador según distancia y tipo de vehículo/viaje
 */
function getMultiplier(distanceKm: number, vehicleType: VehicleType, rideType: RideType): number {
  if (rideType === 'designated_driver') {
    // CONDUCTOR DESIGNADO
    if (distanceKm >= 0.2 && distanceKm <= 0.4) return 13;
    if (distanceKm >= 0.401 && distanceKm <= 1) return 18;
    if (distanceKm >= 1.01 && distanceKm <= 2) return 24;
    if (distanceKm >= 2.01 && distanceKm <= 4) return 30;
    if (distanceKm >= 4.01) return 35;
    return 13;
  } else if (vehicleType === 'motorcycle') {
    // MOTO
    if (distanceKm >= 0.2 && distanceKm <= 0.4) return 8;
    if (distanceKm >= 0.401 && distanceKm <= 1) return 12;
    if (distanceKm >= 1.01 && distanceKm <= 2) return 18;
    if (distanceKm >= 2.01 && distanceKm <= 4) return 22;
    if (distanceKm >= 4.01) return 26;
    return 8;
  } else {
    // AUTO NORMAL
    if (distanceKm >= 0.2 && distanceKm <= 0.4) return 10;
    if (distanceKm >= 0.401 && distanceKm <= 1) return 15;
    if (distanceKm >= 1.01 && distanceKm <= 2) return 20;
    if (distanceKm >= 2.01 && distanceKm <= 4) return 25;
    if (distanceKm >= 4.01) return 30;
    return 10;
  }
}

/**
 * Obtener tasa de comisión según tipo de vehículo y viaje
 */
export function getCommissionRate(vehicleType: VehicleType, rideType: RideType): number {
  if (rideType === 'designated_driver') {
    return 0.25; // 25%
  } else if (vehicleType === 'motorcycle') {
    return 0.075; // 7.5%
  } else {
    return 0.11; // 11%
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
 */
export function calculateRidePrice(
  distanceInMeters: number,
  durationInSeconds: number,
  vehicleType: VehicleType = 'car',
  rideType: RideType = 'normal',
  originLat?: number,
  originLng?: number,
  extraStops: number = 0
): PriceBreakdown {
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
  const multiplier = getMultiplier(distanceKm, vehicleType, rideType);
  
  // Calcular precio por distancia
  const distancePrice = distanceKm * multiplier;
  
  // Calcular precio por tiempo
  const timePrice = calculateTimePrice(durationMinutes);
  
  // Recargo por paradas extras
  const STOP_FEE = 20;
  const extraStopsCharge = extraStops * STOP_FEE;
  
  // Precio base (distancia + tiempo + paradas)
  const basePrice = distancePrice + timePrice + extraStopsCharge;
  
  // Precio mínimo de C$50
  const MINIMUM_FARE = 50;
  const finalPrice = Math.max(Math.round(basePrice), MINIMUM_FARE);
  
  // Calcular comisión
  const commissionRate = getCommissionRate(vehicleType, rideType);
  const commission = Math.round(finalPrice * commissionRate);
  
  return {
    distancePrice: Math.round(distancePrice),
    timePrice,
    basePrice: Math.round(basePrice),
    distanceKm: parseFloat(distanceKm.toFixed(2)),
    durationMinutes,
    multiplier,
    finalPrice,
    isPeakHour: isPeak && inManagua,
    peakHourAdjustment,
    vehicleType,
    rideType,
    commissionRate,
    commission,
    extraStopsCharge,
  };
}

/**
 * Formatear desglose de precio para mostrar al usuario
 */
export function formatPriceBreakdown(breakdown: PriceBreakdown): string {
  let text = `📏 Distancia: ${breakdown.distanceKm} km × C$${breakdown.multiplier} = C$${breakdown.distancePrice}\n`;
  text += `⏱️ Tiempo: ${breakdown.durationMinutes} min (${Math.ceil(breakdown.durationMinutes / 5)} bloques × C$3) = C$${breakdown.timePrice}\n`;
  
  if (breakdown.extraStopsCharge > 0) {
    text += `🛑 Paradas extras: C$${breakdown.extraStopsCharge}\n`;
  }
  
  if (breakdown.peakHourAdjustment > 0) {
    text += `⚠️ Hora pico en Managua: +${breakdown.peakHourAdjustment} min\n`;
  }
  
  text += `\n💰 Total: C$${breakdown.finalPrice}`;
  
  return text;
}

/**
 * Obtener nombre legible del tipo de vehículo
 */
export function getVehicleTypeName(vehicleType: VehicleType, rideType: RideType): string {
  if (rideType === 'designated_driver') {
    return 'Conductor Designado';
  } else if (vehicleType === 'motorcycle') {
    return 'Moto';
  } else {
    return 'Auto';
  }
}
