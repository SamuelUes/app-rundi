/**
 * Servicio de Tracking usando Firebase Realtime Database
 * SIN WebSocket - Usa listeners nativos de Firebase
 * Versión mejorada con soporte para múltiples destinos y seguimiento de clientes
 */

import { getFirebaseDatabase } from '../config/firebase';
import { ref, onValue, off, update } from 'firebase/database';
import { getPreflightResult } from '../stores/preflightStore';
import sessionService from './sessionService';

interface Location {
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
  timestamp: number;
}

interface HeadingCacheEntry {
  lat: number;
  lng: number;
  heading: number | null;
  timestamp: number;
  speed?: number;
}

// ✅ Cache histórico mejorado: mantiene últimas 3 posiciones para mejor cálculo
interface HeadingHistory {
  points: HeadingCacheEntry[];
  maxPoints: number;
}

const driverHeadingCache: Record<string, HeadingHistory> = {};

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

function getCurrentServiceAreaId(): string | null {
  try {
    const summary = getPreflightResult();
    const region = summary?.region; 
    if (region && typeof region.serviceAreaId === 'string') {
      const trimmed = region.serviceAreaId.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  } catch (error) {
    console.warn('[FirebaseTrackingService] No se pudo leer serviceAreaId desde preflight:', error);
  }
  return null;
}

class FirebaseTrackingService {
  private listeners: Map<string, any> = new Map();

  /**
   * ✅ MEJORADO: Actualizar ubicación del conductor con cache histórico
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
    const normalizeHeading = (value: number): number => {
      const normalized = value % 360;
      return normalized < 0 ? normalized + 360 : normalized;
    };

    const computeHeading = (): number | null => {
      // ✅ Prioridad 1: Usar heading del GPS si está disponible
      if (typeof location.heading === 'number' && Number.isFinite(location.heading)) {
        return normalizeHeading(location.heading);
      }

      // ✅ Prioridad 2: Calcular desde historial de puntos
      const history = driverHeadingCache[driverId];
      if (!history || history.points.length === 0) {
        return null;
      }

      // ✅ Umbral de velocidad: ignorar si está muy lento
      const speed = location.speed || 0;
      if (speed < 1.5) {
        // Muy lento: mantener último heading conocido
        const lastPoint = history.points[history.points.length - 1];
        return lastPoint?.heading ?? null;
      }

      const toRad = (deg: number) => (deg * Math.PI) / 180;
      const toDeg = (rad: number) => (rad * 180) / Math.PI;

      // ✅ Usar el punto más antiguo del historial para mejor cálculo
      const oldestPoint = history.points[0];
      const lat1 = toRad(oldestPoint.lat);
      const lat2 = toRad(location.latitude);
      const dLon = toRad(location.longitude - oldestPoint.lng);

      const y = Math.sin(dLon) * Math.cos(lat2);
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

      // Sin movimiento significativo: mantener último heading
      if (Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12) {
        const lastPoint = history.points[history.points.length - 1];
        return lastPoint?.heading ?? null;
      }

      const bearing = normalizeHeading(toDeg(Math.atan2(y, x)));
      return Number.isFinite(bearing) ? bearing : null;
    };

    try {
      const database = await getFirebaseDatabase();
      const locationRef = ref(database, `driverLocations/${driverId}`);

      const deviceId = await sessionService.getDeviceId();
      const resolvedHeading = computeHeading();
      const timestamp = Date.now();

      // ✅ Inicializar historial si no existe
      if (!driverHeadingCache[driverId]) {
        driverHeadingCache[driverId] = {
          points: [],
          maxPoints: 3, // Mantener últimas 3 posiciones
        };
      }

      const history = driverHeadingCache[driverId];

      // ✅ Agregar nuevo punto al historial
      history.points.push({
        lat: location.latitude,
        lng: location.longitude,
        heading: resolvedHeading,
        timestamp,
        speed: location.speed,
      });

      // ✅ Mantener solo las últimas N posiciones
      if (history.points.length > history.maxPoints) {
        history.points.shift(); // Eliminar el más antiguo
      }

      // update() en vez de set(): preserva status (available/busy/offline lo
      // maneja el toggle de disponibilidad) y currentRideId — antes un set()
      // por cada punto GPS reseteaba el estado del conductor a 'available'.
      await update(locationRef, {
        deviceId,
        lat: location.latitude,
        lng: location.longitude,
        speed: location.speed || 0,
        heading: resolvedHeading,
        accuracy: location.accuracy || 0,
        lastUpdate: timestamp,
      });
    } catch (error) {
      console.error('❌ Error actualizando ubicación:', error);
      throw error;
    }
  }

  /**
   * Actualizar tracking del viaje
   * Escribe directo en Firebase Realtime DB (las rules ya autorizan a cada
   * participante sobre su propio campo de ubicación). No invoca callables por
   * punto GPS: la persistencia histórica la hace el backend al archivar el
   * viaje, y `status` es propiedad exclusiva de los callables dedicados.
   */
  async updateRideTracking(
    rideId: string,
    data: Partial<RideTracking>
  ): Promise<void> {
    try {
      const database = await getFirebaseDatabase();

      const updates: any = {
        lastUpdate: Date.now(),
      };

      if (data.driverLocation) {
        updates.driverLocation = {
          latitude: data.driverLocation.latitude,
          longitude: data.driverLocation.longitude,
          speed: data.driverLocation.speed || null,
          heading: data.driverLocation.heading || null,
          accuracy: data.driverLocation.accuracy || null,
          timestamp: data.driverLocation.timestamp || Date.now(),
        };
      }

      if (data.clientLocation) {
        updates.clientLocation = {
          latitude: data.clientLocation.latitude,
          longitude: data.clientLocation.longitude,
          speed: data.clientLocation.speed || null,
          heading: data.clientLocation.heading || null,
          accuracy: data.clientLocation.accuracy || null,
          timestamp: data.clientLocation.timestamp || Date.now(),
        };
      }

      await update(ref(database, `activeRides/${rideId}`), updates);
    } catch (error: any) {
      console.error('❌ Error actualizando tracking en Realtime DB:', error);
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

    const serviceAreaId = getCurrentServiceAreaId();

    // ✅ Escuchar driverLocations shardeado por área cuando sea posible,
    // con fallback implícito a driversInfo.
    const basePath = serviceAreaId
      ? `driverLocationsByArea/${serviceAreaId}/${driverId}`
      : `driverLocations/${driverId}`;

    const locationRef = ref(database, basePath);
    const driverInfoRef = ref(database, `driversInfo/${driverId}`);

    console.log(
      `📍 [subscribeToDriverLocation] Escuchando ubicación del conductor: ${driverId} en ${basePath}`,
    );
    
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
    const serviceAreaId = getCurrentServiceAreaId();
    const preferredPath = serviceAreaId
      ? `activeRidesByArea/${serviceAreaId}/${rideId}`
      : `activeRides/${rideId}`;
    const fallbackPath = `activeRides/${rideId}`;
    const rideRef = ref(database, preferredPath);
    const fallbackRideRef = ref(database, fallbackPath);
    
    console.log(
      `[subscribeToRideTracking] Escuchando tracking de viaje ${rideId} en ${preferredPath}`,
    );

    let hasReceivedData = false;
    let fallbackActive = false;
    let unsubscribeFallback: (() => void) | null = null;

    const unsubscribe = onValue(
      rideRef,
      (snapshot) => {
        const data = snapshot.val();
        
        if (data) {
          hasReceivedData = true;
          callback(data as RideTracking);

          if (fallbackActive && unsubscribeFallback) {
            unsubscribeFallback();
            unsubscribeFallback = null;
            fallbackActive = false;
          }
        } else {
          if (!hasReceivedData && serviceAreaId && preferredPath !== fallbackPath && !fallbackActive) {
            fallbackActive = true;
            unsubscribeFallback = onValue(
              fallbackRideRef,
              (fallbackSnapshot) => {
                const fallbackData = fallbackSnapshot.val();
                callback(fallbackData ? (fallbackData as RideTracking) : null);
              },
              (fallbackError) => {
                console.error('❌ Error en fallback de tracking (activeRides):', fallbackError);
                callback(null);
              },
            );
          } else if (!fallbackActive) {
            callback(null);
          }
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
      off(fallbackRideRef);
      if (unsubscribeFallback) {
        unsubscribeFallback();
      }
      this.listeners.delete(`ride_${rideId}`);
      console.log(`🛑 Detenido listener de viaje: ${rideId}`);
    };
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
