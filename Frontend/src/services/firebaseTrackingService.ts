/**
 * Servicio de Tracking usando Firebase Realtime Database
 * SIN WebSocket - Usa listeners nativos de Firebase
 */

import { getFirebaseDatabase } from '../config/firebase';
import { ref, set, onValue, off, update, remove } from 'firebase/database';

interface DriverLocation {
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  timestamp: number;
}

interface RideTracking {
  rideId: string;
  driverId: string;
  clientId: string;
  status: 'waiting' | 'in_progress' | 'completed' | 'cancelled';
  driverLocation?: DriverLocation;
  lastUpdate: number;
  destination?: {
    lat: number;
    lng: number;
    address: string;
  };
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
    }
  ): Promise<void> {
    try {
      const database = await getFirebaseDatabase();
      const locationRef = ref(database, `driverLocations/${driverId}`);
      
      await set(locationRef, {
        lat: location.latitude,
        lng: location.longitude,
        speed: location.speed || null,
        heading: location.heading || null,
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
   * Actualizar tracking del viaje
   */
  async updateRideTracking(
    rideId: string,
    data: Partial<RideTracking>
  ): Promise<void> {
    try {
      const database = await getFirebaseDatabase();
      const rideRef = ref(database, `activeRides/${rideId}`);
      
      await update(rideRef, {
        ...data,
        lastUpdate: Date.now(),
      });

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
    callback: (location: DriverLocation | null) => void
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
