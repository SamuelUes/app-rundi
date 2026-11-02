import axios from 'axios';
import Constants from 'expo-constants';
import { GOOGLE_MAPS_API_KEY as ENV_GOOGLE_MAPS_API_KEY } from '@env';

const GOOGLE_MAPS_BASE_URL = 'https://maps.googleapis.com/maps/api';
// Places API (New) — los endpoints legacy /place/* están deshabilitados en
// proyectos nuevos (REQUEST_DENIED aunque Places API (New) esté habilitada).
const PLACES_NEW_BASE_URL = 'https://places.googleapis.com/v1';
// Routes API — reemplazo de Directions + Distance Matrix (también legacy).
const ROUTES_BASE_URL = 'https://routes.googleapis.com';

type ExpoExtraWithGoogleMaps = {
  googleMapsApiKey?: string;
};

type ManifestWithExtra = {
  extra?: ExpoExtraWithGoogleMaps;
};

const resolveGoogleMapsKey = (): string => {
  const fromEnv = ENV_GOOGLE_MAPS_API_KEY?.trim();
  const fromProcess = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
  const expoExtra = (Constants.expoConfig?.extra as ExpoExtraWithGoogleMaps | undefined)?.googleMapsApiKey;
  const manifestExtra = (Constants.manifest as ManifestWithExtra | null)?.extra?.googleMapsApiKey;
  const fromExtra = (expoExtra || manifestExtra || '')?.trim?.() ?? '';

  const key = (fromEnv || fromProcess || fromExtra || '').trim();
  if (!key) {
    console.error('❌ Google Maps API key no configurada. Define GOOGLE_MAPS_API_KEY en el entorno.');
  }
  return key;
};

const GOOGLE_MAPS_API_KEY = resolveGoogleMapsKey();

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface RouteResult {
  distance: number; // metros
  duration: number; // segundos
  polyline: Array<{ latitude: number; longitude: number }>;
}

class GoogleMapsService {
  /**
   * Geocoding - Convertir dirección a coordenadas
   */
  async geocode(address: string): Promise<Coordinates | null> {
    try {
      const response = await axios.get(`${GOOGLE_MAPS_BASE_URL}/geocode/json`, {
        params: {
          address,
          key: GOOGLE_MAPS_API_KEY,
        },
      });

      if (response.data.status === 'OK' && response.data.results.length > 0) {
        const location = response.data.results[0].geometry.location;
        return {
          latitude: location.lat,
          longitude: location.lng,
        };
      }

      return null;
    } catch (error) {
      console.error('❌ Google Geocoding error:', error);
      return null;
    }
  }

  /**
   * Reverse Geocoding - Convertir coordenadas a dirección
   */
  async reverseGeocode(coords: Coordinates): Promise<string | null> {
    try {
      const response = await axios.get(`${GOOGLE_MAPS_BASE_URL}/geocode/json`, {
        params: {
          latlng: `${coords.latitude},${coords.longitude}`,
          key: GOOGLE_MAPS_API_KEY,
          language: 'es',
        },
      });

      if (response.data.status === 'OK' && response.data.results.length > 0) {
        return response.data.results[0].formatted_address;
      }

      return null;
    } catch (error) {
      console.error('❌ Google Reverse Geocoding error:', error);
      return null;
    }
  }

  /**
   * Autocomplete - Búsqueda de lugares (Places API New)
   * POST places.googleapis.com/v1/places:autocomplete — sin status OK: la
   * respuesta trae `suggestions` o 4xx con {error}. Se mapea al shape legacy
   * (place_id/description/structured_formatting) que consumen los callers.
   */
  async autocomplete(input: string, location?: Coordinates): Promise<any[]> {
    try {
      const body: any = {
        input,
        languageCode: 'es',
        regionCode: 'NI',
        includedRegionCodes: ['ni'], // Restringir a Nicaragua
      };

      if (location) {
        body.locationBias = {
          circle: {
            center: {
              latitude: location.latitude,
              longitude: location.longitude,
            },
            radius: 50000.0, // 50km
          },
        };
      }

      const response = await axios.post(`${PLACES_NEW_BASE_URL}/places:autocomplete`, body, {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        },
      });

      const suggestions = response.data?.suggestions ?? [];
      return suggestions
        .map((s: any) => s?.placePrediction)
        .filter(Boolean)
        .map((prediction: any) => ({
          place_id: prediction.placeId,
          description: prediction.text?.text ?? '',
          structured_formatting: {
            main_text: prediction.structuredFormat?.mainText?.text ?? '',
            secondary_text: prediction.structuredFormat?.secondaryText?.text ?? '',
          },
        }));
    } catch (error: any) {
      console.warn('⚠️ Google Autocomplete error:', error?.response?.data ?? error);
      return [];
    }
  }

  /**
   * Place Details - Obtener coordenadas de un place_id (Places API New)
   */
  async getPlaceDetails(placeId: string): Promise<Coordinates | null> {
    try {
      const response = await axios.get(
        `${PLACES_NEW_BASE_URL}/places/${encodeURIComponent(placeId)}`,
        {
          headers: {
            'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
            'X-Goog-FieldMask': 'location',
          },
        },
      );

      const location = response.data?.location;
      if (typeof location?.latitude === 'number' && typeof location?.longitude === 'number') {
        return { latitude: location.latitude, longitude: location.longitude };
      }

      console.warn('⚠️ Google Place Details sin location:', response.data);
      return null;
    } catch (error: any) {
      console.error('❌ Google Place Details error:', error?.response?.data ?? error);
      return null;
    }
  }

  /**
   * Directions - Calcular ruta entre dos puntos (Routes API)
   * POST routes.googleapis.com/directions/v2:computeRoutes — duration viene
   * como string protobuf ("1234s"), polyline como encodedPolyline de la ruta
   * completa (equivalente a overview_polyline).
   */
  async getDirections(origin: Coordinates, destination: Coordinates): Promise<RouteResult | null> {
    try {
      const response = await axios.post(
        `${ROUTES_BASE_URL}/directions/v2:computeRoutes`,
        {
          origin: {
            location: {
              latLng: { latitude: origin.latitude, longitude: origin.longitude },
            },
          },
          destination: {
            location: {
              latLng: { latitude: destination.latitude, longitude: destination.longitude },
            },
          },
          travelMode: 'DRIVE',
          languageCode: 'es',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
            'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
          },
        },
      );

      const route = response.data?.routes?.[0];
      if (route?.polyline?.encodedPolyline) {
        return {
          distance: route.distanceMeters, // metros
          duration: this.parseDurationSeconds(route.duration), // segundos
          polyline: this.decodePolyline(route.polyline.encodedPolyline),
        };
      }

      console.warn('⚠️ Google Routes sin ruta:', response.data);
      return null;
    } catch (error: any) {
      console.error('❌ Google Routes error:', error?.response?.data ?? error);
      return null;
    }
  }

  /**
   * Duration protobuf ("1234s") → segundos
   */
  private parseDurationSeconds(duration: any): number {
    if (typeof duration === 'number') return duration;
    const seconds = parseFloat(String(duration ?? '').replace(/s$/, ''));
    return Number.isFinite(seconds) ? seconds : 0;
  }

  /**
   * Decodificar polyline de Google
   */
  private decodePolyline(encoded: string): Array<{ latitude: number; longitude: number }> {
    const points: Array<{ latitude: number; longitude: number }> = [];
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

      points.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
      });
    }

    return points;
  }

  /**
   * Calcular precio estimado (mismo sistema que TomTom)
   */
  calculateEstimatedPrice(distanceMeters: number, durationSeconds: number): number {
    const distanceKm = distanceMeters / 1000;
    const durationMin = durationSeconds / 60;
    const currentHour = new Date().getHours();
    const currentDay = new Date().getDay();

    const MINIMUM_FARE = 50; // C$50 mínimo
    const baseFare = 50; // C$50
    const pricePerKm = 35; // C$35 por km
    const pricePerMin = 5; // C$5 por minuto

    let total = baseFare + (distanceKm * pricePerKm) + (durationMin * pricePerMin);

    // Recargo nocturno (10pm - 6am)
    if (currentHour >= 22 || currentHour < 6) {
      total *= 1.20; // +20%
    }

    // Recargo fin de semana
    if (currentDay === 0 || currentDay === 6) {
      total *= 1.15; // +15%
    }

    // Garantizar mínimo de C$50, sin máximo
    return Math.max(Math.round(total), MINIMUM_FARE);
  }

  /**
   * Encontrar conductor más cercano (usando Distance Matrix)
   */
  async findNearestDriver(
    origin: Coordinates,
    drivers: Array<{ id: string; location: Coordinates }>
  ): Promise<{ id: string; distance: number; duration: number } | null> {
    try {
      if (drivers.length === 0) return null;

      const response = await axios.post(
        `${ROUTES_BASE_URL}/distanceMatrix/v2:computeRouteMatrix`,
        {
          origins: [
            {
              waypoint: {
                location: {
                  latLng: { latitude: origin.latitude, longitude: origin.longitude },
                },
              },
            },
          ],
          destinations: drivers.map((d) => ({
            waypoint: {
              location: {
                latLng: { latitude: d.location.latitude, longitude: d.location.longitude },
              },
            },
          })),
          travelMode: 'DRIVE',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
            'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,duration,condition',
          },
        },
      );

      const elements: any[] = Array.isArray(response.data)
        ? response.data
        : response.data?.routeMatrixElements ?? [];

      const results = drivers.map((driver, index) => {
        const el =
          elements.find((e) => e?.destinationIndex === index) ?? elements[index];
        return {
          id: driver.id,
          distance: el?.distanceMeters || Infinity,
          duration: el ? this.parseDurationSeconds(el.duration) || Infinity : Infinity,
        };
      });

      results.sort((a, b) => a.distance - b.distance);
      return results[0] || null;
    } catch (error: any) {
      console.error('❌ Google Route Matrix error:', error?.response?.data ?? error);
      return null;
    }
  }
}

export default new GoogleMapsService();
