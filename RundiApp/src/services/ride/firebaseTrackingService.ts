import { liveTripDocId } from '../../live/tripIds';
/**
 * Servicio de Tracking — migrado a Firestore v2.
 * - GPS del conductor → REALTIME_drivers_live/{uid} (writeDriverLiveLocation)
 * - Ubicación de participante en viaje → trips_live/{rideId}/locations/{uid}
 * - Listeners → onSnapshot (Firestore), con unsubscribe exacto
 * SIN RTDB. La persistencia histórica la hace el backend (recordRideLocations).
 */

import { collection, doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getFirebaseFirestore } from '../../config/firebase';
import { FS_COL } from '../../constants/firestore';
import { writeDriverLiveLocation, writeTripParticipantLocation } from '../../live/driverLive';
import { getPreflightResult } from '../../stores/preflightStore';

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

interface HeadingHistory {
  points: HeadingCacheEntry[];
  maxPoints: number;
}

const driverHeadingCache: Record<string, HeadingHistory> = {};

interface Destination {
  lat: number;
  lng: number;
  address: string;
  order?: number;
  completed?: boolean;
  eta?: number;
  distance?: number;
}

interface RideTracking {
  rideId: string;
  driverId: string;
  clientId: string;
  status: 'waiting' | 'in_progress' | 'completed' | 'cancelled' | 'pending_payment' | 'pending_rating';
  driverLocation?: Location;
  clientLocation?: Location;
  followerLocation?: Location;
  lastUpdate: number;
  destination?: Destination;
  destinations?: Destination[];
  currentDestinationIndex?: number;
}

function currentUid(): string | null {
  try {
    return getAuth().currentUser?.uid ?? null;
  } catch {
    return null;
  }
}

function getCurrentServiceAreaId(): string | null {
  try {
    const summary = getPreflightResult();
    const region = summary?.region;
    if (region && typeof region.serviceAreaId === 'string') {
      const trimmed = region.serviceAreaId.trim();
      if (trimmed.length > 0) return trimmed;
    }
  } catch (error) {
    console.warn('[FirebaseTrackingService] No se pudo leer serviceAreaId desde preflight:', error);
  }
  return null;
}

function toLocation(data: any): Location | null {
  if (!data) return null;
  const lat = data.latitude ?? data.location?.latitude ?? data.lat;
  const lng = data.longitude ?? data.location?.longitude ?? data.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return {
    latitude: lat,
    longitude: lng,
    speed: data.speed ?? undefined,
    heading: data.heading ?? undefined,
    accuracy: data.accuracy ?? undefined,
    timestamp:
      typeof data.timestamp === 'number'
        ? data.timestamp
        : data.updatedAt?.toMillis?.() ?? data.lastSeen?.toMillis?.() ?? Date.now(),
  };
}

class FirebaseTrackingService {
  private listeners: Map<string, Unsubscribe> = new Map();

  /** Actualizar ubicación del conductor (REALTIME_drivers_live) con heading histórico. */
  async updateDriverLocation(
    driverId: string,
    location: {
      latitude: number;
      longitude: number;
      speed?: number;
      heading?: number;
      accuracy?: number;
    },
  ): Promise<void> {
    const normalizeHeading = (value: number): number => {
      const normalized = value % 360;
      return normalized < 0 ? normalized + 360 : normalized;
    };

    const computeHeading = (): number | null => {
      if (typeof location.heading === 'number' && Number.isFinite(location.heading)) {
        return normalizeHeading(location.heading);
      }
      const history = driverHeadingCache[driverId];
      if (!history || history.points.length === 0) return null;
      const speed = location.speed || 0;
      if (speed < 1.5) {
        return history.points[history.points.length - 1]?.heading ?? null;
      }
      const toRad = (deg: number) => (deg * Math.PI) / 180;
      const toDeg = (rad: number) => (rad * 180) / Math.PI;
      const oldestPoint = history.points[0];
      const lat1 = toRad(oldestPoint.lat);
      const lat2 = toRad(location.latitude);
      const dLon = toRad(location.longitude - oldestPoint.lng);
      const y = Math.sin(dLon) * Math.cos(lat2);
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
      if (Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12) {
        return history.points[history.points.length - 1]?.heading ?? null;
      }
      const bearing = normalizeHeading(toDeg(Math.atan2(y, x)));
      return Number.isFinite(bearing) ? bearing : null;
    };

    const resolvedHeading = computeHeading();
    const timestamp = Date.now();

    if (!driverHeadingCache[driverId]) {
      driverHeadingCache[driverId] = { points: [], maxPoints: 3 };
    }
    const history = driverHeadingCache[driverId];
    history.points.push({
      lat: location.latitude,
      lng: location.longitude,
      heading: resolvedHeading,
      timestamp,
      speed: location.speed,
    });
    if (history.points.length > history.maxPoints) history.points.shift();

    // merge: preserva status/currentRideId (solo se tocan campos presentes)
    await writeDriverLiveLocation(driverId, {
      latitude: location.latitude,
      longitude: location.longitude,
      speed: location.speed ?? undefined,
      heading: resolvedHeading ?? undefined,
      accuracy: location.accuracy ?? undefined,
      serviceAreaId: getCurrentServiceAreaId() ?? undefined,
    });
  }

  /**
   * Ubicación del participante dentro del viaje →
   * trips_live/{rideId}/locations/{uid}. El uid lo deriva del usuario
   * autenticado (reglas v2: cada participante escribe solo su subdoc).
   */
  async updateRideTracking(rideId: string, data: Partial<RideTracking>): Promise<void> {
    const uid = currentUid();
    if (!uid) return;
    const loc = data.driverLocation ?? data.clientLocation;
    if (loc) {
      await writeTripParticipantLocation(rideId, uid, loc.latitude, loc.longitude);
    }
  }

  /** Seguidor de crew: su propio subdoc de ubicación en trips_live. */
  async updateFollowerRideLocation(rideId: string, location: Location): Promise<void> {
    const uid = currentUid();
    if (!uid) return;
    await writeTripParticipantLocation(rideId, uid, location.latitude, location.longitude);
  }

  /** Escuchar ubicación del conductor → REALTIME_drivers_live/{driverId}. */
  async subscribeToDriverLocation(
    driverId: string,
    callback: (location: Location | null) => void,
  ): Promise<() => void> {
    const db = await getFirebaseFirestore();
    const liveRef = doc(db, FS_COL.driversLive, driverId);

    const unsubscribe = onSnapshot(
      liveRef,
      (snapshot) => {
        callback(toLocation(snapshot.data()));
      },
      (error) => {
        console.error('Error escuchando ubicación:', error);
        callback(null);
      },
    );

    this.listeners.set(`driver_${driverId}`, unsubscribe);

    return () => {
      unsubscribe();
      this.listeners.delete(`driver_${driverId}`);
    };
  }

  /**
   * Escuchar tracking del viaje → REALTIME_trips_live/{rideId} +
   * subcolección locations/{uid} (driverLocation/clientLocation/follower).
   */
  async subscribeToRideTracking(
    rideId: string,
    callback: (tracking: RideTracking | null) => void,
  ): Promise<() => void> {
    const db = await getFirebaseFirestore();
    const liveId = await liveTripDocId(rideId);
    const tripRef = doc(db, FS_COL.tripsLive, liveId);
    const locationsRef = collection(db, FS_COL.tripsLive, liveId, 'locations');

    let tripData: any = null;
    const participantLocs = new Map<string, Location>();

    const emit = () => {
      if (!tripData) {
        callback(null);
        return;
      }
      const driverId = tripData.driverId ?? tripData.driver_id;
      const clientId = tripData.clientId ?? tripData.client_id;
      const followerId = tripData.followerDriverId ?? tripData.follower_driver_id;
      callback({
        rideId,
        driverId,
        clientId,
        status: tripData.status,
        driverLocation: (driverId && participantLocs.get(driverId)) || toLocation(tripData.driverLocation),
        clientLocation: (clientId && participantLocs.get(clientId)) || toLocation(tripData.clientLocation),
        followerLocation: (followerId && participantLocs.get(followerId)) || toLocation(tripData.follower?.location),
        lastUpdate: tripData.lastUpdate ?? Date.now(),
        destination: tripData.destination,
        destinations: tripData.destinations,
        currentDestinationIndex: tripData.currentDestinationIndex,
      } as RideTracking);
    };

    const unsubscribeTrip = onSnapshot(
      tripRef,
      (snapshot) => {
        tripData = snapshot.data() ?? null;
        emit();
      },
      (error) => {
        console.error('Error escuchando viaje:', error);
        callback(null);
      },
    );

    const unsubscribeLocations = onSnapshot(locationsRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const loc = toLocation(change.doc.data());
        if (loc) participantLocs.set(change.doc.id, loc);
        else participantLocs.delete(change.doc.id);
      });
      emit();
    });

    this.listeners.set(`ride_${rideId}`, unsubscribeTrip);

    return () => {
      unsubscribeTrip();
      unsubscribeLocations();
      this.listeners.delete(`ride_${rideId}`);
    };
  }

  cleanup(): void {
    this.listeners.forEach((unsub, key) => {
      unsub();
      console.log(`Limpiado listener: ${key}`);
    });
    this.listeners.clear();
  }
}

export default new FirebaseTrackingService();
