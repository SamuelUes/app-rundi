import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, Image, ImageSourcePropType, Animated, Platform, ImageURISource } from 'react-native';
import MapView, {
  LatLng,
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  MapPressEvent,
  MarkerDragStartEndEvent,
} from 'react-native-maps';
import { useTheme } from '../../context/ThemeContext';
import { useMapCamera, isValidCoord, toLatLng, toMarkerImageSource, coordsAreClose } from '../../hooks/shared/map/useMapCamera';
import { useMarkerHeading } from '../../hooks/shared/map/useMarkerHeading';
import { MAP_ICONS } from '../../constants/mapIcons';
import { DARK_MAP_STYLE } from '../../constants/mapStyles';
import { MainMarkerContent, markerStyles, MarkerType } from './mapMarkers/MarkerContent';
import NearbyDriversLayer from './mapMarkers/NearbyDriversLayer';
import RideRequestsLayer, { RideRequest } from './mapMarkers/RideRequestsLayer';
import { simplifyPolyline } from '../../utils/polylineSimplify';

export interface ExtraStopMarker {
  latitude: number;
  longitude: number;
  index: number;
  color?: string;
  label?: string;
}

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
  onMarkerDragStart?: (location: { latitude: number; longitude: number }) => void;
  // Small address bubbles
  originLabel?: string;
  destinationLabel?: string;
  showPinBubbles?: boolean;
  disableMarkerPress?: boolean;
  onMarkerPress?: (coords: { latitude: number; longitude: number }) => void;
  cameraTarget?: { latitude: number; longitude: number } | null;
  routeColor?: string;
  secondaryRouteColor?: string;
  googleRenderer?: 'LATEST' | 'LEGACY';
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
  onMarkerDragStart,
  originLabel,
  destinationLabel,
  showPinBubbles = true,
  disableMarkerPress = false,
  onMarkerPress,
  cameraTarget,
  autoFitEnabled = true,
  routeColor = '#2196F3',
  secondaryRouteColor = '#FFC107',
  googleRenderer = DEFAULT_GOOGLE_RENDERER,
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
        map.fitToCoordinates(markersToFit, {
          edgePadding: { top: 80, right: 40, bottom: 260, left: 40 },
          animated: true,
        });
        return;
      } catch (error) {
        console.warn('[GoogleMap] fitToCoordinates falló, usando applyCamera como respaldo:', error);
      }
    }

    const targetCenter = markersToFit.length === 1 ? markersToFit[0] : computeCentroid(markersToFit);
    applyCamera({ center: targetCenter, altitudeMeters: defaultCameraSettings.altitude }, 420);
  }, [markersToFit, cameraFitSignature, autoFitEnabled, isMapReady, computeCentroid, applyCamera, defaultCameraSettings.altitude, gestureActiveRef]);

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

  const simplifiedRoute = useMemo(
    () => simplifyPolyline(routeCoordinates.filter(isValidCoord).map(toLatLng), 10),
    [routeCoordinates],
  );

  const simplifiedSecondaryRoute = useMemo(
    () => simplifyPolyline(secondaryRouteCoordinates.filter(isValidCoord).map(toLatLng), 10),
    [secondaryRouteCoordinates],
  );

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
          <Marker coordinate={effectiveUserLocation} tracksViewChanges anchor={{ x: 0.5, y: 0.5}} zIndex={10}>
            <View style={{ transform: [{ scale: userLocationScale || 1 }] }}>
              <Image source={userMarkerIcon} style={markerStyles.userMarkerImage} />
            </View>
          </Marker>
        )}

        {isValidCoord(originMarker) && (
          <>
            <Marker
              coordinate={toLatLng(originMarker)}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 1 }}
              image={toMarkerImageSource(MAP_ICONS.ORIGIN_PIN)}
            />
            {showPinBubbles && !!originLabel && (
              <Marker coordinate={toLatLng(originMarker)} tracksViewChanges anchor={{ x: 0.5, y: 1 }}>
                <View style={markerStyles.pinWithBubble}>
                  <View style={markerStyles.smallBubble}>
                    <Text numberOfLines={1} style={markerStyles.smallBubbleText}>{originLabel}</Text>
                  </View>
                </View>
              </Marker>
            )}
          </>
        )}

        {isValidCoord(clientMarker) && !effectiveUserLocation && (
          <Marker coordinate={toLatLng(clientMarker)} tracksViewChanges>
            <MainMarkerContent type="client" userMarkerIcon={userMarkerIcon} />
          </Marker>
        )}

        {isValidCoord(destinationMarker) && (
          <>
            <Marker
              coordinate={toLatLng(destinationMarker)}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 1 }}
              image={toMarkerImageSource(MAP_ICONS.DESTINATION_PIN)}
            />
            {showPinBubbles && !!destinationLabel && (
              <Marker coordinate={toLatLng(destinationMarker)} tracksViewChanges anchor={{ x: 0.5, y: 1 }}>
                <View style={markerStyles.pinWithBubble}>
                  <View style={markerStyles.smallBubble}>
                    <Text numberOfLines={1} style={markerStyles.smallBubbleText}>{destinationLabel}</Text>
                  </View>
                </View>
              </Marker>
            )}
          </>
        )}

        {showMarker && isValidCoord(markerPosition) && effectiveMarkerType === 'car' && (() => {
          const iconSize = getVehicleIconSizeForZoom(currentZoom);
          return (
            <Marker
              key={`car-marker-${iconSize}`}
              coordinate={toLatLng(markerPosition)}
              tracksViewChanges
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
                <View style={{ width: iconSize, height: iconSize, justifyContent: 'center', alignItems: 'center' }}>
                  <Image source={markerVehicleIconSource} style={{ width: iconSize, height: iconSize, resizeMode: 'contain' }} />
                </View>
              )}
            </Marker>
          );
        })()}

        {showMarker && isValidCoord(markerPosition) && effectiveMarkerType !== 'car' && (() => {
          const useChildrenForManualOrigin =
            effectiveMarkerType === 'manual_origin' || effectiveMarkerType === 'manual_origin_hold';

          let markerImage: number | ImageURISource | undefined;
          if (!useChildrenForManualOrigin && effectiveMarkerType === 'client') {
            markerImage = toMarkerImageSource(userMarkerIcon || MAP_ICONS.USER_LOCATION_DARK);
          }

          const shouldRenderChildren = useChildrenForManualOrigin || !markerImage;

          return (
            <Marker
              coordinate={toLatLng(markerPosition)}
              tracksViewChanges={useChildrenForManualOrigin ? true : !markerImage}
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
              image={useChildrenForManualOrigin ? undefined : markerImage}
            >
              {shouldRenderChildren && (
                <MainMarkerContent
                  type={effectiveMarkerType}
                  vehicleIconSource={markerVehicleIconSource}
                  userMarkerIcon={userMarkerIcon}
                  manualOriginIcon={manualOriginIcon}
                  manualOriginHoldIcon={manualOriginHoldIcon}
                  isMarkerHeld={isMarkerHeld}
                  manualOriginScale={manualOriginScale}
                />
              )}
            </Marker>
          );
        })()}

        {extraStopMarkers.map((stop) => {
          if (!isValidCoord(stop)) return null;
          return (
            <React.Fragment key={`extra-stop-${stop.index}`}>
              <Marker
                coordinate={toLatLng(stop)}
                tracksViewChanges={false}
                anchor={{ x: 0.5, y: 1 }}
                image={toMarkerImageSource(MAP_ICONS.MULTI_STOP_PIN)}
              />
              {showPinBubbles && !!(stop as any).label && (
                <Marker coordinate={toLatLng(stop)} tracksViewChanges anchor={{ x: 0.5, y: 0.5 }}>
                  <View style={markerStyles.pinWithBubble}>
                    <View style={markerStyles.smallBubble}>
                      <Text numberOfLines={1} style={markerStyles.smallBubbleText}>{(stop as any).label}</Text>
                    </View>
                  </View>
                </Marker>
              )}
            </React.Fragment>
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
        />

        {routeCoordinates.length > 0 && (
          <Polyline
            coordinates={simplifiedRoute}
            strokeColor={routeColor || "#2196F3"}
            strokeWidth={5}
          />
        )}

        {secondaryRouteCoordinates.length > 0 && (
          <Polyline
            coordinates={simplifiedSecondaryRoute}
            strokeColor={secondaryRouteColor || "#FFC107"}
            strokeWidth={5}
          />
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

