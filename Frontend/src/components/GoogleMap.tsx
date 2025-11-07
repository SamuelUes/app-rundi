import React, { useMemo, useRef, useState, useEffect } from 'react';
import { View, StyleSheet, Text, Image, ImageSourcePropType, TouchableOpacity, Animated } from 'react-native';
import MapView, {
  LatLng,
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  MapPressEvent,
  MarkerDragStartEndEvent,
} from 'react-native-maps';
import { useTheme } from '../context/ThemeContext';

interface ExtraStopMarker {
  latitude: number;
  longitude: number;
  index: number;
  color?: string;
}

interface RideRequest {
  id: string;
  latitude: number;
  longitude: number;
  clientName: string;
  originAddress: string;
  primaryDestination: string;
  finalDestination?: string;
  extraStopsCount: number;
  priceLabel: string;
  priceValue: number;
  hasClientSuggestedPrice: boolean;
  passengers: number;
}
interface DriverMarker {
  id: string;
  latitude: number;
  longitude: number;
  heading?: number;
  vehicleIconSource?: ImageSourcePropType;
}
interface GoogleMapProps {
  latitude: number;
  longitude: number;
  style?: any;
  onMapPress?: (event: { latitude: number; longitude: number }) => void;
  showMarker?: boolean;
  markerPosition?: { latitude: number; longitude: number } | null;
  markerType?: 'default' | 'car' | 'origin' | 'destination' | 'client';
  originMarker?: { latitude: number; longitude: number } | null;
  destinationMarker?: { latitude: number; longitude: number } | null;
  clientMarker?: { latitude: number; longitude: number } | null;
  userLocation?: { latitude: number; longitude: number } | null;
  extraStopMarkers?: ExtraStopMarker[];
  routeCoordinates?: Array<{ latitude: number; longitude: number }>;
  nearbyDrivers?: DriverMarker[];
  draggableMarker?: boolean;
  onMarkerDragEnd?: (newLocation: { latitude: number; longitude: number }) => void;
  rideRequests?: RideRequest[];
  onRideRequestPress?: (rideRequest: RideRequest) => void;
  showUserLocation?: boolean;
  mapType?: 'standard' | 'satellite' | 'hybrid' | 'terrain';
  customMapStyle?: any;
  trafficEnabled?: boolean;
  markerVehicleType?: string;
  markerVehicleIconSource?: ImageSourcePropType;
  userLocationLightIcon?: ImageSourcePropType;
  userLocationDarkIcon?: ImageSourcePropType;
  userLocationHoldingLightIcon?: ImageSourcePropType;
  userLocationHoldingDarkIcon?: ImageSourcePropType;
  onMarkerDragStart?: (location: { latitude: number; longitude: number }) => void;
}

const EDGE_PADDING = { top: 60, right: 60, bottom: 60, left: 60 };
const REQUEST_PIN_IMAGE = require('../assets/icons/requests_pin/requests_pin2x.png');

function isValidCoord(value: any): value is { latitude: number; longitude: number } {
  return (
    !!value &&
    typeof value.latitude === 'number' &&
    !Number.isNaN(value.latitude) &&
    typeof value.longitude === 'number' &&
    !Number.isNaN(value.longitude)
  );
}

function toLatLng(coord: { latitude: number; longitude: number }): LatLng {
  return { latitude: coord.latitude, longitude: coord.longitude };
}

function coordsAreClose(
  a?: { latitude: number; longitude: number } | LatLng | null,
  b?: { latitude: number; longitude: number } | LatLng | null,
  epsilon: number = 0.00001,
): boolean {
  if (!a || !b) return false;
  const latDiff = Math.abs(a.latitude - b.latitude);
  const lngDiff = Math.abs(a.longitude - b.longitude);
  return latDiff <= epsilon && lngDiff <= epsilon;
}

const markerStyles = StyleSheet.create({
  bubble: {
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  bubbleSmall: {
    width: 34,
    height: 34,
  },
  bubbleMedium: {
    width: 42,
    height: 42,
  },
  bubbleLarge: {
    width: 48,
    height: 48,
  },
  bubbleText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  extraStopText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  driverIcon: {
    fontSize: 22,
  },
  requestWrapper: {
    alignItems: 'center',
  },
  requestBubble: {
    backgroundColor: '#FFFFFF',
    minWidth: 180,
    maxWidth: 220,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  requestTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  requestLine: {
    fontSize: 12,
    color: '#334155',
    marginBottom: 3,
  },
  requestMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  requestBubbleTouchable: {
    width: '100%',
  },
  requestPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
  requestPassengers: {
    fontSize: 12,
    color: '#475569',
  },
  requestStops: {
    fontSize: 11,
    color: '#6366F1',
    marginTop: 4,
  },
  requestHint: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 6,
    textAlign: 'right',
  },
  requestMarkerImage: {
    width: 34,
    height: 40,
    resizeMode: 'contain',
    marginTop: 8,
  },
  vehicleIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  vehicleIconImage: {
    width: 46,
    height: 46,
    resizeMode: 'contain',
  },
  userMarkerImage: {
    width: 42,
    height: 42,
    resizeMode: 'contain',
  },
});

function MarkerBubble({
  backgroundColor,
  size = 'medium',
  children,
}: {
  backgroundColor: string;
  size?: 'small' | 'medium' | 'large';
  children: React.ReactNode;
}) {
  const sizeStyle =
    size === 'small'
      ? markerStyles.bubbleSmall
      : size === 'large'
      ? markerStyles.bubbleLarge
      : markerStyles.bubbleMedium;

  return (
    <View style={[markerStyles.bubble, sizeStyle, { backgroundColor }]}>{children}</View>
  );
}

function MainMarkerContent({
  type,
  vehicleIconSource,
  userMarkerIcon,
}: {
  type: GoogleMapProps['markerType'];
  vehicleIconSource?: ImageSourcePropType;
  userMarkerIcon?: ImageSourcePropType;
}) {
  if (vehicleIconSource && type === 'car') {
    return (
      <View style={markerStyles.vehicleIconWrapper}>
        <Image source={vehicleIconSource} style={markerStyles.vehicleIconImage} />
      </View>
    );
  }

  switch (type) {
    case 'car':
      return (
        <MarkerBubble backgroundColor="#4CAF50" size="large">
          <Text style={markerStyles.bubbleText}>🚗</Text>
        </MarkerBubble>
      );
    case 'origin':
    case 'client':
      if (userMarkerIcon) {
        return <Image source={userMarkerIcon} style={markerStyles.userMarkerImage} />;
      }
      return (
        <MarkerBubble backgroundColor="#2196F3" size="medium">
          <Text style={markerStyles.bubbleText}>📍</Text>
        </MarkerBubble>
      );
    case 'destination':
      return (
        <MarkerBubble backgroundColor="#F44336" size="medium">
          <Text style={markerStyles.bubbleText}>🎯</Text>
        </MarkerBubble>
      );
    default:
      return (
        <MarkerBubble backgroundColor="#607D8B" size="medium">
          <Text style={markerStyles.bubbleText}>📍</Text>
        </MarkerBubble>
      );
  }
}

export default function GoogleMap({
  latitude,
  longitude,
  style,
  onMapPress,
  showMarker = true,
  markerPosition,
  markerType = 'default',
  originMarker,
  destinationMarker,
  clientMarker,
  userLocation,
  extraStopMarkers = [],
  routeCoordinates = [],
  nearbyDrivers = [],
  draggableMarker = false,
  onMarkerDragEnd,
  rideRequests = [],
  onRideRequestPress,
  showUserLocation = false,
  mapType,
  customMapStyle = [],
  trafficEnabled = false,
  markerVehicleType,
  markerVehicleIconSource,
  userLocationLightIcon,
  userLocationDarkIcon,
  userLocationHoldingLightIcon,
  userLocationHoldingDarkIcon,
  onMarkerDragStart,
}: GoogleMapProps) {
  const mapRef = useRef<MapView>(null);
  const { isDark } = useTheme();
  const [isMarkerHeld, setIsMarkerHeld] = useState(false);
  const markerScale = useRef(new Animated.Value(1)).current;
  const baseUserMarkerIcon = isDark ? userLocationDarkIcon : userLocationLightIcon;
  const holdingUserMarkerIcon = isDark ? userLocationHoldingDarkIcon : userLocationHoldingLightIcon;
  const userMarkerIcon = isMarkerHeld ? holdingUserMarkerIcon || baseUserMarkerIcon : baseUserMarkerIcon;
  const [selectedRideRequestId, setSelectedRideRequestId] = useState<string | null>(null);
  const lastFitSignatureRef = useRef<string>('');
  const effectiveUserLocation = useMemo(() => {
    if (isValidCoord(userLocation)) return toLatLng(userLocation);
    if (isValidCoord(clientMarker)) return toLatLng(clientMarker);
    return null;
  }, [userLocation, clientMarker]);
  const resolvedMapStyle = useMemo(() => {
    if (Array.isArray(customMapStyle) && customMapStyle.length > 0) {
      return customMapStyle;
    }
    if (isDark) {
      return darkMapStyle;
    }
    return null;
  }, [customMapStyle, isDark]);
  useEffect(() => {
    const mapInstance = mapRef.current as any;
    if (!mapInstance || typeof mapInstance.setMapStyle !== 'function') {
      return;
    }

    try {
      if (Array.isArray(resolvedMapStyle)) {
        mapInstance.setMapStyle(resolvedMapStyle);
      } else {
        mapInstance.setMapStyle(null);
      }
    } catch (error) {
      console.warn('[GoogleMap] No se pudo aplicar el estilo del mapa:', error);
    }
  }, [resolvedMapStyle]);

  const rideRequestSignature = useMemo(() => {
    if (rideRequests.length === 0) return '';
    return rideRequests
      .map((request) => `${request.id}:${request.latitude?.toFixed?.(5) ?? request.latitude}:${request.longitude?.toFixed?.(5) ?? request.longitude}`)
      .join('|');
  }, [rideRequests]);

  useEffect(() => {
    if (!rideRequests.some((request) => request.id === selectedRideRequestId)) {
      setSelectedRideRequestId(null);
    }
  }, [rideRequestSignature, rideRequests, selectedRideRequestId]);

  useEffect(() => {
    if (rideRequests.length === 0 && selectedRideRequestId) {
      setSelectedRideRequestId(null);
    }
  }, [rideRequests.length, selectedRideRequestId]);

  const markerPositionLatLng = useMemo(() => {
    if (markerPosition && isValidCoord(markerPosition)) {
      return toLatLng(markerPosition);
    }
    return null;
  }, [markerPosition]);
  const shouldShowUserMarker = useMemo(() => {
    if (!effectiveUserLocation) return false;
    if (markerPositionLatLng && coordsAreClose(effectiveUserLocation, markerPositionLatLng)) {
      return false;
    }
    return true;
  }, [effectiveUserLocation, markerPositionLatLng]);

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

    nearbyDrivers.forEach((driver) => {
      if (isValidCoord(driver)) {
        coords.push(toLatLng(driver));
      }
    });

    rideRequests.forEach((request) => {
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

    return coords;
  }, [
    originMarker,
    destinationMarker,
    clientMarker,
    markerPosition,
    showMarker,
    extraStopMarkers,
    nearbyDrivers,
    rideRequests,
    routeCoordinates,
  ]);

  const cameraFitSignature = useMemo(() => {
    if (markersToFit.length === 0) return '';
    return markersToFit
      .map((coord) => `${coord.latitude.toFixed(5)}:${coord.longitude.toFixed(5)}`)
      .join('|');
  }, [markersToFit]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || markersToFit.length === 0 || selectedRideRequestId) {
      return;
    }

    if (cameraFitSignature && cameraFitSignature === lastFitSignatureRef.current) {
      return;
    }

    lastFitSignatureRef.current = cameraFitSignature;

    if (markersToFit.length === 1) {
      const coord = markersToFit[0];
      map.animateToRegion(
        {
          latitude: coord.latitude,
          longitude: coord.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        500,
      );
      return;
    }

    setTimeout(() => {
      map.fitToCoordinates(markersToFit, {
        edgePadding: EDGE_PADDING,
        animated: true,
      });
    }, 350);
  }, [markersToFit, selectedRideRequestId, cameraFitSignature]);

  const handleMapPress = (event: MapPressEvent) => {
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

  const handleMarkerDragStart = (event: MarkerDragStartEndEvent) => {
    setIsMarkerHeld(true);
    animateMarkerScale(1.12);
    if (onMarkerDragStart) {
      const { latitude: lat, longitude: lng } = event.nativeEvent.coordinate;
      onMarkerDragStart({ latitude: lat, longitude: lng });
    }
  };

  const handleMarkerDragEnd = (event: MarkerDragStartEndEvent) => {
    setIsMarkerHeld(false);
    animateMarkerScale(1);
    if (!onMarkerDragEnd) return;
    const { latitude: lat, longitude: lng } = event.nativeEvent.coordinate;
    onMarkerDragEnd({ latitude: lat, longitude: lng });
  };

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        showsUserLocation={false}
        showsMyLocationButton
        showsCompass
        showsTraffic={trafficEnabled}
        initialRegion={{
          latitude,
          longitude,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        }}
        onPress={handleMapPress}
        mapType={mapType || 'standard'}
        customMapStyle={Array.isArray(resolvedMapStyle) ? resolvedMapStyle : undefined}
      >
        {shouldShowUserMarker && effectiveUserLocation && (
          <Marker coordinate={effectiveUserLocation} tracksViewChanges anchor={{ x: 0.5, y: 0.5 }}>
            {userMarkerIcon ? (
              <Animated.View style={{ transform: [{ scale: markerScale }] }}>
                <Image source={userMarkerIcon} style={markerStyles.userMarkerImage} />
              </Animated.View>
            ) : (
              <MarkerBubble backgroundColor="#03A9F4" size="large">
                <Text style={markerStyles.bubbleText}>📍</Text>
              </MarkerBubble>
            )}
          </Marker>
        )}

        {isValidCoord(originMarker) && (
          <Marker coordinate={toLatLng(originMarker)} tracksViewChanges>
            <MainMarkerContent type="origin" userMarkerIcon={userMarkerIcon} />
          </Marker>
        )}

        {isValidCoord(clientMarker) && !effectiveUserLocation && (
          <Marker coordinate={toLatLng(clientMarker)} tracksViewChanges>
            <MainMarkerContent type="client" userMarkerIcon={userMarkerIcon} />
          </Marker>
        )}

        {isValidCoord(destinationMarker) && (
          <Marker coordinate={toLatLng(destinationMarker)} tracksViewChanges={false}>
            <MarkerBubble backgroundColor="#F44336" size="medium">
              <Text style={markerStyles.bubbleText}>🎯</Text>
            </MarkerBubble>
          </Marker>
        )}

        {showMarker && isValidCoord(markerPosition) && (
          <Marker
            coordinate={toLatLng(markerPosition)}
            tracksViewChanges
            draggable={!!draggableMarker}
            onDragStart={handleMarkerDragStart}
            onDragEnd={handleMarkerDragEnd}
          >
            <Animated.View style={{ transform: [{ scale: markerScale }] }}>
              <MainMarkerContent
                type={markerType}
                vehicleIconSource={markerVehicleIconSource}
                userMarkerIcon={userMarkerIcon}
              />
            </Animated.View>
          </Marker>
        )}

        {extraStopMarkers.map((stop) => {
          if (!isValidCoord(stop)) return null;
          return (
            <Marker
              key={`extra-stop-${stop.index}`}
              coordinate={toLatLng(stop)}
              tracksViewChanges={false}
            >
              <MarkerBubble backgroundColor={stop.color || '#FFA500'} size="medium">
                <Text style={markerStyles.extraStopText}>{stop.index}</Text>
              </MarkerBubble>
            </Marker>
          );
        })}

        {nearbyDrivers.map((driver) => {
          if (!isValidCoord(driver)) return null;
          return (
            <Marker
              key={`driver-${driver.id}`}
              coordinate={toLatLng(driver)}
              rotation={typeof driver.heading === 'number' ? driver.heading : 0}
              tracksViewChanges={!!driver.vehicleIconSource}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              {driver.vehicleIconSource ? (
                <View style={markerStyles.vehicleIconWrapper}>
                  <Image source={driver.vehicleIconSource} style={markerStyles.vehicleIconImage} />
                </View>
              ) : (
                <MarkerBubble backgroundColor="#1565C0" size="medium">
                  <Text style={markerStyles.driverIcon}>🚗</Text>
                </MarkerBubble>
              )}
            </Marker>
          );
        })}

        {rideRequests.map((request) => {
          if (!isValidCoord(request)) return null;
          const isSelected = selectedRideRequestId === request.id;
          return (
            <Marker
              key={`ride-request-${request.id}`}
              coordinate={toLatLng(request)}
              tracksViewChanges
              anchor={{ x: 0.5, y: 1 }}
              onPress={() => {
                if (selectedRideRequestId === request.id) {
                  setSelectedRideRequestId(null);
                  onRideRequestPress?.(request);
                } else {
                  setSelectedRideRequestId(request.id);
                }
              }}
            >
              <View style={markerStyles.requestWrapper}>
                {isSelected && (
                  <View style={markerStyles.requestBubble}>
                    <Text style={markerStyles.requestTitle} numberOfLines={1}>
                      {request.clientName}
                    </Text>
                    <Text style={markerStyles.requestLine} numberOfLines={1}>
                      📍 {request.originAddress}
                    </Text>
                    <Text style={markerStyles.requestLine} numberOfLines={1}>
                      🎯 {request.primaryDestination || request.finalDestination}
                    </Text>
                    <View style={markerStyles.requestMetaRow}>
                      <Text style={markerStyles.requestPrice}>
                        {request.priceLabel}{request.hasClientSuggestedPrice ? ' • Cliente' : ''}
                      </Text>
                      <Text style={markerStyles.requestPassengers}>
                        👥 {request.passengers}
                      </Text>
                    </View>
                    {request.extraStopsCount > 0 && (
                      <Text style={markerStyles.requestStops}>
                        ➕ {request.extraStopsCount} parada{request.extraStopsCount > 1 ? 's' : ''} extra
                      </Text>
                    )}
                    <Text style={markerStyles.requestHint}>Toca para negociar</Text>
                  </View>
                )}
                <Image source={REQUEST_PIN_IMAGE} style={markerStyles.requestMarkerImage} />
              </View>
            </Marker>
          );
        })}

        {routeCoordinates.length > 0 && (
          <Polyline
            coordinates={routeCoordinates.filter(isValidCoord).map(toLatLng)}
            strokeColor="#2196F3"
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

const LIGHT_MAP_STYLE: any[] = [];

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry',
    stylers: [{ color: '#757575' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#bdbdbd' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#181818' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#616161' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#383838' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#212121' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#3c3c3c' }],
  },
  {
    featureType: 'road.highway.controlled_access',
    elementType: 'geometry',
    stylers: [{ color: '#4e4e4e' }],
  },
  {
    featureType: 'road.local',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#8a8a8a' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#2f2f2f' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0f252e' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#3d3d3d' }],
  },
];
