import React from 'react';
import MapBoxMap from './MapBoxMap';
import OpenStreetMap from './OpenStreetMap';
import Constants from 'expo-constants';

/**
 * Props para el componente DynamicMap
 */
interface DynamicMapProps {
  latitude: number;
  longitude: number;
  style?: any;
  onMapPress?: (event: { latitude: number; longitude: number }) => void;
  showMarker?: boolean;
  markerPosition?: { latitude: number; longitude: number };
  markerType?: 'default' | 'car' | 'origin' | 'destination' | 'client';
  originMarker?: { latitude: number; longitude: number };
  destinationMarker?: { latitude: number; longitude: number };
  clientMarker?: { latitude: number; longitude: number };
  routeCoordinates?: Array<{ latitude: number; longitude: number }>;
  provider?: 'mapbox' | 'openstreet'; // Proveedor de mapa
  nearbyDrivers?: Array<{ id: string; latitude: number; longitude: number; heading?: number }>; // Conductores cercanos
  draggableMarker?: boolean; // Permitir arrastrar el marcador
  onMarkerDragEnd?: (newLocation: { latitude: number; longitude: number }) => void; // Callback cuando se suelta el marcador
  rideRequests?: Array<{ id: string; latitude: number; longitude: number; address?: string; estimatedPrice?: string; passengers?: number }>; // Solicitudes de viaje disponibles
  onRideRequestPress?: (rideRequest: any) => void; // Callback cuando se presiona una solicitud de viaje
}

/**
 * Componente de mapa dinámico con soporte para múltiples proveedores
 * 
 * En Expo Go:
 * - Usa OpenStreetMap (siempre funciona, WebView)
 * - Mapbox no funciona (muestra Google Maps por defecto)
 * 
 * En Development Build:
 * - Puede usar Mapbox con tiles reales
 * 
 * @param props - Propiedades del mapa
 * @returns Componente de mapa renderizado
 */
function DynamicMapComponent({ provider = 'openstreet', ...props }: DynamicMapProps) {
  // En Expo Go, siempre usar OpenStreetMap (Mapbox no funciona correctamente)
  const isExpoGo = !Constants.appOwnership || Constants.appOwnership === 'expo';
  const actualProvider = isExpoGo ? 'openstreet' : provider;

  // Solo loguear cuando cambia el provider (no en cada render)
  React.useEffect(() => {
    console.log(`🗺️ Usando ${actualProvider.toUpperCase()} ${isExpoGo ? '(Expo Go)' : '(Development Build)'}`);
  }, [actualProvider, isExpoGo]);

  if (actualProvider === 'mapbox') {
    return <MapBoxMap {...props} />;
  }
  
  return <OpenStreetMap {...props} />;
}

// Exportar con React.memo para optimización
export default React.memo(DynamicMapComponent, (prevProps, nextProps) => {
  // Comparación personalizada para evitar re-renders innecesarios
  return (
    prevProps.latitude === nextProps.latitude &&
    prevProps.longitude === nextProps.longitude &&
    prevProps.markerPosition?.latitude === nextProps.markerPosition?.latitude &&
    prevProps.markerPosition?.longitude === nextProps.markerPosition?.longitude &&
    prevProps.originMarker?.latitude === nextProps.originMarker?.latitude &&
    prevProps.originMarker?.longitude === nextProps.originMarker?.longitude &&
    prevProps.destinationMarker?.latitude === nextProps.destinationMarker?.latitude &&
    prevProps.destinationMarker?.longitude === nextProps.destinationMarker?.longitude &&
    prevProps.routeCoordinates?.length === nextProps.routeCoordinates?.length &&
    prevProps.nearbyDrivers?.length === nextProps.nearbyDrivers?.length
  );
});
