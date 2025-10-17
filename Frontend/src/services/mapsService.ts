/**
 * Servicio unificado de mapas con sistema de fallback
 * Jerarquía: 1. Google Maps → 2. MapBox → 3. TomTom
 */

import googleMapsService from './googleMapsService';
import mapboxService from './mapboxService';
import tomtomService from './tomtomService';

type MapProvider = 'google' | 'mapbox' | 'openstreet' | 'tomtom';

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface RouteResult {
  distance: number;
  duration: number;
  polyline: Array<{ latitude: number; longitude: number }>;
}

class MapsService {
  // Jerarquía para MAPA VISUAL: 1. Google → 2. Mapbox → 3. OpenStreet → 4. TomTom
  private visualProviders: MapProvider[] = ['google', 'mapbox', 'openstreet', 'tomtom'];
  
  // Jerarquía para LÓGICA/ROUTING: 1. Mapbox → 2. Google → 3. OpenStreet → 4. TomTom
  private routingProviders: MapProvider[] = ['mapbox', 'google', 'openstreet', 'tomtom'];
  
  private currentProvider: MapProvider = 'mapbox'; // Mapbox para datos/routing
  private mapProvider: MapProvider = 'google'; // Google Maps para mapa visual
  private providerFetched = false;

  /**
   * Obtener servicio según proveedor
   */
  private getService(provider: MapProvider) {
    switch (provider) {
      case 'google':
        return googleMapsService;
      case 'mapbox':
        return mapboxService;
      case 'tomtom':
        return tomtomService;
      case 'openstreet':
        return mapboxService; // OpenStreet usa el mismo servicio que Mapbox
      default:
        return mapboxService;
    }
  }

  /**
   * Obtener proveedor de routing basado en el mapa visual
   */
  private getRoutingProvider(): MapProvider {
    // Siempre usar Mapbox para routing (mejor para Nicaragua y más confiable)
    return 'mapbox';
  }

  /**
   * Intentar con fallback automático
   */
  private async tryWithFallback<T>(
    operation: (service: any) => Promise<T>,
    forceProvider?: MapProvider,
    useRoutingOrder: boolean = false
  ): Promise<T | null> {
    // Si se especifica un proveedor forzado, usar solo ese
    // Si no, usar el orden correcto según el tipo de operación
    const providersToTry = forceProvider 
      ? [forceProvider] 
      : (useRoutingOrder ? this.routingProviders : this.visualProviders);
    
    for (const provider of providersToTry) {
      try {
        console.log(`🗺️ Intentando con ${provider.toUpperCase()}...`);
        const service = this.getService(provider);
        const result = await operation(service);
        
        if (result) {
          this.currentProvider = provider;
          console.log(`✅ Éxito con ${provider.toUpperCase()}`);
          return result;
        }
      } catch (error) {
        console.warn(`⚠️ ${provider.toUpperCase()} falló:`, error);
      }
    }
    
    console.error('❌ Todos los proveedores fallaron');
    return null;
  }

  /**
   * Consultar al backend cuál proveedor usar
   */
  async fetchProviderFromBackend(): Promise<void> {
    if (this.providerFetched) return;

    try {
      const { API_BASE_URL } = await import('../config/environment');
      const response = await fetch(`${API_BASE_URL}/maps/provider`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        // Si el endpoint no existe (404), simplemente usar el proveedor por defecto sin warning
        if (response.status === 404) {
          this.providerFetched = true;
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.provider) {
        this.currentProvider = data.provider;
        this.mapProvider = data.mapProvider || data.provider;
        this.providerFetched = true;
        console.log(`🗺️ Backend recomienda - Datos: ${data.provider.toUpperCase()}, Mapa: ${this.mapProvider.toUpperCase()}`);
      }
    } catch (error: any) {
      // Silenciar errores de red (Network request failed) y 404
      if (error.message !== 'HTTP 404' && error.message !== 'Network request failed') {
        console.warn('⚠️ Error consultando proveedor de mapas:', error.message);
      }
      this.providerFetched = true;
    }
  }

  /**
   * Obtener proveedor actual (para datos)
   */
  getProvider(): MapProvider {
    return this.currentProvider;
  }

  /**
   * Obtener proveedor para mapa visual
   * Intenta en orden: Google → Mapbox → OpenStreet → TomTom
   */
  async getMapProviderWithFallback(): Promise<MapProvider> {
    // Intentar Google Maps primero
    try {
      const testResult = await googleMapsService.reverseGeocode({ latitude: 0, longitude: 0 });
      if (testResult !== null) {
        this.mapProvider = 'google';
        return 'google';
      }
    } catch (error) {
      console.log('⚠️ Google Maps no disponible, usando fallback');
    }

    // Fallback a Mapbox
    try {
      const testResult = await mapboxService.reverseGeocode({ latitude: 0, longitude: 0 });
      if (testResult !== null) {
        this.mapProvider = 'mapbox';
        return 'mapbox';
      }
    } catch (error) {
      console.log('⚠️ Mapbox no disponible, usando OpenStreet');
    }

    // Fallback a OpenStreet (usa Mapbox service)
    this.mapProvider = 'openstreet';
    return 'openstreet';
  }

  /**
   * Obtener proveedor para mapa visual (sincrónico)
   */
  getMapProvider(): MapProvider {
    return this.mapProvider;
  }

  /**
   * Geocoding - Convertir dirección a coordenadas
   * Usa orden de routing (Mapbox primero)
   */
  async geocode(address: string): Promise<Coordinates | null> {
    return this.tryWithFallback(service => service.geocode(address), undefined, true);
  }

  /**
   * Reverse Geocoding - Convertir coordenadas a dirección
   * Usa orden de routing (Mapbox primero)
   */
  async reverseGeocode(coords: Coordinates): Promise<string | null> {
    return this.tryWithFallback(service => service.reverseGeocode(coords), undefined, true);
  }

  /**
   * Autocomplete - Búsqueda de lugares
   * Usa orden de routing (Mapbox primero)
   */
  async autocomplete(input: string, location?: Coordinates): Promise<any[]> {
    const result = await this.tryWithFallback<any[]>(service => service.autocomplete(input, location), undefined, true);
    return result || [];
  }

  /**
   * Place Details - Obtener coordenadas de un place_id
   * Usa orden de routing (Mapbox primero)
   */
  async getPlaceDetails(placeId: string, position?: any): Promise<Coordinates | null> {
    return this.tryWithFallback(service => service.getPlaceDetails(placeId, position), undefined, true);
  }

  /**
   * Obtener direcciones y ruta
   * Usa el proveedor de routing (Mapbox) para mejor precisión
   */
  async getDirections(origin: Coordinates, destination: Coordinates): Promise<RouteResult | null> {
    const routingProvider = this.getRoutingProvider();
    console.log(`🛣️ Usando ${routingProvider.toUpperCase()} para routing (mapa visual: ${this.mapProvider.toUpperCase()})`);
    
    // Intentar con el proveedor de routing preferido
    const result = await this.tryWithFallback<RouteResult>(
      service => service.getDirections(origin, destination),
      routingProvider,
      true // Usar orden de routing
    );
    
    // Si falla, intentar con fallback completo
    if (!result) {
      console.log('⚠️ Routing provider falló, intentando con fallback...');
      return this.tryWithFallback<RouteResult>(service => service.getDirections(origin, destination), undefined, true);
    }
    
    return result;
  }

  /**
   * Calcular precio estimado (usa el proveedor actual)
   */
  calculateEstimatedPrice(distanceMeters: number, durationSeconds: number): number {
    const service = this.getService(this.currentProvider);
    return service.calculateEstimatedPrice(distanceMeters, durationSeconds);
  }

  /**
   * Encontrar conductor más cercano
   * Usa el mismo proveedor que routing para consistencia
   */
  async findNearestDriver(
    origin: Coordinates,
    drivers: Array<{ id: string; location: Coordinates }>
  ): Promise<{ id: string; distance: number; duration: number } | null> {
    const routingProvider = this.getRoutingProvider();
    console.log(`🚗 Buscando conductor más cercano con ${routingProvider.toUpperCase()}`);
    
    // Intentar con el proveedor de routing preferido
    const result = await this.tryWithFallback<{ id: string; distance: number; duration: number }>(
      service => service.findNearestDriver(origin, drivers),
      routingProvider,
      true // Usar orden de routing
    );
    
    // Si falla, intentar con fallback completo
    if (!result) {
      return this.tryWithFallback<{ id: string; distance: number; duration: number }>(
        service => service.findNearestDriver(origin, drivers),
        undefined,
        true // Usar orden de routing
      );
    }
    
    return result;
  }
}

export default new MapsService();
