/**
 * Calculadora de precios para viajes - Frontend
 * DriveAngel.ni
 * 
 * Replica la lógica del backend para mostrar precios en tiempo real
 */

export type VehicleType = 'car' | 'motorcycle';
export type RideType = 'normal' | 'designated_driver';

export interface ServicePricingConfig {
  code: string;
  basePrice: number;
  pricePerKm: number;
  pricePerMinute: number;
  minimumFare: number;
  commissionRate: number;
}

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
  serviceCode: string;
}

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
  night: {
    code: 'night',
    basePrice: 40,
    pricePerKm: 12,
    pricePerMinute: 0,
    minimumFare: 40,
    commissionRate: 0.12,
  },
};

const serviceConfigCache: Map<string, ServicePricingConfig> = new Map();

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
    console.warn('⚠️ REST pricing habilitado pero faltan credenciales de Supabase');
    return null;
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/services?select=code,base_price,price_per_km,price_per_minute,minimum_fare,commission_rate&code=eq.${serviceCode}&is_active=eq.true`,
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
        code: matched.code ?? serviceCode,
        basePrice: matched.basePrice ?? DEFAULT_SERVICE_CONFIGS[serviceCode]?.basePrice ?? 0,
        pricePerKm: matched.pricePerKm ?? DEFAULT_SERVICE_CONFIGS[serviceCode]?.pricePerKm ?? 0,
        pricePerMinute: matched.pricePerMinute ?? DEFAULT_SERVICE_CONFIGS[serviceCode]?.pricePerMinute ?? 0,
        minimumFare: DEFAULT_SERVICE_CONFIGS[serviceCode]?.minimumFare ?? 0,
        commissionRate: matched.commissionRate,
      };
    }
  } catch (error) {
    console.warn('⚠️ Error consultando getServices callable:', error);
  }

  return null;
}

/**
 * Obtener config de servicio desde cache → REST → callable → fallback local.
 */
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
    console.warn(`⚠️ REST falló para servicio ${serviceCode}:`, error);
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

function calculateSubtotal(
  service: ServicePricingConfig,
  distanceKm: number,
  durationMinutes: number
) {
  const distanceComponent = distanceKm * service.pricePerKm;
  const timeComponent = durationMinutes * service.pricePerMinute;
  const subtotal = service.basePrice + distanceComponent + timeComponent;
  const subtotalWithMinimum = Math.max(subtotal, service.minimumFare);

  return { distanceComponent, timeComponent, subtotalWithMinimum };
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
  const MANAGUA_BOUNDS = {
    north: 12.20,
    south: 12.05,
    east: -86.15,
    west: -86.35,
  };

  return (
    lat >= MANAGUA_BOUNDS.south &&
    lat <= MANAGUA_BOUNDS.north &&
    lng >= MANAGUA_BOUNDS.west &&
    lng <= MANAGUA_BOUNDS.east
  );
}

/**
 * Calcular el precio total del viaje
 */
export async function calculateRidePrice(
  distanceInMeters: number,
  durationInSeconds: number,
  vehicleType: VehicleType = 'car',
  rideType: RideType = 'normal',
  originLat?: number,
  originLng?: number,
  extraStops: number = 0
): Promise<PriceBreakdown> {
  const distanceKm = distanceInMeters / 1000;
  const durationMinutes = Math.ceil(durationInSeconds / 60);

  const serviceCode =
    rideType === 'designated_driver'
      ? 'designated_driver'
      : vehicleType === 'motorcycle'
      ? 'motorcycle'
      : 'normal';

  const service = await fetchServiceConfig(serviceCode);
  const { distanceComponent, timeComponent, subtotalWithMinimum } = calculateSubtotal(
    service,
    distanceKm,
    durationMinutes
  );

  // Ajustes por hora pico
  const peak = isPeakHour();
  const inManagua = originLat && originLng ? isInManagua(originLat, originLng) : false;
  const peakMultiplier = peak && inManagua ? 1.2 : 1;
  const adjustedSubtotal = subtotalWithMinimum * peakMultiplier;

  // Costo por paradas extras
  const extraStopsCharge = extraStops * 20;

  // Precio final
  const finalPrice = adjustedSubtotal + extraStopsCharge;
  const commission = finalPrice * service.commissionRate;

  return {
    distancePrice: distanceComponent,
    timePrice: timeComponent,
    basePrice: service.basePrice,
    distanceKm,
    durationMinutes,
    multiplier: service.pricePerKm,
    finalPrice: Number(finalPrice.toFixed(2)),
    isPeakHour: peak,
    peakHourAdjustment: peakMultiplier,
    vehicleType,
    rideType,
    commissionRate: service.commissionRate,
    commission: Number(commission.toFixed(2)),
    extraStopsCharge,
    serviceCode,
  };
}

/**
 * Formatear desglose de precios
 */
export function formatPriceBreakdown(breakdown: PriceBreakdown): string {
  let text = `📏 Distancia: ${breakdown.distanceKm.toFixed(2)} km × C$${breakdown.multiplier} = C$${breakdown.distancePrice.toFixed(2)}\n`;
  text += `💰 Total: C$${breakdown.finalPrice.toFixed(2)}`;
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
