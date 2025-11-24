import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, Image, ImageSourcePropType, TouchableOpacity, Animated } from 'react-native';
import MapView, {
  LatLng,
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  MapPressEvent,
  MarkerDragStartEndEvent,
  Region,
} from 'react-native-maps';
import { useTheme } from '../context/ThemeContext';

interface ExtraStopMarker {
  latitude: number;
  longitude: number;
  index: number;
  color?: string;
  label?: string;
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
  isSelected?: boolean;
  rating?: number | null;
  photoURL?: string | null;
}
interface GoogleMapProps {
  latitude: number;
  longitude: number;
  style?: any;
  onMapPress?: (event: { latitude: number; longitude: number }) => void;
  onRegionChangeCenter?: (center: { latitude: number; longitude: number }) => void;
  onRegionChangeCompleteCenter?: (center: { latitude: number; longitude: number }) => void;
  showMarker?: boolean;
  markerPosition?: { latitude: number; longitude: number } | null;
  markerType?: 'default' | 'car' | 'origin' | 'destination' | 'client' | 'manual_origin' | 'manual_origin_hold';
  originMarker?: { latitude: number; longitude: number } | null;
  destinationMarker?: { latitude: number; longitude: number } | null;
  clientMarker?: { latitude: number; longitude: number } | null;
  userLocation?: { latitude: number; longitude: number } | null;
  extraStopMarkers?: ExtraStopMarker[];
  routeCoordinates?: Array<{ latitude: number; longitude: number }>;
  autoFitEnabled?: boolean;
  nearbyDrivers?: DriverMarker[];
  onDriverPress?: (driverId: string) => void;
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
  markerVehicleHeading?: number;
  userLocationLightIcon?: ImageSourcePropType;
  userLocationDarkIcon?: ImageSourcePropType;
  userLocationHoldingLightIcon?: ImageSourcePropType;
  userLocationHoldingDarkIcon?: ImageSourcePropType;
  manualOriginIcon?: ImageSourcePropType;
  manualOriginHoldIcon?: ImageSourcePropType;
  onMarkerDragStart?: (location: { latitude: number; longitude: number }) => void;
  // Small address bubbles
  originLabel?: string;
  destinationLabel?: string;
  showPinBubbles?: boolean;
}

const EDGE_PADDING = { top: 60, right: 60, bottom: 60, left: 60 };
const REQUEST_PIN_IMAGE = require('../assets/icons/requests_pin/requests_pin2x.png');
const DRIVER_PROFILE_BUBBLE_IMAGE = require('../assets/icons/driver-profile-bubble/driverprofilebubble_2x.png');
// ✅ Iconos personalizados para origen, paradas múltiples y destino final (wireframe)
const ORIGIN_PIN_IMAGE = require('../assets/icons/origin_marker/origin_marker.png');
const MULTI_STOP_PIN_IMAGE = require('../assets/icons/select-extra-destination/selectextradestination.png');
const DESTINATION_PIN_IMAGE = require('../assets/icons/desti_locationmarker/desti_locationmarker.png');

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
  driverBubbleWrapper: {
    alignItems: 'center',
  },
  driverBubbleImage: {
    width: 64,
    height: 64,
    resizeMode: 'contain',
  },
  driverBubbleAvatar: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#fff',
    overflow: 'hidden',
    backgroundColor: '#e0e0e0',
  },
  driverBubbleAvatarImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  driverBubbleAvatarFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverBubbleAvatarFallbackText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
  },
  driverRatingBadge: {
    position: 'absolute',
    top: -10,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  driverRatingText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 11,
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
  manualOriginImage: {
    width: 48,
    height: 48,
    resizeMode: 'contain',
  },
  pinIconImage: {
    width: 38,
    height: 38,
    resizeMode: 'contain',
  },
  pinWithBubble: {
    alignItems: 'center',
  },
  smallBubble: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
    maxWidth: 220,
  },
  smallBubbleText: {
    fontSize: 12,
    color: '#111827',
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
  manualOriginIcon,
  manualOriginHoldIcon,
  isMarkerHeld,
}: {
  type: GoogleMapProps['markerType'];
  vehicleIconSource?: ImageSourcePropType;
  userMarkerIcon?: ImageSourcePropType;
  manualOriginIcon?: ImageSourcePropType;
  manualOriginHoldIcon?: ImageSourcePropType;
  isMarkerHeld?: boolean;
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
    case 'manual_origin_hold':
    case 'manual_origin':
      if (isMarkerHeld && manualOriginHoldIcon) {
        return <Image source={manualOriginHoldIcon} style={markerStyles.manualOriginImage} />;
      }
      if (manualOriginIcon) {
        return <Image source={manualOriginIcon} style={markerStyles.manualOriginImage} />;
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
  markerVehicleHeading,
  userLocationLightIcon,
  userLocationDarkIcon,
  userLocationHoldingLightIcon,
  userLocationHoldingDarkIcon,
  manualOriginIcon,
  manualOriginHoldIcon,
  onMarkerDragStart,
  originLabel,
  destinationLabel,
  showPinBubbles,
  autoFitEnabled = true,
}: GoogleMapProps) {
  const mapRef = useRef<MapView>(null);
  const { isDark } = useTheme();
  const [isMarkerHeld, setIsMarkerHeld] = useState(false);
  const markerScale = useRef(new Animated.Value(1)).current;
  const baseUserMarkerIcon = isDark ? userLocationDarkIcon : userLocationLightIcon;
  const holdingUserMarkerIcon = isDark ? userLocationHoldingDarkIcon : userLocationHoldingLightIcon;
  const userMarkerIcon = isMarkerHeld ? holdingUserMarkerIcon || baseUserMarkerIcon : baseUserMarkerIcon;
  const effectiveMarkerType = isMarkerHeld && markerType === 'manual_origin' ? 'manual_origin_hold' : markerType;
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
        mapInstance.setMapStyle(LIGHT_MAP_STYLE);
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

  const normalizeHeading = (value: number): number => {
    if (!Number.isFinite(value)) return 0;
    const normalized = value % 360;
    return normalized < 0 ? normalized + 360 : normalized;
  };

  const toHeading = useCallback((from: LatLng, to: LatLng): number => {
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;
    const lat1 = from.latitude * toRad;
    const lat2 = to.latitude * toRad;
    const dLon = (to.longitude - from.longitude) * toRad;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return normalizeHeading(Math.atan2(y, x) * toDeg);
  }, []);

  const markerHeadingCacheRef = useRef<{ coord: LatLng | null; heading: number | null }>({
    coord: null,
    heading: typeof markerVehicleHeading === 'number' ? normalizeHeading(markerVehicleHeading) : null,
  });
  const markerHeadingSmoothRef = useRef<number | null>(null);

  const shortestAngularDifference = (from: number, to: number): number => {
    const diff = ((to - from + 540) % 360) - 180;
    return diff;
  };

  const applyHeadingSmoothing = (candidate?: number): number | undefined => {
    if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
      return markerHeadingSmoothRef.current ?? undefined;
    }

    const normalizedCandidate = normalizeHeading(candidate);
    const last = markerHeadingSmoothRef.current;

    if (last == null) {
      markerHeadingSmoothRef.current = normalizedCandidate;
      return normalizedCandidate;
    }

    const diff = shortestAngularDifference(last, normalizedCandidate);
    const absDiff = Math.abs(diff);

    if (absDiff >= 120) {
      markerHeadingSmoothRef.current = normalizedCandidate;
      return normalizedCandidate;
    }

    if (absDiff <= 8) {
      markerHeadingSmoothRef.current = normalizedCandidate;
      return normalizedCandidate;
    }

    const smoothingFactor = 0.38;
    const smoothed = normalizeHeading(last + diff * smoothingFactor);
    markerHeadingSmoothRef.current = smoothed;
    return smoothed;
  };

  const routeHeadingAtMarker = useMemo(() => {
    if (!markerPositionLatLng || routeCoordinates.length < 2) {
      return undefined;
    }

    const markerLatRad = markerPositionLatLng.latitude * (Math.PI / 180);
    const markerLonRad = markerPositionLatLng.longitude * (Math.PI / 180);
    const cosMarkerLat = Math.cos(markerLatRad);
    const toXY = (coord: LatLng) => {
      const latRad = coord.latitude * (Math.PI / 180);
      const lonRad = coord.longitude * (Math.PI / 180);
      return {
        x: (lonRad - markerLonRad) * cosMarkerLat,
        y: latRad - markerLatRad,
      };
    };

    const validRoute = routeCoordinates.filter(isValidCoord).map(toLatLng);
    if (validRoute.length < 2) {
      return undefined;
    }

    let bestHeading: number | undefined;
    let bestDistSq = Number.POSITIVE_INFINITY;

    for (let i = 0; i < validRoute.length - 1; i += 1) {
      const start = validRoute[i];
      const end = validRoute[i + 1];
      if (!start || !end) continue;

      const startVec = toXY(start);
      const endVec = toXY(end);
      const segVec = { x: endVec.x - startVec.x, y: endVec.y - startVec.y };
      const segLenSq = segVec.x * segVec.x + segVec.y * segVec.y;
      if (segLenSq < 1e-12) {
        continue;
      }

      const markerVec = { x: 0, y: 0 };
      const tNumerator = (markerVec.x - startVec.x) * segVec.x + (markerVec.y - startVec.y) * segVec.y;
      const t = Math.min(1, Math.max(0, tNumerator / segLenSq));

      const closestPoint = {
        x: startVec.x + segVec.x * t,
        y: startVec.y + segVec.y * t,
      };

      const distSq = closestPoint.x * closestPoint.x + closestPoint.y * closestPoint.y;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestHeading = normalizeHeading(toHeading(start, end));
      }
    }

    return bestHeading;
  }, [markerPositionLatLng, routeCoordinates, toHeading]);

  const resolvedMarkerHeading = useMemo(() => {
    if (effectiveMarkerType !== 'car') {
      markerHeadingCacheRef.current = { coord: markerPositionLatLng ?? null, heading: null };
      markerHeadingSmoothRef.current = null;
      return undefined;
    }

    const incoming = markerVehicleHeading;

    if (!markerPositionLatLng) {
      const normalized = typeof incoming === 'number' && Number.isFinite(incoming)
        ? normalizeHeading(incoming)
        : null;
      markerHeadingCacheRef.current = { coord: null, heading: normalized };
      const smoothed = applyHeadingSmoothing(normalized ?? undefined);
      return smoothed ?? undefined;
    }

    let candidate: number | undefined;

    if (typeof incoming === 'number' && Number.isFinite(incoming)) {
      candidate = normalizeHeading(incoming);
    } else if (typeof routeHeadingAtMarker === 'number' && Number.isFinite(routeHeadingAtMarker)) {
      candidate = normalizeHeading(routeHeadingAtMarker);
    } else {
      const cache = markerHeadingCacheRef.current;
      if (cache.coord && !coordsAreClose(cache.coord, markerPositionLatLng)) {
        candidate = normalizeHeading(toHeading(cache.coord, markerPositionLatLng));
      } else if (typeof cache.heading === 'number') {
        candidate = normalizeHeading(cache.heading);
      }
    }

    const smoothed = applyHeadingSmoothing(candidate);
    const headingToPersist = smoothed ?? candidate ?? markerHeadingCacheRef.current.heading ?? null;
    markerHeadingCacheRef.current = { coord: markerPositionLatLng, heading: headingToPersist };
    return smoothed ?? candidate ?? undefined;
  }, [markerPositionLatLng, markerVehicleHeading, effectiveMarkerType, routeHeadingAtMarker, toHeading]);

  const driverHeadingCacheRef = useRef<Record<string, { coord: LatLng; heading: number }>>({});

  const resolveDriverHeading = useCallback(
    (driver: DriverMarker): number => {
      const coord = toLatLng(driver);
      if (typeof driver.heading === 'number' && Number.isFinite(driver.heading)) {
        const normalized = normalizeHeading(driver.heading);
        driverHeadingCacheRef.current[driver.id] = { coord, heading: normalized };
        return normalized;
      }

      const cached = driverHeadingCacheRef.current[driver.id];
      if (cached && !coordsAreClose(cached.coord, coord)) {
        const derived = toHeading(cached.coord, coord);
        driverHeadingCacheRef.current[driver.id] = { coord, heading: derived };
        return derived;
      }

      const fallback = cached?.heading ?? 0;
      driverHeadingCacheRef.current[driver.id] = { coord, heading: fallback };
      return fallback;
    },
    [toHeading],
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
    if (!autoFitEnabled) {
      lastFitSignatureRef.current = '';
      return;
    }

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
  }, [markersToFit, selectedRideRequestId, cameraFitSignature, autoFitEnabled]);

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

  const animateCameraToCoordinate = useCallback(
    (coord: LatLng, duration: number = 220) => {
      const map = mapRef.current as any;
      if (!map) return;

      if (typeof map.animateCamera === 'function') {
        map.animateCamera({ center: coord }, { duration });
      } else if (typeof map.animateToRegion === 'function') {
        map.animateToRegion(
          {
            latitude: coord.latitude,
            longitude: coord.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          },
          duration,
        );
      }
    },
    [],
  );

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
        onRegionChange={(region: Region) => {
          if (onRegionChangeCenter) {
            onRegionChangeCenter({ latitude: region.latitude, longitude: region.longitude });
          }
        }}
        onRegionChangeComplete={(region: Region) => {
          if (onRegionChangeCompleteCenter) {
            onRegionChangeCompleteCenter({ latitude: region.latitude, longitude: region.longitude });
          }
        }}
        mapType={mapType || 'standard'}
        customMapStyle={Array.isArray(resolvedMapStyle) ? resolvedMapStyle : LIGHT_MAP_STYLE}
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
          <Marker coordinate={toLatLng(originMarker)} tracksViewChanges={false}>
            <View style={markerStyles.pinWithBubble}>
              {showPinBubbles && !!originLabel && (
                <View style={markerStyles.smallBubble}>
                  <Text numberOfLines={1} style={markerStyles.smallBubbleText}>{originLabel}</Text>
                </View>
              )}
              <Image source={ORIGIN_PIN_IMAGE} style={markerStyles.pinIconImage} />
            </View>
          </Marker>
        )}

        {isValidCoord(clientMarker) && !effectiveUserLocation && (
          <Marker coordinate={toLatLng(clientMarker)} tracksViewChanges>
            <MainMarkerContent type="client" userMarkerIcon={userMarkerIcon} />
          </Marker>
        )}

        {isValidCoord(destinationMarker) && (
          <Marker coordinate={toLatLng(destinationMarker)} tracksViewChanges={false}>
            <View style={markerStyles.pinWithBubble}>
              {showPinBubbles && !!destinationLabel && (
                <View style={markerStyles.smallBubble}>
                  <Text numberOfLines={1} style={markerStyles.smallBubbleText}>{destinationLabel}</Text>
                </View>
              )}
              <Image source={DESTINATION_PIN_IMAGE} style={markerStyles.pinIconImage} />
            </View>
          </Marker>
        )}

        {showMarker && isValidCoord(markerPosition) && (
          <Marker
            coordinate={toLatLng(markerPosition)}
            tracksViewChanges
            draggable={!!draggableMarker}
            onDragStart={handleMarkerDragStart}
            onDrag={handleMarkerDrag}
            onDragEnd={handleMarkerDragEnd}
            flat
            rotation={typeof resolvedMarkerHeading === 'number' ? resolvedMarkerHeading : undefined}
          >
            <Animated.View style={{ transform: [{ scale: markerScale }] }}>
              <MainMarkerContent
                type={effectiveMarkerType}
                vehicleIconSource={markerVehicleIconSource}
                userMarkerIcon={userMarkerIcon}
                manualOriginIcon={manualOriginIcon}
                manualOriginHoldIcon={manualOriginHoldIcon}
                isMarkerHeld={isMarkerHeld}
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
              <View style={markerStyles.pinWithBubble}>
                {showPinBubbles && !!(stop as any).label && (
                  <View style={markerStyles.smallBubble}>
                    <Text numberOfLines={1} style={markerStyles.smallBubbleText}>{(stop as any).label}</Text>
                  </View>
                )}
                <Image source={MULTI_STOP_PIN_IMAGE} style={markerStyles.pinIconImage} />
              </View>
            </Marker>
          );
        })}

        {nearbyDrivers.map((driver) => {
          if (!isValidCoord(driver)) return null;
          const heading = resolveDriverHeading(driver);
          return (
            <Marker
              key={`driver-${driver.id}`}
              coordinate={toLatLng(driver)}
              rotation={heading}
              tracksViewChanges={driver.isSelected || !!driver.vehicleIconSource}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => {
                if (typeof (onDriverPress) === 'function') {
                  onDriverPress(driver.id);
                }
              }}
              flat
            >
              {driver.isSelected ? (
                <View style={markerStyles.driverBubbleWrapper}>
                  {!!driver.rating && (
                    <View style={markerStyles.driverRatingBadge}>
                      <Text style={markerStyles.driverRatingText}>{driver.rating.toFixed(1)}</Text>
                    </View>
                  )}
                  <Image source={DRIVER_PROFILE_BUBBLE_IMAGE} style={markerStyles.driverBubbleImage} />
                  <View style={markerStyles.driverBubbleAvatar}>
                    {driver.photoURL ? (
                      <Image source={{ uri: driver.photoURL }} style={markerStyles.driverBubbleAvatarImage} />
                    ) : (
                      <View style={markerStyles.driverBubbleAvatarFallback}>
                        <Text style={markerStyles.driverBubbleAvatarFallbackText}>
                          {driver.id?.charAt(0)?.toUpperCase() ?? 'C'}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              ) : driver.vehicleIconSource ? (
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
