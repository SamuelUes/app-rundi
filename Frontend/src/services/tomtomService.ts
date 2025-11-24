import axios from 'axios';

const TOMTOM_BASE_URL = 'https://api.tomtom.com';
const TOMTOM_API_KEY = '3NDFoFMjpXAs6W2PbCIEAMG0eAlQymMA';

/**
 * 🗺️ TomTom Service - Suite completa de APIs
 * 
 * APIs implementadas:
 * - Map Display API: Mapa interactivo
 * - Routing API: Calcular rutas
 * - Traffic API: Tráfico en tiempo real
 * - Search API: Buscar lugares
 * - Geocoding API: Dirección a coordenadas
 * - Reverse Geocoding API: Coordenadas a dirección
 * - Snap to Roads API: Ajustar GPS al camino
 * - Matrix Routing API: Conductor más cercano
 */

interface SearchResult {
  description: string;
  place_id: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
  position?: {
    lat: number;
    lon: number;
  };
}

interface Coordinates {
  latitude: number;
  longitude: number;
}

class TomTomService {
  /**
   * Buscar lugares con autocompletado
   */
  async autocomplete(query: string, location?: Coordinates): Promise<SearchResult[]> {
    try {
      console.log('🔍 TomTom autocomplete:', query, location);
      
      const params: any = {
        key: TOMTOM_API_KEY,
        limit: 10,
        language: 'es-ES',
        typeahead: true,
        // No restringir países para mejor búsqueda
      };

      if (location) {
        params.lat = location.latitude;
        params.lon = location.longitude;
        params.radius = 50000; // 50km de radio
      }

      // Usar Fuzzy Search que es mejor para autocompletado
      const url = `${TOMTOM_BASE_URL}/search/2/search/${encodeURIComponent(query)}.json`;
      console.log('📡 TomTom URL:', url);
      console.log('📡 TomTom params:', JSON.stringify(params, null, 2));

      const response = await axios.get(url, { 
        params,
        timeout: 10000 // 10 segundos timeout
      });

      console.log('✅ TomTom response:', response.data);
      const results = response.data.results || [];
      console.log('📍 Found results:', results.length);

      const mapped = results.map((result: any) => ({
        description: result.address.freeformAddress || result.poi?.name || 'Sin nombre',
        place_id: result.id,
        structured_formatting: {
          main_text: result.poi?.name || result.address.streetName || result.address.freeformAddress || 'Ubicación',
          secondary_text: result.address.municipality || result.address.country || '',
        },
        position: result.position,
      }));

      console.log('📋 Mapped results:', mapped);
      return mapped;
    } catch (error: any) {
      console.error('❌ TomTom autocomplete error:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Obtener coordenadas de un lugar
   */
  async getPlaceDetails(placeId: string, position?: { lat: number; lon: number }): Promise<Coordinates | null> {
    try {
      // Si ya tenemos la posición del resultado de búsqueda, usarla directamente
      if (position) {
        return {
          latitude: position.lat,
          longitude: position.lon,
        };
      }

      // Si no, hacer geocoding
      return null;
    } catch (error) {
      console.error('TomTom place details error:', error);
      return null;
    }
  }

  /**
   * Geocoding inverso (coordenadas a dirección)
   */
  async reverseGeocode(coords: Coordinates): Promise<string | null> {
    try {
      const response = await axios.get(
        `${TOMTOM_BASE_URL}/search/2/reverseGeocode/${coords.latitude},${coords.longitude}.json`,
        {
          params: {
            key: TOMTOM_API_KEY,
            language: 'es-ES',
          },
        }
      );

      const address = response.data.addresses?.[0]?.address;
      if (address) {
        return address.freeformAddress || 'Ubicación desconocida';
      }

      return null;
    } catch (error) {
      console.error('TomTom reverse geocode error:', error);
      return null;
    }
  }

  /**
   * Calcular ruta entre dos puntos
   */
  async getDirections(origin: Coordinates, destination: Coordinates): Promise<any> {
    try {
      const response = await axios.get(
        `${TOMTOM_BASE_URL}/routing/1/calculateRoute/${origin.latitude},${origin.longitude}:${destination.latitude},${destination.longitude}/json`,
        {
          params: {
            key: TOMTOM_API_KEY,
            traffic: true,
            travelMode: 'car',
            language: 'es-ES',
          },
        }
      );

      const route = response.data.routes?.[0];
      if (!route) return null;

      const summary = route.summary;
      const legs = route.legs[0];

      return {
        distance: summary.lengthInMeters, // metros
        duration: summary.travelTimeInSeconds, // segundos
        polyline: legs.points.map((p: any) => ({
          latitude: p.latitude,
          longitude: p.longitude,
        })),
      };
    } catch (error) {
      console.error('TomTom directions error:', error);
      return null;
    }
  }

  /**
   * Calcular precio estimado basado en distancia y duración
   * Rundi - Sistema de tarifas para Managua, Nicaragua
   * 
   * Tarifas:
   * - Base: C$50 (mínimo)
   * - Por kilómetro: C$35
   * - Por minuto: C$5 (tiempo consumido en tráfico)
   * - Recargo nocturno (10pm-6am): +20%
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
   * 🚗 Matrix Routing API - Encontrar conductor más cercano
   * Calcula distancias/tiempos entre múltiples orígenes y destinos
   */
  async findNearestDriver(
    origin: Coordinates,
    drivers: Array<{ id: string; location: Coordinates }>
  ): Promise<{ id: string; distance: number; duration: number } | null> {
    try {
      if (drivers.length === 0) return null;

      // Usar Matrix Routing para calcular todas las distancias de una vez
      const origins = `${origin.latitude},${origin.longitude}`;
      const destinations = drivers
        .map(d => `${d.location.latitude},${d.location.longitude}`)
        .join(':');

      const response = await axios.post(
        `${TOMTOM_BASE_URL}/routing/1/matrix/sync/json`,
        {
          origins: [{ point: { latitude: origin.latitude, longitude: origin.longitude } }],
          destinations: drivers.map(d => ({
            point: { latitude: d.location.latitude, longitude: d.location.longitude }
          }))
        },
        {
          params: {
            key: TOMTOM_API_KEY,
            traffic: true,
            travelMode: 'car',
          }
        }
      );

      const matrix = response.data.matrix[0];
      const results = drivers.map((driver, index) => ({
        id: driver.id,
        distance: matrix[index].response.routeSummary.lengthInMeters,
        duration: matrix[index].response.routeSummary.travelTimeInSeconds,
      }));

      // Ordenar por distancia
      results.sort((a, b) => a.distance - b.distance);

      console.log('🚗 Conductor más cercano:', results[0]);
      return results[0] || null;
    } catch (error) {
      console.error('❌ Matrix Routing error:', error);
      // Fallback: calcular uno por uno
      const distances = await Promise.all(
        drivers.map(async (driver) => {
          const route = await this.getDirections(origin, driver.location);
          return {
            id: driver.id,
            distance: route?.distance || Infinity,
            duration: route?.duration || Infinity,
          };
        })
      );

      distances.sort((a, b) => a.distance - b.distance);
      return distances[0] || null;
    }
  }

  /**
   * 🚘 Traffic API - Obtener tráfico en tiempo real
   */
  async getTrafficInfo(coords: Coordinates, radius: number = 1000): Promise<any> {
    try {
      const response = await axios.get(
        `${TOMTOM_BASE_URL}/traffic/services/4/flowSegmentData/absolute/10/json`,
        {
          params: {
            key: TOMTOM_API_KEY,
            point: `${coords.latitude},${coords.longitude}`,
            unit: 'KMPH',
          }
        }
      );

      const traffic = response.data.flowSegmentData;
      
      return {
        currentSpeed: traffic.currentSpeed,
        freeFlowSpeed: traffic.freeFlowSpeed,
        confidence: traffic.confidence,
        roadClosure: traffic.roadClosure,
        // Calcular nivel de congestión
        congestionLevel: this.calculateCongestionLevel(
          traffic.currentSpeed,
          traffic.freeFlowSpeed
        ),
      };
    } catch (error) {
      console.error('❌ Traffic API error:', error);
      return null;
    }
  }

  /**
   * 🛣️ Snap to Roads API - Ajustar GPS al camino correcto
   */
  async snapToRoads(points: Coordinates[]): Promise<Coordinates[]> {
    try {
      const response = await axios.post(
        `${TOMTOM_BASE_URL}/snapToRoads/1/json`,
        {
          points: points.map(p => ({
            latitude: p.latitude,
            longitude: p.longitude,
          }))
        },
        {
          params: {
            key: TOMTOM_API_KEY,
          }
        }
      );

      return response.data.snappedPoints.map((p: any) => ({
        latitude: p.latitude,
        longitude: p.longitude,
      }));
    } catch (error) {
      console.error('❌ Snap to Roads error:', error);
      return points; // Retornar puntos originales si falla
    }
  }

  /**
   * 📍 Geocoding API - Convertir dirección a coordenadas
   */
  async geocode(address: string): Promise<Coordinates | null> {
    try {
      const response = await axios.get(
        `${TOMTOM_BASE_URL}/search/2/geocode/${encodeURIComponent(address)}.json`,
        {
          params: {
            key: TOMTOM_API_KEY,
            language: 'es-ES',
          }
        }
      );

      const result = response.data.results?.[0];
      if (!result) return null;

      return {
        latitude: result.position.lat,
        longitude: result.position.lon,
      };
    } catch (error) {
      console.error('❌ Geocoding error:', error);
      return null;
    }
  }

  /**
   * 🚦 Calcular nivel de congestión
   */
  private calculateCongestionLevel(currentSpeed: number, freeFlowSpeed: number): string {
    const ratio = currentSpeed / freeFlowSpeed;
    
    if (ratio > 0.8) return 'fluido';
    if (ratio > 0.5) return 'moderado';
    if (ratio > 0.3) return 'lento';
    return 'congestionado';
  }

  /**
   * 🗺️ Obtener URL del mapa estático (para preview)
   */
  getStaticMapUrl(coords: Coordinates, zoom: number = 15, width: number = 400, height: number = 400): string {
    return `${TOMTOM_BASE_URL}/map/1/staticimage?key=${TOMTOM_API_KEY}&center=${coords.longitude},${coords.latitude}&zoom=${zoom}&width=${width}&height=${height}&format=png`;
  }

  /**
   * 🎯 Calcular ETA (Estimated Time of Arrival) con tráfico
   */
  async calculateETA(origin: Coordinates, destination: Coordinates): Promise<{
    eta: Date;
    duration: number;
    durationInTraffic: number;
    distance: number;
  } | null> {
    try {
      const route = await this.getDirections(origin, destination);
      if (!route) return null;

      const now = new Date();
      const etaDate = new Date(now.getTime() + route.duration * 1000);

      return {
        eta: etaDate,
        duration: route.duration,
        durationInTraffic: route.duration, // Ya incluye tráfico
        distance: route.distance,
      };
    } catch (error) {
      console.error('❌ ETA calculation error:', error);
      return null;
    }
  }
}

export default new TomTomService();
