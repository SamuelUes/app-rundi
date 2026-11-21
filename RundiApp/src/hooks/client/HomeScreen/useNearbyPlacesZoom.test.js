import { act, renderHook } from '@testing-library/react-native';
import { useNearbyPlaces } from './useNearbyPlaces';
import { zoomFromAltitudeRaw } from '../../shared/map/useMapCamera';
import googleMapsService from '../../../services/map/googleMapsService';

jest.mock('../../../services/map/googleMapsService', () => ({
  __esModule: true,
  default: { getNearbyPlaces: jest.fn() },
}));

const center = { latitude: 12, longitude: -86 };
const place = { id: 'place', name: 'Parque', latitude: 12.00005, longitude: -86 };
const farPlace = { id: 'far', name: 'Otro', latitude: 12.0011, longitude: -86 };

beforeEach(() => {
  jest.useFakeTimers();
  googleMapsService.getNearbyPlaces.mockResolvedValue([place, farPlace]);
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

test('shows nearby places at the initial map scale and hides them when zoomed out', async () => {
  const { result } = renderHook(() => useNearbyPlaces(center));
  act(() => result.current.updateViewport({ ...center, zoom: zoomFromAltitudeRaw(140, center.latitude) }));
  await act(async () => { jest.advanceTimersByTime(250); });
  expect(result.current.visiblePlaces).toEqual([place]);
  expect(result.current.candidatePlaceId).toBe(place.id);
  expect(await result.current.resolveSnap(center)).toEqual(place);
  expect(await result.current.resolveSnap({ ...center, latitude: 12.0003 })).toBeNull();

  act(() => result.current.updateViewport({ ...center, zoom: zoomFromAltitudeRaw(300, center.latitude) }));
  expect(result.current.visiblePlaces).toEqual([]);
  expect(result.current.candidatePlaceId).toBeNull();
  expect(await result.current.resolveSnap(center)).toBeNull();
});

test('highlights only the closest place eligible for snapping', async () => {
  const closer = { id: 'closer', name: 'Nearby', latitude: 12.00002, longitude: -86 };
  googleMapsService.getNearbyPlaces.mockResolvedValue([place, closer]);
  const { result, rerender } = renderHook(({ point }) => useNearbyPlaces(point), { initialProps: { point: center } });
  act(() => result.current.updateViewport({ ...center, zoom: zoomFromAltitudeRaw(140, center.latitude) }));
  await act(async () => { jest.advanceTimersByTime(250); });
  expect(result.current.candidatePlaceId).toBe('closer');
  expect(await result.current.resolveSnap(center)).toEqual(closer);
  rerender({ point: { ...center, latitude: 12.0003 } });
  expect(result.current.candidatePlaceId).toBeNull();
});

test('keeps the six highest-ranked places in range and never snaps to a hidden place', async () => {
  const rankedPlaces = Array.from({ length: 6 }, (_, index) => ({
    id: `ranked-${index}`, name: 'Place', latitude: 12.0002 + index * 0.00001, longitude: -86,
  }));
  const hiddenNearest = { id: 'hidden', name: 'Hidden', ...center };
  googleMapsService.getNearbyPlaces.mockResolvedValue([farPlace, ...rankedPlaces, hiddenNearest]);
  const { result } = renderHook(() => useNearbyPlaces(center));
  act(() => result.current.updateViewport({ ...center, zoom: zoomFromAltitudeRaw(140, center.latitude) }));
  await act(async () => { jest.advanceTimersByTime(250); });

  expect(result.current.visiblePlaces).toEqual(rankedPlaces);
  expect(result.current.candidatePlaceId).toBeNull();
  expect(await result.current.resolveSnap(center)).toBeNull();
});

test('does not snap to places from a request that has not appeared on the map', async () => {
  let finishRequest;
  googleMapsService.getNearbyPlaces.mockReturnValue(new Promise((resolve) => { finishRequest = resolve; }));
  const { result } = renderHook(() => useNearbyPlaces(center));
  act(() => result.current.updateViewport({ ...center, zoom: zoomFromAltitudeRaw(140, center.latitude) }));
  act(() => jest.advanceTimersByTime(250));
  expect(await result.current.resolveSnap(center)).toBeNull();
  await act(async () => { finishRequest([place]); });
  expect(result.current.visiblePlaces).toEqual([place]);
  expect(await result.current.resolveSnap(center)).toEqual(place);
});
