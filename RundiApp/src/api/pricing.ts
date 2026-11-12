/**
 * API v2 — pricing (internal/pricing del backend Go).
 * Reemplaza calculateRidePrice(s)Http de v1: Service + Features + Surge, C$.
 */

import client from './client';

export interface CalculatePriceRequest {
  distanceMeters: number;
  durationSeconds: number;
  vehicleType: 'car' | 'motorcycle' | 'auto' | 'moto';
  rideType: 'normal' | 'designated_driver';
  originLat?: number;
  originLng?: number;
  serviceCodeOverride?: string;
  extraStops?: number;
  skipSurge?: boolean;
  selectedFeatureCodes?: string[];
  driverId?: string;
  calculationAt?: string;
}

export interface AppliedFeature {
  code: string;
  name: string;
  adjustment: number;
  pricingType: 'none' | 'surcharge' | 'discount' | 'multiplier';
}

export interface PricingSnapshot {
  serviceCode: string;
  featureCodes: string[];
  featureAdjustments: AppliedFeature[];
  baseFare: number;
  fareBeforeSurge: number;
  surgeMultiplier: number;
  peakHourMultiplier: number;
  isPeakHour: boolean;
  demandSupplyRatio: number | null;
  commissionRate: number;
  commissionAmount: number;
  finalFare: number;
  dynamicMinimumFare: number;
}

export interface PriceResult {
  distanceKm: number;
  durationMinutes: number;
  multiplier: number;
  distancePrice?: number;
  finalPrice: number;
  commissionRate: number;
  commission: number;
  serviceCode: string;
  serviceId?: string;
  extraStopsCharge: number;
  baseFare: number;
  featureCodes: string[];
  surgeMultiplier: number;
  peakHourMultiplier: number;
  isPeakHour: boolean;
  isFallback: boolean;
  pricingSnapshot: PricingSnapshot;
}

/** Estimación de tarifa (una variante). */
export async function calculateRidePrice(body: CalculatePriceRequest): Promise<PriceResult> {
  const { data } = await client.post<PriceResult>('/pricing/calculate', body);
  return data;
}

export interface PriceVariantRequest {
  key: string;
  vehicleType: 'car' | 'motorcycle';
  rideType: 'normal' | 'designated_driver';
  serviceCodeOverride?: string;
  selectedFeatureCodes?: string[];
}

export type VariantsPriceResponse = Record<string, PriceResult | { error?: string } | undefined>;

/**
 * Estimación para variantes de vehículo. Con `variants` cada item lleva su
 * rideType/serviceCode/features propios y la respuesta viene keyed; sin ellos
 * el backend responde el formato legado {car, motorcycle}.
 */
export async function calculateRidePriceVariants(
  body: Omit<CalculatePriceRequest, 'vehicleType' | 'rideType' | 'serviceCodeOverride' | 'selectedFeatureCodes'> & {
    rideType?: CalculatePriceRequest['rideType'];
    serviceCodeOverride?: string;
    selectedFeatureCodes?: string[];
    variants?: PriceVariantRequest[];
  },
): Promise<VariantsPriceResponse> {
  const { data } = await client.post('/pricing/calculate-variants', body);
  return data;
}
