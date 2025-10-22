/**
 * Routing Functions - Funciones para manejo de rutas y ubicaciones
 * 
 * Estas funciones manejan toda la lógica de routing, geocoding y cálculo de distancias
 * usando Google Maps API en el backend.
 */

import * as functions from 'firebase-functions';
import { Client, TravelMode, UnitSystem } from '@googlemaps/google-maps-services-js';

const mapsClient = new Client({});
const GOOGLE_MAPS_API_KEY = functions.config().google?.maps_api_key || process.env.GOOGLE_MAPS_API_KEY;

/**
 * Calcula una ruta entre origen y destino con waypoints opcionales
 * Soporta destinos múltiples con información adicional
 */
export const calculateRoute = functions.https.onCall(async (data, context) => {
  try {
    const { origin, destination, waypoints = [], optimize = false } = data;
    
    if (!origin || !destination) {
      throw new functions.https.HttpsError('invalid-argument', 'Origen y destino son requeridos');
    }
    
    // Validar que tenemos API key
    if (!GOOGLE_MAPS_API_KEY) {
      throw new functions.https.HttpsError('failed-precondition', 'API Key no configurada');
    }
    
    // Preparar waypoints para Google Maps
    const waypointsFormatted = waypoints.map((wp: any) => ({
      location: { lat: wp.lat, lng: wp.lng },
      stopover: true,
    }));
    
    // Llamar a Google Maps Directions API
    const response = await mapsClient.directions({
      params: {
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        waypoints: waypointsFormatted.length > 0 ? waypointsFormatted : undefined,
        optimize: optimize && waypointsFormatted.length > 0, // Optimizar orden de waypoints
        mode: TravelMode.driving,
        units: UnitSystem.metric,
        key: GOOGLE_MAPS_API_KEY,
      },
    });
    
    if (response.data.status !== 'OK' || !response.data.routes || response.data.routes.length === 0) {
      throw new functions.https.HttpsError('not-found', 'No se encontró una ruta válida');
    }
    
    const route = response.data.routes[0];
    
    // Extraer polyline completa
    const polyline = route.overview_polyline.points;
    
    // Calcular distancia y duración totales
    let totalDistance = 0;
    let totalDuration = 0;
    
    route.legs.forEach((leg: any) => {
      totalDistance += leg.distance?.value || 0;
      totalDuration += leg.duration?.value || 0;
    });
    
    // Extraer coordenadas de la ruta
    const routeCoordinates = route.legs.flatMap((leg: any) => 
      leg.steps.flatMap((step: any) => 
        decodePolyline(step.polyline.points)
      )
    );
    
    // Información detallada de cada leg (segmento entre paradas)
    const legsInfo = route.legs.map((leg: any, index: number) => ({
      legIndex: index,
      distance: leg.distance?.value || 0,
      distanceText: leg.distance?.text || '',
      duration: leg.duration?.value || 0,
      durationText: leg.duration?.text || '',
      startAddress: leg.start_address,
      endAddress: leg.end_address,
      startLocation: leg.start_location,
      endLocation: leg.end_location,
      steps: leg.steps.length,
    }));
    
    // Si se optimizó el orden, devolver el nuevo orden de waypoints
    const waypointOrder = route.waypoint_order || [];
    
    return {
      success: true,
      route: routeCoordinates,
      distance: totalDistance, // en metros
      duration: totalDuration, // en segundos
      polyline: polyline,
      legs: legsInfo,
      waypointOrder: waypointOrder, // Orden optimizado de waypoints (si se solicitó)
      bounds: route.bounds, // Límites geográficos de la ruta
      copyrights: route.copyrights,
      warnings: route.warnings || [],
      // Información adicional para destinos múltiples
      numberOfStops: waypoints.length + 2, // origen + waypoints + destino
      estimatedFuelCost: calculateEstimatedFuelCost(totalDistance), // Costo estimado de combustible
      estimatedTollCost: 0, // Placeholder para peajes (requiere Toll API)
    };
    
  } catch (error: any) {
    console.error('Error calculando ruta:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Error calculando ruta');
  }
});

/**
 * Calcula el costo estimado de combustible basado en la distancia
 * Asume consumo promedio de 12 km/L y precio de C$30/L
 */
function calculateEstimatedFuelCost(distanceMeters: number): number {
  const distanceKm = distanceMeters / 1000;
  const fuelConsumptionPerKm = 1 / 12; // 12 km por litro
  const fuelPricePerLiter = 30; // C$30 por litro (Nicaragua)
  
  const litersNeeded = distanceKm * fuelConsumptionPerKm;
  const cost = litersNeeded * fuelPricePerLiter;
  
  return Math.round(cost);
}

/**
 * Geocodificación inversa: obtiene dirección desde coordenadas
 */
export const reverseGeocode = functions.https.onCall(async (data, context) => {
  try {
    const { lat, lng } = data;
    
    if (!lat || !lng) {
      throw new functions.https.HttpsError('invalid-argument', 'Latitud y longitud son requeridas');
    }
    
    if (!GOOGLE_MAPS_API_KEY) {
      throw new functions.https.HttpsError('failed-precondition', 'API Key no configurada');
    }
    
    const response = await mapsClient.reverseGeocode({
      params: {
        latlng: { lat, lng },
        key: GOOGLE_MAPS_API_KEY,
      },
    });
    
    if (response.data.status !== 'OK' || !response.data.results || response.data.results.length === 0) {
      throw new functions.https.HttpsError('not-found', 'No se encontró dirección para estas coordenadas');
    }
    
    const address = response.data.results[0].formatted_address;
    
    return {
      success: true,
      address,
      components: response.data.results[0].address_components,
    };
    
  } catch (error: any) {
    console.error('Error en geocodificación inversa:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Error obteniendo dirección');
  }
});

/**
 * Geocodificación: obtiene coordenadas desde dirección
 */
export const geocodeAddress = functions.https.onCall(async (data, context) => {
  try {
    const { address } = data;
    
    if (!address) {
      throw new functions.https.HttpsError('invalid-argument', 'Dirección es requerida');
    }
    
    if (!GOOGLE_MAPS_API_KEY) {
      throw new functions.https.HttpsError('failed-precondition', 'API Key no configurada');
    }
    
    const response = await mapsClient.geocode({
      params: {
        address,
        key: GOOGLE_MAPS_API_KEY,
      },
    });
    
    if (response.data.status !== 'OK' || !response.data.results || response.data.results.length === 0) {
      throw new functions.https.HttpsError('not-found', 'No se encontraron coordenadas para esta dirección');
    }
    
    const location = response.data.results[0].geometry.location;
    
    return {
      success: true,
      lat: location.lat,
      lng: location.lng,
      formattedAddress: response.data.results[0].formatted_address,
    };
    
  } catch (error: any) {
    console.error('Error en geocodificación:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Error obteniendo coordenadas');
  }
});

/**
 * Busca lugares cercanos
 */
export const searchPlaces = functions.https.onCall(async (data, context) => {
  try {
    const { query, location, radius = 5000 } = data;
    
    if (!query || !location) {
      throw new functions.https.HttpsError('invalid-argument', 'Query y ubicación son requeridos');
    }
    
    if (!GOOGLE_MAPS_API_KEY) {
      throw new functions.https.HttpsError('failed-precondition', 'API Key no configurada');
    }
    
    const response = await mapsClient.placesNearby({
      params: {
        location: { lat: location.lat, lng: location.lng },
        radius,
        keyword: query,
        key: GOOGLE_MAPS_API_KEY,
      },
    });
    
    if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
      throw new functions.https.HttpsError('internal', 'Error buscando lugares');
    }
    
    const places = response.data.results.map((place: any) => ({
      placeId: place.place_id,
      name: place.name,
      address: place.vicinity,
      location: place.geometry?.location,
      types: place.types,
      rating: place.rating,
    }));
    
    return {
      success: true,
      places,
    };
    
  } catch (error: any) {
    console.error('Error buscando lugares:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Error buscando lugares');
  }
});

/**
 * Calcula distancia y duración entre dos puntos
 */
export const calculateDistance = functions.https.onCall(async (data, context) => {
  try {
    const { origin, destination } = data;
    
    if (!origin || !destination) {
      throw new functions.https.HttpsError('invalid-argument', 'Origen y destino son requeridos');
    }
    
    if (!GOOGLE_MAPS_API_KEY) {
      throw new functions.https.HttpsError('failed-precondition', 'API Key no configurada');
    }
    
    const response = await mapsClient.distancematrix({
      params: {
        origins: [{ lat: origin.lat, lng: origin.lng }],
        destinations: [{ lat: destination.lat, lng: destination.lng }],
        mode: TravelMode.driving,
        units: UnitSystem.metric,
        key: GOOGLE_MAPS_API_KEY,
      },
    });
    
    if (response.data.status !== 'OK' || !response.data.rows || response.data.rows.length === 0) {
      throw new functions.https.HttpsError('not-found', 'No se pudo calcular la distancia');
    }
    
    const element = response.data.rows[0].elements[0];
    
    if (element.status !== 'OK') {
      throw new functions.https.HttpsError('not-found', 'No se encontró una ruta válida');
    }
    
    return {
      success: true,
      distance: element.distance?.value, // en metros
      duration: element.duration?.value, // en segundos
      distanceText: element.distance?.text,
      durationText: element.duration?.text,
    };
    
  } catch (error: any) {
    console.error('Error calculando distancia:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Error calculando distancia');
  }
});

/**
 * Decodifica un polyline de Google Maps a coordenadas
 */
function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const poly: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    poly.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return poly;
}
