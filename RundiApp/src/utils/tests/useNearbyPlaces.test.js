import { act, renderHook } from '@testing-library/react-native';
import { useNearbyPlaces } from '../../hooks/client/HomeScreen/useNearbyPlaces';
import googleMapsService from '../../services/map/googleMapsService';

jest.mock('../../services/map/googleMapsService', () => ({
  __esModule: true,
  default: { getNearbyPlaces: jest.fn() },
}));

const center = { latitude: 12, longitude: -86 };
const close = { id: 'close', name: 'Parque', latitude: 12.00004, longitude: -86 };
const far = { id: 'far', name: 'Otro', latitude: 12.0011, longitude: -86 };
const viewport = { ...center, zoom: 20 };

beforeEach(() => {
  jest.useFakeTimers();
  googleMapsService.getNearbyPlaces.mockReset();
});

afterEach(() => jest.useRealTimers());

test('shows only places within 100m at close zoom and snaps within 10m', async () => {
  googleMapsService.getNearbyPlaces.mockResolvedValue([close, far]);
  const { result } = renderHook(() => useNearbyPlaces(center));
  act(() => result.current.updateViewport(viewport));
  await act(async () => { jest.advanceTimersByTime(250); });
  expect(result.current.visiblePlaces).toEqual([close]);
  expect(await result.current.resolveSnap(center)).toEqual(close);
  expect(await result.current.resolveSnap({ ...center, latitude: 12.0003 })).toBeNull();
  act(() => result.current.updateViewport({ ...center, zoom: 15 }));
  expect(result.current.visiblePlaces).toEqual([]);
  expect(await result.current.resolveSnap(center)).toBeNull();
});

test('ignores a response after zooming out', async () => {
  let finish;
  googleMapsService.getNearbyPlaces.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const { result } = renderHook(() => useNearbyPlaces(center));
  act(() => result.current.updateViewport(viewport));
  await act(async () => { jest.advanceTimersByTime(250); });
  act(() => result.current.updateViewport({ ...center, zoom: 15 }));
  await act(async () => { finish([close]); });
  expect(result.current.visiblePlaces).toEqual([]);
  expect(await result.current.resolveSnap(center)).toBeNull();
});
