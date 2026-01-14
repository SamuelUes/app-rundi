import axios from 'axios';
import Constants from 'expo-constants';
import { GOOGLE_MAPS_API_KEY as ENV_GOOGLE_MAPS_API_KEY } from '@env';

const GOOGLE_MAPS_BASE_URL = 'https://maps.googleapis.com/maps/api';

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
   * Autocomplete - Búsqueda de lugares
   */
  async autocomplete(input: string, location?: Coordinates): Promise<any[]> {
    try {
      const params: any = {
        input,
        key: GOOGLE_MAPS_API_KEY,
        language: 'es',
        components: 'country:ni', // Restringir a Nicaragua
      };

      if (location) {
        params.location = `${location.latitude},${location.longitude}`;
        params.radius = 50000; // 50km
      }

      const response = await axios.get(`${GOOGLE_MAPS_BASE_URL}/place/autocomplete/json`, {
        params,
      });

      if (response.data.status === 'OK') {
        return response.data.predictions.map((prediction: any) => ({
          place_id: prediction.place_id,
          description: prediction.description,
          structured_formatting: {
            main_text: prediction.structured_formatting.main_text,
            secondary_text: prediction.structured_formatting.secondary_text,
          },
        }));
      }

      console.warn('⚠️ Google Autocomplete respondió', response.data.status, response.data.error_message);
      return [];
    } catch (error) {
      console.error('❌ Google Autocomplete error:', error);
      return [];
    }
  }

  /**
   * Place Details - Obtener coordenadas de un place_id
   */
  async getPlaceDetails(placeId: string): Promise<Coordinates | null> {
    try {
      const response = await axios.get(`${GOOGLE_MAPS_BASE_URL}/place/details/json`, {
        params: {
          place_id: placeId,
          fields: 'geometry',
          key: GOOGLE_MAPS_API_KEY,
        },
      });

      if (response.data.status === 'OK') {
        const location = response.data.result.geometry.location;
        return {
          latitude: location.lat,
          longitude: location.lng,
        };
      }

      console.warn('⚠️ Google Place Details respondió', response.data.status, response.data.error_message);
      return null;
    } catch (error) {
      console.error('❌ Google Place Details error:', error);
      return null;
    }
  }

  /**
   * Directions - Calcular ruta entre dos puntos
   */
  async getDirections(origin: Coordinates, destination: Coordinates): Promise<RouteResult | null> {
    try {
      const response = await axios.get(`${GOOGLE_MAPS_BASE_URL}/directions/json`, {
        params: {
          origin: `${origin.latitude},${origin.longitude}`,
          destination: `${destination.latitude},${destination.longitude}`,
          key: GOOGLE_MAPS_API_KEY,
          mode: 'driving',
          language: 'es',
        },
      });

      if (response.data.status === 'OK' && response.data.routes.length > 0) {
        const route = response.data.routes[0];
        const leg = route.legs[0];

        // Decodificar polyline
        const polyline = this.decodePolyline(route.overview_polyline.points);

        return {
          distance: leg.distance.value, // metros
          duration: leg.duration.value, // segundos
          polyline,
        };
      }

      console.error('❌ Google Directions error:', response.data.status);
      return null;
    } catch (error) {
      console.error('❌ Google Directions error:', error);
      return null;
    }
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

      const destinations = drivers
        .map(d => `${d.location.latitude},${d.location.longitude}`)
        .join('|');

      const response = await axios.get(`${GOOGLE_MAPS_BASE_URL}/distancematrix/json`, {
        params: {
          origins: `${origin.latitude},${origin.longitude}`,
          destinations,
          key: GOOGLE_MAPS_API_KEY,
          mode: 'driving',
        },
      });

      if (response.data.status === 'OK') {
        const elements = response.data.rows[0].elements;
        const results = drivers.map((driver, index) => ({
          id: driver.id,
          distance: elements[index].distance?.value || Infinity,
          duration: elements[index].duration?.value || Infinity,
        }));

        results.sort((a, b) => a.distance - b.distance);
        return results[0] || null;
      }

      return null;
    } catch (error) {
      console.error('❌ Google Distance Matrix error:', error);
      return null;
    }
  }
}

export default new GoogleMapsService();
