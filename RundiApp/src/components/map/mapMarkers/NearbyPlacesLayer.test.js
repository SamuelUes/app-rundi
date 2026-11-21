import React from 'react';
import { Animated } from 'react-native';
import { act, render } from '@testing-library/react-native';
import NearbyPlacesLayer from './NearbyPlacesLayer';

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Marker: {
      Animated: ({ coordinate, children }) =>
        React.createElement(View, { testID: `place-${coordinate.id}` }, children),
    },
  };
});
jest.mock('../../../hooks/shared/map/useTracksViewChanges', () => {
  const notifyContentRendered = jest.fn();
  return { useTracksViewChanges: () => ({ tracksViewChanges: false, notifyContentRendered }) };
});

const place = { id: 'park', name: 'Park', latitude: 12, longitude: -86 };

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(Animated, 'timing').mockImplementation((_value, options) => {
    let timer;
    return {
      start: (callback) => { timer = setTimeout(() => callback?.({ finished: true }), options.duration); },
      stop: () => clearTimeout(timer),
      reset: jest.fn(),
    };
  });
});

const expectStateTransition = () => {
  expect(Animated.timing).toHaveBeenCalledTimes(3);
  expect(Animated.timing.mock.calls.map(([, options]) => options.toValue).sort()).toEqual([0, 0, 1]);
  Animated.timing.mock.calls.forEach(([, options]) => {
    expect(options).toEqual(expect.objectContaining({ duration: 320 }));
  });
};

test('smoothly switches between default, candidate, and selected icon states', () => {
  const screen = render(<NearbyPlacesLayer places={[place]} />);
  Animated.timing.mockClear();
  screen.rerender(<NearbyPlacesLayer places={[place]} candidatePlaceId="park" />);
  expectStateTransition();
  act(() => jest.advanceTimersByTime(320));
  Animated.timing.mockClear();
  screen.rerender(<NearbyPlacesLayer places={[place]} candidatePlaceId={null} selectedPlaceId="park" />);
  expectStateTransition();
  act(() => jest.advanceTimersByTime(320));
  Animated.timing.mockClear();
  screen.rerender(<NearbyPlacesLayer places={[place]} candidatePlaceId={null} selectedPlaceId={null} />);
  expectStateTransition();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('keeps a disappearing marker until fade-out and cancels removal if it reappears', () => {
  const screen = render(<NearbyPlacesLayer places={[place]} />);
  act(() => jest.advanceTimersByTime(300));
  screen.rerender(<NearbyPlacesLayer places={[]} />);
  expect(screen.queryByTestId('place-park')).not.toBeNull();
  act(() => jest.advanceTimersByTime(150));
  screen.rerender(<NearbyPlacesLayer places={[place]} />);
  act(() => jest.advanceTimersByTime(300));
  expect(screen.queryByTestId('place-park')).not.toBeNull();
  screen.rerender(<NearbyPlacesLayer places={[]} />);
  act(() => jest.advanceTimersByTime(300));
  expect(screen.queryByTestId('place-park')).toBeNull();
});
