import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import preflightService from '../ride/preflightService';
import { getPreflightData, getRegionAvailability } from '../../api/platform';
import { getMyRides } from '../../api/rides';
import { getMyProgrammedRides } from '../../api/programmed';
import { getPendingPayments } from '../../api/payments';
import { getMyDriverProfile, getMyVehicles } from '../../api/drivers';
import { requireFirebaseAuthUser, waitForFirebaseAuthUser } from '../../utils/firebase/firebaseAuthReady';

jest.mock('../../api/platform', () => ({ getPreflightData: jest.fn(), getRegionAvailability: jest.fn(), acceptPreflightTerms: jest.fn() }));
jest.mock('../../api/rides', () => ({ getMyRides: jest.fn() }));
jest.mock('../../api/programmed', () => ({ getMyProgrammedRides: jest.fn() }));
jest.mock('../../api/payments', () => ({ getPendingPayments: jest.fn() }));
jest.mock('../../api/drivers', () => ({ getMyDriverProfile: jest.fn(), getMyVehicles: jest.fn() }));
jest.mock('../../utils/firebase/firebaseAuthReady', () => ({
  waitForFirebaseAuthUser: jest.fn(),
  requireFirebaseAuthUser: jest.fn(),
  forceRefreshIdTokenOrSignOut: jest.fn(),
  isUnauthenticatedError: jest.fn(() => false),
}));

const terms = jest.mocked(getPreflightData);
const region = jest.mocked(getRegionAvailability);
const rides = jest.mocked(getMyRides);
const programmed = jest.mocked(getMyProgrammedRides);
const payments = jest.mocked(getPendingPayments);
const profile = jest.mocked(getMyDriverProfile);
const vehicles = jest.mocked(getMyVehicles);
const waitUser = jest.mocked(waitForFirebaseAuthUser);
const currentUser = jest.mocked(requireFirebaseAuthUser);
const user = { uid: 'u1' } as any;
const payload = { role: 'client' as const, userId: 'u1' };

beforeEach(() => {
  jest.resetAllMocks();
  preflightService.clearCache();
  waitUser.mockResolvedValue(user);
  currentUser.mockResolvedValue(user);
  terms.mockResolvedValue({ termsVersion: 'v1', acceptedVersion: 'v1', needsTerms: false });
  rides.mockResolvedValue([]);
  programmed.mockResolvedValue([]);
  payments.mockResolvedValue({ payments: [], totalDebt: 0 });
  profile.mockResolvedValue({ accountStatus: 'active', documentsStatus: 'verified', rechargeBalance: 10 } as any);
  vehicles.mockResolvedValue([]);
  region.mockResolvedValue({ available: true, areaId: 'real-area' });
});

describe('preflight data', () => {
  it('combines current rides, payments, terms and backend region', async () => {
    rides.mockResolvedValue([{ id: 'r1', status: 'accepted' } as any]);
    payments.mockResolvedValue({ payments: [{ rideId: 'r2', total: 7 } as any], totalDebt: 7 });
    const result = await preflightService.fetchPreflightData({ ...payload, location: { lat: 12, lng: -86 } });
    expect(result.activeRide?.rideId).toBe('r1');
    expect(result.pendingPayments?.amount).toBe(7);
    expect(result.terms?.acceptedAllDocuments).toBe(true);
    expect(result.region).toMatchObject({ allowed: true, serviceAreaId: 'real-area', latitude: 12 });
  });

  it('shares only in-flight account data while checking each location independently', async () => {
    let resolveTerms!: (value: any) => void;
    terms.mockImplementation(() => new Promise((resolve) => { resolveTerms = resolve; }));
    region.mockImplementation(async (lat) => ({ available: lat === 1, areaId: String(lat) }));
    const first = preflightService.fetchPreflightData({ ...payload, location: { lat: 1, lng: 2 } });
    const second = preflightService.fetchPreflightData({ ...payload, location: { lat: 3, lng: 4 } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(terms).toHaveBeenCalledTimes(1);
    expect(region).toHaveBeenCalledTimes(2);
    resolveTerms({ termsVersion: 'v1', acceptedVersion: 'v1', needsTerms: false });
    const [a, b] = await Promise.all([first, second]);
    expect(a.region?.serviceAreaId).toBe('1');
    expect(b.region?.allowed).toBe(false);
    terms.mockResolvedValue({ termsVersion: 'v1', acceptedVersion: 'v1', needsTerms: false });
    await preflightService.fetchPreflightData(payload);
    expect(terms).toHaveBeenCalledTimes(2);
  });

  it('propagates critical failures instead of treating them as empty', async () => {
    payments.mockRejectedValue(new Error('network'));
    await expect(preflightService.fetchPreflightData(payload)).rejects.toThrow('network');
    expect(terms).toHaveBeenCalledTimes(1);
  });

  it('propagates region and vehicle failures', async () => {
    region.mockRejectedValueOnce(new Error('region unavailable'));
    await expect(preflightService.fetchPreflightData({ ...payload, location: { lat: 1, lng: 2 } }))
      .rejects.toThrow('region unavailable');
    vehicles.mockRejectedValueOnce(new Error('vehicles unavailable'));
    await expect(preflightService.fetchPreflightData({ role: 'driver', userId: 'u1' }))
      .rejects.toThrow('vehicles unavailable');
  });

  it('rejects a result after session invalidation', async () => {
    let resolveTerms!: (value: any) => void;
    terms.mockImplementation(() => new Promise((resolve) => { resolveTerms = resolve; }));
    const pending = preflightService.fetchPreflightData(payload);
    await new Promise((resolve) => setTimeout(resolve, 0));
    preflightService.clearCache();
    resolveTerms({ termsVersion: 'v1', acceptedVersion: 'v1', needsTerms: false });
    await expect(pending).rejects.toThrow('sesión cambió');
  });

  it('rejects an old user result when the authenticated user changes', async () => {
    let resolveTerms!: (value: any) => void;
    terms.mockImplementation(() => new Promise((resolve) => { resolveTerms = resolve; }));
    const pending = preflightService.fetchPreflightData(payload);
    await new Promise((resolve) => setTimeout(resolve, 0));
    currentUser.mockResolvedValue({ uid: 'u2' } as any);
    resolveTerms({ termsVersion: 'v1', acceptedVersion: 'v1', needsTerms: false });
    await expect(pending).rejects.toThrow('sesión cambió');
  });

  it('prompts a driver for an assigned ride confirmed by the client', async () => {
    programmed.mockResolvedValue([{ id: 'p1', status: 'client_confirmed', driverId: 'u1', driverConfirmed: false } as any]);
    const result = await preflightService.fetchPreflightData({ role: 'driver', userId: 'u1' });
    expect(result.programmedRide?.rideId).toBe('p1');
  });
});
