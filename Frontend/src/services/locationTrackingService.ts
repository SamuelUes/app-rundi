/**
 * LocationTrackingService - Servicio para gestionar ubicaciones de viajes en Supabase
 * 
 * Este servicio maneja el almacenamiento y recuperación de ubicaciones en tiempo real
 * en la tabla ride_locations de Supabase, delegando la lógica de routing al backend.
 */

import supabase from '../config/supabase';
import { getFunctions } from 'firebase/functions';
import { httpsCallable } from 'firebase/functions';
import { initializeFirebase } from '../config/firebase';

// Interfaces para las ubicaciones
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

class LocationTrackingService {
  /**
   * Guarda un punto de ubicación en tiempo real para un viaje
   */
  async saveLocationPoint(point: TrackingPoint): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('ride_locations')
        .insert({
          ride_id: point.ride_id,
          lat: point.lat,
          lng: point.lng,
          speed: point.speed || null,
          heading: point.heading || null,
          accuracy: point.accuracy || null,
          timestamp: point.timestamp || new Date().toISOString(),
          location_type: point.location_type || 'tracking',
          address: point.address || null,
          place_name: point.place_name || null,
          place_id: point.place_id || null,
          is_origin: point.is_origin || false,
          is_destination: point.is_destination || false,
          is_waypoint: point.is_waypoint || false,
          waypoint_order: point.waypoint_order || null,
        });

      if (error) throw error;
      return { success: true };
    } catch (error: any) {
      console.error('Error guardando punto de ubicación:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Guarda múltiples puntos de ubicación en lote
   */
  async saveLocationBatch(points: TrackingPoint[]): Promise<{ success: boolean; error?: string }> {
    try {
      const formattedPoints = points.map(point => ({
        ride_id: point.ride_id,
        lat: point.lat,
        lng: point.lng,
        speed: point.speed || null,
        heading: point.heading || null,
        accuracy: point.accuracy || null,
        timestamp: point.timestamp || new Date().toISOString(),
      }));

      const { error } = await supabase
        .from('ride_locations')
        .insert(formattedPoints);

      if (error) throw error;
      return { success: true };
    } catch (error: any) {
      console.error('Error guardando lote de ubicaciones:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtiene el historial de ubicaciones de un viaje
   */
  async getRideLocationHistory(
    rideId: string,
    limit: number = 100
  ): Promise<TrackingPoint[]> {
    try {
      const { data, error } = await supabase
        .from('ride_locations')
        .select('*')
        .eq('ride_id', rideId)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo historial de ubicaciones:', error);
      return [];
    }
  }

  /**
   * Obtiene la última ubicación conocida de un viaje
   */
  async getLastKnownLocation(rideId: string): Promise<TrackingPoint | null> {
    try {
      const { data, error } = await supabase
        .from('ride_locations')
        .select('*')
        .eq('ride_id', rideId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error obteniendo última ubicación:', error);
      return null;
    }
  }
  /**
   * Calcula una ruta usando el backend (Firebase Function)
   */
  async calculateRoute(routeData: RouteData & { optimize?: boolean }): Promise<any> {
    try {
      const { functions } = await initializeFirebase();
      const calculateRouteFunction = httpsCallable(functions, 'calculateRoute');
      
      const result = await calculateRouteFunction({
        origin: routeData.origin,
        destination: routeData.destination,
        waypoints: routeData.waypoints || [],
      });

      const data = result.data as any;
      
      if (data.success) {
        return {
          success: true,
          route: data.route,
          distance: data.distance,
          duration: data.duration,
          polyline: data.polyline,
        };
      } else {
        throw new Error(data.error || 'Error calculando ruta');
      }
    } catch (error: any) {
      console.error('Error calculando ruta:', error);
      return {
        success: false,
        error: error.message || 'No se pudo calcular la ruta',
      };
    }
  }

  /**
   * Obtiene direcciones de texto para una ubicación usando el backend
   */
  async getAddressFromCoordinates(
    lat: number,
    lng: number
  ): Promise<{ success: boolean; address?: string; error?: string }> {
    try {
      const { functions } = await initializeFirebase();
      const geocodeFunction = httpsCallable(functions, 'reverseGeocode');
      
      const result = await geocodeFunction({ lat, lng });
      const data = result.data as any;
      
      if (data.success) {
        return {
          success: true,
          address: data.address,
        };
      } else {
        throw new Error(data.error || 'Error obteniendo dirección');
      }
    } catch (error: any) {
      console.error('Error obteniendo dirección:', error);
      return {
        success: false,
        error: error.message || 'No se pudo obtener la dirección',
      };
    }
  }

  /**
   * Obtiene coordenadas de una dirección usando el backend
   */
  async getCoordinatesFromAddress(
    address: string
  ): Promise<{ success: boolean; lat?: number; lng?: number; error?: string }> {
    try {
      const { functions } = await initializeFirebase();
      const geocodeFunction = httpsCallable(functions, 'geocodeAddress');
      
      const result = await geocodeFunction({ address });
      const data = result.data as any;
      
      if (data.success) {
        return {
          success: true,
          lat: data.lat,
          lng: data.lng,
        };
      } else {
        throw new Error(data.error || 'Error obteniendo coordenadas');
      }
    } catch (error: any) {
      console.error('Error obteniendo coordenadas:', error);
      return {
        success: false,
        error: error.message || 'No se pudieron obtener las coordenadas',
      };
    }
  }

  /**
   * Busca lugares cercanos usando el backend
   */
  async searchNearbyPlaces(
    query: string,
    lat: number,
    lng: number,
    radius: number = 5000
  ): Promise<{ success: boolean; places?: any[]; error?: string }> {
    try {
      const { functions } = await initializeFirebase();
      const searchFunction = httpsCallable(functions, 'searchPlaces');
      
      const result = await searchFunction({
        query,
        location: { lat, lng },
        radius,
      });
      
      const data = result.data as any;
      
      if (data.success) {
        return {
          success: true,
          places: data.places,
        };
      } else {
        throw new Error(data.error || 'Error buscando lugares');
      }
    } catch (error: any) {
      console.error('Error buscando lugares:', error);
      return {
        success: false,
        error: error.message || 'No se pudieron buscar lugares',
      };
    }
  }

  /**
   * Calcula la distancia entre dos puntos usando el backend
   */
  async calculateDistance(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number }
  ): Promise<{ success: boolean; distance?: number; duration?: number; error?: string }> {
    try {
      const { functions } = await initializeFirebase();
      const distanceFunction = httpsCallable(functions, 'calculateDistance');
      
      const result = await distanceFunction({ origin, destination });
      const data = result.data as any;
      
      if (data.success) {
        return {
          success: true,
          distance: data.distance,
          duration: data.duration,
        };
      } else {
        throw new Error(data.error || 'Error calculando distancia');
      }
    } catch (error: any) {
      console.error('Error calculando distancia:', error);
      return {
        success: false,
        error: error.message || 'No se pudo calcular la distancia',
      };
    }
  }

  /**
   * Elimina ubicaciones de un viaje
   */
  async deleteRideLocations(rideId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('ride_locations')
        .delete()
        .eq('ride_id', rideId);

      if (error) throw error;
      return { success: true };
    } catch (error: any) {
      console.error('Error eliminando ubicaciones del viaje:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Guarda la ruta completa de un viaje (origen + waypoints + destino)
   */
  async saveRideRoute(
    rideId: string,
    origin: { lat: number; lng: number; address?: string; place_name?: string },
    destination: { lat: number; lng: number; address?: string; place_name?: string },
    waypoints: Array<{ lat: number; lng: number; address?: string; place_name?: string }> = []
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const points: any[] = [];
      
      // Agregar origen
      points.push({
        ride_id: rideId,
        lat: origin.lat,
        lng: origin.lng,
        location_type: 'origin',
        address: origin.address || null,
        place_name: origin.place_name || null,
        is_origin: true,
        is_destination: false,
        is_waypoint: false,
        timestamp: new Date().toISOString(),
      });
      
      // Agregar waypoints
      waypoints.forEach((waypoint, index) => {
        points.push({
          ride_id: rideId,
          lat: waypoint.lat,
          lng: waypoint.lng,
          location_type: 'waypoint',
          address: waypoint.address || null,
          place_name: waypoint.place_name || null,
          is_origin: false,
          is_destination: false,
          is_waypoint: true,
          waypoint_order: index + 1,
          timestamp: new Date().toISOString(),
        });
      });
      
      // Agregar destino
      points.push({
        ride_id: rideId,
        lat: destination.lat,
        lng: destination.lng,
        location_type: 'destination',
        address: destination.address || null,
        place_name: destination.place_name || null,
        is_origin: false,
        is_destination: true,
        is_waypoint: false,
        timestamp: new Date().toISOString(),
      });
      
      const { error } = await supabase
        .from('ride_locations')
        .insert(points);
      
      if (error) throw error;
      return { success: true };
    } catch (error: any) {
      console.error('Error guardando ruta del viaje:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtiene la ruta completa de un viaje (origen + waypoints + destino)
   */
  async getRideRoute(rideId: string): Promise<RideRoutePoint[]> {
    try {
      const { data, error } = await supabase
        .rpc('get_ride_route', { p_ride_id: rideId });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo ruta del viaje:', error);
      return [];
    }
  }

  /**
   * Obtiene solo los puntos de tracking (no incluye origen/destino/waypoints)
   */
  async getRideTracking(rideId: string, limit: number = 100): Promise<TrackingPoint[]> {
    try {
      const { data, error } = await supabase
        .rpc('get_ride_tracking', { 
          p_ride_id: rideId,
          p_limit: limit 
        });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo tracking del viaje:', error);
      return [];
    }
  }

  /**
   * Calcula la distancia total del viaje basado en la ruta guardada
   */
  async calculateRideDistance(rideId: string): Promise<number> {
    try {
      const { data, error } = await supabase
        .rpc('calculate_ride_distance', { p_ride_id: rideId });
      
      if (error) throw error;
      return data || 0;
    } catch (error) {
      console.error('Error calculando distancia del viaje:', error);
      return 0;
    }
  }

  /**
   * Actualiza un waypoint específico
   */
  async updateWaypoint(
    rideId: string,
    waypointOrder: number,
    updates: Partial<TrackingPoint>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('ride_locations')
        .update(updates)
        .eq('ride_id', rideId)
        .eq('is_waypoint', true)
        .eq('waypoint_order', waypointOrder);
      
      if (error) throw error;
      return { success: true };
    } catch (error: any) {
      console.error('Error actualizando waypoint:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Elimina un waypoint específico
   */
  async deleteWaypoint(
    rideId: string,
    waypointOrder: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('ride_locations')
        .delete()
        .eq('ride_id', rideId)
        .eq('is_waypoint', true)
        .eq('waypoint_order', waypointOrder);
      
      if (error) throw error;
      return { success: true };
    } catch (error: any) {
      console.error('Error eliminando waypoint:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Reordena waypoints
   */
  async reorderWaypoints(
    rideId: string,
    newOrder: Array<{ oldOrder: number; newOrder: number }>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Actualizar cada waypoint con su nuevo orden
      for (const item of newOrder) {
        await this.updateWaypoint(rideId, item.oldOrder, {
          waypoint_order: item.newOrder
        });
      }
      
      return { success: true };
    } catch (error: any) {
      console.error('Error reordenando waypoints:', error);
      return { success: false, error: error.message };
    }
  }
}

export default new LocationTrackingService();
