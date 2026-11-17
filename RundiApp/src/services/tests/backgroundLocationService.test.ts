import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import tracking from '../ride/firebaseTrackingService';
import { handleLocationForProximity } from '../ride/proximityService';
import { startBackgroundLocationTracking } from '../map/backgroundLocationService';

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(async () => false),
}));
jest.mock('expo-location', () => ({
  hasServicesEnabledAsync: jest.fn(async () => true),
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getBackgroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  startLocationUpdatesAsync: jest.fn(async () => {}),
}));
jest.mock('@react-native-async-storage/async-storage', () => {
  const values: Record<string, string> = {};
  return { __esModule: true, default: {
    getItem: jest.fn(async (key: string) => values[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values[key] = value; }),
  } };
});
jest.mock('../ride/firebaseTrackingService', () => ({
  __esModule: true, default: { updateDriverLocation: jest.fn(async () => {}) },
}));
jest.mock('../user/sessionService', () => ({
  __esModule: true, default: {
    heartbeatSession: jest.fn(async () => {}),
    isSessionActiveElsewhereError: jest.fn(() => false),
  },
}));
jest.mock('../ride/proximityService', () => ({
  handleLocationForProximity: jest.fn(async () => {}),
  isRegistrationUploadsInProgress: jest.fn(async () => false),
}));
jest.mock('../../utils/system/activityPermission', () => ({ ensureActivityRecognitionPermission: jest.fn(async () => true) }));
jest.mock('../../native/foregroundService', () => ({ __esModule: true, default: { start: jest.fn(async () => {}) } }));
jest.mock('../../native/workManager', () => ({ __esModule: true, default: { schedule: jest.fn(async () => {}) } }));
jest.mock('../../native/batteryOptimization', () => ({ __esModule: true, default: { isIgnoring: jest.fn(async () => true) } }));
jest.mock('../../i18n', () => ({ __esModule: true, default: { t: (key: string) => key } }));

test('stationary drivers receive background location batches and use the latest fix', async () => {
  expect(await startBackgroundLocationTracking('driver', 'driver')).toBe(true);
  expect(Location.startLocationUpdatesAsync).toHaveBeenCalledWith(
    'background-location-task',
    expect.objectContaining({ distanceInterval: 0, deferredUpdatesDistance: 0 }),
  );

  const task = (TaskManager.defineTask as jest.Mock).mock.calls[0][1];
  await task({ data: { locations: [
    { coords: { latitude: 12, longitude: -86 }, timestamp: 1 },
    { coords: { latitude: 12.01, longitude: -86.01 }, timestamp: 2 },
  ] } });
  expect(tracking.updateDriverLocation).toHaveBeenCalledWith('driver', expect.objectContaining({ latitude: 12.01 }));
  expect(handleLocationForProximity).toHaveBeenCalledWith('driver', 12.01, -86.01);
  expect(await AsyncStorage.getItem('location-tracking-state')).toBeTruthy();
});
