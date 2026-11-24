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
import { useMapCamera, isValidCoord, toLatLng, coordsAreClose, altitudeFromZoom } from '../../hooks/shared/map/useMapCamera';
import { useMarkerHeading } from '../../hooks/shared/map/useMarkerHeading';
import { useTracksViewChanges } from '../../hooks/shared/map/useTracksViewChanges';
import { MAP_ICONS } from '../../constants/mapIcons';
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE } from '../../constants/mapStyles';
import { MainMarkerContent, MarkerType } from './mapMarkers/MarkerContent';
import PinMarkerWithBubble from './mapMarkers/PinMarkerWithBubble';
import NearbyDriversLayer from './mapMarkers/NearbyDriversLayer';
import DriverRadarLayer from './mapMarkers/DriverRadarLayer';
import NearbyPlacesLayer from './mapMarkers/NearbyPlacesLayer';
import RideRequestsLayer, { RideRequest } from './mapMarkers/RideRequestsLayer';
import { simplifyPolyline, coordsSignature } from '../../utils/geo/polylineSimplify';
import type { NearbyPlace } from '../../services/map/googleMapsService';

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
const SEDAN_PERSPECTIVE_ICON = require('../../assets/icons/vehicles/perspective/sedan-perspective.png');

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
  onPanDrag?: () => void;
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
  onRegionChangeCenter?: (center: { latitude: number; longitude: number; altitude?: number; isGesture?: boolean }) => void;
  onRegionChangeCompleteCenter?: (center: { latitude: number; longitude: number; altitude?: number; zoom?: number; isGesture?: boolean }) => void;
  nearbyPlaces?: NearbyPlace[];
  nearbyPlaceCandidateId?: string | null;
  nearbyPlaceSelectedId?: string | null;
  showMarker?: boolean;
  markerPosition?: { latitude: number; longitude: number } | null;
  markerType?: MarkerType;
  hideOriginPinImage?: boolean;
  originMarker?: { latitude: number; longitude: number } | null;
  destinationMarker?: { latitude: number; longitude: number } | null;
  clientMarker?: { latitude: number; longitude: number } | null;
  userLocation?: { latitude: number; longitude: number } | null;
  extraStopMarkers?: ExtraStopMarker[];
  routeCoordinates?: Array<{ latitude: number; longitude: number }>;
  secondaryRouteCoordinates?: Array<{ latitude: number; longitude: number }>;
  tertiaryRouteCoordinates?: Array<{ latitude: number; longitude: number }>;
  distanceLineCoordinates?: Array<{ latitude: number; longitude: number }>;
  cameraFitCoordinates?: Array<{ latitude: number; longitude: number }>;
  autoFitEnabled?: boolean;
  nearbyDrivers?: DriverMarker[];
  driverRadar?: boolean;
  onDriverPress?: (driverId: string) => void;
  draggableMarker?: boolean;
  onMarkerDragEnd?: (newLocation: { latitude: number; longitude: number }) => void;
  rideRequests?: RideRequest[];
  onRideRequestPress?: (rideRequest: RideRequest) => void;
  // kept for type compat
  showUserLocation?: boolean;
  navigationMarker?: boolean;
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
  originBubbleCompact?: boolean;
  originBubbleDark?: boolean;
  destinationLabel?: string;
  originTitle?: string;
  destinationTitle?: string;
  originMeta?: string;
  destinationMeta?: string;
  showPinBubbles?: boolean;
  disableMarkerPress?: boolean;
  onMarkerPress?: (coords: { latitude: number; longitude: number }) => void;
  cameraTarget?: {
    latitude: number;
    longitude: number;
    heading?: number;
    pitch?: number;
    zoom?: number;
    durationMs?: number;
  } | null;
  routeColor?: string;
  secondaryRouteColor?: string;
  tertiaryRouteColor?: string;
  googleRenderer?: 'LATEST' | 'LEGACY';
  fitEdgePadding?: Partial<EdgePadding>;
  allowRouteZoomOut?: boolean;
}

const DEFAULT_GOOGLE_RENDERER: 'LATEST' | 'LEGACY' =
  Platform.select({ android: 'LATEST', ios: 'LATEST', default: 'LATEST' }) || 'LATEST';

export default function GoogleMap({
  latitude,
  longitude,
  style,
  onMapPress,
  onPanDrag,
  scrollEnabled = true,
  zoomEnabled = true,
  onRegionChangeCenter,
  onRegionChangeCompleteCenter,
  onDriverPress,
  showMarker = true,
  markerPosition,
  markerType = 'default',
  hideOriginPinImage = false,
  originMarker,
  destinationMarker,
  clientMarker,
  userLocation,
  extraStopMarkers = [],
  routeCoordinates = [],
  secondaryRouteCoordinates = [],
  tertiaryRouteCoordinates = [],
  distanceLineCoordinates = [],
  cameraFitCoordinates,
  nearbyDrivers = [],
  driverRadar = false,
  nearbyPlaces = [],
  nearbyPlaceCandidateId,
  nearbyPlaceSelectedId,
  draggableMarker = false,
  onMarkerDragEnd,
  rideRequests = [],
  onRideRequestPress,
  showUserLocation = true,
  navigationMarker = false,
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
  originBubbleCompact,
  originBubbleDark,
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
  allowRouteZoomOut = false,
}: GoogleMapProps) {
  const { isDark } = useTheme();
  const [isMarkerHeld, setIsMarkerHeld] = useState(false);
  const [navigationIconFailed, setNavigationIconFailed] = useState(false);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const markerScale = useRef(new Animated.Value(1)).current;

  const resolvedUserLight = userLocationLightIcon || MAP_ICONS.USER_LOCATION_LIGHT;
  const resolvedUserDark = userLocationDarkIcon || MAP_ICONS.USER_LOCATION_DARK;
  const resolvedUserHoldingLight = userLocationHoldingLightIcon || MAP_ICONS.USER_LOCATION_HOLDING_LIGHT;
  const resolvedUserHoldingDark = userLocationHoldingDarkIcon || MAP_ICONS.USER_LOCATION_HOLDING_DARK;
  const baseUserMarkerIcon = isDark ? resolvedUserDark : resolvedUserLight;
  const holdingUserMarkerIcon = isDark ? resolvedUserHoldingDark : resolvedUserHoldingLight;
  const userMarkerIcon = isMarkerHeld ? holdingUserMarkerIcon || baseUserMarkerIcon : baseUserMarkerIcon;

  const camera = useMapCamera(latitude, longitude, onRegionChangeCenter, onRegionChangeCompleteCenter, allowRouteZoomOut);
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
    return LIGHT_MAP_STYLE;
  }, [customMapStyle, isDark]);

  useEffect(() => {
    if (!cameraTarget || !isMapReady || !isValidCoord(cameraTarget)) return;
    applyCamera(
      {
        center: toLatLng(cameraTarget),
        altitudeMeters:
          typeof cameraTarget.zoom === 'number' && Number.isFinite(cameraTarget.zoom)
            ? altitudeFromZoom(cameraTarget.zoom, cameraTarget.latitude)
            : undefined,
        heading: cameraTarget.heading,
        pitch: cameraTarget.pitch,
      },
      cameraTarget.durationMs ?? 320,
    );
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
  const navigationMarkerTracking = useTracksViewChanges([navigationMarker, navigationIconFailed]);
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
    if (cameraFitCoordinates?.length) {
      return cameraFitCoordinates.filter(isValidCoord).map(toLatLng);
    }

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
    cameraFitCoordinates,
  ]);

  const cameraFitSignature = useMemo(() => {
    if (markersToFit.length === 0) return '';
    const coordinatesSignature = markersToFit
      .map((coord) => `${coord.latitude.toFixed(5)}:${coord.longitude.toFixed(5)}`)
      .join('|');
    return `${coordinatesSignature}|${JSON.stringify(fitEdgePadding)}|${showPinBubbles}|${mapSize.width}:${mapSize.height}`;
  }, [markersToFit, fitEdgePadding, showPinBubbles, mapSize]);

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
    if (!autoFitEnabled || !isMapReady || !mapSize.width || !mapSize.height) {
      lastFitSignatureRef.current = '';
      return;
    }

    if (markersToFit.length === 0) {
      return;
    }

    if (cameraFitSignature && cameraFitSignature === lastFitSignatureRef.current) {
      return;
    }

    let retry: ReturnType<typeof setTimeout> | undefined;
    const fit = () => {
      if (gestureActiveRef.current && !cameraFitCoordinates?.length) {
        retry = setTimeout(fit, 300);
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
          const requestedPadding: EdgePadding = {
            top: fitEdgePadding?.top ?? (showPinBubbles ? 190 : 90),
            right: fitEdgePadding?.right ?? (showPinBubbles ? 90 : 44),
            bottom: fitEdgePadding?.bottom ?? 260,
            left: fitEdgePadding?.left ?? (showPinBubbles ? 90 : 44),
          };
          // Keep a usable viewport even when an expanded sheet covers most of the map.
          const verticalScale = Math.min(1, Math.max(0, mapSize.height - 80) / Math.max(1, requestedPadding.top + requestedPadding.bottom));
          const horizontalScale = Math.min(1, Math.max(0, mapSize.width - 80) / Math.max(1, requestedPadding.left + requestedPadding.right));
          const edgePadding: EdgePadding = {
            top: Math.max(0, requestedPadding.top * verticalScale),
            bottom: Math.max(0, requestedPadding.bottom * verticalScale),
            left: Math.max(0, requestedPadding.left * horizontalScale),
            right: Math.max(0, requestedPadding.right * horizontalScale),
          };
          map.fitToCoordinates(markersToFit, { edgePadding, animated: true });
          return;
        } catch (error) {
          console.warn('[GoogleMap] fitToCoordinates falló, usando applyCamera como respaldo:', error);
        }
      }

      const targetCenter = computeCentroid(markersToFit);
      applyCamera({ center: targetCenter, altitudeMeters: defaultCameraSettings.altitude }, 420);
    };
    fit();
    return () => { if (retry) clearTimeout(retry); };
  }, [markersToFit, cameraFitSignature, cameraFitCoordinates, autoFitEnabled, isMapReady, mapSize, computeCentroid, applyCamera, defaultCameraSettings.altitude, gestureActiveRef, fitEdgePadding, showPinBubbles]);

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
  const validDistanceLine = useMemo(
    () => distanceLineCoordinates.filter(isValidCoord).map(toLatLng),
    [distanceLineCoordinates],
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
    <View
      testID="google-map-container"
      style={[styles.container, style]}
      onLayout={({ nativeEvent: { layout } }) => {
        setMapSize((current) => current.width === layout.width && current.height === layout.height
          ? current : { width: layout.width, height: layout.height });
      }}
    >
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        {...googleRendererProps}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsBuildings
        showsCompass={false}
        toolbarEnabled={false}
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
        onPanDrag={onPanDrag}
        scrollEnabled={scrollEnabled}
        zoomEnabled={zoomEnabled}
        onRegionChange={handleRegionChange}
        onRegionChangeComplete={handleRegionChangeComplete}
        mapType={mapType || 'standard'}
        customMapStyle={Array.isArray(resolvedMapStyle) ? resolvedMapStyle : undefined}
        minZoomLevel={minZoomLevel}
        maxZoomLevel={maxZoomLevel}
      >
        <NearbyPlacesLayer
          places={nearbyPlaces}
          candidatePlaceId={nearbyPlaceCandidateId}
          selectedPlaceId={nearbyPlaceSelectedId}
          isDark={isDark}
        />
        {navigationMarker && effectiveUserLocation && (
          <Marker
            coordinate={effectiveUserLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={20}
            tracksViewChanges={navigationMarkerTracking.tracksViewChanges}
          >
            {navigationIconFailed ? (
              <View style={styles.navigationFallback}>
                <View style={styles.navigationArrow} />
              </View>
            ) : (
              <Image
                source={SEDAN_PERSPECTIVE_ICON}
                style={styles.navigationVehicle}
                resizeMode="contain"
                onLoad={navigationMarkerTracking.notifyContentRendered}
                onError={() => setNavigationIconFailed(true)}
              />
            )}
          </Marker>
        )}
        {!navigationMarker && shouldShowUserMarker && effectiveUserLocation && userMarkerIcon && (
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
                pinVisible={!(isManualOriginMarker && hideOriginPinImage && !isMarkerHeld)}
                pinScale={isManualOriginMarker ? manualOriginScale : userLocationScale}
                bubbleTitle={originTitle}
                bubbleText={originLabel}
                bubbleMeta={originMeta}
                bubbleAccentColor={originBubbleCompact ? '#0F172A' : '#2196F3'}
                bubbleCompact={originBubbleCompact}
                bubbleDark={originBubbleDark}
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

        {driverRadar && <DriverRadarLayer drivers={nearbyDrivers} zoom={currentZoom} />}
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
              strokeWidth={6}
              lineCap="round"
              lineJoin="round"
              zIndex={1}
            />
            <Polyline
              coordinates={simplifiedRoute}
              strokeColor={routeColor || "#2196F3"}
              strokeWidth={3.5}
              lineCap="round"
              lineJoin="round"
              zIndex={2}
            />
          </>
        )}

        {validDistanceLine.length > 1 && (
          <Polyline
            coordinates={validDistanceLine}
            strokeColor={isDark ? 'rgba(255,214,102,0.9)' : 'rgba(138,88,0,0.82)'}
            strokeWidth={2.5}
            lineDashPattern={[7, 6]}
            geodesic
            zIndex={3}
          />
        )}

        {simplifiedSecondaryRoute.length > 1 && (
          <>
            <Polyline
              coordinates={simplifiedSecondaryRoute}
              strokeColor={routeCasingColor}
              strokeWidth={5}
              lineCap="round"
              lineJoin="round"
              zIndex={1}
            />
            <Polyline
              coordinates={simplifiedSecondaryRoute}
              strokeColor={secondaryRouteColor || "#FFC107"}
              strokeWidth={3}
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
              strokeWidth={5}
              lineCap="round"
              lineJoin="round"
              zIndex={1}
            />
            <Polyline
              coordinates={simplifiedTertiaryRoute}
              strokeColor={tertiaryRouteColor || "#FF9800"}
              strokeWidth={3}
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
  navigationVehicle: {
    width: 24.9,
    height: 43.6,
  },
  navigationFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0879ed',
    borderColor: '#ffffff',
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navigationArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 20,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#ffffff',
    marginTop: -2,
  },
});
