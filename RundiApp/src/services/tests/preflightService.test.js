jest.mock('expo-location', () => ({}));
jest.mock('../../api/platform', () => ({ getPreflightData: jest.fn(), acceptPreflightTerms: jest.fn() }));
jest.mock('../../api/rides', () => ({ getMyRides: jest.fn() }));
jest.mock('../../api/programmed', () => ({ getMyProgrammedRides: jest.fn() }));
jest.mock('../../api/payments', () => ({ getPendingPayments: jest.fn() }));
jest.mock('../../api/ratings', () => ({ getPendingRating: jest.fn() }));
jest.mock('../../live/pendingRating', () => ({ getProjectedPendingRating: jest.fn() }));
jest.mock('../../api/drivers', () => ({ getMyDriverProfile: jest.fn(), getMyVehicles: jest.fn() }));
jest.mock('../../utils/firebase/firebaseAuthReady', () => ({
  waitForFirebaseAuthUser: jest.fn(),
  requireFirebaseAuthUser: jest.fn(),
  forceRefreshIdTokenOrSignOut: jest.fn(),
  isUnauthenticatedError: () => false,
}));

const service = require('../ride/preflightService').default;
const platform = require('../../api/platform');
const rides = require('../../api/rides');
const programmed = require('../../api/programmed');
const payments = require('../../api/payments');
const ratings = require('../../api/ratings');
const projection = require('../../live/pendingRating');
const auth = require('../../utils/firebase/firebaseAuthReady');

let user;
beforeEach(() => {
  jest.resetAllMocks();
  service.clearCache();
  user = { uid: 'a' };
  auth.waitForFirebaseAuthUser.mockImplementation(async () => user);
  auth.requireFirebaseAuthUser.mockImplementation(async (uid) => {
    if (!user || user.uid !== uid) throw new Error('session changed');
    return user;
  });
  platform.getPreflightData.mockResolvedValue({ termsVersion: '1', needsTerms: false });
  rides.getMyRides.mockResolvedValue([]);
  programmed.getMyProgrammedRides.mockResolvedValue([]);
  payments.getPendingPayments.mockResolvedValue({ payments: [], totalDebt: 0 });
  ratings.getPendingRating.mockResolvedValue(null);
  projection.getProjectedPendingRating.mockResolvedValue(null);
});

const payload = { role: 'client', userId: 'a' };

test.each(['rides', 'programmed', 'payments'])('%s errors do not become empty results', async (name) => {
  const fn = { rides: rides.getMyRides, programmed: programmed.getMyProgrammedRides, payments: payments.getPendingPayments }[name];
  fn.mockRejectedValueOnce(new Error('backend failed'));
  await expect(service.fetchPreflightData(payload)).rejects.toThrow('backend failed');
  await expect(service.fetchPreflightData(payload)).resolves.toMatchObject({ userId: 'a' });
});

test('invalidation during request rejects the stale generation and the next call refetches', async () => {
  let resolve;
  rides.getMyRides.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
  const result = service.fetchPreflightData(payload);
  while (!resolve) await Promise.resolve();
  service.clearCache();
  resolve([]);
  await expect(result).rejects.toThrow('sesión');
  await expect(service.fetchPreflightData(payload)).resolves.toMatchObject({ userId: 'a' });
  expect(rides.getMyRides).toHaveBeenCalledTimes(2);
}, 10000);

test('session change during request cannot return or cache another user data', async () => {
  let resolve;
  rides.getMyRides.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
  const result = service.fetchPreflightData(payload);
  while (!resolve) await Promise.resolve();
  user = { uid: 'b' };
  resolve([]);
  await expect(result).rejects.toThrow();
  await expect(service.fetchPreflightData({ role: 'client', userId: 'b' })).resolves.toMatchObject({ userId: 'b' });
});

test('new session for same uid does not reuse cached data', async () => {
  await service.fetchPreflightData(payload);
  user = { uid: 'a' };
  await service.fetchPreflightData(payload);
  expect(rides.getMyRides).toHaveBeenCalledTimes(2);
});

test('uses current Firestore projection and falls back to SQL when it is stale', async () => {
  const current = { rideId: 'ride', version: 2, status: 'pending', captainRated: true };
  ratings.getPendingRating.mockResolvedValue(current);
  projection.getProjectedPendingRating.mockResolvedValue({ ...current, version: 1, captainRated: false });
  await expect(service.fetchPreflightData(payload)).resolves.toMatchObject({ pendingRating: current });
  projection.getProjectedPendingRating.mockResolvedValue({ ...current, projected: true });
  await expect(service.fetchPreflightData(payload)).resolves.toMatchObject({ pendingRating: { projected: true } });
});

test('a stale pending projection cannot reopen a completed SQL decision', async () => {
  ratings.getPendingRating.mockResolvedValue({ rideId: 'ride', version: 2, status: 'skipped' });
  projection.getProjectedPendingRating.mockResolvedValue({ rideId: 'ride', version: 1, status: 'pending' });
  await expect(service.fetchPreflightData(payload)).resolves.toMatchObject({ pendingRating: null });
});

test('rating query errors do not silently discard a pending action', async () => {
  ratings.getPendingRating.mockRejectedValueOnce(new Error('backend failed'));
  await expect(service.fetchPreflightData(payload)).rejects.toThrow('backend failed');
});

test('rechecks payment and active ride before showing the pending rating', async () => {
  const rating = { rideId: 'ride', status: 'pending' };
  ratings.getPendingRating.mockResolvedValue(rating);
  await expect(service.refreshClientPendingRating()).resolves.toEqual(rating);
  payments.getPendingPayments.mockResolvedValue({ payments: [{ rideId: 'ride' }], totalDebt: 10 });
  await expect(service.refreshClientPendingRating()).resolves.toBeNull();
  payments.getPendingPayments.mockResolvedValue({ payments: [], totalDebt: 0 });
  rides.getMyRides.mockResolvedValue([{ status: 'in_progress' }]);
  await expect(service.refreshClientPendingRating()).resolves.toBeNull();
});
