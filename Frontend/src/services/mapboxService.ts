import axios from 'axios';

const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1Ijoic2FtdWVsdWVzIiwiYSI6ImNtZ2k5OHdzbDA3NW8ybXB4OXM5Y2E2ZzYifQ.rTD0LZ2w9t_jQxEV2MR_Sg';
const MAPBOX_BASE_URL = 'https://api.mapbox.com';

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface RouteResult {
  distance: number; // metros
  duration: number; // segundos
  polyline: Array<{ latitude: number; longitude: number }>;
}

class MapboxService {
  /**
   * Geocoding - Convertir dirección a coordenadas
   */
  async geocode(address: string): Promise<Coordinates | null> {
    try {
      const response = await axios.get(
        `${MAPBOX_BASE_URL}/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`,
        {
          params: {
            access_token: MAPBOX_ACCESS_TOKEN,
            country: 'ni', // Restringir a Nicaragua
            language: 'es',
            limit: 1,
          },
        }
      );

      if (response.data.features && response.data.features.length > 0) {
        const [longitude, latitude] = response.data.features[0].center;
        return { latitude, longitude };
      }

      return null;
    } catch (error) {
      console.error('❌ Mapbox Geocoding error:', error);
      return null;
    }
  }

  /**
   * Reverse Geocoding - Convertir coordenadas a dirección
   */
  async reverseGeocode(coords: Coordinates): Promise<string | null> {
    try {
      const response = await axios.get(
        `${MAPBOX_BASE_URL}/geocoding/v5/mapbox.places/${coords.longitude},${coords.latitude}.json`,
        {
          params: {
            access_token: MAPBOX_ACCESS_TOKEN,
            language: 'es',
            types: 'address,place,locality',
          },
        }
      );

      if (response.data.features && response.data.features.length > 0) {
        return response.data.features[0].place_name;
      }

      return null;
    } catch (error) {
      console.error('❌ Mapbox Reverse Geocoding error:', error);
      return null;
    }
  }

  /**
   * Autocomplete - Búsqueda de lugares
   */
  async autocomplete(input: string, location?: Coordinates): Promise<any[]> {
    try {
      const params: any = {
        access_token: MAPBOX_ACCESS_TOKEN,
        country: 'ni',
        language: 'es',
        limit: 10,
        types: 'address,place,poi',
      };

      if (location) {
        params.proximity = `${location.longitude},${location.latitude}`;
      }

      const response = await axios.get(
        `${MAPBOX_BASE_URL}/geocoding/v5/mapbox.places/${encodeURIComponent(input)}.json`,
        { params }
      );

      if (response.data.features) {
        return response.data.features.map((feature: any) => ({
          place_id: feature.id,
          description: feature.place_name,
          position: {
            latitude: feature.center[1],
            longitude: feature.center[0],
          },
          structured_formatting: {
            main_text: feature.text,
            secondary_text: feature.place_name.replace(feature.text + ', ', ''),
          },
        }));
      }

      return [];
    } catch (error) {
      console.error('❌ Mapbox Autocomplete error:', error);
      return [];
    }
  }

  /**
   * Place Details - Obtener coordenadas de un place_id
   */
  async getPlaceDetails(placeId: string, position?: any): Promise<Coordinates | null> {
    try {
      // Mapbox ya nos da las coordenadas en el autocomplete
      if (position) {
        return {
          latitude: position.latitude,
          longitude: position.longitude,
        };
      }

      // Si no tenemos position, hacer una búsqueda por ID
      const response = await axios.get(
        `${MAPBOX_BASE_URL}/geocoding/v5/mapbox.places/${placeId}.json`,
        {
          params: {
            access_token: MAPBOX_ACCESS_TOKEN,
          },
        }
      );

      if (response.data.features && response.data.features.length > 0) {
        const [longitude, latitude] = response.data.features[0].center;
        return { latitude, longitude };
      }

      return null;
    } catch (error) {
      console.error('❌ Mapbox Place Details error:', error);
      return null;
    }
  }

  /**
   * Directions - Calcular ruta entre dos puntos
   */
  async getDirections(origin: Coordinates, destination: Coordinates): Promise<RouteResult | null> {
    try {
      const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
      
      const response = await axios.get(
        `${MAPBOX_BASE_URL}/directions/v5/mapbox/driving/${coordinates}`,
        {
          params: {
            access_token: MAPBOX_ACCESS_TOKEN,
            geometries: 'geojson',
            overview: 'full',
            steps: false,
          },
        }
      );

      if (response.data.routes && response.data.routes.length > 0) {
        const route = response.data.routes[0];
        
        // Convertir coordenadas de GeoJSON a nuestro formato
        const polyline = route.geometry.coordinates.map((coord: number[]) => ({
          longitude: coord[0],
          latitude: coord[1],
        }));

        return {
          distance: route.distance, // metros
          duration: route.duration, // segundos
          polyline,
        };
      }

      console.error('❌ Mapbox Directions: No routes found');
      return null;
    } catch (error) {
      console.error('❌ Mapbox Directions error:', error);
      return null;
    }
  }

  /**
   * Calcular precio estimado (mismo sistema)
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
   * Encontrar conductor más cercano (usando Matrix API)
   */
  async findNearestDriver(
    origin: Coordinates,
    drivers: Array<{ id: string; location: Coordinates }>
  ): Promise<{ id: string; distance: number; duration: number } | null> {
    try {
      if (drivers.length === 0) return null;

      // Mapbox Matrix API requiere coordenadas en formato lng,lat
      const coordinates = [
        `${origin.longitude},${origin.latitude}`,
        ...drivers.map(d => `${d.location.longitude},${d.location.latitude}`)
      ].join(';');

      const response = await axios.get(
        `${MAPBOX_BASE_URL}/directions-matrix/v1/mapbox/driving/${coordinates}`,
        {
          params: {
            access_token: MAPBOX_ACCESS_TOKEN,
            sources: '0', // Solo el origen
            annotations: 'distance,duration',
          },
        }
      );

      if (response.data.distances && response.data.durations) {
        const distances = response.data.distances[0]; // Primera fila (origen)
        const durations = response.data.durations[0];

        const results = drivers.map((driver, index) => ({
          id: driver.id,
          distance: distances[index + 1] || Infinity, // +1 porque el origen es index 0
          duration: durations[index + 1] || Infinity,
        }));

        results.sort((a, b) => a.distance - b.distance);
        return results[0] || null;
      }

      return null;
    } catch (error) {
      console.error('❌ Mapbox Matrix error:', error);
      return null;
    }
  }
}

export default new MapboxService();
