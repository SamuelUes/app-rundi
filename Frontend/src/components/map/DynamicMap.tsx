import React from 'react';
import { Animated } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import GoogleMap from './GoogleMaps';
import { useTheme } from '../../hooks/shared/theme/useTheme';

type RideRequestMarker = {
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
};

type NearbyDriver = {
  id: string;
  latitude: number;
  longitude: number;
  heading?: number;
  vehicleType?: string | null;
  vehicleIconSource?: ImageSourcePropType;
};

interface DynamicMapProps {
  latitude: number;
  longitude: number;
  style?: any;
  onMapPress?: (event: { latitude: number; longitude: number }) => void;
  // Center coordinate callbacks when the camera/region changes
  onRegionChangeCenter?: (center: { latitude: number; longitude: number; altitude?: number }) => void;
  onRegionChangeCompleteCenter?: (center: { latitude: number; longitude: number; altitude?: number }) => void;
  onDriverPress?: (driverId: string) => void; // when user taps a driver marker
  showMarker?: boolean;
  markerPosition?: { latitude: number; longitude: number };
  markerType?: 'default' | 'car' | 'origin' | 'destination' | 'client' | 'manual_origin' | 'manual_origin_hold';
  originMarker?: { latitude: number; longitude: number };
  destinationMarker?: { latitude: number; longitude: number };
  clientMarker?: { latitude: number; longitude: number };
  // ✅ NUEVO: Marcadores de paradas extras con colores
  extraStopMarkers?: Array<{
    latitude: number;
    longitude: number;
    index: number;
    color?: string;
    label?: string;
    title?: string;
    meta?: string;
  }>;
  routeCoordinates?: Array<{ latitude: number; longitude: number }>;
  secondaryRouteCoordinates?: Array<{ latitude: number; longitude: number }>;
  tertiaryRouteCoordinates?: Array<{ latitude: number; longitude: number }>;
  autoFitEnabled?: boolean;
  nearbyDrivers?: NearbyDriver[]; // Conductores cercanos
  draggableMarker?: boolean; // Permitir arrastrar el marcador
  onMarkerDragEnd?: (newLocation: { latitude: number; longitude: number }) => void; // Callback cuando se suelta el marcador
  rideRequests?: Array<RideRequestMarker>; // Solicitudes de viaje disponibles
  onRideRequestPress?: (rideRequest: RideRequestMarker) => void; // Callback cuando se presiona una solicitud de viaje
  showUserLocation?: boolean;
  userLocation?: { latitude: number; longitude: number };
  cameraTarget?: { latitude: number; longitude: number } | null;
  mapType?: 'standard' | 'satellite' | 'hybrid' | 'terrain';
  mapStyle?: any;
  showTraffic?: boolean;
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
  requestPinScale?: number;
  onMarkerDragStart?: (location: { latitude: number; longitude: number }) => void;
  // ✅ NUEVO: Burbujas de dirección sobre pines
  originLabel?: string;
  destinationLabel?: string;
  originTitle?: string;
  destinationTitle?: string;
  originMeta?: string;
  destinationMeta?: string;
  showPinBubbles?: boolean;
  disableMarkerPress?: boolean;
  onMarkerPress?: (coords: { latitude: number; longitude: number }) => void;
  routeColor?: string;
  secondaryRouteColor?: string;
  tertiaryRouteColor?: string;
  googleRenderer?: 'LATEST' | 'LEGACY';
  fitEdgePadding?: { top?: number; right?: number; bottom?: number; left?: number };
}

function DynamicMapComponent({
  showUserLocation = true,
  userLocation,
  mapType,
  mapStyle,
  showTraffic,
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
  onMarkerPress,
  googleRenderer,
  ...restProps
}: DynamicMapProps) {
  const { mapTrafficEnabled } = useTheme();
  const trafficEnabled = showTraffic ?? mapTrafficEnabled;
  const effectiveMarkerHeading = restProps.markerType === 'car' ? markerVehicleHeading : undefined;
  const defaultGoogleRenderer = 'LATEST';

  return (
    <GoogleMap
      {...restProps}
      showUserLocation={showUserLocation}
      userLocation={userLocation}
      mapType={mapType}
      customMapStyle={mapStyle}
      trafficEnabled={trafficEnabled}
      markerVehicleType={markerVehicleType}
      markerVehicleIconSource={markerVehicleIconSource}
      markerVehicleHeading={effectiveMarkerHeading}
      userLocationLightIcon={userLocationLightIcon}
      userLocationDarkIcon={userLocationDarkIcon}
      userLocationHoldingLightIcon={userLocationHoldingLightIcon}
      userLocationHoldingDarkIcon={userLocationHoldingDarkIcon}
      onMarkerDragStart={onMarkerDragStart}
      manualOriginIcon={manualOriginIcon}
      manualOriginHoldIcon={manualOriginHoldIcon}
      manualOriginBounceValue={restProps.manualOriginBounceValue}
      manualOriginScale={restProps.manualOriginScale}
      userLocationScale={restProps.userLocationScale}
      disableMarkerPress={!!restProps.disableMarkerPress}
      onMarkerPress={onMarkerPress}
      cameraTarget={restProps.cameraTarget}
      routeColor={restProps.routeColor}
      secondaryRouteCoordinates={restProps.secondaryRouteCoordinates}
      secondaryRouteColor={restProps.secondaryRouteColor}
      tertiaryRouteCoordinates={restProps.tertiaryRouteCoordinates}
      tertiaryRouteColor={restProps.tertiaryRouteColor}
      googleRenderer={googleRenderer ?? defaultGoogleRenderer}
    />
  );
}

export default DynamicMapComponent;
