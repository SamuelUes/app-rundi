/**
 * Calculadora de precios para viajes
 * Rundi
 *
 * COMISIONES:
 * - Moto: 7%
 * - Auto Normal: 15%
 * - Conductor Designado: 25%
 *
 * ✅ FÓRMULA FINAL (SOLO DISTANCIA):
 * Precio = Distancia × Multiplicador según tipo
 *
 * ⚠️ NOTA: El precio se calcula SOLO por distancia, NO incluye costo por tiempo
 *
 * Fórmula de precios por tramos de distancia para AUTO NORMAL:
 * - 0.2 km a 0.4 km   → multiplicar por 10 C$
 * - 0.401 km a 1 km   → multiplicar por 15 C$
 * - 1.01 km a 2 km    → multiplicar por 20 C$
 * - 2.01 km a 4 km    → multiplicar por 25 C$
 * - Mayor a 4.01 km   → multiplicar por 30 C$
 *
 *  * Fórmula de precios por tramos de distancia para AUTO NORMAL NUEVO:
 * - 0.2 km a 0.4 km   → multiplicar por 10 C$
 * - 0.401 km a 1 km   → multiplicar por 15 C$
 * - 1.01 km a 2 km    → multiplicar por 20 C$
 * - 2.01 km a 8 km    → multiplicar por 25 C$
 * - Mayor a 8.01 km   → multiplicar por 27 C$
 *
 * Fórmula de precios por tramos de distancia para MOTO:
 * - 0.2 km a 0.4 km   → multiplicar por 8 C$
 * - 0.401 km a 1 km   → multiplicar por 12 C$
 * - 1.01 km a 2 km    → multiplicar por 18 C$
 * - 2.01 km a 4 km    → multiplicar por 22 C$
 * - Mayor a 4.01 km   → multiplicar por 26 C$
 *
 *  * Fórmula de precios por tramos de distancia para MOTO NUEVO:
 * - 0.2 km a 4 km   → multiplicar por 5 C$
 * - 4 km a 6 km    → multiplicar por 7 C$
 * - Mayor a 6.01 km   → multiplicar por 9 C$
 *
 * Fórmula de precios por tramos de distancia para CONDUCTOR DESIGNADO:
 * - 0.2 km a 0.4 km   → multiplicar por 13 C$
 * - 0.401 km a 1 km   → multiplicar por 18 C$
 * - 1.01 km a 2 km    → multiplicar por 24 C$
 * - 2.01 km a 4 km    → multiplicar por 30 C$
 * - Mayor a 4.01 km   → multiplicar por 35 C$
 */

import { firestore } from '../config/firebase';

export type VehicleType = 'car' | 'motorcycle';
export type RideType = 'normal' | 'designated_driver';

const STOP_FEE = 20;

interface ServicePricingConfig {
  id: string;
  code: string;
  basePrice: number;
  pricePerKm: number;
  pricePerMinute: number;
  minimumFare: number;
  commissionRate: number;
}

interface RidePriceOptions {
  originLat?: number;
  originLng?: number;
  driverId?: string;
  serviceCodeOverride?: string;
  extraStops?: number;
}

const serviceCache = new Map<string, ServicePricingConfig>();

async function fetchServiceConfig(serviceCode: string): Promise<ServicePricingConfig | null> {
  if (serviceCache.has(serviceCode)) {
    return serviceCache.get(serviceCode)!;
  }

  const pool = (await import('../config/database')).default;
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT id, code, commission_rate, base_price, price_per_km, price_per_minute, minimum_fare, is_active
       FROM public.services
       WHERE code = $1
       LIMIT 1`,
      [serviceCode]
    );

    if (!result.rows.length) {
      console.warn(`⚠️ Servicio ${serviceCode} no encontrado en Supabase.`);
      return null;
    }

    const row = result.rows[0];
    const isActive = row.is_active === null ? true : row.is_active === true || row.is_active === 't';

    if (!isActive) {
      console.warn(`⚠️ Servicio ${serviceCode} está inactivo en Supabase.`);
      return null;
    }

    const service: ServicePricingConfig = {
      id: row.id,
      code: row.code,
      basePrice: parseFloat(row.base_price ?? '0'),
      pricePerKm: parseFloat(row.price_per_km ?? '0'),
      pricePerMinute: parseFloat(row.price_per_minute ?? '0'),
      minimumFare: parseFloat(row.minimum_fare ?? '0'),
      commissionRate: parseFloat(row.commission_rate ?? '0'),
    };

    serviceCache.set(serviceCode, service);
    return service;
  } catch (error) {
    console.error(`❌ Error consultando servicio ${serviceCode}:`, error);
    return null;
  } finally {
    client.release();
  }
}

function buildBreakdownLine(label: string, value: number): string {
  return `${label}: C$${value.toFixed(2)}`;
}

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
  serviceCode: string;
  serviceId?: string;
  extraStopsCharge: number;
}

/**
 * Obtener multiplicador según distancia y tipo de vehículo/viaje
 */
function getMultiplier(distanceKm: number, vehicleType: VehicleType, rideType: RideType): { multiplier: number; tramo: string } {
  let multiplier: number;
  let tramo: string;

   if (rideType === 'designated_driver') {
    if (distanceKm >= 0.2 && distanceKm <= 0.4) {
      multiplier = 18;
      tramo = '0.2-0.4 km';
    } else if (distanceKm >= 0.401 && distanceKm <= 1) {
      multiplier = 23;
      tramo = '0.401-1 km';
    } else if (distanceKm >= 1.01 && distanceKm <= 2) {
      multiplier = 26.5;
      tramo = '1.01-2 km';
    } else if (distanceKm >= 2.01 && distanceKm <= 4) {
      multiplier = 28;
      tramo = '2.01-4 km';
    } else if (distanceKm >= 4.01) {
      multiplier = 20;
      tramo = 'Mayor a 4.01 km';
    } else {
      multiplier = 18;
      tramo = 'Menor a 0.2 km (mínimo)';
    }
  } else if (vehicleType === 'motorcycle') {
    if (distanceKm >= 0.1 && distanceKm <= 4) {
      multiplier = 4;
      tramo = '0.1-4 km';
    } else if (distanceKm >= 4.01 && distanceKm <= 6) {
      multiplier = 6;
      tramo = '4.01-6 km';
    } else if (distanceKm >= 6.01) {
      multiplier = 7;
      tramo = 'Mayor a 6.01 km';
    } else {
      multiplier = 2;
      tramo = 'Menor a 0.2 km (mínimo)';
    }
  } else {
    if (distanceKm >= 0.2 && distanceKm <= 0.4) {
      multiplier = 10;
      tramo = '0.2-0.4 km';
    } else if (distanceKm >= 0.401 && distanceKm <= 1) {
      multiplier = 12;
      tramo = '0.401-1 km';
    } else if (distanceKm >= 1.01 && distanceKm <= 2) {
      multiplier = 15;
      tramo = '1.01-2 km';
    } else if (distanceKm >= 2.01 && distanceKm <= 6) {
      multiplier = 18;
      tramo = '2.01-6 km';
    } else if (distanceKm >= 6.01 && distanceKm <= 8) {
      multiplier = 20;
      tramo = '6.01-8 km';
    } else if (distanceKm >= 8.01) {
      multiplier = 12;
      tramo = 'Mayor a 8.01 km';
    } else {
      multiplier = 8;
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
    return 0.25; // 25%
  } else if (vehicleType === 'motorcycle') {
    return 0.07; // 7%
  } else {
    return 0.15; // 15%
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
    return serviceCode === 'designated_driver' ? 0.25 : 0.11;
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

function getPeakHourMultiplier(subtotal: number, peak: boolean, inServiceArea: boolean): number {
  if (!peak || !inServiceArea) {
    return 1;
  }

  if (subtotal < 150) {
    return 0.4;
  }

  if (subtotal < 300) {
    return 0.25;
  }

  return 0.6;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

type ServiceAreaPoint = {
  lat: number;
  lng: number;
};

interface ServiceAreaDoc {
  id: string;
  name?: string;
  active?: boolean;
  centerLat?: number;
  centerLng?: number;
  radiusKm?: number;
  points?: ServiceAreaPoint[];
}

const DEFAULT_SERVICE_AREA: ServiceAreaDoc = {
  id: 'ni-managua-default',
  name: 'Managua',
  active: true,
  points: [
    { lat: 12.2, lng: -86.35 },
    { lat: 12.2, lng: -86.15 },
    { lat: 12.05, lng: -86.15 },
    { lat: 12.05, lng: -86.35 },
    { lat: 12.2, lng: -86.35 },
  ],
};

let cachedServiceAreas: ServiceAreaDoc[] | null = null;
let serviceAreasFetchedAt = 0;
const SERVICE_AREAS_CACHE_TTL_MS = 5 * 60 * 1000;

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizePolygon(points: unknown): ServiceAreaPoint[] | undefined {
  if (!Array.isArray(points)) {
    return undefined;
  }

  const normalized: ServiceAreaPoint[] = [];
  for (const rawPoint of points) {
    const lat = toFiniteNumber((rawPoint as any)?.lat);
    const lng = toFiniteNumber((rawPoint as any)?.lng);
    if (lat == null || lng == null) {
      continue;
    }
    normalized.push({ lat, lng });
  }

  if (normalized.length < 3) {
    return undefined;
  }

  return normalized;
}

function isValidCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasValidPolygon(points?: ServiceAreaPoint[]): points is ServiceAreaPoint[] {
  return Array.isArray(points) && points.length >= 3;
}

function isPointInPolygon(lat: number, lng: number, polygon: ServiceAreaPoint[]): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersects =
      yi > lat !== yj > lat &&
      lng <
        ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function isPointInServiceArea(lat: number, lng: number, area: ServiceAreaDoc): boolean {
  if (hasValidPolygon(area.points)) {
    return isPointInPolygon(lat, lng, area.points);
  }

  if (
    isValidCoordinate(area.centerLat) &&
    isValidCoordinate(area.centerLng) &&
    isValidCoordinate(area.radiusKm)
  ) {
    const R = 6371; // km
    const toRad = (value: number) => (value * Math.PI) / 180;
    const dLat = toRad(lat - area.centerLat);
    const dLon = toRad(lng - area.centerLng);
    const sinLat = Math.sin(dLat / 2);
    const sinLon = Math.sin(dLon / 2);
    const a =
      sinLat * sinLat +
      Math.cos(toRad(area.centerLat)) * Math.cos(toRad(lat)) * sinLon * sinLon;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = R * c;
    return distanceKm <= (area.radiusKm ?? 0);
  }

  return false;
}

async function loadServiceAreas(): Promise<ServiceAreaDoc[]> {
  const now = Date.now();
  if (cachedServiceAreas && now - serviceAreasFetchedAt < SERVICE_AREAS_CACHE_TTL_MS) {
    return cachedServiceAreas;
  }

  try {
    const snapshot = await firestore.collection('service_areas').where('active', '==', true).get();
    const areas: ServiceAreaDoc[] = snapshot.docs.map((doc) => {
      const data = doc.data() as Partial<ServiceAreaDoc>;
      return {
        id: doc.id,
        name: data.name,
        active: data.active,
        centerLat: data.centerLat,
        centerLng: data.centerLng,
        radiusKm: data.radiusKm,
        points: normalizePolygon((data as any)?.points),
      };
    });

    if (areas.length > 0) {
      cachedServiceAreas = areas;
      serviceAreasFetchedAt = now;
      return cachedServiceAreas;
    }
  } catch (error) {
    console.warn('⚠️ [priceCalculator] Error obteniendo service_areas desde Firestore:', error);
  }

  cachedServiceAreas = [DEFAULT_SERVICE_AREA];
  serviceAreasFetchedAt = now;
  return cachedServiceAreas;
}

export async function isInManagua(lat?: number, lng?: number): Promise<boolean> {
  if (!isValidCoordinate(lat) || !isValidCoordinate(lng)) {
    return false;
  }

  const serviceAreas = await loadServiceAreas();
  return serviceAreas.some((area) => isPointInServiceArea(lat, lng, area));
}

/**
 * Calcular precio por tiempo
 * C$3 por cada 5 minutos
 */
//function calculateTimePrice(durationMinutes: number): number {
//  const PRICE_PER_5_MIN = 3;
//  const blocks = Math.ceil(durationMinutes / 5);
//  return blocks * PRICE_PER_5_MIN;
//}

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
export async function calculateRidePrice(
  distanceInMeters: number,
  durationInSeconds: number,
  vehicleType: VehicleType = 'car',
  rideType: RideType = 'normal',
  originLat?: number,
  originLng?: number,
  options: RidePriceOptions = {}
): Promise<PriceCalculationResult> {
  const distanceKm = distanceInMeters / 1000;
  const durationMinutes = Math.ceil(durationInSeconds / 60);
  const serviceCode = options.serviceCodeOverride ?? mapRideTypeToServiceCode(vehicleType, rideType);
  const extraStops = Math.max(options.extraStops ?? 0, 0);

  let service = await fetchServiceConfig(serviceCode);

  if (!service) {
    console.warn(`⚠️ Usando fallback legacy para calcular precio de ${serviceCode}.`);
    const { multiplier } = getMultiplier(distanceKm, vehicleType, rideType);
    const legacyDistance = Math.max(distanceKm, 0) * multiplier;
    const legacySubtotal = Math.max(legacyDistance + STOP_FEE * extraStops + 50, 50);
    const commissionRateLegacy = getCommissionRate(vehicleType, rideType);
    const legacyCommission = roundCurrency(legacySubtotal * commissionRateLegacy);
    const finalLegacyPrice = roundCurrency(legacySubtotal + legacyCommission);

    return {
      distancePrice: roundCurrency(legacyDistance),
      timePrice: 0,
      basePrice: 50,
      distanceKm: parseFloat(distanceKm.toFixed(2)),
      durationMinutes,
      multiplier,
      finalPrice: finalLegacyPrice,
      breakdown:
        `⚠️ Fallback legacy activo. Distancia: ${distanceKm.toFixed(2)} km × C$${multiplier} = C$${legacyDistance.toFixed(2)}` +
        `\nSubtotal (sin comisión): C$${legacySubtotal.toFixed(2)}` +
        `\nComisión ${(commissionRateLegacy * 100).toFixed(2)}%: C$${legacyCommission.toFixed(2)}` +
        `\nPrecio final (subtotal + comisión): C$${finalLegacyPrice.toFixed(2)}`,
      isPeakHour: false,
      peakHourAdjustment: 1,
      vehicleType,
      rideType,
      commissionRate: commissionRateLegacy,
      commission: legacyCommission,
      serviceCode,
      extraStopsCharge: extraStops * STOP_FEE,
    };
  }

  const { multiplier } = getMultiplier(distanceKm, vehicleType, rideType);
  const distanceComponent = Math.max(distanceKm, 0) * multiplier;
  const baseComponent = service.basePrice;
  const minimumFare = service.minimumFare ?? baseComponent;

  let subtotal = baseComponent + distanceComponent;
  const minimumApplied = subtotal < minimumFare;
  if (minimumApplied) {
    subtotal = minimumFare;
  }

  const peak = isPeakHour();
  const inServiceArea = await isInManagua(originLat, originLng);
  const peakMultiplier = getPeakHourMultiplier(subtotal, peak, inServiceArea);

  let adjustedSubtotal = subtotal * peakMultiplier;
  const extraStopsCharge = extraStops * STOP_FEE;
  adjustedSubtotal += extraStopsCharge;

  const breakdownLines: string[] = [];
  breakdownLines.push(buildBreakdownLine(`Base (${service.code})`, baseComponent));
  breakdownLines.push(
    `Distancia (${distanceKm.toFixed(2)} km × C$${multiplier.toFixed(2)}): C$${distanceComponent.toFixed(2)}`,
  );

  if (minimumApplied) {
    breakdownLines.push(`Tarifa mínima aplicada: C$${minimumFare.toFixed(2)}`);
  }

  if (peakMultiplier > 1) {
    breakdownLines.push(`Ajuste hora pico (×${peakMultiplier.toFixed(2)})`);
  }

  if (extraStops > 0) {
    breakdownLines.push(`Paradas extra (${extraStops} × C$${STOP_FEE}): C$${extraStopsCharge.toFixed(2)}`);
  }

  if (serviceCode === 'designated_driver') {
    const normalService = await fetchServiceConfig('normal');
    if (normalService) {
      const normalMultiplier = getMultiplier(distanceKm, vehicleType, 'normal').multiplier;
      const normalDistance = Math.max(distanceKm, 0) * normalMultiplier;
      const normalBaseSubtotal = normalService.basePrice + normalDistance;
      const normalFinal = Math.max(normalBaseSubtotal, normalService.minimumFare ?? normalBaseSubtotal);
      const doubledNormal = normalFinal * 2;
      const designatedMinimum = service.minimumFare ?? doubledNormal;
      const newFinal = Math.max(doubledNormal, adjustedSubtotal, designatedMinimum);
      breakdownLines.push(`Tarifa normal estimada: C$${normalFinal.toFixed(2)}`);
      breakdownLines.push(`Tarifa conductor designado = tarifa normal × 2: C$${doubledNormal.toFixed(2)}`);
      if (newFinal > doubledNormal) {
        breakdownLines.push(`Se aplica tarifa mínima de conductor designado: C$${designatedMinimum.toFixed(2)}`);
      }
      adjustedSubtotal = newFinal;
    } else {
      breakdownLines.push('⚠️ No se pudo obtener la tarifa normal para duplicar el precio.');
    }
  }

  let commissionRate = service.commissionRate;

  if (options.driverId) {
    try {
      commissionRate = await getCommissionFromDatabase(options.driverId, serviceCode);
    } catch (error) {
      console.error('❌ Error obteniendo comisión personalizada:', error);
    }
  }

  const commission = roundCurrency(adjustedSubtotal * commissionRate);
  const finalPrice = roundCurrency(adjustedSubtotal + commission);

  breakdownLines.push(`Subtotal tras ajustes (sin comisión): C$${adjustedSubtotal.toFixed(2)}`);
  breakdownLines.push(`Comisión ${(commissionRate * 100).toFixed(2)}%: C$${commission.toFixed(2)}`);
  breakdownLines.push(`Precio final (subtotal + comisión): C$${finalPrice.toFixed(2)}`);

  return {
    distancePrice: roundCurrency(distanceComponent),
    timePrice: 0,
    basePrice: roundCurrency(baseComponent),
    distanceKm: parseFloat(distanceKm.toFixed(2)),
    durationMinutes,
    multiplier,
    finalPrice,
    breakdown: breakdownLines.join('\n'),
    isPeakHour: peak && peakMultiplier > 1,
    peakHourAdjustment: peakMultiplier,
    vehicleType,
    rideType,
    commissionRate,
    commission,
    serviceCode,
    serviceId: service.id,
    extraStopsCharge,
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
export async function calculateRidePriceWithStops(
  distanceInMeters: number,
  durationInSeconds: number,
  extraStops: number = 0,
  vehicleType: VehicleType = 'car',
  rideType: RideType = 'normal',
  originLat?: number,
  originLng?: number,
  options: RidePriceOptions = {}
): Promise<PriceCalculationResult> {
  return calculateRidePrice(
    distanceInMeters,
    durationInSeconds,
    vehicleType,
    rideType,
    originLat,
    originLng,
    { ...options, extraStops },
  );
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
