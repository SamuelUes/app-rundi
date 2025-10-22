/**
 * Servicio de Tracking usando Firebase Realtime Database
 * SIN WebSocket - Usa listeners nativos de Firebase
 * Versión mejorada con soporte para múltiples destinos y seguimiento de clientes
 */

import { getFirebaseDatabase, getFirebaseFunctions } from '../config/firebase';
import { ref, set, onValue, off, update, remove, serverTimestamp } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';

interface Location {
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
  timestamp: number;
}

interface Destination {
  lat: number;
  lng: number;
  address: string;
  order?: number; // Orden en la secuencia de múltiples destinos
  completed?: boolean; // Si ya se completó este destino
  eta?: number; // Tiempo estimado de llegada en segundos
  distance?: number; // Distancia en metros
}

interface RideTracking {
  rideId: string;
  driverId: string;
  clientId: string;
  status: 'waiting' | 'in_progress' | 'completed' | 'cancelled';
  driverLocation?: Location;
  clientLocation?: Location;
  lastUpdate: number;
  destination?: Destination;
  // Soporte para múltiples destinos
  destinations?: Destination[];
  currentDestinationIndex?: number;
}

class FirebaseTrackingService {
  private listeners: Map<string, any> = new Map();

  /**
   * Actualizar ubicación del conductor
   */
  async updateDriverLocation(
    driverId: string,
    location: {
      latitude: number;
      longitude: number;
      speed?: number;
      heading?: number;
      accuracy?: number;
    }
  ): Promise<void> {
    try {
      const database = await getFirebaseDatabase();
      const locationRef = ref(database, `driverLocations/${driverId}`);
      
      await set(locationRef, {
        lat: location.latitude,
        lng: location.longitude,
        speed: location.speed || 0,
        heading: location.heading || 0,
        accuracy: location.accuracy || 0,
        status: 'available',
        lastUpdate: Date.now(),
      });

      console.log(`📍 Ubicación actualizada en Firebase RTDB: ${driverId}`);
    } catch (error) {
      console.error('❌ Error actualizando ubicación:', error);
      throw error;
    }
  }
  
  /**
   * Actualizar ubicación del cliente
   */
  async updateClientLocation(
    clientId: string,
    location: {
      latitude: number;
      longitude: number;
      accuracy?: number;
    }
  ): Promise<void> {
    try {
      const database = await getFirebaseDatabase();
      const locationRef = ref(database, `clientLocations/${clientId}`);
      
      await set(locationRef, {
        lat: location.latitude,
        lng: location.longitude,
        accuracy: location.accuracy || 0,
        lastUpdate: Date.now(),
      });

      console.log(`📍 Ubicación del cliente actualizada: ${clientId}`);
    } catch (error) {
      console.error('❌ Error actualizando ubicación del cliente:', error);
      throw error;
    }
  }

  /**
   * Actualizar tracking del viaje
   * Guarda en Firebase Realtime DB Y en PostgreSQL (ride_locations)
   */
  async updateRideTracking(
    rideId: string,
    data: Partial<RideTracking>
  ): Promise<void> {
    try {
      // 1. Actualizar Firebase Realtime DB
      const database = await getFirebaseDatabase();
      const rideRef = ref(database, `activeRides/${rideId}`);
      
      await update(rideRef, {
        ...data,
        lastUpdate: Date.now(),
      });

      // 2. Si hay ubicación del conductor, guardar en PostgreSQL (ride_locations)
      if (data.driverLocation) {
        try {
          console.log(`🔄 Intentando guardar ubicación en PostgreSQL para ${rideId}`);
          const functions = await getFirebaseFunctions();
          console.log(`✅ Functions inicializado`);
          
          const saveLocationFn = httpsCallable(functions, 'saveRideLocation');
          console.log(`✅ Cloud Function obtenida`);
          
          const result = await saveLocationFn({
            rideId,
            latitude: data.driverLocation.latitude,
            longitude: data.driverLocation.longitude,
            speed: data.driverLocation.speed || null,
            heading: data.driverLocation.heading || null,
            accuracy: data.driverLocation.accuracy || null,
          });

          console.log(`📍 Ubicación guardada en PostgreSQL: ${rideId}`, result);
        } catch (pgError: any) {
          console.error(`❌ Error guardando en PostgreSQL:`, {
            message: pgError.message,
            code: pgError.code,
            details: pgError.details,
          });
          // No lanzar error - Firebase Realtime DB es lo importante
        }
      }

      console.log(`🚗 Tracking actualizado: ${rideId}`);
    } catch (error) {
      console.error('❌ Error actualizando tracking:', error);
      throw error;
    }
  }

  /**
   * Escuchar ubicación del conductor en tiempo real
   */
  async subscribeToDriverLocation(
    driverId: string,
    callback: (location: Location | null) => void
  ): Promise<() => void> {
    const database = await getFirebaseDatabase();
    const locationRef = ref(database, `driverLocations/${driverId}`);
    
    const unsubscribe = onValue(
      locationRef,
      (snapshot) => {
        const data = snapshot.val();
        
        if (data) {
          callback({
            latitude: data.lat,
            longitude: data.lng,
            speed: data.speed,
            heading: data.heading,
            timestamp: data.lastUpdate,
          });
        } else {
          callback(null);
        }
      },
      (error) => {
        console.error('❌ Error escuchando ubicación:', error);
        callback(null);
      }
    );

    // Guardar listener para limpieza
    this.listeners.set(`driver_${driverId}`, locationRef);

    // Retornar función de limpieza
    return () => {
      off(locationRef);
      this.listeners.delete(`driver_${driverId}`);
      console.log(`🛑 Detenido listener de conductor: ${driverId}`);
    };
  }

  /**
   * Escuchar tracking del viaje en tiempo real
   */
  async subscribeToRideTracking(
    rideId: string,
    callback: (tracking: RideTracking | null) => void
  ): Promise<() => void> {
    const database = await getFirebaseDatabase();
    const rideRef = ref(database, `activeRides/${rideId}`);
    
    const unsubscribe = onValue(
      rideRef,
      (snapshot) => {
        const data = snapshot.val();
        
        if (data) {
          callback(data as RideTracking);
        } else {
          callback(null);
        }
      },
      (error) => {
        console.error('❌ Error escuchando viaje:', error);
        callback(null);
      }
    );

    // Guardar listener para limpieza
    this.listeners.set(`ride_${rideId}`, rideRef);

    // Retornar función de limpieza
    return () => {
      off(rideRef);
      this.listeners.delete(`ride_${rideId}`);
      console.log(`🛑 Detenido listener de viaje: ${rideId}`);
    };
  }

  /**
   * Iniciar tracking de viaje
   */
  async startRideTracking(
    rideId: string,
    driverId: string,
    clientId: string
  ): Promise<void> {
    try {
      const database = await getFirebaseDatabase();
      const rideRef = ref(database, `activeRides/${rideId}`);
      
      await set(rideRef, {
        rideId,
        driverId,
        clientId,
        status: 'in_progress',
        lastUpdate: Date.now(),
      });

      console.log(`🎯 Tracking iniciado para viaje: ${rideId}`);
    } catch (error) {
      console.error('❌ Error iniciando tracking:', error);
      throw error;
    }
  }

  /**
   * Detener tracking de viaje
   */
  async stopRideTracking(rideId: string): Promise<void> {
    try {
      const database = await getFirebaseDatabase();
      const rideRef = ref(database, `activeRides/${rideId}`);
      await remove(rideRef);
      
      console.log(`🛑 Tracking detenido para viaje: ${rideId}`);
    } catch (error) {
      console.error('❌ Error deteniendo tracking:', error);
      throw error;
    }
  }

  /**
   * Limpiar todos los listeners
   */
  cleanup(): void {
    this.listeners.forEach((locationRef, key) => {
      off(locationRef);
      console.log(`🧹 Limpiado listener: ${key}`);
    });
    this.listeners.clear();
  }
}

export default new FirebaseTrackingService();
