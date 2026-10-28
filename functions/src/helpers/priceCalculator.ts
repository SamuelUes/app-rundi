/**
 * Calculadora de precios para viajes
 * Rundi
 *
 * COMISIONES (fuente de verdad: tabla `services.commission_rate`):
 * - Viaje Normal (normal): 15%
 * - Moto (motorcycle): 7.5%
 * - Conductor Designado Auto (designated_driver_auto): 25%
 * - Conductor Designado Moto (designated_driver_moto): 12.5%
 * - `night` is a reusable Feature; commission remains defined by the base Service.
 *
 * Fórmula:
 *
 *   fare         = max(minimum_fare, base + distancia + tiempo + paradas)
 *   fare         = max(minimum_fare, applyFeatures(fare)) × surge
 *   comisión     = fare × commission_rate
 *
 * `base_price`, `price_per_km`, `minimum_fare` y `commission_rate` se leen en
 * vivo desde la tabla `services`. Si el servicio no tiene `price_per_km > 0`,
 * se usa la tabla legacy de multiplicadores por tramo (getMultiplier).
 *
 * La comisión se muestra al cliente como parte del precio final y al completar
 * el pago se deduce del monedero del conductor sobre el total pagado:
 *   deducción = total_pagado × commission_rate
 *   neto conductor = total_pagado − deducción
 */

import { database, firestore } from '../config/firebase';
import { DEFAULT_SERVICE_AREA_ID } from '../config/constants';
import { supabaseGet } from '../supabase/rest';
import {
  applyPricingFeatures,
  calculateCommissionAmount,
  calculateDynamicMinimumFare,
  calculateSurgeRatio,
  DEFAULT_SURGE_RULES,
  getDefaultSelectedPricingFeatureCodes,
  resolveSurgeMultiplier,
  roundFareToNearestFive,
  validateSelectedFeatureCodes,
  type PricingFeature,
  type SurgeRule,
} from './pricingRules';

export type VehicleType = 'car' | 'motorcycle';
export type RideType = 'normal' | 'designated_driver';

const STOP_FEE = 20;
const PRICING_SERVICE_CODES = new Set([
  'normal',
  'motorcycle',
  'designated_driver_auto',
  'designated_driver_moto',
]);

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
  calculationAt?: Date;
  skipSurge?: boolean;
  selectedFeatureCodes?: readonly string[];
}

interface FeatureAssignmentRow {
  enabled?: boolean;
  configuration?: Record<string, unknown> | null;
  features?: Record<string, unknown> | null;
}

interface PricingSnapshot {
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
}

const PRICING_CONFIG_CACHE_TTL_MS = 60 * 1000;
const DEMAND_SUPPLY_CACHE_TTL_MS = 10 * 1000;
const featureCache = new Map<string, { features: PricingFeature[]; fetchedAt: number }>();
const demandSupplyCache = new Map<string, { ratio: number | null; fetchedAt: number }>();
const demandSupplyInflight = new Map<string, Promise<number | null>>();
let cachedSurgeRules: SurgeRule[] | null = null;
let surgeRulesFetchedAt = 0;

async function loadServiceFeatures(serviceId: string): Promise<PricingFeature[]> {
  const cached = featureCache.get(serviceId);
  if (cached && Date.now() - cached.fetchedAt < PRICING_CONFIG_CACHE_TTL_MS) {
    return cached.features;
  }

  try {
    const rows = await supabaseGet(
      'service_feature_assignments',
      { service_id: serviceId, enabled: true },
      'enabled,configuration,features!inner(code,name,enabled,starts_at,ends_at,start_time,end_time,timezone,pricing_type,pricing_value,priority,stackable,eligibility_subject,eligibility_mode,eligibility_rules,metadata)',
      { limit: 100, requireServiceRole: true },
    ) as FeatureAssignmentRow[];

    const features = rows
      .filter((row) => row.enabled === true && row.features?.enabled === true)
      .map((row) => {
        const feature = row.features ?? {};
        const overrides = row.configuration ?? {};
        const metadata = feature.metadata as Record<string, unknown> | undefined;
        const priority = Number(overrides.priority ?? feature.priority ?? 100);
        return {
          code: String(feature.code ?? ''),
          name: String(feature.name ?? feature.code ?? ''),
          pricingType: String(overrides.pricing_type ?? feature.pricing_type ?? 'none') as PricingFeature['pricingType'],
          pricingValue: Number(overrides.pricing_value ?? feature.pricing_value ?? 0),
          priority: Number.isFinite(priority) ? priority : 100,
          stackable: overrides.stackable === undefined ? feature.stackable !== false : overrides.stackable === true,
          defaultSelected: overrides.default_selected === undefined
            ? metadata?.defaultSelected !== false
            : overrides.default_selected === true,
          startTime: typeof feature.start_time === 'string' ? feature.start_time : null,
          endTime: typeof feature.end_time === 'string' ? feature.end_time : null,
          timezone: typeof feature.timezone === 'string' ? feature.timezone : 'America/Managua',
          startsAt: typeof feature.starts_at === 'string' ? feature.starts_at : null,
          endsAt: typeof feature.ends_at === 'string' ? feature.ends_at : null,
          enabled: feature.enabled === true,
          eligibilitySubject: String(feature.eligibility_subject ?? 'none') as PricingFeature['eligibilitySubject'],
          eligibilityMode: String(feature.eligibility_mode ?? 'none') as PricingFeature['eligibilityMode'],
          eligibilityRules: feature.eligibility_rules && typeof feature.eligibility_rules === 'object'
            ? feature.eligibility_rules as Record<string, unknown>
            : {},
        } satisfies PricingFeature;
      })
      .filter((feature) => feature.code.length > 0);

    featureCache.set(serviceId, { features, fetchedAt: Date.now() });
    return features;
  } catch (error) {
    console.error('[priceCalculator] No se pudieron cargar Features desde Supabase:', error);
    throw error;
  }
}

async function loadSurgeRules(): Promise<SurgeRule[]> {
  if (cachedSurgeRules && Date.now() - surgeRulesFetchedAt < PRICING_CONFIG_CACHE_TTL_MS) {
    return cachedSurgeRules;
  }

  try {
    const rows = await supabaseGet(
      'pricing_surge_rules',
      { enabled: true },
      'min_demand_supply_ratio,max_demand_supply_ratio,multiplier,priority',
      { limit: 100, requireServiceRole: true },
    );
    const rules = rows.map((row: Record<string, unknown>) => ({
      minDemandSupplyRatio: Number(row.min_demand_supply_ratio),
      maxDemandSupplyRatio: row.max_demand_supply_ratio == null ? null : Number(row.max_demand_supply_ratio),
      multiplier: Number(row.multiplier),
      priority: Number(row.priority ?? 100),
    })).filter((rule: SurgeRule) =>
      Number.isFinite(rule.minDemandSupplyRatio) &&
      Number.isFinite(rule.multiplier),
    );

    if (rules.length > 0) {
      cachedSurgeRules = rules;
      surgeRulesFetchedAt = Date.now();
      return rules;
    }
  } catch (error) {
    console.warn('[priceCalculator] No se pudieron cargar reglas Surge; usando defaults:', error);
  }

  return [...DEFAULT_SURGE_RULES];
}

const SERVICE_CACHE_TTL_MS = 60 * 1000;
const serviceCache = new Map<string, { config: ServicePricingConfig; fetchedAt: number }>();

async function fetchServiceConfig(serviceCode: string): Promise<ServicePricingConfig | null> {
  const cached = serviceCache.get(serviceCode);
  if (cached && Date.now() - cached.fetchedAt < SERVICE_CACHE_TTL_MS) {
    return cached.config;
  }

  const { supabaseGet } = await import('../supabase/rest');

  try {
    const rows = await supabaseGet(
      'services',
      { code: serviceCode },
      'id,code,commission_rate,base_price,price_per_km,price_per_minute,minimum_fare,is_active',
      { limit: 1, requireServiceRole: true },
    );

    if (!Array.isArray(rows) || !rows.length) {
      console.warn(`⚠️ Servicio ${serviceCode} no encontrado en Supabase.`);
      return null;
    }

    const row = rows[0];
    const isActive = row.is_active === null ? true : row.is_active === true || row.is_active === 't';

    if (!isActive) {
      console.warn(`⚠️ Servicio ${serviceCode} está inactivo en Supabase.`);
      return null;
    }

    const parsedValues = {
      basePrice: Number(row.base_price ?? 0),
      pricePerKm: Number(row.price_per_km ?? 0),
      pricePerMinute: Number(row.price_per_minute ?? 0),
      minimumFare: Number(row.minimum_fare ?? 0),
      commissionRate: Number(row.commission_rate ?? 0),
    };
    if (
      Object.values(parsedValues).some((value) => !Number.isFinite(value) || value < 0) ||
      parsedValues.commissionRate > 1
    ) {
      console.error(`[priceCalculator] Configuración inválida para el servicio ${serviceCode}`);
      return null;
    }

    const service: ServicePricingConfig = {
      id: row.id,
      code: row.code,
      ...parsedValues,
    };

    serviceCache.set(serviceCode, { config: service, fetchedAt: Date.now() });
    return service;
  } catch (error) {
    console.error(`❌ Error consultando servicio ${serviceCode}:`, error);
    return null;
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
  baseFare: number;
  featureCodes: string[];
  featureAdjustments: Array<{ code: string; adjustment: number }>;
  surgeMultiplier: number;
  demandSupplyRatio: number | null;
  pricingSnapshot: PricingSnapshot;
}

/**
 * Obtener multiplicador según distancia y tipo de vehículo/viaje
 */
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

/**
 * Tasa de comisión de fallback por código de servicio.
 * Último recurso cuando no se puede leer la BD: debe coincidir con
 * services.commission_rate y con los defaults del RPC get_driver_commission_rate.
 */
export function getFallbackCommissionRate(serviceCode?: string | null): number {
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

/**
 * Obtener tasa de comisión según tipo de vehículo y viaje
 * DEPRECATED: Usar getCommissionFromDatabase() en su lugar
 * Esta función se mantiene solo para compatibilidad con código legacy
 */
export function getCommissionRate(vehicleType: VehicleType, rideType: RideType): number {
  return getFallbackCommissionRate(mapRideTypeToServiceCode(vehicleType, rideType));
}

/**
 * Obtener tasa de comisión desde la base de datos
 * Usa la tabla services para obtener la comisión correcta
 */
export async function getCommissionFromDatabase(
  driverId: string,
  serviceCode: string
): Promise<number> {
  const { supabaseRpc } = await import('../supabase/rest');

  try {
    const result = await supabaseRpc('get_driver_commission_rate', {
      p_driver_uid: driverId,
      p_service_code: serviceCode,
    });

    const commissionRate = parseFloat(result);

    console.log(`💰 Comisión desde BD: ${commissionRate * 100}% (Driver: ${driverId}, Service: ${serviceCode})`);

    return commissionRate;
  } catch (error) {
    console.error('❌ Error obteniendo comisión desde BD:', error);
    return getFallbackCommissionRate(serviceCode);
  }
}

/**
 * Mapear tipo de viaje legacy a service code
 */
export function mapRideTypeToServiceCode(vehicleType: VehicleType, rideType: RideType): string {
  if (rideType === 'designated_driver') {
    return vehicleType === 'motorcycle' ? 'designated_driver_moto' : 'designated_driver_auto';
  } else if (vehicleType === 'motorcycle') {
    return 'motorcycle';
  } else {
    return 'normal';
  }
}

/**
 * Derivar código de servicio desde los campos persistidos de un ride
 * (ride_type / vehicle_type / designated_driver_vehicle). Se usa cuando
 * service_id es NULL (viajes legacy).
 */
export function serviceCodeFromRideFields(
  rideType?: string | null,
  vehicleType?: string | null,
  designatedDriverVehicle?: string | null,
): string {
  const rt = String(rideType ?? '').toLowerCase();
  const vt = String(vehicleType ?? '').toLowerCase();
  const dd = String(designatedDriverVehicle ?? '').toLowerCase();
  if (rt === 'designated_driver' || vt === 'designated_driver') {
    return dd === 'moto' || dd === 'motorcycle' ? 'designated_driver_moto' : 'designated_driver_auto';
  }
  if (vt === 'motorcycle' || vt === 'moto') return 'motorcycle';
  if (rt === 'night' || vt === 'night') return 'night';
  return 'normal';
}

/**
 * Verificar si es hora pico en Managua
 * Hora pico: 6am-8am y 5pm-8pm
 */
export function isPeakHour(date: Date = new Date()): boolean {
  const hour = date.getHours();
  return (hour >= 6 && hour < 8) || (hour >= 17 && hour < 20);
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
  id: DEFAULT_SERVICE_AREA_ID,
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

async function getServiceAreaId(lat?: number, lng?: number): Promise<string | null> {
  if (!isValidCoordinate(lat) || !isValidCoordinate(lng)) return null;
  const area = (await loadServiceAreas()).find((candidate) => isPointInServiceArea(lat, lng, candidate));
  return area?.id ?? null;
}

function toTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
    const date = Date.parse(value);
    return Number.isFinite(date) ? date : null;
  }
  return null;
}

async function readDemandSupplyRatio(serviceAreaId: string): Promise<number | null> {
  try {
    const [driversSnapshot, ridesSnapshot] = await Promise.all([
      database.ref(`driverLocationsByArea/${serviceAreaId}`).once('value'),
      database.ref(`activeRidesByArea/${serviceAreaId}`).once('value'),
    ]);
    const now = Date.now();
    const maxDriverAgeMs = 90_000;
    const maxRideAgeMs = 5 * 60_000;
    const drivers = driversSnapshot.val() ?? {};
    const rides = ridesSnapshot.val() ?? {};

    const availableDrivers = Object.values(drivers).filter((raw: any) => {
      if (raw?.status !== 'available') return false;
      const updatedAt = toTimestamp(raw.updatedAt ?? raw.lastUpdate ?? raw.timestamp);
      return updatedAt !== null && now - updatedAt >= 0 && now - updatedAt <= maxDriverAgeMs;
    }).length;

    const pendingRequests = Object.values(rides).filter((raw: any) => {
      if (!['requested', 'pending'].includes(String(raw?.status ?? '').toLowerCase())) return false;
      const createdAt = toTimestamp(raw.createdAt ?? raw.updatedAt);
      return createdAt !== null && now - createdAt >= 0 && now - createdAt <= maxRideAgeMs;
    }).length;

    return calculateSurgeRatio(pendingRequests, availableDrivers);
  } catch (error) {
    console.warn('[priceCalculator] No se pudo calcular demanda/oferta en RTDB:', error);
    return null;
  }
}

async function getDemandSupplyRatio(originLat?: number, originLng?: number): Promise<number | null> {
  const serviceAreaId = await getServiceAreaId(originLat, originLng);
  if (!serviceAreaId) return null;

  const cached = demandSupplyCache.get(serviceAreaId);
  if (cached && Date.now() - cached.fetchedAt < DEMAND_SUPPLY_CACHE_TTL_MS) {
    return cached.ratio;
  }

  const inflight = demandSupplyInflight.get(serviceAreaId);
  if (inflight) return inflight;

  const request = readDemandSupplyRatio(serviceAreaId)
    .then((ratio) => {
      demandSupplyCache.set(serviceAreaId, { ratio, fetchedAt: Date.now() });
      return ratio;
    })
    .finally(() => {
      demandSupplyInflight.delete(serviceAreaId);
    });
  demandSupplyInflight.set(serviceAreaId, request);
  return request;
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
  if (!['car', 'motorcycle'].includes(vehicleType) || !['normal', 'designated_driver'].includes(rideType)) {
    throw new RangeError('Unsupported vehicleType or rideType');
  }
  if (options.serviceCodeOverride && !PRICING_SERVICE_CODES.has(options.serviceCodeOverride)) {
    throw new RangeError('Unsupported serviceCodeOverride');
  }
  if (
    !Number.isFinite(distanceInMeters) ||
    distanceInMeters < 0 ||
    distanceInMeters > 500_000 ||
    !Number.isFinite(durationInSeconds) ||
    durationInSeconds < 0 ||
    durationInSeconds > 86_400
  ) {
    throw new RangeError('distanceInMeters or durationInSeconds is outside the allowed range');
  }
  if (
    options.extraStops !== undefined &&
    (!Number.isInteger(options.extraStops) || options.extraStops < 0 || options.extraStops > 10)
  ) {
    throw new RangeError('extraStops must be an integer between 0 and 10');
  }

  const distanceKm = distanceInMeters / 1000;
  const durationMinutes = Math.ceil(durationInSeconds / 60);
  const serviceCode = options.serviceCodeOverride ?? mapRideTypeToServiceCode(vehicleType, rideType);
  const extraStops = Math.max(options.extraStops ?? 0, 0);
  const calculationDate = options.calculationAt ?? new Date();

  let service = await fetchServiceConfig(serviceCode);

  if (!service) {
    console.warn(`⚠️ Usando fallback legacy para calcular precio de ${serviceCode}.`);
    const { multiplier } = getMultiplier(distanceKm, vehicleType, rideType);
    const fallbackBasePrice = vehicleType === 'motorcycle' && rideType !== 'designated_driver' ? 40 : 50;
    const legacyDistance = Math.max(distanceKm, 0) * multiplier;
    const baseFare = Math.max(legacyDistance + STOP_FEE * extraStops + fallbackBasePrice, 50);
    const finalLegacyPrice = roundFareToNearestFive(baseFare);
    const commissionRateLegacy = getCommissionRate(vehicleType, rideType);
    const legacyCommission = calculateCommissionAmount(finalLegacyPrice, commissionRateLegacy);
    const pricingSnapshot: PricingSnapshot = {
      serviceCode,
      featureCodes: [],
      featureAdjustments: [],
      baseFare,
      fareBeforeSurge: baseFare,
      surgeMultiplier: 1,
      demandSupplyRatio: null,
      commissionRate: commissionRateLegacy,
      commissionAmount: legacyCommission,
      finalFare: finalLegacyPrice,
      dynamicMinimumFare: calculateDynamicMinimumFare(baseFare, finalLegacyPrice, 1),
    };

    return {
      distancePrice: roundCurrency(legacyDistance),
      timePrice: 0,
      basePrice: fallbackBasePrice,
      distanceKm: parseFloat(distanceKm.toFixed(2)),
      durationMinutes,
      multiplier,
      finalPrice: finalLegacyPrice,
      breakdown:
        `⚠️ Fallback legacy activo. Distancia: ${distanceKm.toFixed(2)} km × C$${multiplier} = C$${legacyDistance.toFixed(2)}` +
        `\nTarifa calculada: C$${baseFare.toFixed(2)}` +
        `\nComisión ${(commissionRateLegacy * 100).toFixed(2)}%: C$${legacyCommission.toFixed(2)}` +
        `\nPrecio final: C$${finalLegacyPrice.toFixed(2)}`,
      isPeakHour: false,
      peakHourAdjustment: 1,
      vehicleType,
      rideType,
      commissionRate: commissionRateLegacy,
      commission: legacyCommission,
      serviceCode,
      extraStopsCharge: extraStops * STOP_FEE,
      baseFare: roundCurrency(baseFare),
      featureCodes: [],
      featureAdjustments: [],
      surgeMultiplier: 1,
      demandSupplyRatio: null,
      pricingSnapshot,
    };
  }

  const legacyMultiplier = getMultiplier(distanceKm, vehicleType, rideType).multiplier;
  const multiplier = service.pricePerKm > 0 ? service.pricePerKm : legacyMultiplier;
  const distanceComponent = Math.max(distanceKm, 0) * multiplier;
  const baseComponent = service.basePrice;
  const timePrice = Math.max(durationMinutes, 0) * Math.max(service.pricePerMinute, 0);
  const extraStopsCharge = extraStops * STOP_FEE;
  const minimumFare = Math.max(service.minimumFare ?? baseComponent, 0);
  let baseFare = Math.max(
    baseComponent + distanceComponent + timePrice + extraStopsCharge,
    minimumFare,
  );

  if (rideType === 'designated_driver') {
    const normalService = await fetchServiceConfig('normal');
    if (normalService) {
      const normalMultiplier = normalService.pricePerKm > 0
        ? normalService.pricePerKm
        : getMultiplier(distanceKm, vehicleType, 'normal').multiplier;
      const normalFare = Math.max(
        normalService.basePrice +
          Math.max(distanceKm, 0) * normalMultiplier +
          Math.max(durationMinutes, 0) * Math.max(normalService.pricePerMinute, 0) +
          extraStopsCharge,
        normalService.minimumFare ?? normalService.basePrice,
      );
      baseFare = Math.max(baseFare, normalFare * 2);
    }
  }

  const activeFeatures = await loadServiceFeatures(service.id);
  const selectedFeatureCodes = options.selectedFeatureCodes === undefined
    ? getDefaultSelectedPricingFeatureCodes(activeFeatures, calculationDate)
    : validateSelectedFeatureCodes(options.selectedFeatureCodes, activeFeatures, calculationDate);
  const requestedFeatureCodes = selectedFeatureCodes;
  const featureResult = applyPricingFeatures(baseFare, activeFeatures, calculationDate, selectedFeatureCodes);
  const fareBeforeSurge = Math.max(featureResult.fare, minimumFare);
  const demandSupplyRatio = options.skipSurge ? null : await getDemandSupplyRatio(originLat, originLng);
  const surgeMultiplier = options.skipSurge
    ? 1
    : resolveSurgeMultiplier(demandSupplyRatio, await loadSurgeRules());
  const finalFare = roundFareToNearestFive(fareBeforeSurge * surgeMultiplier);

  let commissionRate = service.commissionRate;
  if (options.driverId) {
    try {
      commissionRate = await getCommissionFromDatabase(options.driverId, serviceCode);
    } catch (error) {
      console.error('❌ Error obteniendo comisión personalizada:', error);
    }
  }

  const commission = calculateCommissionAmount(finalFare, commissionRate);
  const featureCodes = requestedFeatureCodes;
  const featureAdjustments = featureResult.features.map(({ code, adjustment }) => ({ code, adjustment }));
  const pricingSnapshot: PricingSnapshot = {
    serviceCode: service.code,
    featureCodes,
    featureAdjustments,
    baseFare: roundCurrency(baseFare),
    fareBeforeSurge: roundCurrency(fareBeforeSurge),
    surgeMultiplier,
    demandSupplyRatio,
    commissionRate,
    commissionAmount: commission,
    finalFare,
    dynamicMinimumFare: calculateDynamicMinimumFare(fareBeforeSurge, finalFare, surgeMultiplier),
  };

  const breakdownLines: string[] = [];
  breakdownLines.push(buildBreakdownLine(`Base (${service.code})`, baseComponent));
  breakdownLines.push(
    `Distancia (${distanceKm.toFixed(2)} km × C$${multiplier.toFixed(2)}): C$${distanceComponent.toFixed(2)}`,
  );
  if (timePrice > 0) {
    breakdownLines.push(
      `Tiempo (${durationMinutes} min × C$${service.pricePerMinute.toFixed(2)}): C$${timePrice.toFixed(2)}`,
    );
  }
  if (extraStops > 0) {
    breakdownLines.push(`Paradas extra (${extraStops} × C$${STOP_FEE}): C$${extraStopsCharge.toFixed(2)}`);
  }
  if (baseFare === minimumFare) {
    breakdownLines.push(`Tarifa mínima aplicada: C$${minimumFare.toFixed(2)}`);
  }
  for (const feature of featureResult.features) {
    const sign = feature.adjustment < 0 ? '-' : '+';
    breakdownLines.push(`${feature.name}: ${sign}C$${Math.abs(feature.adjustment).toFixed(2)}`);
  }
  if (demandSupplyRatio !== null) {
    breakdownLines.push(`Demanda/oferta: ${demandSupplyRatio.toFixed(2)}`);
  }
  if (surgeMultiplier > 1) {
    breakdownLines.push(`Alta demanda (×${surgeMultiplier.toFixed(2)})`);
  }
  breakdownLines.push(`Tarifa final: C$${finalFare.toFixed(2)}`);
  breakdownLines.push(`Comisión ${(commissionRate * 100).toFixed(2)}%: C$${commission.toFixed(2)}`);

  return {
    distancePrice: roundCurrency(distanceComponent),
    timePrice: roundCurrency(timePrice),
    basePrice: roundCurrency(baseComponent),
    distanceKm: parseFloat(distanceKm.toFixed(2)),
    durationMinutes,
    multiplier,
    finalPrice: finalFare,
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
    demandSupplyRatio,
    pricingSnapshot,
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
    formula: 'finalFare = roundToNearest5(max(minimum_fare, serviceFare + features) × surge); commission is deducted from finalFare',
    pricePerKmByService: {
      normal: 10,
      motorcycle: 8,
      designated_driver_auto: 13,
      designated_driver_moto: 13,
    },
    features: { night: { pricingType: 'multiplier', pricingValue: 1.1 } },
    surgeMultiplier: { minimum: 1, maximum: 1.6 },
    minimumFare: 50,
    stopFee: 20,
    currency: 'C$',
  };
}
