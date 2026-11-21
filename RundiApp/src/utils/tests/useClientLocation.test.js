import { act, renderHook } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useClientLocation } from '../../hooks/client/HomeScreen/useClientLocation';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));
jest.mock('../../services/map/mapsService', () => ({
  __esModule: true,
  default: { reverseGeocode: jest.fn() },
}));
jest.mock('../../services/notification/alertService', () => ({
  __esModule: true,
  default: { showErrorAlert: jest.fn() },
}));

test('serializes manual and GPS writes so the latest location is stored last', async () => {
  let finishFirst;
  AsyncStorage.getItem.mockResolvedValue(null);
  AsyncStorage.setItem
    .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
    .mockResolvedValueOnce(undefined);
  const t = (key) => key;
  const { result } = renderHook(() => useClientLocation('user', null, null, t));
  await act(async () => {});

  let manualWrite;
  let gpsWrite;
  await act(async () => {
    manualWrite = result.current.saveClientLocation({ latitude: 12, longitude: -86 }, 'Manual', { source: 'manual' });
    gpsWrite = result.current.saveClientLocation({ latitude: 13, longitude: -87 }, 'GPS', { source: 'gps' });
    await Promise.resolve();
  });
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);

  await act(async () => {
    finishFirst();
    await Promise.all([manualWrite, gpsWrite]);
  });
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2);
  expect(JSON.parse(AsyncStorage.setItem.mock.calls[1][1])).toMatchObject({
    coords: { latitude: 13, longitude: -87 },
    source: 'gps',
  });
  expect(result.current.clientLocationData.coords).toEqual({ latitude: 13, longitude: -87 });
});
