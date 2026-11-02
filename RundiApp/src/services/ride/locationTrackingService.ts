/**
 * LocationTrackingService — adaptador v2.
 * Tracking: POST/GET /v1/rides/{id}/locations (autoridad SQL vía backend).
 * Geocoding/rutas/distancias: Google Maps client-side (mapsService).
 * Ya no existe la tabla ride_locations de Supabase.
 */

import mapsService from '../map/mapsService';
import { getRideLocations, recordRideLocations, type RideLocation } from '../../api/rides';
import { sqlRideIdForTrip } from '../../live/tripIds';
import i18n from '../../i18n';

export interface LocationPoint {
  lat: number;
  lng: number;
  speed?: number | null;
  heading?: number | null;
  accuracy?: number | null;
  timestamp?: string;
  address?: string;
  place_name?: string;
  place_id?: string;
}

export interface RouteData {
  origin: { lat: number; lng: number; address?: string; place_name?: string };
  destination: { lat: number; lng: number; address?: string; place_name?: string };
  waypoints?: Array<{ lat: number; lng: number; address?: string; place_name?: string }>;
  distance?: number;
  duration?: number;
  polyline?: string;
}

export interface TrackingPoint {
  id?: string;
  ride_id: string;
  lat: number;
  lng: number;
  speed?: number | null;
  heading?: number | null;
  accuracy?: number | null;
  timestamp?: string;
  location_type?: 'tracking' | 'origin' | 'destination' | 'waypoint';
  address?: string;
  place_name?: string;
  place_id?: string;
  is_origin?: boolean;
  is_destination?: boolean;
  is_waypoint?: boolean;
  waypoint_order?: number;
}

export interface RideRoutePoint {
  id: string;
  ride_id: string;
  lat: number;
  lng: number;
  location_type: 'origin' | 'waypoint' | 'destination';
  address?: string;
  place_name?: string;
  waypoint_order?: number;
  timestamp: string;
}

function toTrackingPoint(rideId: string, loc: RideLocation): TrackingPoint {
  return {
    id: loc.id,
    ride_id: rideId,
    lat: loc.lat,
    lng: loc.lng,
    timestamp: loc.createdAt,
    address: loc.address || undefined,
    location_type: (loc.type as TrackingPoint['location_type']) || 'tracking',
    is_origin: loc.type === 'origin',
    is_destination: loc.type === 'destination',
    is_waypoint: loc.type === 'waypoint',
    waypoint_order: loc.order || undefined,
  };
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

class LocationTrackingService {
  private tr(path: string) {
    return i18n.t(`services.locationTrackingService.${path}`) as string;
  }

  async saveLocationPoint(point: TrackingPoint): Promise<{ success: boolean; error?: string }> {
    return this.saveLocationBatch([point]);
  }

  async saveLocationBatch(points: TrackingPoint[]): Promise<{ success: boolean; error?: string }> {
    try {
      // La API v2 graba por rideId; agrupamos por ride_id por seguridad.
      const byRide = new Map<string, TrackingPoint[]>();
      for (const p of points) {
        const list = byRide.get(p.ride_id) ?? [];
        list.push(p);
        byRide.set(p.ride_id, list);
      }
      for (const [rideId, list] of byRide) {
        // REST exige el UUID SQL — ride_id puede venir como doc id vivo.
        const sqlId = await sqlRideIdForTrip(rideId);
        await recordRideLocations(
          sqlId,
          list.map((p) => ({
            lat: p.lat,
            lng: p.lng,
            at: p.timestamp ? new Date(p.timestamp).getTime() : undefined,
          })),
        );
      }
      return { success: true };
    } catch (error: any) {
      console.error('Error guardando lote de ubicaciones:', error);
      return { success: false, error: error.message || this.tr('errors.saveBatch') };
    }
  }

  async getRideLocationHistory(rideId: string, limit: number = 100): Promise<TrackingPoint[]> {
    try {
      const sqlId = await sqlRideIdForTrip(rideId);
      const locations = await getRideLocations(sqlId);
      return locations.slice(0, limit).map((l) => toTrackingPoint(sqlId, l));
    } catch (error) {
      console.error('Error obteniendo historial de ubicaciones:', error);
      return [];
    }
  }

  async getLastKnownLocation(rideId: string): Promise<TrackingPoint | null> {
    try {
      const locations = await getRideLocations(rideId);
      const tracking = locations.filter((l) => l.type === 'tracking');
      const last = tracking[tracking.length - 1] ?? locations[locations.length - 1];
      return last ? toTrackingPoint(rideId, last) : null;
    } catch (error) {
      console.error('Error obteniendo última ubicación:', error);
      return null;
    }
  }

  async calculateRoute(routeData: RouteData & { optimize?: boolean }): Promise<any> {
    try {
      const route = await mapsService.getDirections(
        { latitude: routeData.origin.lat, longitude: routeData.origin.lng },
        { latitude: routeData.destination.lat, longitude: routeData.destination.lng },
      );
      if (!route) throw new Error(this.tr('errors.routeFailed'));
      return {
        success: true,
        route,
        distance: route.distance,
        duration: route.duration,
        polyline: route.polyline,
      };
    } catch (error: any) {
      console.error('Error calculando ruta:', error);
      return { success: false, error: error.message || this.tr('errors.routeUnavailable') };
    }
  }

  async getAddressFromCoordinates(
    lat: number,
    lng: number,
  ): Promise<{ success: boolean; address?: string; error?: string }> {
    try {
      const address = await mapsService.reverseGeocode({ latitude: lat, longitude: lng });
      if (!address) throw new Error(this.tr('errors.reverseGeocodeFailed'));
      return { success: true, address };
    } catch (error: any) {
      console.error('Error obteniendo dirección:', error);
      return { success: false, error: error.message || this.tr('errors.reverseGeocodeUnavailable') };
    }
  }

  async getCoordinatesFromAddress(
    address: string,
  ): Promise<{ success: boolean; lat?: number; lng?: number; error?: string }> {
    try {
      const coords = await mapsService.geocode(address);
      if (!coords) throw new Error(this.tr('errors.geocodeFailed'));
      return { success: true, lat: coords.latitude, lng: coords.longitude };
    } catch (error: any) {
      console.error('Error obteniendo coordenadas:', error);
      return { success: false, error: error.message || this.tr('errors.geocodeUnavailable') };
    }
  }

  async searchNearbyPlaces(
    query: string,
    lat: number,
    lng: number,
    _radius: number = 5000,
  ): Promise<{ success: boolean; places?: any[]; error?: string }> {
    try {
      const places = await mapsService.autocomplete(query, { latitude: lat, longitude: lng });
      return { success: true, places };
    } catch (error: any) {
      console.error('Error buscando lugares:', error);
      return { success: false, error: error.message || this.tr('errors.placesSearchUnavailable') };
    }
  }

  async calculateDistance(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
  ): Promise<{ success: boolean; distance?: number; duration?: number; error?: string }> {
    try {
      const route = await mapsService.getDirections(
        { latitude: origin.lat, longitude: origin.lng },
        { latitude: destination.lat, longitude: destination.lng },
      );
      if (!route) throw new Error(this.tr('errors.distanceFailed'));
      return { success: true, distance: route.distance, duration: route.duration };
    } catch (error: any) {
      console.error('Error calculando distancia:', error);
      return { success: false, error: error.message || this.tr('errors.distanceUnavailable') };
    }
  }

  /** Las ubicaciones son append-only en v2 (SQL); no hay delete desde el cliente. */
  async deleteRideLocations(_rideId: string): Promise<{ success: boolean; error?: string }> {
    console.warn('[locationTrackingService] deleteRideLocations no soportado en v2 (append-only)');
    return { success: true };
  }

  /** La ruta (origen/waypoints/destino) viaja en el payload de requestRide en v2. */
  async saveRideRoute(rideId: string, ..._points: any[]): Promise<{ success: boolean; error?: string }> {
    console.warn('[locationTrackingService] saveRideRoute es no-op en v2 — waypoints van en requestRide', rideId);
    return { success: true };
  }

  async getRideRoute(rideId: string): Promise<RideRoutePoint[]> {
    try {
      const locations = await getRideLocations(rideId);
      return locations
        .filter((l) => l.type === 'origin' || l.type === 'waypoint' || l.type === 'destination')
        .map((l) => ({
          id: l.id,
          ride_id: rideId,
          lat: l.lat,
          lng: l.lng,
          location_type: l.type as RideRoutePoint['location_type'],
          address: l.address || undefined,
          waypoint_order: l.order || undefined,
          timestamp: l.createdAt,
        }));
    } catch (error) {
      console.error('Error obteniendo ruta del viaje:', error);
      return [];
    }
  }

  async getRideTracking(rideId: string, limit: number = 100): Promise<TrackingPoint[]> {
    try {
      const locations = await getRideLocations(rideId);
      return locations
        .filter((l) => l.type === 'tracking')
        .slice(0, limit)
        .map((l) => toTrackingPoint(rideId, l));
    } catch (error) {
      console.error('Error obteniendo tracking del viaje:', error);
      return [];
    }
  }

  async calculateRideDistance(rideId: string): Promise<number> {
    try {
      const tracking = await this.getRideTracking(rideId, 1000);
      let meters = 0;
      for (let i = 1; i < tracking.length; i++) {
        meters += haversineMeters(tracking[i - 1], tracking[i]);
      }
      return meters;
    } catch (error) {
      console.error('Error calculando distancia del viaje:', error);
      return 0;
    }
  }

  async updateWaypoint(..._args: any[]): Promise<{ success: boolean; error?: string }> {
    console.warn('[locationTrackingService] updateWaypoint no soportado en v2');
    return { success: true };
  }

  async deleteWaypoint(..._args: any[]): Promise<{ success: boolean; error?: string }> {
    console.warn('[locationTrackingService] deleteWaypoint no soportado en v2');
    return { success: true };
  }

  async reorderWaypoints(..._args: any[]): Promise<{ success: boolean; error?: string }> {
    console.warn('[locationTrackingService] reorderWaypoints no soportado en v2');
    return { success: true };
  }
}

export default new LocationTrackingService();
