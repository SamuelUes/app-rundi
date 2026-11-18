import { act, renderHook } from '@testing-library/react-native';
import { useMapPinInteraction } from '../../hooks/client/HomeScreen/useMapPinInteraction';
import mapsService from '../../services/map/mapsService';
import alertService from '../../services/notification/alertService';

jest.mock('../../../services/map/mapsService', () => ({
  __esModule: true,
  default: { reverseGeocode: jest.fn() },
}));
jest.mock('../../../services/notification/alertService', () => ({
  __esModule: true,
  default: { showInfoAlert: jest.fn(), showConfirmAlert: jest.fn() },
}));

const origin = { latitude: 12, longitude: -86 };
const first = { latitude: 12.01, longitude: -86 };
const second = { latitude: 12.02, longitude: -86 };
const allowed = { checked: true, allowed: true, serviceAreaId: 'area' };
const t = (key) => key;
const addressFallback = (lat, lng) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function setup(checkRegion, resolveSnap) {
  const save = jest.fn().mockResolvedValue(undefined);
  const setRegion = jest.fn();
  const restore = jest.fn();
  const hook = renderHook(() => useMapPinInteraction(
    origin, null, null, '', save, checkRegion, setRegion, addressFallback, t, false, restore, resolveSnap,
  ));
  const move = (location) => {
    act(() => {
      hook.result.current.handlePanDrag();
      hook.result.current.handleRegionChangeCenter(location);
      hook.result.current.handleRegionChangeCompleteCenter(location);
    });
  };
  return { ...hook, save, setRegion, restore, move };
}

test('saves the snapped coordinates and shows the place name', async () => {
  const place = { id: 'place', name: 'Parque', latitude: first.latitude + 0.00001, longitude: first.longitude };
  const { move, save, result, restore } = setup(jest.fn().mockResolvedValue(allowed), jest.fn().mockResolvedValue(place));
  move(first);
  await act(async () => { jest.advanceTimersByTime(900); });
  expect(save).toHaveBeenCalledWith({ latitude: place.latitude, longitude: place.longitude }, 'Address', expect.any(Object));
  expect(restore).toHaveBeenCalledWith({ latitude: place.latitude, longitude: place.longitude });
  expect(result.current.selectedPlaceName).toBe('Parque');
});

test('a late snap from an earlier gesture cannot move or save the pin', async () => {
  const oldSnap = deferred();
  const resolveSnap = jest.fn().mockReturnValueOnce(oldSnap.promise).mockResolvedValueOnce(null);
  const { move, save, restore } = setup(jest.fn().mockResolvedValue(allowed), resolveSnap);
  move(first);
  await act(async () => { jest.advanceTimersByTime(900); });
  move(second);
  await act(async () => { jest.advanceTimersByTime(900); });
  await act(async () => { oldSnap.resolve({ id: 'old', name: 'Old', ...first }); });
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith(second, 'Address', expect.any(Object));
  expect(restore).not.toHaveBeenCalled();
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mapsService.reverseGeocode.mockResolvedValue('Address');
});

afterEach(() => {
  jest.useRealTimers();
});

test('only the latest gesture can publish and save a location', async () => {
  const oldRegion = deferred();
  const checkRegion = jest.fn().mockReturnValueOnce(oldRegion.promise).mockResolvedValueOnce(allowed);
  const { move, save, setRegion } = setup(checkRegion);
  move(first);
  await act(async () => { jest.advanceTimersByTime(900); });
  move(second);
  await act(async () => { jest.advanceTimersByTime(900); });
  await act(async () => { oldRegion.resolve({ ...allowed, allowed: false }); });
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith(second, 'Address', expect.any(Object));
  expect(setRegion).toHaveBeenCalledTimes(1);
  expect(setRegion).toHaveBeenCalledWith(allowed);
});

test('a failed coverage check does not save and lets the user retry', async () => {
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  const checkRegion = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(allowed);
  const { move, save, result } = setup(checkRegion);
  move(first);
  await act(async () => { jest.advanceTimersByTime(900); });
  expect(save).not.toHaveBeenCalled();
  expect(result.current.hasPendingManualSelection).toBe(true);
  const retry = alertService.showConfirmAlert.mock.calls[0][2];
  const onClose = alertService.showConfirmAlert.mock.calls[0][3];
  await act(async () => { onClose(); retry(); });
  expect(save).toHaveBeenCalledWith(first, 'Address', expect.any(Object));
  consoleError.mockRestore();
});

test('rejects an unsupported point and keeps the committed location', async () => {
  const { move, save, result, restore } = setup(jest.fn().mockResolvedValue({ ...allowed, allowed: false }));
  move(first);
  await act(async () => { jest.advanceTimersByTime(900); });
  expect(save).not.toHaveBeenCalled();
  expect(result.current.hasPendingManualSelection).toBe(false);
  expect(restore).toHaveBeenCalledWith(origin);
});

test('uses the new coordinates when reverse geocoding fails', async () => {
  mapsService.reverseGeocode.mockRejectedValue(new Error('offline'));
  const { move, save } = setup(jest.fn().mockResolvedValue(allowed));
  move(first);
  await act(async () => { jest.advanceTimersByTime(900); });
  expect(save).toHaveBeenCalledWith(first, '12.010000, -86.000000', expect.any(Object));
});

test('a pinch gesture without onPanDrag activates the pin and saves', async () => {
  const { save, result } = setup(jest.fn().mockResolvedValue(allowed));
  act(() => {
    result.current.handleRegionChangeCenter({ ...first, isGesture: true });
    result.current.handleRegionChangeCompleteCenter({ ...first, isGesture: true });
  });
  await act(async () => { jest.advanceTimersByTime(900); });
  expect(save).toHaveBeenCalledWith(first, 'Address', expect.any(Object));
  expect(result.current.hasPendingManualSelection).toBe(false);
  expect(result.current.isPinLocked).toBe(true);
});

test('a zoom that does not move the center resets without saving', async () => {
  const { save, result } = setup(jest.fn().mockResolvedValue(allowed));
  act(() => {
    result.current.handleRegionChangeCenter({ ...origin, isGesture: true });
    result.current.handleRegionChangeCompleteCenter({ ...origin, isGesture: true });
  });
  await act(async () => { jest.advanceTimersByTime(900); });
  expect(save).not.toHaveBeenCalled();
  expect(result.current.hasPendingManualSelection).toBe(false);
  expect(result.current.isHoldingPin).toBe(false);
  expect(result.current.isPinLocked).toBe(true);
});

test('programmatic camera moves do not activate the pin', async () => {
  const { save, result } = setup(jest.fn().mockResolvedValue(allowed));
  act(() => {
    result.current.handleRegionChangeCenter({ ...first, isGesture: false });
    result.current.handleRegionChangeCompleteCenter({ ...first, isGesture: false });
  });
  await act(async () => { jest.advanceTimersByTime(900); });
  expect(save).not.toHaveBeenCalled();
  expect(result.current.isHoldingPin).toBe(false);
  expect(result.current.isPinLocked).toBe(true);
});

test('an unsupported GPS location invalidates an in-flight manual selection', async () => {
  const check = deferred();
  const save = jest.fn();
  const setRegion = jest.fn();
  const { result, rerender } = renderHook(
    ({ disabled }) => useMapPinInteraction(
      origin, null, null, '', save, () => check.promise, setRegion, addressFallback, t, disabled, jest.fn(),
    ),
    { initialProps: { disabled: false } },
  );
  act(() => {
    result.current.handlePanDrag();
    result.current.handleRegionChangeCompleteCenter(first);
  });
  await act(async () => { jest.advanceTimersByTime(900); });
  rerender({ disabled: true });
  await act(async () => { check.resolve(allowed); });
  expect(save).not.toHaveBeenCalled();
  expect(setRegion).not.toHaveBeenCalled();
  expect(result.current.isPinLocked).toBe(true);
});
