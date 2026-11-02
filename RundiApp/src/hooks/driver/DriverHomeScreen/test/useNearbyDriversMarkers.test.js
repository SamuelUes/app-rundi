import { act, renderHook, waitFor } from '@testing-library/react-native';
import { onSnapshot } from 'firebase/firestore';
import { useNearbyDriversMarkers } from '../useNearbyDriversMarkers';

jest.mock('../../../../config/firebase', () => ({ getFirebaseFirestore: jest.fn(async () => ({})) }));
jest.mock('../../../../utils/driver/vehicleIcons', () => ({
  extractVehicleTypeFromInfo: jest.fn(() => null),
  ensureVehicleIconSource: jest.fn(() => null),
}));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  onSnapshot: jest.fn(),
}));

test('updates nearby markers as coordinates change without resubscribing', async () => {
  let emit;
  const unsubscribe = jest.fn();
  onSnapshot.mockImplementation((_query, callback) => {
    emit = callback;
    return unsubscribe;
  });
  const cache = { current: {} };
  const hook = renderHook(({ lat }) => useNearbyDriversMarkers(
    { latitude: lat, longitude: -86 }, true, 'self', 'area', cache,
  ), { initialProps: { lat: 12 } });
  await waitFor(() => expect(onSnapshot).toHaveBeenCalledTimes(1));
  act(() => emit({ docs: [{ id: 'driver', data: () => ({ location: { latitude: 12, longitude: -86 } }) }] }));
  expect(hook.result.current).toHaveLength(1);
  hook.rerender({ lat: 13 });
  expect(hook.result.current).toHaveLength(0);
  expect(onSnapshot).toHaveBeenCalledTimes(1);
  hook.unmount();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});
