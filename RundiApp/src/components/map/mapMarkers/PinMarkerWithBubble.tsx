import React, { useMemo } from 'react';
import { View, StyleSheet, Image, Platform, type ImageSourcePropType } from 'react-native';
import { Marker, type LatLng, type MarkerDragEvent, type MarkerDragStartEndEvent } from 'react-native-maps';
import { PinInfoBubble } from './MarkerContent';
import { toMarkerImageSource } from '../../../hooks/shared/map/useMapCamera';
import { useTracksViewChanges } from '../../../hooks/shared/map/useTracksViewChanges';

const BUBBLE_GAP = 6;
/** Deterministic pill marker widths so the Android snapshot can never clip the
 *  pill mid-render: the marker view always measures exactly this wide. */
const COLUMN_WIDTH = 220;
const COLUMN_WIDTH_COMPACT = 150;

// Pills require react-native-maps >= 1.29.5 on Android: earlier versions size
// the marker snapshot from the Yoga box only, which clips the pill mid-glyph
// under Fabric/New Arch (fixed upstream by expandSnapshotSizeFromSubtree).
const PIN_BUBBLES_ENABLED = true;

export type PinAnchorMode = 'tip' | 'center';

interface PinMarkerWithBubbleProps {
  coordinate: LatLng;
  /** Pin artwork rendered with the native `image` prop (no view snapshot). */
  pinImage: ImageSourcePropType;
  pinWidth: number;
  pinHeight: number;
  /** 'tip' -> bottom point of a teardrop sits on the coordinate.
   *  'center' -> center of a round dot sits on the coordinate. */
  pinAnchor?: PinAnchorMode;
  /** Scales the pin artwork. The native `image` prop renders at the asset's
   *  point size, so scale != 1 falls back to a child <Image> sized
   *  pinWidth/pinHeight * pinScale (safe on >=1.29.5 — the snapshot covers the
   *  laid-out subtree). */
  pinScale?: number;
  bubbleTitle?: string | null;
  bubbleText?: string | null;
  bubbleMeta?: string | null;
  bubbleLabel?: string | null;
  bubbleAccentColor?: string;
  bubbleCompact?: boolean;
  showBubble?: boolean;
  zIndex?: number;
  onPress?: () => void;
  onCalloutPress?: () => void;
  markerRef?: (ref: React.ComponentRef<typeof Marker> | null) => void;
  draggable?: boolean;
  onDragStart?: (event: MarkerDragStartEndEvent) => void;
  onDrag?: (event: MarkerDragEvent) => void;
  onDragEnd?: (event: MarkerDragStartEndEvent) => void;
  /** Optional children rendered inside the pin marker (e.g. a Callout). */
  children?: React.ReactNode;
}

/**
 * Renders a map pin plus an optional floating info pill above it.
 *
 * The pin uses the native `image` prop so it is rendered by the map SDK itself
 * (no React-view snapshot -> no flicker, no missing icons, exact anchor) —
 * except on iOS, where the `image` prop is broken under bridgeless mode
 * (RN >= 0.82, react-native-maps #5912) and the pin is rendered as a child
 * <Image> snapshot instead. The
 * pill lives in a second <Marker> anchored at the same coordinate with an
 * invisible spacer of (pinLift + gap) below it, so it always floats right
 * above the pin regardless of the pill's height.
 *
 * The pill marker keeps `tracksViewChanges` enabled permanently: text views
 * inside Android markers measure asynchronously and a one-shot snapshot
 * reliably clips them mid-glyph. Re-tracking a small text pill is cheap; the
 * pins (the part that actually hurt perf before) are native image markers.
 */
export default React.memo(function PinMarkerWithBubble({
  coordinate,
  pinImage,
  pinWidth,
  pinHeight,
  pinAnchor = 'tip',
  pinScale = 1,
  bubbleTitle,
  bubbleText,
  bubbleMeta,
  bubbleLabel,
  bubbleAccentColor,
  bubbleCompact = false,
  showBubble = true,
  zIndex = 5,
  onPress,
  onCalloutPress,
  markerRef,
  draggable = false,
  onDragStart,
  onDrag,
  onDragEnd,
  children,
}: PinMarkerWithBubbleProps) {
  const hasBubble =
    PIN_BUBBLES_ENABLED && showBubble && !!(bubbleTitle || bubbleText || bubbleMeta || bubbleLabel);

  const anchor = useMemo(
    () => (pinAnchor === 'center' ? { x: 0.5, y: 0.5 } : { x: 0.5, y: 1 }),
    [pinAnchor],
  );

  const scaledPin = pinScale !== 1;
  const scaledPinWidth = pinWidth * pinScale;
  const scaledPinHeight = pinHeight * pinScale;
  const pinTracking = useTracksViewChanges([pinImage, scaledPinWidth, scaledPinHeight]);
  // iOS bridgeless (RN >= 0.82 / New Arch): the native `image` prop silently
  // never renders because AIRGoogleMapMarker loads it through
  // [RCTBridge currentBridge], which is nil (react-native-maps #5912).
  // Rendering the pin as a child <Image> goes through the Fabric image
  // pipeline + view snapshot instead, which does work.
  const useChildImage = scaledPin || Platform.OS === 'ios';

  const lift = (pinAnchor === 'center' ? scaledPinHeight / 2 : scaledPinHeight) + BUBBLE_GAP;

  return (
    <>
      <Marker
        ref={markerRef}
        coordinate={coordinate}
        image={useChildImage ? undefined : toMarkerImageSource(pinImage)}
        anchor={anchor}
        tracksViewChanges={useChildImage ? pinTracking.tracksViewChanges : false}
        zIndex={zIndex}
        onPress={onPress}
        onCalloutPress={onCalloutPress}
        draggable={draggable}
        onDragStart={onDragStart}
        onDrag={onDrag}
        onDragEnd={onDragEnd}
      >
        {useChildImage && (
          <Image
            source={pinImage}
            style={{ width: scaledPinWidth, height: scaledPinHeight }}
            resizeMode="contain"
            onLoad={pinTracking.notifyContentRendered}
          />
        )}
        {children}
      </Marker>
      {hasBubble && (
        <Marker
          coordinate={coordinate}
          anchor={{ x: 0.5, y: 1 }}
          tracksViewChanges
          zIndex={zIndex + 1}
          onPress={onPress}
          tappable={!!onPress}
        >
          <View
            collapsable={false}
            style={[styles.column, { width: bubbleCompact ? COLUMN_WIDTH_COMPACT : COLUMN_WIDTH }]}
          >
            <PinInfoBubble
              title={bubbleTitle}
              text={bubbleText}
              meta={bubbleMeta}
              label={bubbleLabel}
              accentColor={bubbleAccentColor}
              compact={bubbleCompact}
            />
            <View collapsable={false} style={{ height: lift, width: 1 }} />
          </View>
        </Marker>
      )}
    </>
  );
});

const styles = StyleSheet.create({
  column: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
});
