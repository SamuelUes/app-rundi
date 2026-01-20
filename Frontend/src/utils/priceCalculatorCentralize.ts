import axios from 'axios';
import { collection, getDocs, query, where } from 'firebase/firestore';
import client from '../api/client';
import { getFirebaseFirestore } from '../config/firebase';

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
  breakdown?: string;
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

export type PriceBreakdown = PriceCalculationResult;

export interface RidePriceOptions {
  originLat?: number;
  originLng?: number;
  driverId?: string;
  serviceCodeOverride?: string;
  extraStops?: number;
}

interface ServicePricingConfig {
  id?: string;
  code: string;
  basePrice: number;
  pricePerKm: number;
  minimumFare: number;
  commissionRate: number;
  pricePerMinute?: number;
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

const STOP_FEE = 20;
const SERVICE_AREAS_CACHE_TTL_MS = 5 * 60 * 1000;
const REMOTE_TIMEOUT_MS = 3000;
const PRICE_ENDPOINT = '/calculateRidePriceHttp';

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

const DEFAULT_SERVICE_CONFIGS: Record<string, ServicePricingConfig> = {
  normal: {
    code: 'normal',
    basePrice: 50,
    pricePerKm: 10,
    pricePerMinute: 0,
    minimumFare: 50,
    commissionRate: 0.11,
  },
  motorcycle: {
    code: 'motorcycle',
    basePrice: 50,
    pricePerKm: 8,
    pricePerMinute: 0,
    minimumFare: 50,
    commissionRate: 0.07,
  },
  designated_driver: {
    code: 'designated_driver',
    basePrice: 50,
    pricePerKm: 13,
    pricePerMinute: 0,
    minimumFare: 100,
    commissionRate: 0.25,
  },
};

const serviceConfigCache: Map<string, ServicePricingConfig> = new Map();
let cachedServiceAreas: ServiceAreaDoc[] | null = null;
let serviceAreasFetchedAt = 0;

const useRestPricingLookup =
  (process.env.EXPO_PUBLIC_SUPABASE_REST_PRICING ?? '').toLowerCase() === 'true' ||
  (process.env.SUPABASE_REST_PRICING ?? '').toLowerCase() === 'true';

async function fetchServiceConfigViaRest(serviceCode: string): Promise<ServicePricingConfig | null> {
  if (!useRestPricingLookup) {
    return null;
  }

  const supabaseUrl =
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    '';

  const supabaseAnonKey =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    '';

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[priceCalculator] REST habilitado pero faltan credenciales de Supabase');
    return null;
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/services?select=id,code,base_price,price_per_km,price_per_minute,minimum_fare,commission_rate&code=eq.${serviceCode}&is_active=eq.true`,
    {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Supabase respondió ${response.status}`);
  }

  const data = await response.json();
  if (Array.isArray(data) && data.length > 0) {
    const row = data[0];
    return {
      id: row.id,
      code: row.code,
      basePrice: Number(row.base_price ?? 0),
      pricePerKm: Number(row.price_per_km ?? 0),
      pricePerMinute: Number(row.price_per_minute ?? 0),
      minimumFare: Number(row.minimum_fare ?? 0),
      commissionRate: Number(row.commission_rate ?? 0),
    };
  }

  return null;
}

async function fetchServiceConfigViaCallable(serviceCode: string): Promise<ServicePricingConfig | null> {
  try {
    const servicesModule = await import('../services/servicesService');
    const services = await servicesModule.default.listServices();
    const matched = services.find((s) => s.code === serviceCode || (!s.code && serviceCode === 'normal'));
    if (matched) {
      return {
        id: matched.id,
        code: matched.code ?? serviceCode,
        basePrice: matched.basePrice ?? DEFAULT_SERVICE_CONFIGS[serviceCode]?.basePrice ?? 0,
        pricePerKm: matched.pricePerKm ?? DEFAULT_SERVICE_CONFIGS[serviceCode]?.pricePerKm ?? 0,
        pricePerMinute: matched.pricePerMinute ?? DEFAULT_SERVICE_CONFIGS[serviceCode]?.pricePerMinute ?? 0,
        minimumFare: matched.minimumFare ?? DEFAULT_SERVICE_CONFIGS[serviceCode]?.minimumFare ?? 0,
        commissionRate: matched.commissionRate ?? DEFAULT_SERVICE_CONFIGS[serviceCode]?.commissionRate ?? 0.11,
      };
    }
  } catch (error) {
    console.warn('[priceCalculator] Error consultando servicios (callable):', error);
  }

  return null;
}

export async function fetchServiceConfig(serviceCode: string): Promise<ServicePricingConfig> {
  if (serviceConfigCache.has(serviceCode)) {
    return serviceConfigCache.get(serviceCode)!;
  }

  try {
    const restConfig = await fetchServiceConfigViaRest(serviceCode);
    if (restConfig) {
      serviceConfigCache.set(serviceCode, restConfig);
      return restConfig;
    }
  } catch (error) {
    console.warn(`[priceCalculator] REST falló para servicio ${serviceCode}:`, error);
  }

  const callableConfig = await fetchServiceConfigViaCallable(serviceCode);
  if (callableConfig) {
    serviceConfigCache.set(serviceCode, callableConfig);
    return callableConfig;
  }

  const fallback = DEFAULT_SERVICE_CONFIGS[serviceCode] ?? DEFAULT_SERVICE_CONFIGS.normal;
  serviceConfigCache.set(serviceCode, fallback);
  return fallback;
}

function getMultiplier(distanceKm: number, vehicleType: VehicleType, rideType: RideType): { multiplier: number; tramo: string } {
  let multiplier: number;
  let tramo: string;

  if (rideType === 'designated_driver') {
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
    if (distanceKm >= 0.1 && distanceKm <= 4) {
      multiplier = 5;
      tramo = '0.1-4 km';
    } else if (distanceKm >= 4.01 && distanceKm <= 6) {
      multiplier = 7;
      tramo = '4.01-6 km';
    } else if (distanceKm >= 6.01) {
      multiplier = 9;
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
      multiplier = 15;
      tramo = '0.401-1 km';
    } else if (distanceKm >= 1.01 && distanceKm <= 2) {
      multiplier = 20;
      tramo = '1.01-2 km';
    } else if (distanceKm >= 2.01 && distanceKm <= 8) {
      multiplier = 25;
      tramo = '2.01-8 km';
    } else if (distanceKm >= 8.01) {
      multiplier = 27;
      tramo = 'Mayor a 8.01 km';
    } else {
      multiplier = 8;
      tramo = 'Menor a 0.2 km (mínimo)';
    }
  }

  return { multiplier, tramo };
}

function mapRideTypeToServiceCode(vehicleType: VehicleType, rideType: RideType): string {
  if (rideType === 'designated_driver') {
    return 'designated_driver';
  }
  return vehicleType === 'motorcycle' ? 'motorcycle' : 'normal';
}

export function isPeakHour(date: Date = new Date()): boolean {
  const hour = date.getHours();
  return (hour >= 6 && hour < 8) || (hour >= 17 && hour < 20);
}

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
    const R = 6371;
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
    const firestore = await getFirebaseFirestore();
    const snapshot = await getDocs(
      query(collection(firestore, 'service_areas'), where('active', '==', true)),
    );

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
  return serviceAreas.some((area) => isPointInServiceArea(lat!, lng!, area));
}

interface BackendPricePayload {
  distanceInMeters: number;
  durationInSeconds: number;
  vehicleType: VehicleType;
  rideType: RideType;
  originLat?: number;
  originLng?: number;
  driverId?: string;
  serviceCodeOverride?: string;
  extraStops?: number;
}

function buildBreakdownLine(label: string, value: number): string {
  return `${label}: C$${value.toFixed(2)}`;
}

function normalizeBackendResponse(data: any): PriceCalculationResult | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const payload = 'data' in data ? data.data : data;
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const finalPrice = Number(payload.finalPrice ?? payload.final_price);
  const distancePrice = Number(payload.distancePrice ?? payload.distance_price);
  const basePrice = Number(payload.basePrice ?? payload.base_price ?? 0);
  const distanceKm = Number(payload.distanceKm ?? payload.distance_km);

  if (!Number.isFinite(finalPrice) || !Number.isFinite(distancePrice)) {
    return null;
  }

  return {
    distancePrice,
    timePrice: Number(payload.timePrice ?? payload.time_price ?? 0),
    basePrice,
    distanceKm,
    durationMinutes: Number(payload.durationMinutes ?? payload.duration_minutes ?? 0),
    multiplier: Number(payload.multiplier ?? 0),
    finalPrice,
    breakdown: payload.breakdown ?? undefined,
    isPeakHour: Boolean(payload.isPeakHour ?? payload.is_peak_hour),
    peakHourAdjustment: Number(payload.peakHourAdjustment ?? payload.peak_hour_adjustment ?? 1),
    vehicleType: (payload.vehicleType ?? payload.vehicle_type ?? 'car') as VehicleType,
    rideType: (payload.rideType ?? payload.ride_type ?? 'normal') as RideType,
    commissionRate: Number(payload.commissionRate ?? payload.commission_rate ?? 0),
    commission: Number(payload.commission ?? 0),
    serviceCode: String(payload.serviceCode ?? payload.service_code ?? mapRideTypeToServiceCode('car', 'normal')),
    serviceId: payload.serviceId ?? payload.service_id ?? undefined,
    extraStopsCharge: Number(payload.extraStopsCharge ?? payload.extra_stops_charge ?? 0),
  };
}

async function calculateRidePriceViaEndpoint(payload: BackendPricePayload): Promise<PriceCalculationResult | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);

  try {
    const response = await client.post(PRICE_ENDPOINT, payload, { signal: controller.signal });
    return normalizeBackendResponse(response.data);
  } catch (error) {
    if (axios.isCancel(error) || (error as any)?.name === 'CanceledError') {
      console.warn('[priceCalculator] Solicitud al endpoint de precio cancelada por timeout');
    } else if ((error as any)?.name === 'AbortError') {
      console.warn('[priceCalculator] Endpoint de precio abortado por timeout');
    } else {
      console.warn('[priceCalculator] Error consultando endpoint de precio:', (error as any)?.message ?? error);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function calculateRidePrice(
  distanceInMeters: number,
  durationInSeconds: number,
  vehicleType: VehicleType = 'car',
  rideType: RideType = 'normal',
  originLat?: number,
  originLng?: number,
  options: RidePriceOptions = {},
): Promise<PriceCalculationResult> {
  const payload: BackendPricePayload = {
    distanceInMeters,
    durationInSeconds,
    vehicleType,
    rideType,
    originLat,
    originLng,
    driverId: options.driverId,
    serviceCodeOverride: options.serviceCodeOverride,
    extraStops: Math.max(options.extraStops ?? 0, 0),
  };

  const remoteResult = await calculateRidePriceViaEndpoint(payload);
  if (remoteResult) {
    return remoteResult;
  }

  return calculateRidePriceFallback(distanceInMeters, durationInSeconds, vehicleType, rideType, originLat, originLng, options);
}

async function calculateRidePriceFallback(
  distanceInMeters: number,
  durationInSeconds: number,
  vehicleType: VehicleType,
  rideType: RideType,
  originLat?: number,
  originLng?: number,
  options: RidePriceOptions = {},
): Promise<PriceCalculationResult> {
  const distanceKm = distanceInMeters / 1000;
  const durationMinutes = Math.ceil(durationInSeconds / 60);
  const serviceCode = options.serviceCodeOverride ?? mapRideTypeToServiceCode(vehicleType, rideType);
  const extraStops = Math.max(options.extraStops ?? 0, 0);

  const service = await fetchServiceConfig(serviceCode);
  const { multiplier } = getMultiplier(distanceKm, vehicleType, rideType);
  const distanceComponent = Math.max(distanceKm, 0) * multiplier;
  const baseComponent = service.basePrice;

  let subtotal = baseComponent + distanceComponent;
  const minimumFare = service.minimumFare ?? baseComponent;
  const minimumApplied = subtotal < minimumFare;
  if (minimumApplied) {
    subtotal = minimumFare;
  }

  let peakMultiplier = 1;
  const peak = isPeakHour();
  const inServiceArea = await isInManagua(originLat, originLng);
  if (peak && inServiceArea) {
    peakMultiplier = 1.2;
  }
  subtotal *= peakMultiplier;

  const extraStopsCharge = extraStops * STOP_FEE;
  subtotal += extraStopsCharge;

  let adjustedSubtotal = subtotal;
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
    const normalMultiplier = getMultiplier(distanceKm, vehicleType, 'normal').multiplier;
    const normalDistance = Math.max(distanceKm, 0) * normalMultiplier;
    const normalBase = normalService.basePrice + normalDistance;
    const normalFinal = Math.max(normalBase, normalService.minimumFare ?? normalBase);
    const doubledNormal = normalFinal * 2;
    const newFinal = Math.max(doubledNormal, adjustedSubtotal, service.minimumFare ?? doubledNormal);
    breakdownLines.push(`Tarifa normal estimada: C$${normalFinal.toFixed(2)}`);
    breakdownLines.push(`Tarifa conductor designado = tarifa normal × 2: C$${doubledNormal.toFixed(2)}`);
    if (newFinal > doubledNormal) {
      breakdownLines.push(`Se aplica tarifa mínima de conductor designado: C$${(service.minimumFare ?? doubledNormal).toFixed(2)}`);
    }
    adjustedSubtotal = newFinal;
  }

  const finalPriceRounded = Math.round(adjustedSubtotal);
  const commissionRate = service.commissionRate ?? 0.11;
  const commission = Math.round(finalPriceRounded * commissionRate);

  breakdownLines.push(`Precio final (redondeado): C$${finalPriceRounded.toFixed(2)}`);
  breakdownLines.push(`Comisión ${(commissionRate * 100).toFixed(2)}%: C$${commission.toFixed(2)}`);

  return {
    distancePrice: Math.round(distanceComponent),
    timePrice: 0,
    basePrice: Math.round(baseComponent),
    distanceKm: Number(distanceKm.toFixed(2)),
    durationMinutes,
    multiplier,
    finalPrice: finalPriceRounded,
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

export function formatPriceBreakdown(breakdown: PriceBreakdown): string {
  if (breakdown.breakdown) {
    return breakdown.breakdown;
  }

  const lines: string[] = [];
  lines.push(
    `📏 Distancia: ${breakdown.distanceKm.toFixed(2)} km × C$${breakdown.multiplier.toFixed(2)} = C$${breakdown.distancePrice.toFixed(2)}`,
  );
  if (breakdown.extraStopsCharge > 0) {
    lines.push(`➕ Paradas extra: C$${breakdown.extraStopsCharge.toFixed(2)}`);
  }
  lines.push(`💰 Total: C$${breakdown.finalPrice.toFixed(2)}`);
  return lines.join('\n');
}

export function getVehicleTypeName(vehicleType: VehicleType, rideType: RideType): string {
  if (rideType === 'designated_driver') {
    return 'Conductor Designado';
  }
  if (vehicleType === 'motorcycle') {
    return 'Moto';
  }
  return 'Auto';
}
