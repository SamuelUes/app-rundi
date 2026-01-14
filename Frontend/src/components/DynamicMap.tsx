import React from 'react';
import { Animated, Platform } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import MapBoxMap from './MapBoxMap';
import OpenStreetMap from './OpenStreetMap';
import GoogleMap from './GoogleMaps';
import Constants from 'expo-constants';
import { useTheme } from '../context/ThemeContext';

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
  extraStopMarkers?: Array<{ latitude: number; longitude: number; index: number; color?: string; label?: string }>;
  routeCoordinates?: Array<{ latitude: number; longitude: number }>;
  secondaryRouteCoordinates?: Array<{ latitude: number; longitude: number }>;
  autoFitEnabled?: boolean;
  provider?: 'google' | 'mapbox' | 'openstreet' | 'tomtom'; // Proveedor de mapa
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
  onMarkerDragStart?: (location: { latitude: number; longitude: number }) => void;
  // ✅ NUEVO: Burbujas de dirección sobre pines
  originLabel?: string;
  destinationLabel?: string;
  showPinBubbles?: boolean;
  disableMarkerPress?: boolean;
  onMarkerPress?: (coords: { latitude: number; longitude: number }) => void;
  routeColor?: string;
  secondaryRouteColor?: string;
  googleRenderer?: 'LATEST' | 'LEGACY';
}

/**
 * Componente de mapa dinámico con soporte para múltiples proveedores
 * 
 * - Usa OpenStreetMap (siempre funciona, WebView)
 * - Mapbox no funciona (muestra Google Maps por defecto)
 * 
 * En Development Build:
 * - Puede usar Mapbox con tiles reales
 * 
 * @param props - Propiedades del mapa
 * @returns Componente de mapa renderizado
 */
function DynamicMapComponent({
  provider = 'google',
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
  // En Expo Go, usar siempre Google Maps (react-native-maps) para compatibilidad.
  const isExpoGo = !Constants.appOwnership || Constants.appOwnership === 'expo';
  const actualProvider = isExpoGo ? 'google' : provider;
  const trafficEnabled = showTraffic ?? mapTrafficEnabled;
  const effectiveMarkerHeading = restProps.markerType === 'car' ? markerVehicleHeading : undefined;
  const defaultGoogleRenderer = Platform.OS === 'android' ? 'LEGACY' : 'LATEST';

  // Solo loguear cuando cambia el provider (no en cada render)
  React.useEffect(() => {
    console.log(`🗺️ Usando ${actualProvider.toUpperCase()} ${isExpoGo ? '(Expo Go)' : '(Development Build)'}`);
  }, [actualProvider, isExpoGo]);

  if (actualProvider === 'google') {
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
        googleRenderer={googleRenderer ?? defaultGoogleRenderer}
      />
    );
  }

  if (actualProvider === 'mapbox') {
    return <MapBoxMap {...restProps} />;
  }
  
  return <OpenStreetMap {...restProps} markerVehicleHeading={effectiveMarkerHeading} onMarkerPress={onMarkerPress} routeColor={restProps.routeColor} secondaryRouteCoordinates={restProps.secondaryRouteCoordinates} secondaryRouteColor={restProps.secondaryRouteColor} />;
}

export default DynamicMapComponent;
