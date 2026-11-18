import React from 'react';
import { Platform } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import GoogleMap from './GoogleMaps';
import { useMapCamera } from '../../hooks/shared/map/useMapCamera';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { DARK_MAP_STYLE } from '../../constants/mapStyles';

const mockFitToCoordinates = jest.fn();

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => ({ fitToCoordinates: mockFitToCoordinates }));
      return React.createElement(View, { testID: 'map', ...props }, props.children);
    }),
    Marker: () => null,
    Polyline: () => null,
    PROVIDER_GOOGLE: 'google',
  };
});
jest.mock('../../hooks/shared/theme/useTheme', () => ({ useTheme: jest.fn() }));
jest.mock('../../hooks/shared/map/useMapCamera', () => ({
  useMapCamera: jest.fn(),
  isValidCoord: (c) => c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude),
  toLatLng: (c) => ({ latitude: c.latitude, longitude: c.longitude }),
  coordsAreClose: () => false,
  clampValue: (value, min, max) => Math.min(max, Math.max(min, value)),
}));
jest.mock('./mapMarkers/PinMarkerWithBubble', () => () => null);
jest.mock('./mapMarkers/NearbyDriversLayer', () => () => null);
jest.mock('./mapMarkers/RideRequestsLayer', () => () => null);

const origin = { latitude: 12, longitude: -86 };
const destination = { latitude: 12.1, longitude: -86.1 };

beforeEach(() => {
  jest.useFakeTimers();
  useTheme.mockReturnValue({ isDark: false });
});
afterEach(() => {
  jest.useRealTimers();
  mockFitToCoordinates.mockClear();
});

test('Android resets the dark style without remounting the map', () => {
  const originalPlatform = Platform.OS;
  Platform.OS = 'android';
  try {
    useMapCamera.mockReturnValue({
      mapRef: { current: null },
      currentZoom: 16,
      isMapReady: false,
      defaultCameraSettings: { altitude: 140, zoom: 18 },
      minZoomLevel: 15,
      maxZoomLevel: 19,
      lastCameraAltitudeRef: { current: 140 },
      gestureActiveRef: { current: false },
      applyCamera: jest.fn(),
      animateCameraToCoordinate: jest.fn(),
      handleRegionChange: jest.fn(),
      handleRegionChangeComplete: jest.fn(),
      handleMapReady: jest.fn(),
      markGestureActive: jest.fn(),
    });
    useTheme.mockReturnValue({ isDark: true });
    const screen = render(<GoogleMap latitude={12} longitude={-86} />);
    const map = screen.getByTestId('map');
    expect(map.props.customMapStyle).toEqual(DARK_MAP_STYLE);
    useTheme.mockReturnValue({ isDark: false });
    screen.rerender(<GoogleMap latitude={12} longitude={-86} />);
    expect(screen.getByTestId('map')).toBe(map);
    expect(screen.getByTestId('map').props.customMapStyle).toEqual([]);
    useTheme.mockReturnValue({ isDark: true });
    screen.rerender(<GoogleMap latitude={12} longitude={-86} />);
    expect(screen.getByTestId('map').props.customMapStyle).toEqual(DARK_MAP_STYLE);
  } finally {
    Platform.OS = originalPlatform;
  }
});

test('fits after layout and retries changes deferred by a camera movement', () => {
  const fitToCoordinates = mockFitToCoordinates;
  const gestureActiveRef = { current: false };
  useMapCamera.mockReturnValue({
    mapRef: { current: { fitToCoordinates } },
    currentZoom: 16,
    isMapReady: true,
    defaultCameraSettings: { altitude: 140, zoom: 18 },
    minZoomLevel: 2,
    maxZoomLevel: 19,
    lastCameraAltitudeRef: { current: 140 },
    gestureActiveRef,
    applyCamera: jest.fn(),
    animateCameraToCoordinate: jest.fn(),
    handleRegionChange: jest.fn(),
    handleRegionChangeComplete: jest.fn(),
    handleMapReady: jest.fn(),
    markGestureActive: jest.fn(),
  });
  const screen = render(<GoogleMap latitude={12} longitude={-86} originMarker={origin} destinationMarker={destination} />);
  expect(fitToCoordinates).not.toHaveBeenCalled();
  fireEvent(screen.getByTestId('google-map-container'), 'layout', { nativeEvent: { layout: { width: 400, height: 800 } } });
  expect(fitToCoordinates).toHaveBeenCalledTimes(1);
  gestureActiveRef.current = true;
  const next = { latitude: 12.2, longitude: -86.2 };
  screen.rerender(<GoogleMap latitude={12} longitude={-86} originMarker={origin} destinationMarker={next} />);
  act(() => jest.advanceTimersByTime(300));
  expect(fitToCoordinates).toHaveBeenCalledTimes(1);
  gestureActiveRef.current = false;
  act(() => jest.advanceTimersByTime(300));
  expect(fitToCoordinates).toHaveBeenCalledTimes(2);
  expect(fitToCoordinates.mock.calls[1][0]).toContainEqual(next);
  screen.rerender(
    <GoogleMap latitude={12} longitude={-86} originMarker={origin} destinationMarker={next} fitEdgePadding={{ top: 100, bottom: 900 }} />,
  );
  expect(fitToCoordinates).toHaveBeenCalledTimes(3);
  const padding = fitToCoordinates.mock.calls[2][1].edgePadding;
  expect(padding.top + padding.bottom).toBeLessThanOrEqual(720);
});
