/**
 * Servicio de Tracking usando Firebase Realtime Database
 * SIN WebSocket - Usa listeners nativos de Firebase
 * Versión mejorada con soporte para múltiples destinos y seguimiento de clientes
 */

import { getFirebaseAuth, getFirebaseDatabase, getFirebaseFunctions } from '../config/firebase';
import { ref, set, onValue, off, update, remove, serverTimestamp } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { signInAnonymously } from 'firebase/auth';

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
  status: 'waiting' | 'in_progress' | 'completed' | 'cancelled' | 'pending_payment' | 'pending_rating';
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

  private async ensureFirebaseAuthSession(): Promise<void> {
    const auth = await getFirebaseAuth();
    if (auth.currentUser) {
      return;
    }

    try {
      console.log('🔐 [FirebaseTrackingService] No hay sesión Firebase, autenticando anónimamente para tracking...');
      await signInAnonymously(auth);
      console.log('✅ [FirebaseTrackingService] Sesión anónima iniciada para tracking');
    } catch (error) {
      console.error('❌ [FirebaseTrackingService] Error iniciando sesión anónima:', error);
      throw error;
    }
  }

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
   * Guardar ubicación con reintentos automáticos
   */
  private async saveLocationWithRetry(
    rideId: string,
    location: Location,
    retries: number = 3
  ): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        console.log(
          `📍 Intento ${i + 1}/${retries} guardando ubicación en PostgreSQL`
        );

        const functions = await getFirebaseFunctions();
        const saveLocationFn = httpsCallable(
          functions,
          'saveRideLocationWithRetry'
        );

        const result = await saveLocationFn({
          rideId,
          latitude: location.latitude,
          longitude: location.longitude,
          speed: location.speed || null,
          heading: location.heading || null,
          accuracy: location.accuracy || null,
        });

        console.log('✅ Ubicación guardada en PostgreSQL:', result.data);
        return; // Éxito
      } catch (error: any) {
        console.error(`❌ Intento ${i + 1} falló:`, error.message);

        if (i === retries - 1) {
          console.error('❌ Todos los intentos fallaron');
          // No lanzar error - Firebase Realtime DB es lo importante
          return;
        }

        // Backoff exponencial
        const delay = Math.pow(2, i) * 1000;
        console.log(`⏳ Esperando ${delay}ms antes de reintentar...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Actualizar tracking del viaje
   * Guarda en Firebase Realtime DB Y en PostgreSQL (ride_locations)
   * ✅ NUEVO: Usa Cloud Function para actualizar (evita problemas de permisos)
   */
  async updateRideTracking(
    rideId: string,
    data: Partial<RideTracking>
  ): Promise<void> {
    try {
      await this.ensureFirebaseAuthSession();

      // ✅ NUEVO: Usar Cloud Function en lugar de actualizar directamente
      // Esto evita problemas de permisos en Firebase Realtime DB
      const functions = await getFirebaseFunctions();
      const updateTrackingFn = httpsCallable(functions, 'updateRideStatus');
      
      // ✅ NUEVO: Agregar timeout para evitar bloqueos
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout actualizando tracking')), 5000)
      );
      
      await Promise.race([
        updateTrackingFn({
          rideId,
          status: data.status,
          driverLocation: data.driverLocation ? {
            latitude: data.driverLocation.latitude,
            longitude: data.driverLocation.longitude,
            speed: data.driverLocation.speed,
            heading: data.driverLocation.heading,
            accuracy: data.driverLocation.accuracy,
          } : null,
        }),
        timeoutPromise
      ]);

      console.log(`✅ Tracking actualizado vía Cloud Function: ${rideId}`);

      // 2. Si hay ubicación del conductor, guardar en PostgreSQL (ride_locations) con reintentos
      // ✅ NUEVO: No guardar ubicaciones si el viaje está completado, cancelado o en pending_payment
      if (data.driverLocation && 
          data.status !== 'pending_payment' && 
          data.status !== 'completed' && 
          data.status !== 'cancelled' &&
          data.status !== 'pending_rating') {
        await this.saveLocationWithRetry(rideId, data.driverLocation, 3);
      } else if (data.status === 'pending_payment' || data.status === 'completed' || data.status === 'cancelled' || data.status === 'pending_rating') {
        console.log(`⏸️ Tracking pausado: viaje en estado ${data.status}, no se guardan ubicaciones`);
      }

      console.log(`🚗 Tracking actualizado: ${rideId}`);
    } catch (error: any) {
      console.error('❌ Error actualizando tracking:', error);
      
      // ✅ NUEVO: Logging detallado de errores
      if (error.code === 'functions/unavailable') {
        console.warn(`⚠️ Firebase Functions no disponible - posible problema de conectividad`);
      } else if (error.message?.includes('Timeout')) {
        console.warn(`⚠️ Timeout actualizando tracking - servidor lento`);
      }
      
      // No lanzar error - el tracking es no-bloqueante
      console.warn(`⚠️ Tracking no se actualizó, pero el viaje continúa`);
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
    
    // ✅ NUEVO: Escuchar driverLocations (principal) con fallback a driversInfo
    const locationRef = ref(database, `driverLocations/${driverId}`);
    const driverInfoRef = ref(database, `driversInfo/${driverId}`);
    
    console.log(`📍 [subscribeToDriverLocation] Escuchando ubicación del conductor: ${driverId}`);
    
    let hasReceivedData = false;
    let unsubscribeInfo: (() => void) | null = null;
    
    const unsubscribe = onValue(
      locationRef,
      (snapshot) => {
        const data = snapshot.val();
        
        if (data) {
          hasReceivedData = true;
          console.log(`📍 [subscribeToDriverLocation] Ubicación recibida desde driverLocations:`, data);
          callback({
            latitude: data.lat,
            longitude: data.lng,
            speed: data.speed,
            heading: data.heading,
            timestamp: data.lastUpdate,
          });
          
          // Si teníamos un fallback activo, desactivarlo
          if (unsubscribeInfo) {
            unsubscribeInfo();
            unsubscribeInfo = null;
          }
        } else if (!hasReceivedData) {
          console.log(`⚠️ [subscribeToDriverLocation] No hay datos en driverLocations, activando fallback a driversInfo...`);
          
          // Fallback: escuchar driversInfo
          unsubscribeInfo = onValue(
            driverInfoRef,
            (infoSnapshot) => {
              const infoData = infoSnapshot.val();
              if (infoData && (infoData.lat || infoData.latitude)) {
                console.log(`📍 [subscribeToDriverLocation] Ubicación recibida desde driversInfo:`, infoData);
                callback({
                  latitude: infoData.latitude || infoData.lat,
                  longitude: infoData.longitude || infoData.lng,
                  speed: infoData.speed || null,
                  heading: infoData.heading || null,
                  timestamp: infoData.lastUpdate || new Date().toISOString(),
                });
              } else {
                callback(null);
              }
            }
          );
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
      if (unsubscribeInfo) {
        unsubscribeInfo();
      }
      this.listeners.delete(`driver_${driverId}`);
      this.listeners.delete(`driver_info_${driverId}`);
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
