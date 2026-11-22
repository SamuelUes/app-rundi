import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { useTracksViewChanges } from '../../../hooks/shared/map/useTracksViewChanges';
import { MAP_ICONS } from '../../../constants/mapIcons';
import type { NearbyPlace } from '../../../services/map/googleMapsService';

const FADE_DURATION_MS = 300;
const STATE_DURATION_MS = 320;
const STATE_EASING = Easing.out(Easing.cubic);
const MARKER_ANCHOR_POINT_Y = 40;
const MARKER_FRAME_HEIGHT = 54;
const MARKER_ANCHOR_Y = MARKER_ANCHOR_POINT_Y / MARKER_FRAME_HEIGHT;

// react-native-maps tipa Marker.Animated como AnimatedComponent<typeof MapMarker>
// — con la Strict TS API de RN 0.88 esa firma espera las props (no el componente)
// y pierde `children`/`opacity` animable.
const AnimatedMarker = Marker.Animated as unknown as React.ComponentType<
  Omit<React.ComponentProps<typeof Marker>, 'opacity'> & {
    opacity?: number | Animated.Value;
  }
>;

type PlaceEntry = { place: NearbyPlace; visible: boolean };
type PlaceMode = 'default' | 'candidate' | 'selected';

function PlaceMarker({
  entry,
  mode,
  isDark,
  onExit,
}: {
  entry: PlaceEntry;
  mode: PlaceMode;
  isDark: boolean;
  onExit: (id: string) => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const modeProgress = useRef({
    default: new Animated.Value(mode === 'default' ? 1 : 0),
    candidate: new Animated.Value(mode === 'candidate' ? 1 : 0),
    selected: new Animated.Value(mode === 'selected' ? 1 : 0),
  }).current;
  const previousMode = useRef(mode);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const { tracksViewChanges, notifyContentRendered } = useTracksViewChanges([mode, isDark]);

  useEffect(() => {
    const animation = Animated.timing(opacity, {
      toValue: entry.visible ? 1 : 0,
      duration: FADE_DURATION_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished && !entry.visible) onExit(entry.place.id);
    });
    return () => animation.stop();
  }, [entry.visible, entry.place.id, onExit, opacity]);

  useEffect(() => {
    if (previousMode.current === mode) return;
    previousMode.current = mode;
    setIsTransitioning(true);
    const animation = Animated.parallel([
      Animated.timing(modeProgress.default, {
        toValue: mode === 'default' ? 1 : 0,
        duration: STATE_DURATION_MS,
        easing: STATE_EASING,
        useNativeDriver: false,
      }),
      Animated.timing(modeProgress.candidate, {
        toValue: mode === 'candidate' ? 1 : 0,
        duration: STATE_DURATION_MS,
        easing: STATE_EASING,
        useNativeDriver: false,
      }),
      Animated.timing(modeProgress.selected, {
        toValue: mode === 'selected' ? 1 : 0,
        duration: STATE_DURATION_MS,
        easing: STATE_EASING,
        useNativeDriver: false,
      }),
    ]);
    animation.start(({ finished }) => {
      if (finished) {
        notifyContentRendered();
        setIsTransitioning(false);
      }
    });
    return () => animation.stop();
  }, [mode, modeProgress, notifyContentRendered]);

  const defaultScale = modeProgress.default.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  });
  const candidateScale = modeProgress.candidate.interpolate({
    inputRange: [0, 1],
    outputRange: [0.78, 1],
  });
  const selectedScale = modeProgress.selected.interpolate({
    inputRange: [0, 1],
    outputRange: [0.86, 1],
  });
  const selectedLift = modeProgress.selected.interpolate({
    inputRange: [0, 1],
    outputRange: [3, 0],
  });
  const modeChanged = previousMode.current !== mode;

  return (
    <AnimatedMarker
      coordinate={entry.place}
      anchor={{ x: 0.5, y: MARKER_ANCHOR_Y }}
      tappable={false}
      tracksViewChanges={tracksViewChanges || isTransitioning || modeChanged}
      opacity={opacity}
      zIndex={mode === 'selected' ? 9 : mode === 'candidate' ? 8 : 6}
    >
      <View style={styles.markerFrame} collapsable={false}>
        <Animated.Image
          source={MAP_ICONS.SUGGESTED_PLACE}
          style={[
            styles.defaultIcon,
            { opacity: modeProgress.default, transform: [{ scale: defaultScale }] },
          ]}
          resizeMode="contain"
          onLoad={notifyContentRendered}
        />
        <Animated.Image
          source={MAP_ICONS.SUGGESTED_PLACE_HUGE}
          style={[
            styles.candidateIcon,
            { opacity: modeProgress.candidate, transform: [{ scale: candidateScale }] },
          ]}
          resizeMode="contain"
          onLoad={notifyContentRendered}
        />
        <Animated.Image
          source={isDark ? MAP_ICONS.SUGGESTED_PLACE_SELECTED_DARK : MAP_ICONS.SUGGESTED_PLACE_SELECTED_LIGHT}
          style={[
            styles.selectedIcon,
            isDark ? styles.selectedIconDark : styles.selectedIconLight,
            {
              opacity: modeProgress.selected,
              transform: [{ translateY: selectedLift }, { scale: selectedScale }],
            },
          ]}
          resizeMode="contain"
          onLoad={notifyContentRendered}
        />
      </View>
    </AnimatedMarker>
  );
}

export default function NearbyPlacesLayer({
  places,
  candidatePlaceId,
  selectedPlaceId,
  isDark = false,
}: {
  places: NearbyPlace[];
  candidatePlaceId?: string | null;
  selectedPlaceId?: string | null;
  isDark?: boolean;
}) {
  const [entries, setEntries] = useState<PlaceEntry[]>(() => places.map((place) => ({ place, visible: true })));

  useEffect(() => {
    setEntries((previous) => {
      const incoming = new Map(places.map((place) => [place.id, place]));
      let changed = false;
      const next = previous.map((entry) => {
        const place = incoming.get(entry.place.id);
        incoming.delete(entry.place.id);
        if (!place) {
          if (!entry.visible) return entry;
          changed = true;
          return { ...entry, visible: false };
        }
        if (entry.visible && entry.place === place) return entry;
        changed = true;
        return { place, visible: true };
      });
      incoming.forEach((place) => {
        changed = true;
        next.push({ place, visible: true });
      });
      return changed ? next : previous;
    });
  }, [places]);

  const handleExit = useCallback((id: string) => {
    setEntries((previous) => previous.filter((entry) => entry.place.id !== id || entry.visible));
  }, []);

  return (
    <>
      {entries.map((entry) => (
        <PlaceMarker
          key={entry.place.id}
          entry={entry}
          mode={
            entry.place.id === selectedPlaceId
              ? 'selected'
              : entry.visible && entry.place.id === candidatePlaceId
                ? 'candidate'
                : 'default'
          }
          isDark={isDark}
          onExit={handleExit}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  markerFrame: {
    width: 30,
    height: MARKER_FRAME_HEIGHT,
    overflow: 'visible',
  },
  defaultIcon: {
    position: 'absolute',
    top: 29,
    left: 4,
    width: 22,
    height: 22,
  },
  candidateIcon: {
    position: 'absolute',
    top: 27.5,
    left: 2.5,
    width: 25,
    height: 25,
  },
  selectedIcon: {
    position: 'absolute',
    top: 0,
    left: 2,
    width: 26,
  },
  selectedIconLight: {
    height: 47,
  },
  selectedIconDark: {
    height: 46,
  },
});
