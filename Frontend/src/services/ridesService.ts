import { getFirebaseFunctions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import sessionService from './sessionService';
import analyticsService, { AnalyticsEvents } from './analyticsService';
import i18n from '../i18n';

export interface Location {
  latitude: number;
  longitude: number;
  address?: string;
}

export interface RejectRideResponse {
  success: boolean;
  message?: string;
  ride?: { id: string };
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
  paymentMethod?: 'cash' | 'card'; // Método de pago: cash (efectivo) o card (bancos nacionales)
  serviceId?: string; // ✅ NUEVO: ID del servicio (normal, motorcycle, night, designated_driver)
  designatedDriverVehicle?: 'auto' | 'moto';
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

export interface RideVehicle {
  id?: string;
  brand?: string;
  model?: string;
  color?: string;
  plate?: string;
  type?: string;
  year?: number;
  isActive?: boolean;
  registrationNumber?: string;
  insuranceCompany?: string;
}

export interface RidePayment {
  id?: string;
  amount: number;
  tip?: number;
  commission?: number;
  status?: string;
  paymentMethod?: string;
  paidAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RideParticipant {
  id?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  photo?: string | null;
  rating?: number | null;
  totalRides?: number | null;
  department?: string | null;
  municipality?: string | null;
  licenseNumber?: string | null;
  vehicles?: RideVehicle[];
}

export interface RideLocation {
  id?: string;
  latitude: number;
  longitude: number;
  address?: string;
  type?: string;
  order?: number;
}

export interface Ride {
  id: string;
  status: string;
  isProgrammed?: boolean;
  scheduledAt?: number;
  clientConfirmedAt?: number;
  driverConfirmedAt?: number;
  clientId?: string;
  driverId?: string;
  client?: RideParticipant;
  driver?: RideParticipant;
  vehicle?: RideVehicle;
  origin?: Location;
  destination?: Location;
  originAddress?: string;
  destinationAddress?: string;
  allAddresses: string[];
  hasMultipleStops?: boolean;
  waypointsCount?: number;
  passengers?: number;
  rideType?: string;
  vehicleType?: string;
  designatedDriverVehicle?: 'auto' | 'moto';
  paymentType?: string;
  estimatedPrice?: number;
  estimatedFare?: number;
  finalFare?: number;
  commission?: number;
  tip?: number;
  distance?: number;
  estimatedDistance?: number;
  duration?: number;
  estimatedDuration?: number;
  notes?: string;
  cancelReason?: string;
  createdAt?: string;
  updatedAt?: string;
  requestedAt?: string;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  canceledAt?: string;
  timeline?: {
    requestedAt?: string;
    acceptedAt?: string;
    startedAt?: string;
    completedAt?: string;
    canceledAt?: string;
  };
  payments: RidePayment[];
  primaryPayment?: RidePayment;
  payment?: {
    id?: string;
    amount: number;
    tip?: number;
    total: number;
    paymentMethod?: string;
    status: string;
    paidAt?: string;
    createdAt?: string;
    estimatedPrice: number;
    commission: number;
    commissionRate: number;
    finalAmount: number;
  };
  locations: RideLocation[];
  originLat?: number;
  originLng?: number;
  destinationLat?: number;
  destinationLng?: number;
}

export type CreateProgrammedRideData = RequestRideData & {
  scheduledAt: number;
};

export type ProgrammedRideSummary = {
  id: string;
  status: string;
  scheduledAt: number;
};

const toISOString = (value: any): string | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }

  const date = typeof value === 'number' ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
};

const toNumber = (value: any, fallback = 0): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const normalizeVehicle = (vehicle: any): RideVehicle => ({
  id: vehicle?.id ?? undefined,
  brand: vehicle?.brand ?? undefined,
  model: vehicle?.model ?? undefined,
  color: vehicle?.color ?? undefined,
  plate: vehicle?.plate ?? undefined,
  type: vehicle?.type ?? undefined,
  year: vehicle?.year !== undefined ? Number(vehicle.year) : undefined,
  isActive: typeof vehicle?.isActive === 'boolean' ? vehicle.isActive : (vehicle?.is_active ?? undefined),
  registrationNumber: vehicle?.registrationNumber ?? vehicle?.registration_number ?? undefined,
  insuranceCompany: vehicle?.insuranceCompany ?? vehicle?.insurance_company ?? undefined,
});

const normalizePayment = (payment: any): RidePayment => ({
  id: payment?.id ?? undefined,
  amount: toNumber(payment?.amount ?? 0, 0),
  tip: payment?.tip !== undefined ? toNumber(payment.tip, 0) : undefined,
  commission: payment?.commission !== undefined && payment?.commission !== null ? toNumber(payment.commission, 0) : undefined,
  status: payment?.status ?? undefined,
  paymentMethod: payment?.paymentMethod ?? payment?.payment_method ?? undefined,
  paidAt: toISOString(payment?.paidAt ?? payment?.paid_at),
  createdAt: toISOString(payment?.createdAt ?? payment?.created_at),
  updatedAt: toISOString(payment?.updatedAt ?? payment?.updated_at),
});

const normalizeLocation = (location: any): RideLocation => ({
  id: location?.id ?? undefined,
  latitude: toNumber(location?.latitude ?? 0, 0),
  longitude: toNumber(location?.longitude ?? 0, 0),
  address: typeof location?.address === 'string' ? location.address : undefined,
  type: location?.type ?? location?.location_type ?? undefined,
  order: location?.order !== undefined ? Number(location.order) : (location?.location_order !== undefined ? Number(location.location_order) : undefined),
});

const normalizeParticipant = (participant: any): RideParticipant => {
  if (!participant) {
    return {};
  }

  return {
    id: participant.id ?? participant.uid ?? undefined,
    name: participant.name ?? participant.displayName ?? null,
    email: participant.email ?? null,
    phone: participant.phone ?? participant.phoneNumber ?? null,
    photo: participant.photo ?? participant.photoURL ?? participant.photoUrl ?? null,
    rating: participant.rating ?? participant.average_rating ?? null,
    totalRides: participant.totalRides ?? participant.total_rides ?? null,
    department: participant.department ?? null,
    municipality: participant.municipality ?? null,
    licenseNumber: participant.licenseNumber ?? participant.license_number ?? null,
    vehicles: Array.isArray(participant.vehicles) ? participant.vehicles.map(normalizeVehicle) : undefined,
  };
};

const normalizeRide = (raw: any): Ride => {
  const payments = Array.isArray(raw?.payments) ? raw.payments.map(normalizePayment) : [];
  const primaryPayment = raw?.primaryPayment ? normalizePayment(raw.primaryPayment) : payments[0];

  const locations = Array.isArray(raw?.locations) ? raw.locations.map(normalizeLocation) : [];
  const originLocation = locations.find((loc: RideLocation) => loc.type === 'origin') || locations[0];
  const destinationLocation = locations.find((loc: RideLocation) => loc.type === 'destination') || locations[locations.length - 1];

  const originAddress = typeof raw?.originAddress === 'string' && raw.originAddress.trim().length > 0
    ? raw.originAddress
    : originLocation?.address;

  const destinationAddress = typeof raw?.destinationAddress === 'string' && raw.destinationAddress.trim().length > 0
    ? raw.destinationAddress
    : destinationLocation?.address;

  const allAddresses = Array.isArray(raw?.allAddresses) && raw.allAddresses.length > 0
    ? raw.allAddresses
    : locations
        .map((loc: RideLocation) => loc.address)
        .filter((addr: string | undefined | null): addr is string => typeof addr === 'string' && addr.trim().length > 0);

  const distance = raw?.distance ?? raw?.actualDistance ?? raw?.actual_distance ?? undefined;
  const estimatedDistance = raw?.estimatedDistance ?? raw?.estimated_distance ?? undefined;
  const duration = raw?.duration ?? raw?.actualDuration ?? raw?.actual_duration ?? undefined;
  const estimatedDuration = raw?.estimatedDuration ?? raw?.estimated_duration ?? undefined;

  const commission = raw?.commission !== undefined && raw?.commission !== null
    ? toNumber(raw.commission, 0)
    : (primaryPayment?.commission ?? undefined);

  const timeline = raw?.timeline
    ? {
        requestedAt: toISOString(raw.timeline.requestedAt ?? raw.timeline.requested_at),
        acceptedAt: toISOString(raw.timeline.acceptedAt ?? raw.timeline.accepted_at),
        startedAt: toISOString(raw.timeline.startedAt ?? raw.timeline.started_at),
        completedAt: toISOString(raw.timeline.completedAt ?? raw.timeline.completed_at),
        canceledAt: toISOString(raw.timeline.canceledAt ?? raw.timeline.canceled_at),
      }
    : undefined;

  const ride: Ride = {
    id: String(raw?.id ?? ''),
    status: String(raw?.status ?? 'unknown'),
    clientId: raw?.clientId ?? raw?.client_id ?? undefined,
    driverId: raw?.driverId ?? raw?.driver_id ?? undefined,
    client: raw?.client ? normalizeParticipant(raw.client) : undefined,
    driver: raw?.driver ? normalizeParticipant(raw.driver) : undefined,
    vehicle: raw?.vehicle ? normalizeVehicle(raw.vehicle) : undefined,
    origin: originLocation
      ? {
          latitude: originLocation.latitude,
          longitude: originLocation.longitude,
          address: originLocation.address,
        }
      : undefined,
    destination: destinationLocation
      ? {
          latitude: destinationLocation.latitude,
          longitude: destinationLocation.longitude,
          address: destinationLocation.address,
        }
      : undefined,
    originAddress: originAddress,
    destinationAddress: destinationAddress,
    allAddresses,
    hasMultipleStops: Boolean(raw?.hasMultipleStops ?? raw?.has_multiple_stops ?? locations.some((loc: RideLocation) => loc.type === 'waypoint')),
    waypointsCount: raw?.waypointsCount ?? raw?.waypoints_count ?? undefined,
    passengers: raw?.passengers !== undefined ? Number(raw.passengers) : undefined,
    rideType: raw?.rideType ?? raw?.ride_type ?? undefined,
    vehicleType: raw?.vehicleType ?? raw?.vehicle_type ?? undefined,
    designatedDriverVehicle: raw?.designatedDriverVehicle ?? raw?.designated_driver_vehicle ?? undefined,
    paymentType: raw?.paymentType ?? raw?.payment_type ?? undefined,
    estimatedPrice: raw?.estimatedPrice !== undefined ? toNumber(raw.estimatedPrice, 0) : (raw?.estimated_price !== undefined ? toNumber(raw.estimated_price, 0) : undefined),
    estimatedFare: raw?.estimatedFare !== undefined ? toNumber(raw.estimatedFare, 0) : undefined,
    finalFare: raw?.finalFare !== undefined ? toNumber(raw.finalFare, 0) : (raw?.final_fare !== undefined ? toNumber(raw.final_fare, 0) : undefined),
    commission,
    tip: primaryPayment?.tip,
    distance: distance !== undefined ? toNumber(distance, 0) : undefined,
    estimatedDistance: estimatedDistance !== undefined ? toNumber(estimatedDistance, 0) : undefined,
    duration: duration !== undefined ? toNumber(duration, 0) : undefined,
    estimatedDuration: estimatedDuration !== undefined ? toNumber(estimatedDuration, 0) : undefined,
    notes: raw?.notes ?? undefined,
    cancelReason: raw?.cancelReason ?? undefined,
    createdAt: toISOString(raw?.createdAt ?? raw?.created_at),
    updatedAt: toISOString(raw?.updatedAt ?? raw?.updated_at),
    requestedAt: toISOString(raw?.requestedAt ?? raw?.requested_at),
    acceptedAt: toISOString(raw?.acceptedAt ?? raw?.accepted_at),
    startedAt: toISOString(raw?.startedAt ?? raw?.started_at),
    completedAt: toISOString(raw?.completedAt ?? raw?.completed_at),
    canceledAt: toISOString(raw?.canceledAt ?? raw?.canceled_at),
    timeline,
    payments,
    primaryPayment,
    locations,
    originLat: originLocation?.latitude,
    originLng: originLocation?.longitude,
    destinationLat: destinationLocation?.latitude,
    destinationLng: destinationLocation?.longitude,
  };

  if (!ride.vehicle && ride.driver?.vehicles && ride.driver.vehicles.length > 0) {
    ride.vehicle = ride.driver.vehicles[0];
  }

  return ride;
};

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
  private tr(path: string, options?: Record<string, any>) {
    return i18n.t(`services.ridesService.${path}`, options) as string;
  }

  private async getFunctions() {
    if (!this.functions) {
      this.functions = await getFirebaseFunctions();
    }
    return this.functions;
  }

  async requestRide(data: RequestRideData): Promise<Ride> {
    try {
      // Validar datos requeridos
      if (!data.clientId) {
        throw new Error(this.tr('errors.clientIdRequired'));
      }
      if (!data.origin || !data.destination) {
        throw new Error(this.tr('errors.locationsRequired'));
      }
      if (!data.estimatedPrice || data.estimatedPrice <= 0) {
        throw new Error(this.tr('errors.estimatedPricePositive'));
      }

      const functions = await this.getFunctions();
      const requestRideFunction = httpsCallable(functions, 'requestRide');
      
      // Limpiar datos: remover campos undefined
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([_, v]) => v !== undefined)
      );
      
      const deviceId = await sessionService.getDeviceId();
      const response = await requestRideFunction({ ...cleanData, deviceId });
      const result = response.data as { success: boolean; ride: any };
      
      if (!result.success || !result.ride) {
        throw new Error(this.tr('errors.invalidServerResponse'));
      }
      
      await analyticsService.logRideEvent(AnalyticsEvents.RIDE_REQUESTED, result.ride.id, {
        estimatedPrice: data.estimatedPrice,
        rideType: data.rideType || 'normal',
        vehicleType: data.vehicleType || 'auto',
      });

      return result.ride;
    } catch (error: any) {
      console.error('Error en requestRide:', error);
      throw error;
    }
  }

  async createProgrammedRide(data: CreateProgrammedRideData): Promise<ProgrammedRideSummary> {
    if (!data.clientId) {
      throw new Error(this.tr('errors.clientIdRequired'));
    }
    if (!data.origin || !data.destination) {
      throw new Error(this.tr('errors.locationsRequired'));
    }
    if (!data.estimatedPrice || data.estimatedPrice <= 0) {
      throw new Error(this.tr('errors.estimatedPricePositive'));
    }
    if (!data.scheduledAt || !Number.isFinite(data.scheduledAt) || data.scheduledAt <= 0) {
      throw new Error(this.tr('errors.scheduledAtRequired'));
    }

    const functions = await this.getFunctions();
    const createFn = httpsCallable(functions, 'createProgrammedRide');

    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    );

    const deviceId = await sessionService.getDeviceId();
    const response = await createFn({ ...cleanData, deviceId });
    const result = response.data as any;

    if (!result?.success || !result?.ride?.id) {
      throw new Error(this.tr('errors.invalidServerResponse'));
    }

    await analyticsService.logRideEvent(AnalyticsEvents.RIDE_REQUESTED, result.ride.id, {
      isProgrammed: true,
      scheduledAt: result.ride.scheduledAt,
      estimatedPrice: data.estimatedPrice,
      rideType: data.rideType || 'normal',
      vehicleType: data.vehicleType || 'auto',
    });

    return {
      id: result.ride.id,
      status: result.ride.status,
      scheduledAt: result.ride.scheduledAt,
    };
  }

  async assignDriverToProgrammedRide(rideId: string): Promise<{ success: boolean; ride?: any; message?: string }> {
    const functions = await this.getFunctions();
    const assignFn = httpsCallable(functions, 'assignDriverToProgrammedRide');
    const deviceId = await sessionService.getDeviceId();
    const response = await assignFn({ rideId, deviceId });
    return response.data as any;
  }

  async confirmProgrammedRideClient(rideId: string): Promise<{ success: boolean; ride?: any; message?: string }> {
    const functions = await this.getFunctions();
    const confirmFn = httpsCallable(functions, 'confirmProgrammedRideClient');
    const deviceId = await sessionService.getDeviceId();
    const response = await confirmFn({ rideId, deviceId });
    return response.data as any;
  }

  async confirmProgrammedRideDriver(rideId: string): Promise<{ success: boolean; ride?: any; message?: string }> {
    const functions = await this.getFunctions();
    const confirmFn = httpsCallable(functions, 'confirmProgrammedRideDriver');
    const deviceId = await sessionService.getDeviceId();
    const response = await confirmFn({ rideId, deviceId });
    return response.data as any;
  }

  async cancelProgrammedRide(rideId: string, reason?: string): Promise<{ success: boolean; ride?: any; message?: string }> {
    const functions = await this.getFunctions();
    const cancelFn = httpsCallable(functions, 'cancelProgrammedRide');
    const deviceId = await sessionService.getDeviceId();
    const response = await cancelFn({ rideId, reason, deviceId });
    return response.data as any;
  }

  async getMyRides(
    userId: string,
    userType: 'client' | 'driver' = 'client',
    options?: { pageSize?: number },
  ): Promise<Ride[]> {
    try {
      console.log(`📱 [ridesService] Obteniendo viajes para ${userType}: ${userId}`);
      const functions = await this.getFunctions();
      const getMyRidesFunction = httpsCallable(functions, 'getMyRides');

      const limit = Math.min(Math.max(options?.pageSize ?? 200, 1), 500);
      let offset = 0;
      let totalCount: number | null = null;
      const allRides: Ride[] = [];

      while (true) {
        const deviceId = await sessionService.getDeviceId();
        const response = await getMyRidesFunction({ userType, limit, offset, deviceId });
        const result = response.data as { success: boolean; rides: any[]; totalCount?: number };
        const batchRaw = result.success && Array.isArray(result.rides) ? result.rides : [];
        const batch = batchRaw.map(normalizeRide);
        allRides.push(...batch);

        if (typeof result.totalCount === 'number' && !Number.isNaN(result.totalCount)) {
          totalCount = result.totalCount;
        }

        console.log(
          `✅ [ridesService] Lote obtenido: ${batch.length} (acumulado: ${allRides.length}${
            totalCount !== null ? ` / ${totalCount}` : ''
          })`,
        );

        if (batch.length < limit) {
          break;
        }

        offset += limit;

        if (totalCount !== null && allRides.length >= totalCount) {
          break;
        }
      }

      if (totalCount !== null && allRides.length > totalCount) {
        return allRides.slice(0, totalCount);
      }

      return allRides;
    } catch (error: any) {
      console.error('❌ Error getting my rides:', error.message);
      return [];
    }
  }

  async getDriverRides(driverId: string): Promise<Ride[]> {
    return this.getMyRides(driverId, 'driver');
  }

  async getRideDetails(rideId: string): Promise<Ride> {
    const functions = await this.getFunctions();
    const getRideDetailsFunction = httpsCallable(functions, 'getRideDetails');
    const deviceId = await sessionService.getDeviceId();
    const response = await getRideDetailsFunction({ rideId, deviceId });
    const result = response.data as { success: boolean; ride: any };
    if (!result.success || !result.ride) {
      throw new Error(this.tr('errors.rideDetailsFailed'));
    }
    return normalizeRide(result.ride);
  }

  async cancelRide(
    rideId: string,
    reason?: string,
    options?: { canceledBy?: 'client' | 'driver' }
  ): Promise<{
    success: boolean;
    ride: Ride;
    canceledBy: string;
    progressPercentage: string;
    message: string;
  }> {
    const functions = await this.getFunctions();
    const cancelRideFunction = httpsCallable(functions, 'cancelRide');

    const payload: Record<string, any> = { rideId };
    if (reason) {
      payload.reason = reason;
    }
    if (options?.canceledBy) {
      payload.canceledBy = options.canceledBy;
    }

    const deviceId = await sessionService.getDeviceId();
    const response = await cancelRideFunction({ ...payload, deviceId });
    const data = response.data as any;

    if (data?.success && data.ride?.id) {
      await analyticsService.logRideEvent(AnalyticsEvents.RIDE_CANCELED, data.ride.id, {
        canceledBy: data.canceledBy,
        reason: reason || null,
      });
    }

    return data;
  }

  async findAvailableDrivers(location: Location): Promise<Driver[]> {
    // TODO: Implement using Firebase Callable Function when backend is ready
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
    const deviceId = await sessionService.getDeviceId();
    const response = await getAvailableRidesFunction({ 
      latitude: lat, 
      longitude: lng, 
      radius: radius || 1.5, // Radio por defecto: 1.5 km
      deviceId,
    });
    const result = response.data as { success: boolean; rides: any[] };
    return result.rides;
  }

  async acceptRide(rideId: string, data: AcceptRideData): Promise<Ride> {
    const functions = await this.getFunctions();
    const acceptRideFunction = httpsCallable(functions, 'acceptRide');
    const deviceId = await sessionService.getDeviceId();
    const response = await acceptRideFunction({ rideId, ...data, deviceId });
    const result = response.data as { success: boolean; ride: any };

    if (result.success && result.ride?.id) {
      await analyticsService.logRideEvent(AnalyticsEvents.RIDE_ACCEPTED, result.ride.id, {
        driverId: data.driverId,
        vehicleId: data.vehicleId,
      });
    }

    return result.ride;
  }

  async markDriverOnRoute(rideId: string): Promise<Ride> {
    const functions = await this.getFunctions();
    const markDriverOnRouteFn = httpsCallable(functions, 'markDriverOnRoute');
    const deviceId = await sessionService.getDeviceId();
    const response = await markDriverOnRouteFn({ rideId, deviceId });
    const result = response.data as { success: boolean; ride: any };
    if (!result.success || !result.ride) {
      throw new Error(this.tr('errors.driverOnRouteFailed'));
    }
    await analyticsService.logRideEvent(AnalyticsEvents.RIDE_DRIVER_ON_ROUTE, rideId);
    return result.ride;
  }

  async confirmDriver(rideId: string, selectedDriverId: string): Promise<Ride> {
    const functions = await this.getFunctions();
    const confirmDriverFunction = httpsCallable(functions, 'confirmDriver');
    const deviceId = await sessionService.getDeviceId();
    const response = await confirmDriverFunction({ 
      rideId,
      selectedDriverId,
      deviceId,
    });
    const result = response.data as { success: boolean; ride: any };

    if (result.success && result.ride?.id) {
      await analyticsService.logRideEvent(AnalyticsEvents.CLIENT_CONFIRMED_DRIVER, result.ride.id, {
        driverId: selectedDriverId,
      });
    }

    return result.ride;
  }

  /**
   * Registrar rechazo del conductor a una solicitud de viaje
   * Oculta el viaje hasta que el precio cambie para ese conductor
   */
  async rejectRide(rideId: string, reason?: string): Promise<RejectRideResponse> {
    const functions = await this.getFunctions();
    const rejectRideFunction = httpsCallable(functions, 'rejectRide');
    const response = await rejectRideFunction({ rideId, reason });
    const data = response.data as RejectRideResponse;

    if (data.success) {
      await analyticsService.logRideEvent(AnalyticsEvents.DRIVER_REJECTED_RIDE, rideId, { reason: reason || null });
    }

    return data;
  }

  async rejectDriver(rideId: string, reason?: string): Promise<void> {
    const functions = await this.getFunctions();
    const rejectDriverFunction = httpsCallable(functions, 'rejectDriver');
    await rejectDriverFunction({ rideId, reason });
  }

  async updateRideStatus(rideId: string, status: Ride['status'], additionalData?: any): Promise<any> {
    const functions = await this.getFunctions();
    
    if (status === 'in_progress') {
      const startRideFunction = httpsCallable(functions, 'startRide');
      const deviceId = await sessionService.getDeviceId();
      const response = await startRideFunction({ rideId, deviceId });
      const ride = response.data as Ride;
      await analyticsService.logRideEvent(AnalyticsEvents.RIDE_STARTED, rideId);
      return ride;
    } else if (status === 'completed' || status === 'pending_payment') {
      // Ambos estados usan completeRide (el backend decide el estado final según el método de pago)
      const completeRideFunction = httpsCallable(functions, 'completeRide');
      const deviceId = await sessionService.getDeviceId();
      const response = await completeRideFunction({ 
        rideId,
        finalFare: additionalData?.finalFare || 0,
        actualDistance: additionalData?.actualDistance || 0,
        actualDuration: additionalData?.actualDuration || 0,
        deviceId,
      });
      
      // ✅ NUEVO: Retornar pgRideId junto con el ride
      const data = response.data as any;
      const summary = {
        ...data,
        pgRideId: data.pgRideId,  // ← Extraer pgRideId
        ride: data.ride,
      };
      await analyticsService.logRideEvent(AnalyticsEvents.RIDE_COMPLETED, rideId, {
        finalFare: additionalData?.finalFare || 0,
        pgRideId: data.pgRideId,
      });
      return summary;
    }
    
    throw new Error(this.tr('errors.unsupportedStatus', { status }));
  }

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
    const deviceId = await sessionService.getDeviceId();
    const response = await calculatePriceFunction({ distanceInMeters, extraStops, isDesignatedDriver, deviceId });
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

const ridesServiceInstance = new RidesService();

export async function rejectRide(rideId: string, reason: string): Promise<RejectRideResponse> {
  return ridesServiceInstance.rejectRide(rideId, reason);
}

export default ridesServiceInstance;
