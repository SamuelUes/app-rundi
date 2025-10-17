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
export default function DynamicMap({ provider = 'openstreet', ...props }: DynamicMapProps) {
  // En Expo Go, siempre usar OpenStreetMap (Mapbox no funciona correctamente)
  const isExpoGo = !Constants.appOwnership || Constants.appOwnership === 'expo';
  const actualProvider = isExpoGo ? 'openstreet' : provider;

  console.log(`🗺️ Usando ${actualProvider.toUpperCase()} ${isExpoGo ? '(Expo Go)' : '(Development Build)'}`);

  if (actualProvider === 'mapbox') {
    return <MapBoxMap {...props} />;
  }
  
  return <OpenStreetMap {...props} />;
}
