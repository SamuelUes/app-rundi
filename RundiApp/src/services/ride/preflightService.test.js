jest.mock('expo-location', () => ({}));
jest.mock('../../api/platform', () => ({ getPreflightData: jest.fn(), acceptPreflightTerms: jest.fn() }));
jest.mock('../../api/rides', () => ({ getMyRides: jest.fn() }));
jest.mock('../../api/programmed', () => ({ getMyProgrammedRides: jest.fn() }));
jest.mock('../../api/payments', () => ({ getPendingPayments: jest.fn() }));
jest.mock('../../api/drivers', () => ({ getMyDriverProfile: jest.fn(), getMyVehicles: jest.fn() }));
jest.mock('../../utils/firebase/firebaseAuthReady', () => ({
  waitForFirebaseAuthUser: jest.fn(),
  requireFirebaseAuthUser: jest.fn(),
  forceRefreshIdTokenOrSignOut: jest.fn(),
  isUnauthenticatedError: () => false,
}));

const service = require('./preflightService').default;
const platform = require('../../api/platform');
const rides = require('../../api/rides');
const programmed = require('../../api/programmed');
const payments = require('../../api/payments');
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
