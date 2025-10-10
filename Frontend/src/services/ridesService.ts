import client from '../api/client';
import { functions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';

export interface Location {
  latitude: number;
  longitude: number;
  address?: string;
}

export interface RequestRideData {
  clientId: string;
  origin: {
    lat: number;
    lng: number;
    address: string;
  };
  destination: {
    lat: number;
    lng: number;
    address: string;
  };
  estimatedDistance: number; // metros
  estimatedDuration: number; // segundos
  estimatedPrice: number;
  rideType?: 'normal' | 'designated_driver';
  clientSuggestedPrice?: number;
  notes?: string;
}

export interface AcceptRideData {
  driverId: string;
  vehicleId: string;
  currentLocation: {
    lat: number;
    lng: number;
  };
  driverProposedPrice?: number;
  estimatedArrivalTime?: string;
}

export interface Ride {
  id: string;
  clientId: string;
  driverId?: string;
  driver?: Driver;
  origin: Location;
  destination: Location;
  status: 'requested' | 'accepted' | 'driver_arrived' | 'in_progress' | 'completed' | 'canceled';
  estimatedPrice: number;
  finalPrice?: number;
  distance: number;
  duration: number;
  notes?: string;
  createdAt: string;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  canceledAt?: string;
  cancelReason?: string;
}

export interface Driver {
  id: string;
  name: string;
  rating: number;
  vehicle: {
    type: string;
    brand: string;
    model: string;
    color: string;
    plate: string;
  };
  currentLocation: Location;
}

class RidesService {
  async requestRide(data: RequestRideData): Promise<Ride> {
    const requestRideFunction = httpsCallable(functions, 'requestRide');
    const response = await requestRideFunction(data);
    const result = response.data as { success: boolean; ride: any };
    return result.ride;
  }

  async getMyRides(userId: string): Promise<Ride[]> {
    try {
      const getMyRidesFunction = httpsCallable(functions, 'getMyRides');
      const response = await getMyRidesFunction({ userId, limit: 50, offset: 0 });
      const result = response.data as { success: boolean; rides: any[] };
      return result.success ? result.rides : [];
    } catch (error) {
      console.error('Error getting my rides:', error);
      return [];
    }
  }

  async getDriverRides(driverId: string): Promise<Ride[]> {
    try {
      const getMyRidesFunction = httpsCallable(functions, 'getMyRides');
      const response = await getMyRidesFunction({ userId: driverId, limit: 50, offset: 0 });
      const result = response.data as { success: boolean; rides: any[] };
      return result.success ? result.rides : [];
    } catch (error) {
      console.error('Error getting driver rides:', error);
      return [];
    }
  }

  async getRideDetails(rideId: string): Promise<Ride> {
    const getRideDetailsFunction = httpsCallable(functions, 'getRideDetails');
    const response = await getRideDetailsFunction({ rideId });
    const result = response.data as { success: boolean; ride: any };
    return result.ride;
  }

  async cancelRide(rideId: string, reason?: string): Promise<Ride> {
    const cancelRideFunction = httpsCallable(functions, 'cancelRide');
    const response = await cancelRideFunction({ rideId, reason });
    return response.data as Ride;
  }

  async findAvailableDrivers(location: Location): Promise<Driver[]> {
    // TODO: Implementar con Firebase Callable Function cuando esté disponible
    // Por ahora retorna array vacío
    return [];
  }

  async rateRide(rideId: string, rating: number, comment?: string): Promise<void> {
    // TODO: Implementar con Firebase Callable Function cuando esté disponible
    console.log('Rating ride:', rideId, rating, comment);
  }

  // Para conductores
  async getAvailableRides(lat?: number, lng?: number, radius?: number): Promise<any[]> {
    const getAvailableRidesFunction = httpsCallable(functions, 'getAvailableRides');
    const response = await getAvailableRidesFunction({ lat, lng, radius });
    const result = response.data as { success: boolean; rides: any[] };
    return result.rides;
  }

  async acceptRide(rideId: string, data: AcceptRideData): Promise<Ride> {
    const acceptRideFunction = httpsCallable(functions, 'acceptRide');
    const response = await acceptRideFunction({ rideId, ...data });
    const result = response.data as { success: boolean; ride: any };
    return result.ride;
  }

  async updateRideStatus(rideId: string, status: Ride['status']): Promise<Ride> {
    const startRideFunction = httpsCallable(functions, status === 'in_progress' ? 'startRide' : 'completeRide');
    const response = await startRideFunction({ rideId });
    return response.data as Ride;
  }
}

export default new RidesService();
