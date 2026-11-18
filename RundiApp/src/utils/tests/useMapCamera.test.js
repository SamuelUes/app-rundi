import { act, renderHook } from '@testing-library/react-native';
import { useMapCamera } from '../../hooks/shared/map/useMapCamera';

const latitude = 12.1364;
const longitude = -86.2514;

test('route maps can zoom out without changing the limits used by Home', () => {
  const home = renderHook(() => useMapCamera(latitude, longitude));
  const route = renderHook(() => useMapCamera(latitude, longitude, undefined, undefined, true));
  expect(home.result.current.minZoomLevel).toBeGreaterThan(15);
  expect(route.result.current.minZoomLevel).toBe(2);
  expect(route.result.current.maxZoomLevel).toBe(home.result.current.maxZoomLevel);
});

test('recentering a wide route preserves the zoom after a location update', async () => {
  const animateCamera = jest.fn();
  const getCamera = jest.fn().mockResolvedValue({ zoom: 12, center: { latitude, longitude } });
  const { result, rerender } = renderHook(
    ({ lat }) => useMapCamera(lat, longitude, undefined, undefined, true),
    { initialProps: { lat: latitude } },
  );
  result.current.mapRef.current = { getCamera, animateCamera };
  act(() => result.current.handleMapReady());
  await act(async () => { await result.current.updateAltitudeFromCamera(); });
  rerender({ lat: latitude + 0.001 });
  act(() => result.current.animateCameraToCoordinate({ latitude: latitude + 0.001, longitude }));
  expect(animateCamera.mock.calls[0][0].zoom).toBeCloseTo(12, 3);
});
