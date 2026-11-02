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
  finalPrice: number;
  commissionRate: number;
  commission: number;
  serviceCode: string;
  serviceId?: string;
  extraStopsCharge: number;
  baseFare: number;
  featureCodes: string[];
  surgeMultiplier: number;
  isFallback: boolean;
  pricingSnapshot: PricingSnapshot;
}

/** Estimación de tarifa (una variante). */
export async function calculateRidePrice(body: CalculatePriceRequest): Promise<PriceResult> {
  const { data } = await client.post<PriceResult>('/pricing/calculate', body);
  return data;
}

/** Estimación para ambas variantes de vehículo. */
export async function calculateRidePriceVariants(
  body: Omit<CalculatePriceRequest, 'vehicleType'>,
): Promise<{ car?: PriceResult; motorcycle?: PriceResult }> {
  const { data } = await client.post('/pricing/calculate-variants', body);
  return data;
}
