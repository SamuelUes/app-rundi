import client from '../api/client';
import { getFirebaseFunctions } from '../config/firebase';
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
  vehicleType?: 'moto' | 'auto' | 'designated_driver'; // Tipo de vehículo solicitado
  clientVehiclePhoto?: string; // Foto del vehículo del cliente (solo para conductor designado)
  passengers?: number; // Cantidad de pasajeros
  extraDestinations?: Array<{lat: number; lng: number; address: string}>; // Paradas adicionales
  clientSuggestedPrice?: number;
  notes?: string;
  paymentMethod?: 'cash' | 'stripe' | 'card'; // Método de pago seleccionado
}

export interface AcceptRideData {
  driverId: string;
  vehicleId: string;
  currentLocation: {
    lat: number;
    lng: number;
  };
  driverProposedPrice?: number;
  offeredPrice?: number;
  estimatedArrivalTime?: string;
}

export interface Ride {
  id: string;
  clientId: string;
  driverId?: string;
  client?: {
    id: string;
    name: string;
    email: string;
    phone: string;
  };
  driver?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    rating?: number;
    licenseNumber?: string;
    photo?: string;
  };
  vehicle?: {
    id: string;
    brand: string;
    model: string;
    color: string;
    plate: string;
    type: string;
    year?: number;
    registrationNumber?: string;
    insuranceCompany?: string;
  };
  payment?: {
    id?: string;
    amount?: number;
    tip?: number;
    total?: number;
    paymentMethod?: string;
    status: string;
    paidAt?: string;
    createdAt?: string;
    // Nuevos campos calculados
    estimatedPrice: number;
    commission: number;
    commissionRate: number;
    finalAmount: number;
  };
  origin: Location;
  originAddress: string;
  originLat: number;
  originLng: number;
  destination: Location;
  destinationAddress: string;
  destinationLat: number;
  destinationLng: number;
  status: 'requested' | 'accepted' | 'driver_arrived' | 'in_progress' | 'pending_payment' | 'completed' | 'canceled';
  estimatedDistance: number;
  estimatedDuration: number;
  estimatedPrice: number;
  clientSuggestedPrice?: number;
  driverOfferedPrice?: number;
  negotiationStatus?: 'pending' | 'accepted' | 'rejected' | null;
  finalPrice?: number;
  passengers?: number;
  rideType: string;
  vehicleType?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  requestedAt?: string;
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
  private functions: any = null;

  private async getFunctions() {
    if (!this.functions) {
      this.functions = await getFirebaseFunctions();
    }
    return this.functions;
  }

  async requestRide(data: RequestRideData): Promise<Ride> {
    const functions = await this.getFunctions();
    const requestRideFunction = httpsCallable(functions, 'requestRide');
    const response = await requestRideFunction(data);
    const result = response.data as { success: boolean; ride: any };
    return result.ride;
  }

  async getMyRides(userId: string): Promise<Ride[]> {
    try {
      const functions = await this.getFunctions();
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
      const functions = await this.getFunctions();
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
    const functions = await this.getFunctions();
    const getRideDetailsFunction = httpsCallable(functions, 'getRideDetails');
    const response = await getRideDetailsFunction({ rideId });
    const result = response.data as { success: boolean; ride: any };
    return result.ride;
  }

  async cancelRide(rideId: string, reason?: string): Promise<{ 
    success: boolean; 
    ride: Ride; 
    canceledBy: string;
    progressPercentage: string;
    message: string;
  }> {
    const functions = await this.getFunctions();
    const cancelRideFunction = httpsCallable(functions, 'cancelRide');
    const response = await cancelRideFunction({ rideId, reason });
    return response.data as any;
  }

  async findAvailableDrivers(location: Location): Promise<Driver[]> {
    // TODO: Implementar con Firebase Callable Function cuando esté disponible
    // Por ahora retorna array vacío
    return [];
  }

  async rateRide(
    rideId: string, 
    rating: number, 
    comment?: string,
    punctuality?: number,
    cleanliness?: number,
    communication?: number
  ): Promise<void> {
    const functions = await this.getFunctions();
    const submitRatingFunction = httpsCallable(functions, 'submitRating');
    
    await submitRatingFunction({
      rideId,
      rating,
      comment,
      punctuality,
      cleanliness,
      communication,
    });
  }

  async skipRating(rideId: string): Promise<void> {
    const functions = await this.getFunctions();
    const skipRatingFunction = httpsCallable(functions, 'skipRating');
    
    await skipRatingFunction({ rideId });
  }

  async getUserRating(userId: string): Promise<any> {
    const functions = await this.getFunctions();
    const getUserRatingFunction = httpsCallable(functions, 'getUserRating');
    
    const response = await getUserRatingFunction({ userId });
    return response.data;
  }

  async getRideRatings(rideId: string): Promise<any> {
    const functions = await this.getFunctions();
    const getRideRatingsFunction = httpsCallable(functions, 'getRideRatings');
    
    const response = await getRideRatingsFunction({ rideId });
    return response.data;
  }

  // Para conductores
  async getAvailableRides(lat?: number, lng?: number, radius?: number): Promise<any[]> {
    const functions = await this.getFunctions();
    const getAvailableRidesFunction = httpsCallable(functions, 'getAvailableRides');
    const response = await getAvailableRidesFunction({ 
      latitude: lat, 
      longitude: lng, 
      radius: radius || 1.5 // Radio por defecto: 1.5 km
    });
    const result = response.data as { success: boolean; rides: any[] };
    return result.rides;
  }

  async acceptRide(rideId: string, data: AcceptRideData): Promise<Ride> {
    const functions = await this.getFunctions();
    const acceptRideFunction = httpsCallable(functions, 'acceptRide');
    const response = await acceptRideFunction({ rideId, ...data });
    const result = response.data as { success: boolean; ride: any };
    return result.ride;
  }

  async confirmDriver(rideId: string, selectedDriverId: string): Promise<Ride> {
    const functions = await this.getFunctions();
    const confirmDriverFunction = httpsCallable(functions, 'confirmDriver');
    const response = await confirmDriverFunction({ 
      rideId,
      selectedDriverId 
    });
    const result = response.data as { success: boolean; ride: any };
    return result.ride;
  }

  async rejectDriver(rideId: string, reason?: string): Promise<void> {
    const functions = await this.getFunctions();
    const rejectDriverFunction = httpsCallable(functions, 'rejectDriver');
    await rejectDriverFunction({ rideId, reason });
  }

  async updateRideStatus(rideId: string, status: Ride['status'], additionalData?: any): Promise<Ride> {
    const functions = await this.getFunctions();
    
    if (status === 'in_progress') {
      const startRideFunction = httpsCallable(functions, 'startRide');
      const response = await startRideFunction({ rideId });
      return response.data as Ride;
    } else if (status === 'completed' || status === 'pending_payment') {
      // Ambos estados usan completeRide (el backend decide el estado final según el método de pago)
      const completeRideFunction = httpsCallable(functions, 'completeRide');
      const response = await completeRideFunction({ 
        rideId,
        finalFare: additionalData?.finalFare || 0,
        actualDistance: additionalData?.actualDistance || 0,
        actualDuration: additionalData?.actualDuration || 0,
      });
      return response.data as Ride;
    }
    
    throw new Error(`Estado no soportado: ${status}`);
  }

  /**
   * Calcular precio estimado del viaje
   * @param distanceInMeters - Distancia en metros
   * @param extraStops - Número de paradas adicionales
   * @param isDesignatedDriver - Si es servicio de conductor designado (multiplica por 1.5)
   * @returns Precio calculado por el backend
   */
  async calculatePrice(distanceInMeters: number, extraStops: number = 0, isDesignatedDriver: boolean = false): Promise<{
    price: number;
    basePrice: number;
    distanceKm: number;
    multiplier: number;
    breakdown: string;
    pricingInfo: any;
  }> {
    const functions = await this.getFunctions();
    const calculatePriceFunction = httpsCallable(functions, 'calculatePrice');
    const response = await calculatePriceFunction({ distanceInMeters, extraStops, isDesignatedDriver });
    const result = response.data as any;
    return {
      price: result.price,
      basePrice: result.basePrice,
      distanceKm: result.distanceKm,
      multiplier: result.multiplier,
      breakdown: result.breakdown,
      pricingInfo: result.pricingInfo,
    };
  }
}

export default new RidesService();
