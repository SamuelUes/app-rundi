/**
 * Servicio unificado de mapas — Google Maps como único proveedor.
 */

import googleMapsService from './googleMapsService';

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
  async geocode(address: string): Promise<Coordinates | null> {
    return googleMapsService.geocode(address);
  }

  async reverseGeocode(coords: Coordinates): Promise<string | null> {
    return googleMapsService.reverseGeocode(coords);
  }

  async autocomplete(input: string, location?: Coordinates): Promise<any[]> {
    return googleMapsService.autocomplete(input, location);
  }

  async getPlaceDetails(placeId: string): Promise<Coordinates | null> {
    return googleMapsService.getPlaceDetails(placeId);
  }

  async getDirections(origin: Coordinates, destination: Coordinates): Promise<RouteResult | null> {
    return googleMapsService.getDirections(origin, destination);
  }

  calculateEstimatedPrice(distanceMeters: number, durationSeconds: number): number {
    return googleMapsService.calculateEstimatedPrice(distanceMeters, durationSeconds);
  }

  async findNearestDriver(
    origin: Coordinates,
    drivers: Array<{ id: string; location: Coordinates }>
  ): Promise<{ id: string; distance: number; duration: number } | null> {
    return googleMapsService.findNearestDriver(origin, drivers);
  }
}

export default new MapsService();
