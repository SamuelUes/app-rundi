import React from 'react';
import MapBoxMap from './MapBoxMap';
import OpenStreetMap from './OpenStreetMap';

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
  markerType?: 'default' | 'car' | 'origin' | 'destination';
  originMarker?: { latitude: number; longitude: number };
  routeCoordinates?: Array<{ latitude: number; longitude: number }>;
  provider?: 'mapbox' | 'openstreet'; // Proveedor de mapa
}

/**
 * Componente de mapa dinámico con soporte para múltiples proveedores
 * 
 * Proveedores disponibles:
 * 
 * 1. **OpenStreetMap** (predeterminado) ⭐
 *    - ✅ Siempre funciona
 *    - ✅ No requiere API Key
 *    - ✅ Gratis sin límites
 *    - ✅ NO muestra logo de Google
 *    - ✅ Renderizado con Leaflet (WebView)
 *    - ✅ Estilo limpio y funcional
 * 
 * 2. **MapBox** (alternativa)
 *    - ⚠️ En Expo muestra Google Maps nativo (no tiles de Mapbox)
 *    - ✅ Usa react-native-maps
 *    - ⚠️ Requiere reconstruir app para cambiar estilo
 * 
 * Características:
 * - ✅ Soporte para marcadores personalizados (car, origin, destination)
 * - ✅ Soporte para rutas y múltiples marcadores
 * - ✅ Sin dependencia de Google Maps API Key
 * 
 * @param props - Propiedades del mapa (coordenadas, marcadores, rutas, etc.)
 * @returns Componente de mapa renderizado
 */
export default function DynamicMap({ provider = 'openstreet', ...props }: DynamicMapProps) {
  // Usar OpenStreetMap por defecto (siempre funciona, no muestra logo de Google)
  // MapBoxMap con react-native-maps muestra Google Maps en Expo
  if (provider === 'mapbox') {
    return <MapBoxMap {...props} />;
  }
  
  return <OpenStreetMap {...props} />;
}
