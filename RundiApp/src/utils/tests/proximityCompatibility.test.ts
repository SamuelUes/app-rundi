import { getDocFromServer, getDocsFromServer } from 'firebase/firestore';
import ridesService from '../../services/ride/ridesService';
import { cancelProximitySequence, getNearbyRides, handleLocationForProximity, scheduleNextProximityRide, setOverlayEnabled } from '../../services/ride/proximityService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigate, navigationRef } from '../../navigation/NavigationService';
import { AppState } from 'react-native';
import { overlayManager } from '../../native/overlay';
import driverAvailabilityService from '../../services/driver/driverAvailabilityService';

jest.mock('@react-native-async-storage/async-storage', () => {
  const values: Record<string, string> = {};
  return { __esModule: true, default: {
    getItem: jest.fn(async (key: string) => values[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values[key] = value; }),
    removeItem: jest.fn(async (key: string) => { delete values[key]; }),
  } };
});
jest.mock('expo-location', () => ({}));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db, ...path) => path.join('/')),
  getDocFromServer: jest.fn(),
  collection: jest.fn(),
  getDocsFromServer: jest.fn(async () => ({ docs: [] })),
  query: jest.fn(),
  where: jest.fn(),
  limit: jest.fn(),
}));
jest.mock('../../config/firebase', () => ({
  getFirebaseFirestore: jest.fn(async () => ({})),
  getFirebaseAuth: jest.fn(async () => ({ currentUser: { uid: 'driver', getIdToken: async () => 'token' } })),
}));
jest.mock('../../services/driver/driverAvailabilityService', () => ({
  __esModule: true,
  default: { getAvailabilityState: jest.fn(async () => ({ isAvailable: true, isDesignatedDriverMode: false })) },
}));
jest.mock('../../services/ride/ridesService', () => ({
  __esModule: true,
  default: { getAvailableRides: jest.fn() },
  normalizeVehicleTypeForMatching: (type: string) => type === 'moto' ? 'moto' : type ? 'auto' : null,
  extractRideVehicleTypeForMatching: (ride: any) => ride.vehicleType === 'moto' ? 'moto' : 'auto',
}));
jest.mock('../../services/notification/notificationService', () => ({ __esModule: true, default: { showManagedNotification: jest.fn(async () => {}) } }));
jest.mock('../../navigation/NavigationService', () => ({
  navigate: jest.fn(),
  navigationRef: { isReady: () => true, getCurrentRoute: jest.fn(() => ({ name: 'DriverHome', key: 'home' })) },
}));
jest.mock('../../native/overlay', () => ({ overlayManager: {
  hasPermission: jest.fn(async () => true),
  showRideOverlay: jest.fn(async () => {}),
  hideOverlay: jest.fn(async () => {}),
  bringAppToFront: jest.fn(async () => false),
} }));
jest.mock('../../api/rides', () => ({ notifyProximityRide: jest.fn() }));

test('proximity filters incompatible features before selecting the closest rides', async () => {
  (getDocFromServer as jest.Mock).mockImplementation(async (path: string) => ({
    data: () => path.includes('/vehicles/active')
      ? { vehicleId: 'vehicle', type: 'sedan' }
      : { features: ['pet_friendly'] },
  }));
  const base = {
    rideType: 'normal', vehicleType: 'auto', serviceCode: 'normal',
    origin: { latitude: 12, longitude: -86 }, destination: { latitude: 12, longitude: -86 },
  };
  (ridesService.getAvailableRides as jest.Mock).mockResolvedValue([
    { ...base, id: 'senior', featureCodes: ['senior'] },
    { ...base, id: 'premium', featureCodes: ['premium'] },
    { ...base, id: 'pets', featureCodes: ['pet_friendly'] },
  ]);
  const rides = await getNearbyRides(12, -86, 500, 1, 'driver');
  expect(rides.map((ride) => ride.id)).toEqual(['pets']);
  expect(rides[0].featureCodes).toEqual(['pet_friendly']);
});

test('a stalled server read releases the proximity check for a later retry', async () => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  (AppState as any).currentState = 'background';
  await AsyncStorage.removeItem('proximity:lastCheckAt');
  await AsyncStorage.removeItem('proximity:suppressionUntil');
  (getDocFromServer as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));
  const first = handleLocationForProximity('driver', 12, -86);
  await jest.advanceTimersByTimeAsync(10000);
  await first;

  (getDocFromServer as jest.Mock).mockImplementation(async (path: string) => ({
    data: () => path.includes('/vehicles/active')
      ? { vehicleId: 'vehicle', type: 'sedan' }
      : path.includes('REALTIME_drivers_live') ? { status: 'online' } : { features: [] },
  }));
  (getDocsFromServer as jest.Mock).mockResolvedValue({ docs: [] });
  (ridesService.getAvailableRides as jest.Mock).mockResolvedValue([]);
  await jest.advanceTimersByTimeAsync(15000);
  await handleLocationForProximity('driver', 12, -86);
  expect(ridesService.getAvailableRides).toHaveBeenCalledTimes(1);
  cancelProximitySequence();
  jest.clearAllTimers();
  jest.useRealTimers();
  await AsyncStorage.removeItem('proximity:lastCheckAt');
});

test('after a two second pause refreshes the server and advances past omitted rides', async () => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  (AppState as any).currentState = 'active';
  (getDocFromServer as jest.Mock).mockImplementation(async (path: string) => ({
    data: () => path.includes('/vehicles/active')
      ? { vehicleId: 'vehicle', type: 'sedan' }
      : path.includes('REALTIME_drivers_live') ? { status: 'online' } : { features: ['pet_friendly'] },
  }));
  const base = {
    rideType: 'normal', vehicleType: 'auto', serviceCode: 'normal', featureCodes: [],
    origin: { latitude: 12, longitude: -86 }, destination: { latitude: 12, longitude: -86 },
  };
  (ridesService.getAvailableRides as jest.Mock)
    .mockResolvedValueOnce([{ ...base, id: 'first', requestedAt: 1 }, { ...base, id: 'second', requestedAt: 2 }])
    .mockResolvedValueOnce([{ ...base, id: 'second', requestedAt: 2 }]);
  await handleLocationForProximity('driver', 12, -86);
  expect(navigate).toHaveBeenCalledWith('RidePreview', expect.objectContaining({ ride: expect.objectContaining({ id: 'first' }) }));
  scheduleNextProximityRide('first');
  await jest.advanceTimersByTimeAsync(1999);
  expect(ridesService.getAvailableRides).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1);
  expect(ridesService.getAvailableRides).toHaveBeenCalledTimes(2);
  expect(navigate).toHaveBeenLastCalledWith('RidePreview', expect.objectContaining({ ride: expect.objectContaining({ id: 'second' }) }));
  expect(ridesService.getAvailableRides).toHaveBeenLastCalledWith(12, -86, 0.5, undefined, true);
  cancelProximitySequence();
  jest.clearAllTimers();
  jest.useRealTimers();
  await AsyncStorage.removeItem('proximity:lastCheckAt');
});

test('background overlay shows a ride for five seconds then revalidates after two seconds', async () => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  (AppState as any).currentState = 'background';
  await AsyncStorage.removeItem('proximity:lastCheckAt');
  await AsyncStorage.removeItem('proximity:suppressionUntil');
  await AsyncStorage.removeItem('proximity:lastOverlayPayload');
  await setOverlayEnabled(true);
  (getDocFromServer as jest.Mock).mockImplementation(async (path: string) => ({
    data: () => path.includes('/vehicles/active')
      ? { vehicleId: 'vehicle', type: 'sedan' }
      : path.includes('REALTIME_drivers_live') ? { status: 'online' } : { features: ['pet_friendly'] },
  }));
  const base = {
    rideType: 'normal', vehicleType: 'auto', serviceCode: 'normal', featureCodes: [],
    origin: { latitude: 12, longitude: -86, address: 'Origen' },
    destination: { latitude: 12, longitude: -86 },
  };
  (ridesService.getAvailableRides as jest.Mock)
    .mockResolvedValueOnce([{ ...base, id: 'first', requestedAt: 1, featureCodes: ['pet_friendly'] }, { ...base, id: 'second', requestedAt: 2 }])
    .mockResolvedValueOnce([{ ...base, id: 'second', requestedAt: 2 }]);
  await handleLocationForProximity('driver', 12, -86);
  expect(overlayManager.showRideOverlay).toHaveBeenLastCalledWith(expect.objectContaining({ rideId: 'first', featureCodes: ['pet_friendly'] }));
  await jest.advanceTimersByTimeAsync(5000);
  expect(overlayManager.showRideOverlay).toHaveBeenLastCalledWith(expect.objectContaining({ rideId: '__overlay_home__' }));
  expect(ridesService.getAvailableRides).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(2000);
  expect(ridesService.getAvailableRides).toHaveBeenCalledTimes(2);
  expect(overlayManager.showRideOverlay).toHaveBeenLastCalledWith(expect.objectContaining({ rideId: 'second', featureCodes: [] }));
  cancelProximitySequence();
  jest.clearAllTimers();
  jest.useRealTimers();
  await setOverlayEnabled(false);
  await AsyncStorage.removeItem('proximity:lastCheckAt');
  await AsyncStorage.removeItem('proximity:suppressionUntil');
});

test('does not let three dismissed rides hide the fourth eligible ride', async () => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  (AppState as any).currentState = 'active';
  await AsyncStorage.removeItem('proximity:lastCheckAt');
  await AsyncStorage.removeItem('proximity:suppressionUntil');
  await AsyncStorage.setItem('proximity:dismissedRides', JSON.stringify({
    a: Date.now(), b: Date.now(), c: Date.now(),
  }));
  (getDocFromServer as jest.Mock).mockImplementation(async (path: string) => ({
    data: () => path.includes('/vehicles/active')
      ? { vehicleId: 'vehicle', type: 'sedan' }
      : path.includes('REALTIME_drivers_live') ? { status: 'online' } : { features: [] },
  }));
  const base = {
    rideType: 'normal', vehicleType: 'auto', serviceCode: 'normal', featureCodes: [],
    origin: { latitude: 12, longitude: -86 }, destination: { latitude: 12, longitude: -86 },
  };
  (ridesService.getAvailableRides as jest.Mock).mockResolvedValue(
    ['a', 'b', 'c', 'd'].map((id, index) => ({ ...base, id, requestedAt: index + 1 })),
  );
  await handleLocationForProximity('driver', 12, -86);
  expect(navigate).toHaveBeenCalledWith('RidePreview', expect.objectContaining({ ride: expect.objectContaining({ id: 'd' }) }));
  cancelProximitySequence();
  jest.clearAllTimers();
  jest.useRealTimers();
  await AsyncStorage.removeItem('proximity:dismissedRides');
  await AsyncStorage.removeItem('proximity:lastCheckAt');
});

test('does not advance using stale data when server revalidation fails', async () => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  (AppState as any).currentState = 'active';
  await AsyncStorage.removeItem('proximity:lastCheckAt');
  await AsyncStorage.removeItem('proximity:suppressionUntil');
  (getDocFromServer as jest.Mock).mockImplementation(async (path: string) => ({
    data: () => path.includes('/vehicles/active')
      ? { vehicleId: 'vehicle', type: 'sedan' }
      : path.includes('REALTIME_drivers_live') ? { status: 'online' } : { features: [] },
  }));
  const base = {
    rideType: 'normal', vehicleType: 'auto', serviceCode: 'normal', featureCodes: [],
    origin: { latitude: 12, longitude: -86 }, destination: { latitude: 12, longitude: -86 },
  };
  (ridesService.getAvailableRides as jest.Mock)
    .mockResolvedValueOnce([{ ...base, id: 'first' }, { ...base, id: 'second' }])
    .mockRejectedValueOnce(new Error('offline'));
  await handleLocationForProximity('driver', 12, -86);
  scheduleNextProximityRide('first');
  await jest.advanceTimersByTimeAsync(2000);
  expect(ridesService.getAvailableRides).toHaveBeenCalledTimes(2);
  expect(navigate).toHaveBeenCalledTimes(1);
  cancelProximitySequence();
  jest.clearAllTimers();
  jest.useRealTimers();
  await AsyncStorage.removeItem('proximity:lastCheckAt');
});

test('stops the sequence if the driver goes offline during the pause', async () => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  (AppState as any).currentState = 'active';
  await AsyncStorage.removeItem('proximity:lastCheckAt');
  await AsyncStorage.removeItem('proximity:suppressionUntil');
  await AsyncStorage.removeItem('proximity:lastRideId');
  await AsyncStorage.removeItem('proximity:lastShownAt');
  (driverAvailabilityService.getAvailabilityState as jest.Mock).mockResolvedValue({ isAvailable: true, isDesignatedDriverMode: false });
  (getDocFromServer as jest.Mock).mockImplementation(async (path: string) => ({
    data: () => path.includes('/vehicles/active')
      ? { vehicleId: 'vehicle', type: 'sedan' }
      : path.includes('REALTIME_drivers_live') ? { status: 'online' } : { features: [] },
  }));
  const base = {
    rideType: 'normal', vehicleType: 'auto', serviceCode: 'normal', featureCodes: [],
    origin: { latitude: 12, longitude: -86 }, destination: { latitude: 12, longitude: -86 },
  };
  (ridesService.getAvailableRides as jest.Mock).mockResolvedValue([{ ...base, id: 'first' }, { ...base, id: 'second' }]);
  await handleLocationForProximity('driver', 12, -86);
  scheduleNextProximityRide('first');
  (driverAvailabilityService.getAvailabilityState as jest.Mock).mockResolvedValue({ isAvailable: false });
  await jest.advanceTimersByTimeAsync(2000);
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(ridesService.getAvailableRides).toHaveBeenCalledTimes(1);
  cancelProximitySequence();
  jest.clearAllTimers();
  jest.useRealTimers();
  (driverAvailabilityService.getAvailabilityState as jest.Mock).mockResolvedValue({ isAvailable: true, isDesignatedDriverMode: false });
  await AsyncStorage.removeItem('proximity:lastCheckAt');
});

test('does not show another request when a ride was assigned during the pause', async () => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  (AppState as any).currentState = 'active';
  await AsyncStorage.removeItem('proximity:lastCheckAt');
  await AsyncStorage.removeItem('proximity:lastRideId');
  await AsyncStorage.removeItem('proximity:lastShownAt');
  await AsyncStorage.removeItem('proximity:suppressionUntil');
  (getDocFromServer as jest.Mock).mockImplementation(async (path: string) => ({
    data: () => path.includes('/vehicles/active')
      ? { vehicleId: 'vehicle', type: 'sedan' }
      : path.includes('REALTIME_drivers_live') ? { status: 'online' } : { features: [] },
  }));
  (getDocsFromServer as jest.Mock)
    .mockResolvedValueOnce({ docs: [] })
    .mockResolvedValueOnce({ docs: [{ data: () => ({ status: 'accepted' }) }] });
  const base = {
    rideType: 'normal', vehicleType: 'auto', serviceCode: 'normal', featureCodes: [],
    origin: { latitude: 12, longitude: -86 }, destination: { latitude: 12, longitude: -86 },
  };
  (ridesService.getAvailableRides as jest.Mock).mockResolvedValue([{ ...base, id: 'first' }, { ...base, id: 'second' }]);
  await handleLocationForProximity('driver', 12, -86);
  scheduleNextProximityRide('first');
  await jest.advanceTimersByTimeAsync(2000);
  expect(navigate).toHaveBeenCalledTimes(1);
  cancelProximitySequence();
  jest.clearAllTimers();
  jest.useRealTimers();
  await AsyncStorage.removeItem('proximity:lastCheckAt');
});

test('cancels the next preview if the driver navigates elsewhere during the pause', async () => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  (AppState as any).currentState = 'active';
  await AsyncStorage.removeItem('proximity:lastCheckAt');
  await AsyncStorage.removeItem('proximity:lastRideId');
  await AsyncStorage.removeItem('proximity:lastShownAt');
  await AsyncStorage.removeItem('proximity:suppressionUntil');
  (getDocFromServer as jest.Mock).mockImplementation(async (path: string) => ({
    data: () => path.includes('/vehicles/active')
      ? { vehicleId: 'vehicle', type: 'sedan' }
      : path.includes('REALTIME_drivers_live') ? { status: 'online' } : { features: [] },
  }));
  const base = {
    rideType: 'normal', vehicleType: 'auto', serviceCode: 'normal', featureCodes: [],
    origin: { latitude: 12, longitude: -86 }, destination: { latitude: 12, longitude: -86 },
  };
  (ridesService.getAvailableRides as jest.Mock).mockResolvedValue([{ ...base, id: 'first' }, { ...base, id: 'second' }]);
  await handleLocationForProximity('driver', 12, -86);
  scheduleNextProximityRide('first');
  await jest.advanceTimersByTimeAsync(0);
  (navigationRef.getCurrentRoute as jest.Mock).mockReturnValue({ name: 'Earnings', key: 'earnings' });
  await jest.advanceTimersByTimeAsync(2000);
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(ridesService.getAvailableRides).toHaveBeenCalledTimes(1);
  (navigationRef.getCurrentRoute as jest.Mock).mockReturnValue({ name: 'DriverHome', key: 'home' });
  cancelProximitySequence();
  jest.clearAllTimers();
  jest.useRealTimers();
  await AsyncStorage.removeItem('proximity:lastCheckAt');
});
