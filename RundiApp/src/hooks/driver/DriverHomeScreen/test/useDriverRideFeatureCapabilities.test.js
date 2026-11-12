import { act, renderHook, waitFor } from '@testing-library/react-native';
import { onSnapshot } from 'firebase/firestore';
import { useDriverRideFeatureCapabilities } from '../../useDriverRideFeatureCapabilities';

jest.mock('../../../../config/firebase', () => ({ getFirebaseFirestore: jest.fn(async () => ({})) }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), onSnapshot: jest.fn() }));
jest.mock('../../useActiveVehiclePremium', () => ({
  useActiveVehiclePremium: () => ({ vehicle: null, eligible: false }),
}));

test('reads senior capability in realtime from the driver projection', async () => {
  let emit;
  const unsubscribe = jest.fn();
  onSnapshot.mockImplementation((_ref, callback) => {
    emit = callback;
    return unsubscribe;
  });
  const hook = renderHook(() => useDriverRideFeatureCapabilities('driver', null));
  await waitFor(() => expect(emit).toBeDefined());
  act(() => emit({ data: () => ({ features: ['pet_friendly', 'senior'] }) }));
  expect(hook.result.current.driverFeatureCodes).toEqual(['pet_friendly', 'senior']);
  act(() => emit({ data: () => ({ features: ['pet_friendly'] }) }));
  expect(hook.result.current.driverFeatureCodes).toEqual(['pet_friendly']);
  hook.unmount();
  expect(unsubscribe).toHaveBeenCalled();
});
