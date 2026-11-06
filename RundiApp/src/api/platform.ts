/**
 * API v2 — plataforma: analytics, biometría, códigos SMS, disponibilidad
 * de región, preflight/términos y tokens de compartir viaje.
 */

import client from './client';

export async function getPremiumEligibleDrivers(driverIds: string[]): Promise<string[]> {
  const batches: string[][] = [];
  for (let i = 0; i < driverIds.length; i += 200) batches.push(driverIds.slice(i, i + 200));
  const results = await Promise.all(batches.map(async (ids) =>
    (await client.post<{ driverIds: string[] }>('/platform/drivers/premium-eligibility', { driverIds: ids })).data.driverIds,
  ));
  return results.flat();
}

export async function trackEvent(
  eventType: string,
  data?: Record<string, unknown>,
  platform?: string,
  appVersion?: string,
): Promise<void> {
  await client.post('/platform/analytics/events', { eventType, data, platform, appVersion });
}

export interface LogBiometricInput {
  userType: string;
  biometricType: string;
  context: string;
  success: boolean;
  attempt?: number;
  error?: string;
  rideId?: string;
}

export async function logBiometric(input: LogBiometricInput): Promise<void> {
  await client.post('/platform/biometric/log', input);
}

export async function logSmsCode(
  code: string,
  opts: { phone?: string; email?: string; context?: string; rideId?: string },
): Promise<void> {
  await client.post('/platform/sms-codes', { code, ...opts });
}

export async function verifySmsCode(code: string): Promise<boolean> {
  const { data } = await client.post<{ verified: boolean }>('/platform/sms-codes/verify', { code });
  return data.verified;
}

export interface RegionAvailability {
  available: boolean;
  areaId?: string;
  areaName?: string;
  isFallback?: boolean;
}

export async function checkRegionAvailability(lat: number, lng: number): Promise<RegionAvailability> {
  const { data } = await client.get<RegionAvailability>('/platform/region/availability', {
    params: { lat, lng },
  });
  return data;
}

export interface PreflightData {
  termsVersion: string;
  needsTerms: boolean;
  acceptedVersion: string;
}

export interface RegionAvailability {
  available: boolean;
  areaId?: string;
  areaName?: string;
}

/** GET /v1/platform/region/availability — checkRegionAvailability v1. */
export async function getRegionAvailability(lat: number, lng: number): Promise<RegionAvailability> {
  const { data } = await client.get<RegionAvailability>('/platform/region/availability', {
    params: { lat, lng },
  });
  return data;
}

export async function getPreflightData(): Promise<PreflightData> {
  const { data } = await client.get<PreflightData>('/platform/preflight');
  return data;
}

export async function acceptPreflightTerms(): Promise<void> {
  await client.post('/platform/preflight/accept-terms');
}

export async function createRideShareToken(
  rideId: string,
  ttlHours = 24,
): Promise<{ token: string; expiresAt: number }> {
  const { data } = await client.post<{ token: string; expiresAt: number }>(
    `/platform/rides/${rideId}/share`,
    { ttlHours },
  );
  return data;
}

/** GET /v1/platform/sms-codes/verified-phone — hasVerifiedRegisterPhoneLog v1. */
export async function hasVerifiedRegisterPhone(
  phone?: string,
  userId?: string,
): Promise<boolean> {
  const { data } = await client.get<{ hasVerified: boolean }>(
    '/platform/sms-codes/verified-phone',
    { params: { phone, userId } },
  );
  return data.hasVerified;
}

/** Historiales propios (getUserBiometricAuthsSeq/SmsCodesSeq/AnalyticsEventsSeq v1). */
export async function getMyBiometricAuths(limit = 50): Promise<Record<string, unknown>[]> {
  const { data } = await client.get<{ items: Record<string, unknown>[] }>(
    '/platform/biometric/mine',
    { params: { limit } },
  );
  return data.items;
}

export async function getMySmsCodes(limit = 50): Promise<Record<string, unknown>[]> {
  const { data } = await client.get<{ items: Record<string, unknown>[] }>(
    '/platform/sms-codes/mine',
    { params: { limit } },
  );
  return data.items;
}

export async function getMyAnalyticsEvents(limit = 50): Promise<Record<string, unknown>[]> {
  const { data } = await client.get<{ items: Record<string, unknown>[] }>(
    '/platform/analytics/mine',
    { params: { limit } },
  );
  return data.items;
}
