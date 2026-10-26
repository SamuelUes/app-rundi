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
  baseFare: number;
  featureCodes: string[];
  featureAdjustments: Array<{ code: string; adjustment: number }>;
  surgeMultiplier: number;
  demandSupplyRatio: number | null;
  pricingSnapshot: {
    serviceCode: string;
    featureCodes: string[];
    featureAdjustments: Array<{ code: string; adjustment: number }>;
    baseFare: number;
    fareBeforeSurge: number;
    surgeMultiplier: number;
    demandSupplyRatio: number | null;
    commissionRate: number;
    commissionAmount: number;
    finalFare: number;
    dynamicMinimumFare: number;
  };
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

// Fallbacks locales — deben coincidir con services en producción
const DEFAULT_SERVICE_CONFIGS: Record<string, ServicePricingConfig> = {
  normal: {
    code: 'normal',
    basePrice: 50,
    pricePerKm: 10,
    pricePerMinute: 0,
    minimumFare: 50,
    commissionRate: 0.15,
  },
  motorcycle: {
    code: 'motorcycle',
    basePrice: 50,
    pricePerKm: 8,
    pricePerMinute: 0,
    minimumFare: 50,
    commissionRate: 0.075,
  },
  designated_driver_auto: {
    code: 'designated_driver_auto',
    basePrice: 50,
    pricePerKm: 13,
    pricePerMinute: 0,
    minimumFare: 50,
    commissionRate: 0.25,
  },
  designated_driver_moto: {
    code: 'designated_driver_moto',
    basePrice: 50,
    pricePerKm: 13,
    pricePerMinute: 0,
    minimumFare: 50,
    commissionRate: 0.125,
  },
  designated_driver: {
    code: 'designated_driver',
    basePrice: 50,
    pricePerKm: 13,
    pricePerMinute: 0,
    minimumFare: 50,
    commissionRate: 0.25,
  },
};

// Tasa de comisión de último recurso por código de servicio.
// Debe coincidir con getFallbackCommissionRate del backend.
function getFallbackCommissionRate(serviceCode?: string | null): number {
  switch (serviceCode) {
    case 'designated_driver_moto':
      return 0.125;
    case 'designated_driver_auto':
    case 'designated_driver':
      return 0.25;
    case 'motorcycle':
      return 0.075;
    case 'night':
      return 0.12;
    default:
      return 0.15;
  }
}

const SERVICE_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
const serviceConfigCache: Map<string, { config: ServicePricingConfig; fetchedAt: number }> = new Map();
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
        commissionRate: matched.commissionRate ?? getFallbackCommissionRate(matched.code ?? serviceCode),
      };
    }
  } catch (error) {
    console.warn('[priceCalculator] Error consultando servicios (callable):', error);
  }

  return null;
}

export async function fetchServiceConfig(serviceCode: string): Promise<ServicePricingConfig> {
  const cached = serviceConfigCache.get(serviceCode);
  if (cached && Date.now() - cached.fetchedAt < SERVICE_CONFIG_CACHE_TTL_MS) {
    return cached.config;
  }

  try {
    const restConfig = await fetchServiceConfigViaRest(serviceCode);
    if (restConfig) {
      serviceConfigCache.set(serviceCode, { config: restConfig, fetchedAt: Date.now() });
      return restConfig;
    }
  } catch (error) {
    console.warn(`[priceCalculator] REST falló para servicio ${serviceCode}:`, error);
  }

  const callableConfig = await fetchServiceConfigViaCallable(serviceCode);
  if (callableConfig) {
    serviceConfigCache.set(serviceCode, { config: callableConfig, fetchedAt: Date.now() });
    return callableConfig;
  }

  const fallback = DEFAULT_SERVICE_CONFIGS[serviceCode] ?? DEFAULT_SERVICE_CONFIGS.normal;
  serviceConfigCache.set(serviceCode, { config: fallback, fetchedAt: Date.now() });
  return fallback;
}

/**
 * Tarifa mínima real por variante de conductor designado, desde la misma
 * config de servicios que usa pricing (Supabase/callable con cache + defaults).
 */
export async function getDesignatedDriverMinimumFares(): Promise<{ auto: number; moto: number }> {
  const [autoConfig, motoConfig] = await Promise.all([
    fetchServiceConfig('designated_driver_auto'),
    fetchServiceConfig('designated_driver_moto'),
  ]);
  return {
    auto: autoConfig.minimumFare ?? DEFAULT_SERVICE_CONFIGS.designated_driver_auto.minimumFare,
    moto: motoConfig.minimumFare ?? DEFAULT_SERVICE_CONFIGS.designated_driver_moto.minimumFare,
  };
}

function getMultiplier(distanceKm: number, vehicleType: VehicleType, rideType: RideType): { multiplier: number; tramo: string } {
  let multiplier: number;
  let tramo: string;

  if (rideType === 'designated_driver') {
    if (distanceKm >= 0.01 && distanceKm <= 0.2) {
      multiplier = 16;
      tramo = '0.01-0.2 km';
    } else if (distanceKm >= 0.201 && distanceKm <= 0.7) {
      multiplier = 24;
      tramo = '0.201-0.7 km';
    } else if (distanceKm >= 0.701 && distanceKm <= 1) {
      multiplier = 24;
      tramo = '0.701-1 km';
    } else if (distanceKm >= 1.01 && distanceKm <= 2) {
      multiplier = 30;
      tramo = '1.01-2 km';
    } else if (distanceKm >= 2.01 && distanceKm <= 3) {
      multiplier = 32.5;
      tramo = '2.01-3 km';
    } else if (distanceKm >= 3.01 && distanceKm <= 4.5) {
      multiplier = 28.5;
      tramo = '3.01-4.5 km';
    } else if (distanceKm >= 4.51 && distanceKm <= 6) {
      multiplier = 26;
      tramo = '4.51-6 km';
    } else if (distanceKm >= 6.01 && distanceKm <= 8) {
      multiplier = 24.5;
      tramo = '6.01-8 km';
    } else if (distanceKm >= 8.01 && distanceKm <= 9.5) {
      multiplier = 20.5;
      tramo = 'Mayor a 8.01 km';
    } else if (distanceKm >= 9.51 ) {
      multiplier = 21.5;
      tramo = 'Mayor a 9.51 km';
    } else {
      multiplier = 2;
      tramo = 'Menor a 0.2 km (mínimo)';
    }
  } else if (vehicleType === 'motorcycle') {
    if (distanceKm >= 0.1 && distanceKm <= 2) {
      multiplier = 2;
      tramo = '0.1-1 km';
    } else if (distanceKm >= 2.01 && distanceKm <= 4) {
      multiplier = 4;
      tramo = '2.01-4 km';
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
    if (distanceKm >= 0.01 && distanceKm <= 0.2) {
      multiplier = 13;
      tramo = '0.2-0.4 km';
    } else if (distanceKm >= 0.201 && distanceKm <= 0.7) {
      multiplier = 16;
      tramo = '0.401-1 km';
    } else if (distanceKm >= 0.701 && distanceKm <= 1) {
      multiplier = 19;
      tramo = '0.401-1 km';
    } else if (distanceKm >= 1.01 && distanceKm <= 2) {
      multiplier = 14;
      tramo = '1.01-2 km';
    } else if (distanceKm >= 2.01 && distanceKm <= 3) {
      multiplier = 11;
      tramo = '2.01-3 km';
    } else if (distanceKm >= 3.01 && distanceKm <= 4.5) {
      multiplier = 11.5;
      tramo = '3.01-4.5 km';
    } else if (distanceKm >= 4.51 && distanceKm <= 6) {
      multiplier = 12;
      tramo = '4.51-6 km';
    } else if (distanceKm >= 6.01 && distanceKm <= 8) {
      multiplier = 13;
      tramo = '6.01-8 km';
    } else if (distanceKm >= 8.01) {
      multiplier = 12.5;
      tramo = 'Mayor a 8.01 km';
    } else {
      multiplier = 2;
      tramo = 'Menor a 0.2 km (mínimo)';
    }
  }

  return { multiplier, tramo };
}

function mapRideTypeToServiceCode(vehicleType: VehicleType, rideType: RideType): string {
  if (rideType === 'designated_driver') {
    return vehicleType === 'motorcycle' ? 'designated_driver_moto' : 'designated_driver_auto';
  }
  return vehicleType === 'motorcycle' ? 'motorcycle' : 'normal';
}

export function isPeakHour(date: Date = new Date()): boolean {
  const hour = date.getHours();
  return (hour >= 6 && hour < 8) || (hour >= 17 && hour < 20);
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundFareToNearestFive(value: number): number {
  return Math.round(value / 5) * 5;
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

  const finalPriceRaw = Number(payload.finalPrice ?? payload.final_price);
  const distancePrice = Number(payload.distancePrice ?? payload.distance_price);
  const basePrice = Number(payload.basePrice ?? payload.base_price ?? 0);
  const distanceKm = Number(payload.distanceKm ?? payload.distance_km);
  const commissionRate = Number(payload.commissionRate ?? payload.commission_rate ?? 0);
  const commission = Number(payload.commission ?? 0);
  const subtotalFromPayload = Number(
    payload.subtotal ?? payload.adjustedSubtotal ?? payload.adjusted_subtotal ?? payload.subtotal_price,
  );

  if (!Number.isFinite(finalPriceRaw) || !Number.isFinite(distancePrice)) {
    return null;
  }

  let finalPrice = finalPriceRaw;
  const hasPricingSnapshot = Boolean(payload.pricingSnapshot);
  if (!hasPricingSnapshot && Number.isFinite(commission) && commission > 0) {
    if (Number.isFinite(subtotalFromPayload) && subtotalFromPayload > 0) {
      finalPrice = subtotalFromPayload + commission;
    } else if (Number.isFinite(commissionRate) && commissionRate > 0) {
      const commissionIfFinalAlreadyIncludes = (finalPriceRaw / (1 + commissionRate)) * commissionRate;
      const commissionIfFinalIsSubtotal = finalPriceRaw * commissionRate;
      const diffIncludes = Math.abs(commission - commissionIfFinalAlreadyIncludes);
      const diffSubtotal = Math.abs(commission - commissionIfFinalIsSubtotal);
      if (diffSubtotal + 0.01 < diffIncludes) {
        finalPrice = finalPriceRaw + commission;
      }
    }
  }
  finalPrice = roundFareToNearestFive(finalPrice);

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
    commissionRate,
    commission,
    serviceCode: String(payload.serviceCode ?? payload.service_code ?? mapRideTypeToServiceCode('car', 'normal')),
    serviceId: payload.serviceId ?? payload.service_id ?? undefined,
    extraStopsCharge: Number(payload.extraStopsCharge ?? payload.extra_stops_charge ?? 0),
    baseFare: Number(payload.baseFare ?? payload.base_fare ?? finalPrice),
    featureCodes: Array.isArray(payload.featureCodes ?? payload.feature_codes)
      ? (payload.featureCodes ?? payload.feature_codes)
      : [],
    featureAdjustments: Array.isArray(payload.featureAdjustments ?? payload.feature_adjustments)
      ? (payload.featureAdjustments ?? payload.feature_adjustments)
      : [],
    surgeMultiplier: Number(payload.surgeMultiplier ?? payload.surge_multiplier ?? 1),
    demandSupplyRatio:
      payload.demandSupplyRatio == null && payload.demand_supply_ratio == null
        ? null
        : Number(payload.demandSupplyRatio ?? payload.demand_supply_ratio),
    pricingSnapshot: payload.pricingSnapshot ?? payload.pricing_snapshot ?? {
      serviceCode: String(payload.serviceCode ?? payload.service_code ?? 'normal'),
      featureCodes: [],
      featureAdjustments: [],
      baseFare: Number(payload.baseFare ?? payload.base_fare ?? finalPrice),
      fareBeforeSurge: Number(payload.baseFare ?? payload.base_fare ?? finalPrice),
      surgeMultiplier: 1,
      demandSupplyRatio: null,
      commissionRate,
      commissionAmount: commission,
      finalFare: finalPrice,
      dynamicMinimumFare: Number(
        payload.pricingSnapshot?.dynamicMinimumFare ??
          payload.pricing_snapshot?.dynamic_minimum_fare ??
          Math.max(50, finalPrice * 0.6667),
      ),
    },
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

export interface PriceBatchVariant {
  key: string;
  vehicleType: VehicleType;
  rideType: RideType;
  serviceCodeOverride?: string;
}

const PRICE_BATCH_ENDPOINT = '/calculateRidePricesHttp';

async function calculateRidePricesViaBatchEndpoint(
  payload: BackendPricePayload,
  variants: PriceBatchVariant[],
): Promise<Record<string, PriceCalculationResult | null> | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);

  try {
    const response = await client.post(
      PRICE_BATCH_ENDPOINT,
      {
        distanceInMeters: payload.distanceInMeters,
        durationInSeconds: payload.durationInSeconds,
        originLat: payload.originLat,
        originLng: payload.originLng,
        extraStops: payload.extraStops,
        variants: variants.map((variant) => ({
          key: variant.key,
          vehicleType: variant.vehicleType,
          rideType: variant.rideType,
          serviceCodeOverride: variant.serviceCodeOverride,
        })),
      },
      { signal: controller.signal },
    );

    const results = response.data?.results;
    if (!results || typeof results !== 'object') {
      return null;
    }

    const normalized: Record<string, PriceCalculationResult | null> = {};
    for (const variant of variants) {
      normalized[variant.key] = normalizeBackendResponse(results[variant.key]);
    }

    if (variants.every((variant) => normalized[variant.key] == null)) {
      return null;
    }

    return normalized;
  } catch (error) {
    if (axios.isCancel(error) || (error as any)?.name === 'CanceledError' || (error as any)?.name === 'AbortError') {
      console.warn('[priceCalculator] Solicitud batch de precios cancelada por timeout');
    } else {
      console.warn('[priceCalculator] Error consultando endpoint batch de precios:', (error as any)?.message ?? error);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Calcula varias variantes de precio en UNA sola llamada HTTP. Si el endpoint
 * batch no está disponible (o devuelve variantes faltantes), cada variante
 * faltante se resuelve con `calculateRidePrice` individual (que a su vez tiene
 * fallback local), garantizando compatibilidad con backends sin desplegar.
 */
export async function calculateRidePricesBatch(
  distanceInMeters: number,
  durationInSeconds: number,
  originLat: number | undefined,
  originLng: number | undefined,
  variants: PriceBatchVariant[],
  options: RidePriceOptions = {},
): Promise<Record<string, PriceCalculationResult | null>> {
  const payload: BackendPricePayload = {
    distanceInMeters,
    durationInSeconds,
    vehicleType: 'car',
    rideType: 'normal',
    originLat,
    originLng,
    driverId: options.driverId,
    serviceCodeOverride: options.serviceCodeOverride,
    extraStops: Math.max(options.extraStops ?? 0, 0),
  };

  const remote = await calculateRidePricesViaBatchEndpoint(payload, variants);
  if (remote && variants.every((variant) => remote[variant.key] != null)) {
    return remote;
  }

  const resolved = await Promise.all(
    variants.map(async (variant) => {
      const existing = remote?.[variant.key];
      if (existing) {
        return [variant.key, existing] as const;
      }
      try {
        const result = await calculateRidePrice(
          distanceInMeters,
          durationInSeconds,
          variant.vehicleType,
          variant.rideType,
          originLat,
          originLng,
          {
            driverId: options.driverId,
            serviceCodeOverride: variant.serviceCodeOverride ?? options.serviceCodeOverride,
            extraStops: payload.extraStops,
          },
        );
        return [variant.key, result] as const;
      } catch {
        return [variant.key, null] as const;
      }
    }),
  );

  return Object.fromEntries(resolved);
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
  // Fórmula por distancia: base + km × price_per_km; tramos legacy solo si el
  // servicio no define price_per_km (paridad con priceCalculator del backend).
  const legacyMultiplier = getMultiplier(distanceKm, vehicleType, rideType).multiplier;
  const multiplier = service.pricePerKm > 0 ? service.pricePerKm : legacyMultiplier;
  const distanceComponent = Math.max(distanceKm, 0) * multiplier;
  const baseComponent = service.basePrice;
  const timePrice = Math.max(durationMinutes, 0) * Math.max(service.pricePerMinute ?? 0, 0);
  const extraStopsCharge = extraStops * STOP_FEE;
  let minimumFare = Math.max(service.minimumFare ?? baseComponent, 0);
  let baseFare = Math.max(
    baseComponent + distanceComponent + timePrice + extraStopsCharge,
    minimumFare,
  );

  if (rideType === 'designated_driver') {
    const normalService = await fetchServiceConfig('normal');
    const normalMultiplier = normalService.pricePerKm > 0
      ? normalService.pricePerKm
      : getMultiplier(distanceKm, vehicleType, 'normal').multiplier;
    const normalFare = Math.max(
      normalService.basePrice +
        Math.max(distanceKm, 0) * normalMultiplier +
        Math.max(durationMinutes, 0) * Math.max(normalService.pricePerMinute ?? 0, 0) +
        extraStopsCharge,
      normalService.minimumFare ?? normalService.basePrice,
    );
    minimumFare = Math.max(minimumFare, normalFare * 2);
    baseFare = Math.max(baseFare, minimumFare);
  }

  const now = new Date();
  let managuaMinutes = -1;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Managua',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    managuaMinutes =
      Number(parts.find((part) => part.type === 'hour')?.value) * 60 +
      Number(parts.find((part) => part.type === 'minute')?.value);
  } catch {
    managuaMinutes = -1;
  }
  const nightActive = managuaMinutes >= 22 * 60 || (managuaMinutes >= 0 && managuaMinutes < 4 * 60);
  let adjustedFare = baseFare;
  const featureCodes: string[] = [];
  const featureAdjustments: Array<{ code: string; adjustment: number }> = [];
  if (nightActive) {
    const adjustment = roundCurrency(adjustedFare * 0.1);
    adjustedFare += adjustment;
    featureCodes.push('night');
    featureAdjustments.push({ code: 'night', adjustment });
  }
  if (serviceCode === 'designated_driver_moto') {
    const beforeDiscount = adjustedFare;
    adjustedFare = Math.max(minimumFare, adjustedFare - 70);
    featureCodes.push('designated_driver_moto_discount');
    featureAdjustments.push({
      code: 'designated_driver_moto_discount',
      adjustment: adjustedFare - beforeDiscount,
    });
  }
  const fareBeforeSurge = Math.max(adjustedFare, minimumFare);
  const surgeMultiplier = 1;
  const finalPrice = roundFareToNearestFive(fareBeforeSurge * surgeMultiplier);
  const commissionRate = service.commissionRate ?? getFallbackCommissionRate(serviceCode);
  const commission = roundCurrency(finalPrice * commissionRate);
  const breakdownLines: string[] = [];
  breakdownLines.push(buildBreakdownLine(`Base (${service.code})`, baseComponent));
  breakdownLines.push(
    `Distancia (${distanceKm.toFixed(2)} km × C$${multiplier.toFixed(2)}): C$${distanceComponent.toFixed(2)}`,
  );
  if (timePrice > 0) {
    breakdownLines.push(
      `Tiempo (${durationMinutes} min × C$${(service.pricePerMinute ?? 0).toFixed(2)}): C$${timePrice.toFixed(2)}`,
    );
  }
  if (extraStops > 0) {
    breakdownLines.push(`Paradas extra (${extraStops} × C$${STOP_FEE}): C$${extraStopsCharge.toFixed(2)}`);
  }
  for (const feature of featureAdjustments) {
    const sign = feature.adjustment < 0 ? '-' : '+';
    breakdownLines.push(`${feature.code}: ${sign}C$${Math.abs(feature.adjustment).toFixed(2)}`);
  }
  breakdownLines.push(`Tarifa final: C$${finalPrice.toFixed(2)}`);
  breakdownLines.push(`Comisión ${(commissionRate * 100).toFixed(2)}%: C$${commission.toFixed(2)}`);
  const pricingSnapshot = {
    serviceCode: service.code,
    featureCodes,
    featureAdjustments,
    baseFare: roundCurrency(baseFare),
    fareBeforeSurge: roundCurrency(fareBeforeSurge),
    surgeMultiplier,
    demandSupplyRatio: null,
    commissionRate,
    commissionAmount: commission,
    finalFare: finalPrice,
    dynamicMinimumFare: Math.round(
      Math.max(
        50,
        finalPrice * 0.6667,
        surgeMultiplier > 1
          ? fareBeforeSurge * (1 + (Math.min(1.6, surgeMultiplier) - 1) * 0.5)
          : 0,
      ) * 100,
    ) / 100,
  };

  return {
    distancePrice: roundCurrency(distanceComponent),
    timePrice: roundCurrency(timePrice),
    basePrice: roundCurrency(baseComponent),
    distanceKm: Number(distanceKm.toFixed(2)),
    durationMinutes,
    multiplier,
    finalPrice,
    breakdown: breakdownLines.join('\n'),
    isPeakHour: false,
    peakHourAdjustment: 1,
    vehicleType,
    rideType,
    commissionRate,
    commission,
    serviceCode,
    serviceId: service.id,
    extraStopsCharge,
    baseFare: roundCurrency(baseFare),
    featureCodes,
    featureAdjustments,
    surgeMultiplier,
    demandSupplyRatio: null,
    pricingSnapshot,
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
