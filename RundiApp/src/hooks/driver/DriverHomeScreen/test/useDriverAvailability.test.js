import { act, renderHook, waitFor } from '@testing-library/react-native';
import { getDoc, onSnapshot } from 'firebase/firestore';
import { useDriverAvailability } from '../useDriverAvailability';

jest.mock('../../../../config/firebase', () => ({ getFirebaseFirestore: jest.fn(async () => ({})) }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), getDoc: jest.fn(), onSnapshot: jest.fn() }));
jest.mock('../../../../services/driver/driversService', () => ({ __esModule: true, default: {} }));
jest.mock('../../../../services/notification/alertService', () => ({ __esModule: true, default: {} }));
jest.mock('../../../../services/driver/driverAvailabilityService', () => ({
  __esModule: true,
  default: {
    getAvailabilityState: jest.fn(async () => null),
    saveAvailabilityState: jest.fn(async () => {}),
    initAppStateListener: jest.fn(),
    startHeartbeat: jest.fn(),
    cleanup: jest.fn(),
  },
}));

test('a stale offline read cannot overwrite a newer online snapshot', async () => {
  let finishRead;
  let emit;
  getDoc.mockImplementation(() => new Promise((resolve) => { finishRead = resolve; }));
  onSnapshot.mockImplementation((_ref, callback) => {
    emit = callback;
    return jest.fn();
  });
  const coords = { latitude: 12, longitude: -86 };
  const markTaskCompleted = jest.fn();
  const hook = renderHook(() => useDriverAvailability({
    userId: 'driver', userRole: 'driver', coords, hasInsufficientFunds: false,
    rechargeFundsSummary: null, tr: (key) => key, navigation: {},
    markTaskCompleted,
  }));
  await waitFor(() => expect(emit).toBeDefined());
  await act(async () => emit({ data: () => ({ status: 'online' }) }));
  expect(hook.result.current.isAvailable).toBe(true);
  await act(async () => finishRead({ data: () => ({ status: 'offline' }) }));
  expect(hook.result.current.isAvailable).toBe(true);
  await act(async () => emit({ data: () => ({ status: 'offline' }) }));
  expect(hook.result.current.isAvailable).toBe(false);
  hook.unmount();
});
