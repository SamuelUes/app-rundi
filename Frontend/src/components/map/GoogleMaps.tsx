import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Image, ImageSourcePropType, Animated, Platform } from 'react-native';
import MapView, {
  LatLng,
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  MapPressEvent,
  MarkerDragStartEndEvent,
  EdgePadding,
} from 'react-native-maps';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useMapCamera, isValidCoord, toLatLng, coordsAreClose } from '../../hooks/shared/map/useMapCamera';
import { useMarkerHeading } from '../../hooks/shared/map/useMarkerHeading';
import { useTracksViewChanges } from '../../hooks/shared/map/useTracksViewChanges';
import { MAP_ICONS } from '../../constants/mapIcons';
import { DARK_MAP_STYLE } from '../../constants/mapStyles';
import { MainMarkerContent, MarkerType } from './mapMarkers/MarkerContent';
import PinMarkerWithBubble from './mapMarkers/PinMarkerWithBubble';
import NearbyDriversLayer from './mapMarkers/NearbyDriversLayer';
import RideRequestsLayer, { RideRequest } from './mapMarkers/RideRequestsLayer';
import { simplifyPolyline, coordsSignature } from '../../utils/polylineSimplify';

export interface ExtraStopMarker {
  latitude: number;
  longitude: number;
  index: number;
  color?: string;
  label?: string;
  title?: string;
  meta?: string;
}

const ORIGIN_PIN_SIZE = { width: 28, height: 28 };
const DESTINATION_PIN_SIZE = { width: 22, height: 39 };
const EXTRA_STOP_PIN_SIZE = { width: 22, height: 39 };
const MANUAL_ORIGIN_PIN_HEIGHT = 39;
const MANUAL_ORIGIN_HOLD_PIN_HEIGHT = 41;

export interface DriverMarker {
  id: string;
  latitude: number;
  longitude: number;
  heading?: number;
  vehicleIconSource?: ImageSourcePropType;
  isSelected?: boolean;
  rating?: number | null;
  photoURL?: string | null;
}

interface GoogleMapProps {
  latitude: number;
  longitude: number;
  style?: any;
  onMapPress?: (event: { latitude: number; longitude: number }) => void;
  onRegionChangeCenter?: (center: { latitude: number; longitude: number; altitude?: number }) => void;
  onRegionChangeCompleteCenter?: (center: { latitude: number; longitude: number; altitude?: number }) => void;
  showMarker?: boolean;
  markerPosition?: { latitude: number; longitude: number } | null;
  markerType?: MarkerType;
  originMarker?: { latitude: number; longitude: number } | null;
  destinationMarker?: { latitude: number; longitude: number } | null;
  clientMarker?: { latitude: number; longitude: number } | null;
  userLocation?: { latitude: number; longitude: number } | null;
  extraStopMarkers?: ExtraStopMarker[];
  routeCoordinates?: Array<{ latitude: number; longitude: number }>;
  secondaryRouteCoordinates?: Array<{ latitude: number; longitude: number }>;
  tertiaryRouteCoordinates?: Array<{ latitude: number; longitude: number }>;
  autoFitEnabled?: boolean;
  nearbyDrivers?: DriverMarker[];
  onDriverPress?: (driverId: string) => void;
  draggableMarker?: boolean;
  onMarkerDragEnd?: (newLocation: { latitude: number; longitude: number }) => void;
  rideRequests?: RideRequest[];
  onRideRequestPress?: (rideRequest: RideRequest) => void;
  // kept for type compat
  showUserLocation?: boolean;
  mapType?: 'standard' | 'satellite' | 'hybrid' | 'terrain';
  customMapStyle?: any;
  trafficEnabled?: boolean;
  markerVehicleType?: string;
  markerVehicleIconSource?: ImageSourcePropType;
  markerVehicleHeading?: number;
  userLocationLightIcon?: ImageSourcePropType;
  userLocationDarkIcon?: ImageSourcePropType;
  userLocationHoldingLightIcon?: ImageSourcePropType;
  userLocationHoldingDarkIcon?: ImageSourcePropType;
  manualOriginIcon?: ImageSourcePropType;
  manualOriginHoldIcon?: ImageSourcePropType;
  manualOriginBounceValue?: Animated.AnimatedInterpolation<number> | Animated.Value;
  manualOriginScale?: number;
  userLocationScale?: number;
  /** Scales the ride-request pins (requests_pin) rendered by RideRequestsLayer. */
  requestPinScale?: number;
  onMarkerDragStart?: (location: { latitude: number; longitude: number }) => void;
  // Small address bubbles
  originLabel?: string;
  destinationLabel?: string;
  originTitle?: string;
  destinationTitle?: string;
  originMeta?: string;
  destinationMeta?: string;
  showPinBubbles?: boolean;
  disableMarkerPress?: boolean;
  onMarkerPress?: (coords: { latitude: number; longitude: number }) => void;
  cameraTarget?: { latitude: number; longitude: number } | null;
  routeColor?: string;
  secondaryRouteColor?: string;
  tertiaryRouteColor?: string;
  googleRenderer?: 'LATEST' | 'LEGACY';
  fitEdgePadding?: Partial<EdgePadding>;
}

const DEFAULT_GOOGLE_RENDERER: 'LATEST' | 'LEGACY' =
  Platform.select({ android: 'LATEST', ios: 'LATEST', default: 'LATEST' }) || 'LATEST';

export default function GoogleMap({
  latitude,
  longitude,
  style,
  onMapPress,
  onRegionChangeCenter,
  onRegionChangeCompleteCenter,
  onDriverPress,
  showMarker = true,
  markerPosition,
  markerType = 'default',
  originMarker,
  destinationMarker,
  clientMarker,
  userLocation,
  extraStopMarkers = [],
  routeCoordinates = [],
  secondaryRouteCoordinates = [],
  tertiaryRouteCoordinates = [],
  nearbyDrivers = [],
  draggableMarker = false,
  onMarkerDragEnd,
  rideRequests = [],
  onRideRequestPress,
  showUserLocation = true,
  mapType,
  customMapStyle = [],
  trafficEnabled = false,
  markerVehicleType,
  markerVehicleIconSource,
  markerVehicleHeading,
  userLocationLightIcon,
  userLocationDarkIcon,
  userLocationHoldingLightIcon,
  userLocationHoldingDarkIcon,
  manualOriginIcon,
  manualOriginHoldIcon,
  manualOriginBounceValue,
  manualOriginScale = 1,
  userLocationScale = 1,
  requestPinScale = 1,
  onMarkerDragStart,
  originLabel,
  destinationLabel,
  originTitle,
  destinationTitle,
  originMeta,
  destinationMeta,
  showPinBubbles = true,
  disableMarkerPress = false,
  onMarkerPress,
  cameraTarget,
  autoFitEnabled = true,
  routeColor = '#2196F3',
  secondaryRouteColor = '#FFC107',
  tertiaryRouteColor = '#FF9800',
  googleRenderer = DEFAULT_GOOGLE_RENDERER,
  fitEdgePadding,
}: GoogleMapProps) {
  const { isDark } = useTheme();
  const [isMarkerHeld, setIsMarkerHeld] = useState(false);
  const markerScale = useRef(new Animated.Value(1)).current;

  const resolvedUserLight = userLocationLightIcon || MAP_ICONS.USER_LOCATION_LIGHT;
  const resolvedUserDark = userLocationDarkIcon || MAP_ICONS.USER_LOCATION_DARK;
  const resolvedUserHoldingLight = userLocationHoldingLightIcon || MAP_ICONS.USER_LOCATION_HOLDING_LIGHT;
  const resolvedUserHoldingDark = userLocationHoldingDarkIcon || MAP_ICONS.USER_LOCATION_HOLDING_DARK;
  const baseUserMarkerIcon = isDark ? resolvedUserDark : resolvedUserLight;
  const holdingUserMarkerIcon = isDark ? resolvedUserHoldingDark : resolvedUserHoldingLight;
  const userMarkerIcon = isMarkerHeld ? holdingUserMarkerIcon || baseUserMarkerIcon : baseUserMarkerIcon;

  const camera = useMapCamera(latitude, longitude, onRegionChangeCenter, onRegionChangeCompleteCenter);
  const {
    mapRef,
    currentZoom,
    isMapReady,
    defaultCameraSettings,
    minZoomLevel,
    maxZoomLevel,
    lastCameraAltitudeRef,
    gestureActiveRef,
    applyCamera,
    animateCameraToCoordinate,
    handleRegionChange,
    handleRegionChangeComplete,
    handleMapReady,
    markGestureActive,
  } = camera;

  const safeInitialCenter = useMemo(
    () => (isValidCoord({ latitude, longitude }) ? { latitude, longitude } : { latitude: 0, longitude: 0 }),
    [latitude, longitude],
  );
  const effectiveMarkerType = isMarkerHeld && markerType === 'manual_origin' ? 'manual_origin_hold' : markerType;
  const lastFitSignatureRef = useRef<string>('');

  const effectiveUserLocation = useMemo(() => {
    if (!showUserLocation) return null;
    if (isValidCoord(userLocation)) return toLatLng(userLocation);
    if (isValidCoord(clientMarker)) return toLatLng(clientMarker);
    return null;
  }, [showUserLocation, userLocation, clientMarker]);

  const resolvedMapStyle = useMemo(() => {
    if (Array.isArray(customMapStyle) && customMapStyle.length > 0) {
      return customMapStyle;
    }
    if (isDark) {
      return DARK_MAP_STYLE;
    }
    return null;
  }, [customMapStyle, isDark]);

  useEffect(() => {
    if (!cameraTarget || !isMapReady || !isValidCoord(cameraTarget)) return;
    applyCamera({ center: toLatLng(cameraTarget) }, 320);
  }, [cameraTarget, applyCamera, isMapReady]);

  const effectiveMarkerPosition =
    showMarker && markerPosition && Number.isFinite(markerPosition.latitude) && Number.isFinite(markerPosition.longitude)
      ? markerPosition
      : null;

  const markerPositionLatLng = useMemo(() => {
    if (effectiveMarkerPosition && isValidCoord(effectiveMarkerPosition)) {
      return toLatLng(effectiveMarkerPosition);
    }
    return null;
  }, [effectiveMarkerPosition]);

  const shouldShowUserMarker = useMemo(() => {
    if (!showUserLocation || !effectiveUserLocation) return false;
    if (markerPositionLatLng && coordsAreClose(effectiveUserLocation, markerPositionLatLng)) {
      return false;
    }
    return true;
  }, [showUserLocation, effectiveUserLocation, markerPositionLatLng]);

  const baseVehicleZoom = 16.7;

  const { resolvedMarkerHeading, resolveDriverHeading, getVehicleIconSizeForZoom } = useMarkerHeading(
    markerPositionLatLng,
    markerVehicleHeading,
    effectiveMarkerType,
    routeCoordinates,
    baseVehicleZoom,
  );

  // Child-view markers must keep `tracksViewChanges` on until their snapshot is
  // taken; afterwards it gets disabled so they stop re-rasterizing every frame.
  // Markers rendered via the native `image` prop don't need tracking at all.
  const carMarkerTracking = useTracksViewChanges([markerVehicleIconSource, Math.round(getVehicleIconSizeForZoom(currentZoom))]);
  const mainMarkerTracking = useTracksViewChanges([
    effectiveMarkerType,
    userMarkerIcon,
    manualOriginIcon,
    manualOriginHoldIcon,
    isMarkerHeld,
    manualOriginScale,
  ]);

  const isManualOriginMarker =
    effectiveMarkerType === 'manual_origin' || effectiveMarkerType === 'manual_origin_hold';

  const markersToFit = useMemo<LatLng[]>(() => {
    const coords: LatLng[] = [];

    if (isValidCoord(originMarker)) coords.push(toLatLng(originMarker));
    if (isValidCoord(destinationMarker)) coords.push(toLatLng(destinationMarker));
    if (isValidCoord(clientMarker)) coords.push(toLatLng(clientMarker));
    if (showMarker && isValidCoord(markerPosition)) coords.push(toLatLng(markerPosition));

    extraStopMarkers.forEach((stop) => {
      if (isValidCoord(stop)) {
        coords.push(toLatLng(stop));
      }
    });

    // Nota: intencionalmente no incluimos nearbyDrivers en markersToFit
    // para evitar animaciones de cámara frecuentes con muchos marcadores dinámicos.
    // Sí incluimos un subconjunto de rideRequests para que la cámara las encuadre.

    rideRequests.slice(0, 3).forEach((request) => {
      if (isValidCoord(request)) {
        coords.push(toLatLng(request));
      }
    });

    if (routeCoordinates.length > 0) {
      coords.push(
        ...routeCoordinates
          .filter(isValidCoord)
          .map((coord) => ({ latitude: coord.latitude, longitude: coord.longitude })),
      );
    }

    if (secondaryRouteCoordinates.length > 0) {
      coords.push(
        ...secondaryRouteCoordinates
          .filter(isValidCoord)
          .map((coord) => ({ latitude: coord.latitude, longitude: coord.longitude })),
      );
    }

    if (tertiaryRouteCoordinates.length > 0) {
      coords.push(
        ...tertiaryRouteCoordinates
          .filter(isValidCoord)
          .map((coord) => ({ latitude: coord.latitude, longitude: coord.longitude })),
      );
    }

    return coords;
  }, [
    originMarker,
    destinationMarker,
    clientMarker,
    markerPosition,
    showMarker,
    extraStopMarkers,
    rideRequests,
    routeCoordinates,
    secondaryRouteCoordinates,
    tertiaryRouteCoordinates,
  ]);

  const cameraFitSignature = useMemo(() => {
    if (markersToFit.length === 0) return '';
    return markersToFit
      .map((coord) => `${coord.latitude.toFixed(5)}:${coord.longitude.toFixed(5)}`)
      .join('|');
  }, [markersToFit]);

  const computeCentroid = useCallback((coords: LatLng[]): LatLng => {
    const accumulator = coords.reduce(
      (acc, coord) => {
        acc.latitude += coord.latitude;
        acc.longitude += coord.longitude;
        return acc;
      },
      { latitude: 0, longitude: 0 },
    );
    const count = coords.length || 1;
    return {
      latitude: accumulator.latitude / count,
      longitude: accumulator.longitude / count,
    };
  }, []);

  useEffect(() => {
    if (!autoFitEnabled || !isMapReady) {
      lastFitSignatureRef.current = '';
      return;
    }

    if (gestureActiveRef.current) {
      return;
    }

    if (markersToFit.length === 0) {
      return;
    }

    if (cameraFitSignature && cameraFitSignature === lastFitSignatureRef.current) {
      return;
    }

    lastFitSignatureRef.current = cameraFitSignature;

    const map = mapRef.current as any;

    if (markersToFit.length === 1) {
      applyCamera({ center: markersToFit[0], altitudeMeters: defaultCameraSettings.altitude }, 420);
      return;
    }

    if (map && typeof map.fitToCoordinates === 'function') {
      try {
        // Extra top room so the floating info pills above pins never get
        // clipped by the top edge of the map.
        const edgePadding: EdgePadding = {
          top: fitEdgePadding?.top ?? (showPinBubbles ? 190 : 90),
          right: fitEdgePadding?.right ?? (showPinBubbles ? 90 : 44),
          bottom: fitEdgePadding?.bottom ?? 260,
          left: fitEdgePadding?.left ?? (showPinBubbles ? 90 : 44),
        };
        map.fitToCoordinates(markersToFit, {
          edgePadding,
          animated: true,
        });
        return;
      } catch (error) {
        console.warn('[GoogleMap] fitToCoordinates falló, usando applyCamera como respaldo:', error);
      }
    }

    const targetCenter = markersToFit.length === 1 ? markersToFit[0] : computeCentroid(markersToFit);
    applyCamera({ center: targetCenter, altitudeMeters: defaultCameraSettings.altitude }, 420);
  }, [markersToFit, cameraFitSignature, autoFitEnabled, isMapReady, computeCentroid, applyCamera, defaultCameraSettings.altitude, gestureActiveRef, fitEdgePadding, showPinBubbles]);

  const handleMapPress = (event: MapPressEvent) => {
    if (disableMarkerPress || gestureActiveRef.current) {
      return;
    }
    if (!onMapPress) return;
    const { latitude: lat, longitude: lng } = event.nativeEvent.coordinate;
    onMapPress({ latitude: lat, longitude: lng });
  };

  const animateMarkerScale = (toValue: number) => {
    Animated.spring(markerScale, {
      toValue,
      useNativeDriver: true,
      friction: 6,
      tension: 120,
    }).start();
  };

  const markerDragFollowThrottleRef = useRef<number>(0);

  const handleMarkerDragStart = (event: MarkerDragStartEndEvent) => {
    setIsMarkerHeld(true);
    animateMarkerScale(1.12);
    if (onMarkerDragStart) {
      const { latitude: lat, longitude: lng } = event.nativeEvent.coordinate;
      onMarkerDragStart({ latitude: lat, longitude: lng });
    }
    animateCameraToCoordinate(event.nativeEvent.coordinate, 280);
  };

  const handleMarkerDrag = (event: MarkerDragStartEndEvent) => {
    const now = Date.now();
    if (now - markerDragFollowThrottleRef.current < 90) {
      return;
    }
    markerDragFollowThrottleRef.current = now;
    animateCameraToCoordinate(event.nativeEvent.coordinate, 340);
  };

  const handleMarkerDragEnd = (event: MarkerDragStartEndEvent) => {
    setIsMarkerHeld(false);
    animateMarkerScale(1);
    if (!onMarkerDragEnd) return;
    const { latitude: lat, longitude: lng } = event.nativeEvent.coordinate;
    onMarkerDragEnd({ latitude: lat, longitude: lng });
    animateCameraToCoordinate(event.nativeEvent.coordinate, 260);
  };

  const googleRendererProps = useMemo<Record<string, any>>(
    () => (Platform.OS === 'android' ? { googleMapsRenderer: googleRenderer } : {}),
    [googleRenderer],
  );

  // 2.5m tolerance keeps the polyline glued to the streets instead of cutting
  // corners, while still dropping redundant points on long straight segments.
  // Memoizar por firma de contenido: los padres recrean estos arrays en cada
  // render (snapshots GPS), así que la identidad del array cambia siempre.
  const routeRef = useRef(routeCoordinates);
  routeRef.current = routeCoordinates;
  const routeSignature = coordsSignature(routeCoordinates);
  const simplifiedRoute = useMemo(
    () => simplifyPolyline(routeRef.current.filter(isValidCoord).map(toLatLng), 2.5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routeSignature],
  );

  const secondaryRouteRef = useRef(secondaryRouteCoordinates);
  secondaryRouteRef.current = secondaryRouteCoordinates;
  const secondaryRouteSignature = coordsSignature(secondaryRouteCoordinates);
  const simplifiedSecondaryRoute = useMemo(
    () => simplifyPolyline(secondaryRouteRef.current.filter(isValidCoord).map(toLatLng), 2.5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [secondaryRouteSignature],
  );

  const tertiaryRouteRef = useRef(tertiaryRouteCoordinates);
  tertiaryRouteRef.current = tertiaryRouteCoordinates;
  const tertiaryRouteSignature = coordsSignature(tertiaryRouteCoordinates);
  const simplifiedTertiaryRoute = useMemo(
    () => simplifyPolyline(tertiaryRouteRef.current.filter(isValidCoord).map(toLatLng), 2.5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tertiaryRouteSignature],
  );

  const routeCasingColor = isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.9)';

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        {...googleRendererProps}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsTraffic={trafficEnabled}
        onMapReady={handleMapReady}
        initialCamera={{
          center: safeInitialCenter,
          altitude: defaultCameraSettings.altitude,
          zoom: defaultCameraSettings.zoom,
          pitch: 0,
          heading: 0,
        }}
        onPress={handleMapPress}
        onRegionChange={handleRegionChange}
        onRegionChangeComplete={handleRegionChangeComplete}
        mapType={mapType || 'standard'}
        customMapStyle={Array.isArray(resolvedMapStyle) ? resolvedMapStyle : undefined}
        minZoomLevel={minZoomLevel}
        maxZoomLevel={maxZoomLevel}
      >
        {shouldShowUserMarker && effectiveUserLocation && userMarkerIcon && (
          <PinMarkerWithBubble
            coordinate={effectiveUserLocation}
            pinImage={userMarkerIcon}
            pinWidth={isMarkerHeld ? 24 : 22}
            pinHeight={isMarkerHeld ? 41 : 39}
            pinAnchor="tip"
            pinScale={userLocationScale}
            showBubble={false}
            zIndex={10}
          />
        )}

        {isValidCoord(originMarker) && (
          <PinMarkerWithBubble
            coordinate={toLatLng(originMarker)}
            pinImage={MAP_ICONS.ORIGIN_PIN}
            pinWidth={ORIGIN_PIN_SIZE.width}
            pinHeight={ORIGIN_PIN_SIZE.height}
            pinAnchor="center"
            bubbleTitle={originTitle}
            bubbleText={originLabel}
            bubbleMeta={originMeta}
            bubbleAccentColor="#2196F3"
            showBubble={showPinBubbles}
            zIndex={5}
          />
        )}

        {isValidCoord(clientMarker) && !effectiveUserLocation && userMarkerIcon && (
          <PinMarkerWithBubble
            coordinate={toLatLng(clientMarker)}
            pinImage={userMarkerIcon}
            pinWidth={isMarkerHeld ? 24 : 22}
            pinHeight={isMarkerHeld ? 41 : 39}
            pinAnchor="tip"
            pinScale={userLocationScale}
            showBubble={false}
            zIndex={6}
          />
        )}

        {isValidCoord(destinationMarker) && (
          <PinMarkerWithBubble
            coordinate={toLatLng(destinationMarker)}
            pinImage={MAP_ICONS.DESTINATION_PIN}
            pinWidth={DESTINATION_PIN_SIZE.width}
            pinHeight={DESTINATION_PIN_SIZE.height}
            pinAnchor="tip"
            bubbleTitle={destinationTitle}
            bubbleText={destinationLabel}
            bubbleMeta={destinationMeta}
            bubbleAccentColor="#E53935"
            showBubble={showPinBubbles}
            zIndex={5}
          />
        )}

        {showMarker && isValidCoord(markerPosition) && effectiveMarkerType === 'car' && (() => {
          const iconSize = getVehicleIconSizeForZoom(currentZoom);
          return (
            <Marker
              key={`car-marker-${iconSize}`}
              coordinate={toLatLng(markerPosition)}
              tracksViewChanges={carMarkerTracking.tracksViewChanges}
              draggable={!!draggableMarker}
              onDragStart={handleMarkerDragStart}
              onDrag={handleMarkerDrag}
              onDragEnd={handleMarkerDragEnd}
              onPress={() => {
                if (typeof onMarkerPress === 'function') {
                  onMarkerPress({ latitude: markerPosition.latitude, longitude: markerPosition.longitude });
                }
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              centerOffset={{ x: 0, y: 0 }}
              flat
              rotation={typeof resolvedMarkerHeading === 'number' ? resolvedMarkerHeading : undefined}
            >
              {markerVehicleIconSource && (
                <View style={{ width: iconSize, height: iconSize, justifyContent: 'center', alignItems: 'center' }} collapsable={false}>
                  <Image
                    source={markerVehicleIconSource}
                    style={{ width: iconSize, height: iconSize, resizeMode: 'contain' }}
                    onLoad={carMarkerTracking.notifyContentRendered}
                  />
                </View>
              )}
            </Marker>
          );
        })()}

        {showMarker && isValidCoord(markerPosition) && effectiveMarkerType !== 'car' && (() => {
          const heldAsset = isManualOriginMarker && isMarkerHeld;
          const mainPinImage = isManualOriginMarker
            ? (isMarkerHeld ? manualOriginHoldIcon || manualOriginIcon : manualOriginIcon)
            : effectiveMarkerType === 'client'
            ? userMarkerIcon || MAP_ICONS.USER_LOCATION_DARK
            : null;

          const handleMainPress = () => {
            if (typeof onMarkerPress === 'function') {
              onMarkerPress({ latitude: markerPosition.latitude, longitude: markerPosition.longitude });
            }
          };

          if (mainPinImage) {
            return (
              <PinMarkerWithBubble
                coordinate={toLatLng(markerPosition)}
                pinImage={mainPinImage}
                pinWidth={heldAsset ? 24 : 22}
                pinHeight={heldAsset ? MANUAL_ORIGIN_HOLD_PIN_HEIGHT : MANUAL_ORIGIN_PIN_HEIGHT}
                pinAnchor="tip"
                pinScale={isManualOriginMarker ? manualOriginScale : userLocationScale}
                bubbleTitle={originTitle}
                bubbleText={originLabel}
                bubbleMeta={originMeta}
                bubbleAccentColor="#2196F3"
                showBubble={showPinBubbles && isManualOriginMarker && !isMarkerHeld}
                draggable={!!draggableMarker}
                onDragStart={handleMarkerDragStart}
                onDrag={handleMarkerDrag}
                onDragEnd={handleMarkerDragEnd}
                onPress={handleMainPress}
                zIndex={6}
              />
            );
          }

          // Fallback for marker types without a dedicated asset.
          return (
            <Marker
              coordinate={toLatLng(markerPosition)}
              tracksViewChanges={mainMarkerTracking.tracksViewChanges}
              draggable={!!draggableMarker}
              onDragStart={handleMarkerDragStart}
              onDrag={handleMarkerDrag}
              onDragEnd={handleMarkerDragEnd}
              onPress={handleMainPress}
              anchor={{ x: 0.5, y: 0.5 }}
              flat
              zIndex={6}
            >
              <MainMarkerContent
                type={effectiveMarkerType}
                vehicleIconSource={markerVehicleIconSource}
                userMarkerIcon={userMarkerIcon}
                manualOriginIcon={manualOriginIcon}
                manualOriginHoldIcon={manualOriginHoldIcon}
                isMarkerHeld={isMarkerHeld}
                manualOriginScale={manualOriginScale}
              />
            </Marker>
          );
        })()}

        {extraStopMarkers.map((stop) => {
          if (!isValidCoord(stop)) return null;
          return (
            <PinMarkerWithBubble
              key={`extra-stop-${stop.index}`}
              coordinate={toLatLng(stop)}
              pinImage={MAP_ICONS.MULTI_STOP_PIN}
              pinWidth={EXTRA_STOP_PIN_SIZE.width}
              pinHeight={EXTRA_STOP_PIN_SIZE.height}
              pinAnchor="tip"
              bubbleTitle={stop.title}
              bubbleText={stop.label}
              bubbleMeta={stop.meta}
              bubbleAccentColor="#D39838"
              showBubble={showPinBubbles}
              zIndex={5}
            />
          );
        })}

        <NearbyDriversLayer
          nearbyDrivers={nearbyDrivers}
          onDriverPress={onDriverPress}
          currentZoom={currentZoom}
          resolveDriverHeading={resolveDriverHeading}
        />

        <RideRequestsLayer
          rideRequests={rideRequests}
          onRideRequestPress={onRideRequestPress}
          showPinBubbles={showPinBubbles}
          requestPinScale={requestPinScale}
        />

        {simplifiedRoute.length > 1 && (
          <>
            <Polyline
              coordinates={simplifiedRoute}
              strokeColor={routeCasingColor}
              strokeWidth={8}
              lineCap="round"
              lineJoin="round"
              zIndex={1}
            />
            <Polyline
              coordinates={simplifiedRoute}
              strokeColor={routeColor || "#2196F3"}
              strokeWidth={4.5}
              lineCap="round"
              lineJoin="round"
              zIndex={2}
            />
          </>
        )}

        {simplifiedSecondaryRoute.length > 1 && (
          <>
            <Polyline
              coordinates={simplifiedSecondaryRoute}
              strokeColor={routeCasingColor}
              strokeWidth={7}
              lineCap="round"
              lineJoin="round"
              zIndex={1}
            />
            <Polyline
              coordinates={simplifiedSecondaryRoute}
              strokeColor={secondaryRouteColor || "#FFC107"}
              strokeWidth={4}
              lineCap="round"
              lineJoin="round"
              zIndex={2}
            />
          </>
        )}

        {simplifiedTertiaryRoute.length > 1 && (
          <>
            <Polyline
              coordinates={simplifiedTertiaryRoute}
              strokeColor={routeCasingColor}
              strokeWidth={7}
              lineCap="round"
              lineJoin="round"
              zIndex={1}
            />
            <Polyline
              coordinates={simplifiedTertiaryRoute}
              strokeColor={tertiaryRouteColor || "#FF9800"}
              strokeWidth={4}
              lineCap="round"
              lineJoin="round"
              zIndex={2}
            />
          </>
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
});

