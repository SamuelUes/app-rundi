import { getFirebaseFunctions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import sessionService from './sessionService';
import analyticsService, { AnalyticsEvents } from './analyticsService';
import ratingService from './ratingService';
import { calculateRidePrice as calculateRidePriceCentralized } from '../utils/priceCalculatorCentralize';
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
  clientComment?: string;
  notes?: string;
  paymentMethod?: 'cash' | 'card'; // Método de pago: cash (efectivo) o card (bancos nacionales)
  serviceId?: string; // ✅ NUEVO: ID del servicio (normal, motorcycle, night, designated_driver)
  designatedDriverVehicle?: 'auto' | 'moto';
}

export interface AcceptRideData {
  driverId: string;
  vehicleId?: string; // el backend resuelve el vehículo actual del conductor si se omite
  currentLocation?: {
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
  claimCode?: string | null;
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

const VEHICLE_TYPE_KEYWORDS = {
  moto: ['moto', 'motorcycle', 'motorbike', 'bike', 'mototaxi', 'moto taxi'],
  auto: [
    'auto',
    'car',
    'sedan',
    'suv',
    'pickup',
    'truck',
    'van',
    'crossover',
    'jeep',
    'convertible',
    'camioneta',
    'coche',
    'carro',
    'automovil',
    'automóvil',
    'normal',
  ],
} as const;

export const normalizeVehicleTypeForMatching = (rawType?: string | null): 'moto' | 'auto' | null => {
  if (!rawType || typeof rawType !== 'string') {
    return null;
  }

  const value = rawType.trim().toLowerCase();
  if (!value) {
    return null;
  }

  if (VEHICLE_TYPE_KEYWORDS.moto.some((keyword) => value === keyword || value.includes(keyword))) {
    return 'moto';
  }

  if (VEHICLE_TYPE_KEYWORDS.auto.some((keyword) => value === keyword || value.includes(keyword))) {
    return 'auto';
  }

  if (value === 'motorcycle') {
    return 'moto';
  }

  return null;
};

export const extractRideVehicleTypeForMatching = (rideLike: any): 'moto' | 'auto' | null => {
  if (!rideLike || typeof rideLike !== 'object') {
    return null;
  }

  const rideType = String(rideLike.rideType ?? rideLike.ride_type ?? '').trim().toLowerCase();
  const candidates: Array<string | null | undefined> = [];

  if (rideType === 'designated_driver') {
    candidates.push(
      rideLike.designatedDriverVehicle,
      rideLike.designated_driver_vehicle,
      rideLike.vehicleType,
      rideLike.vehicle_type,
      rideLike.vehicle?.type,
      rideLike.serviceId,
      rideLike.service_id,
    );
  } else {
    candidates.push(
      rideLike.vehicleType,
      rideLike.vehicle_type,
      rideLike.vehicle?.type,
      rideLike.serviceId,
      rideLike.service_id,
      rideLike.requestedVehicleType,
      rideLike.requested_vehicle_type,
    );
  }

  for (const candidate of candidates) {
    const normalized = normalizeVehicleTypeForMatching(candidate ?? null);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

export const rideMatchesVehicleType = (rideLike: any, selectedDriverVehicleType?: string | null): boolean => {
  const normalizedDriverType = normalizeVehicleTypeForMatching(selectedDriverVehicleType ?? null);
  if (!normalizedDriverType) {
    return true;
  }

  const normalizedRideType = extractRideVehicleTypeForMatching(rideLike);
  if (!normalizedRideType) {
    return false;
  }

  return normalizedRideType === normalizedDriverType;
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

  private normalizeRidePreservingRaw(rawRide: any): Ride & Record<string, any> {
    const normalized = normalizeRide(rawRide);
    if (!rawRide || typeof rawRide !== 'object') {
      return normalized as Ride & Record<string, any>;
    }

    return {
      ...normalized,
      ...rawRide,
      id: normalized.id,
      status: normalized.status,
    } as Ride & Record<string, any>;
  }

  private normalizeRideListPreservingRaw(rawRides: any[]): Array<Ride & Record<string, any>> {
    if (!Array.isArray(rawRides)) return [];
    return rawRides.map((ride) => this.normalizeRidePreservingRaw(ride));
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

      return this.normalizeRidePreservingRaw(result.ride);
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
    const result = response.data as { success?: boolean; ride?: Record<string, any> };

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
      claimCode: result.ride.claimCode ?? null,
    };
  }

  async assignDriverToProgrammedRide(rideId: string): Promise<{ success: boolean; ride?: any; message?: string }> {
    const functions = await this.getFunctions();
    const assignFn = httpsCallable(functions, 'assignDriverToProgrammedRide');
    const deviceId = await sessionService.getDeviceId();
    const response = await assignFn({ rideId, deviceId });
    return response.data as { success: boolean; ride?: Record<string, unknown>; message?: string };
  }

  async claimProgrammedRideByCode(code: string): Promise<{ success: boolean; ride?: any; message?: string }> {
    const functions = await this.getFunctions();
    const claimFn = httpsCallable(functions, 'claimProgrammedRideByCode');
    const deviceId = await sessionService.getDeviceId();
    const response = await claimFn({ code: code.trim().toUpperCase(), deviceId });
    return response.data as { success: boolean; ride?: Record<string, unknown>; message?: string };
  }

  async confirmProgrammedRideClient(rideId: string): Promise<{ success: boolean; ride?: any; message?: string }> {
    const functions = await this.getFunctions();
    const confirmFn = httpsCallable(functions, 'confirmProgrammedRideClient');
    const deviceId = await sessionService.getDeviceId();
    const response = await confirmFn({ rideId, deviceId });
    return response.data as { success: boolean; ride?: Record<string, unknown>; message?: string };
  }

  async confirmProgrammedRideDriver(rideId: string): Promise<{ success: boolean; ride?: any; message?: string }> {
    const functions = await this.getFunctions();
    const confirmFn = httpsCallable(functions, 'confirmProgrammedRideDriver');
    const deviceId = await sessionService.getDeviceId();
    const response = await confirmFn({ rideId, deviceId });
    return response.data as { success: boolean; ride?: Record<string, unknown>; message?: string };
  }

  async cancelProgrammedRide(rideId: string, reason?: string): Promise<{ success: boolean; ride?: any; message?: string }> {
    const functions = await this.getFunctions();
    const cancelFn = httpsCallable(functions, 'cancelProgrammedRide');
    const deviceId = await sessionService.getDeviceId();
    const response = await cancelFn({ rideId, reason, deviceId });
    return response.data as { success: boolean; ride?: Record<string, unknown>; message?: string };
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
    const data = response.data as { success: boolean; ride?: Record<string, any>; canceledBy: string; progressPercentage: string; message: string };

    if (data?.success && data.ride?.id) {
      await analyticsService.logRideEvent(AnalyticsEvents.RIDE_CANCELED, data.ride.id, {
        canceledBy: data.canceledBy,
        reason: reason || null,
      });
    }

    if (data?.ride) {
      return {
        ...data,
        ride: this.normalizeRidePreservingRaw(data.ride),
      };
    }

    return { ...data, ride: data.ride as Ride };
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
    communication?: number,
    driving?: number,
    safety?: number,
    friendliness?: number
  ): Promise<void> {
    await ratingService.submitRideRating({
      rideId,
      rating,
      comment,
      punctuality,
      cleanliness,
      communication,
      driving,
      safety,
      friendliness,
    });
  }

  async skipRating(rideId: string): Promise<void> {
    await ratingService.skipRideRating(rideId);
  }

  // ⚠️ Legacy method:
  // Backend callable `getUserRating` ya no está exportado en functions/src/index.ts.
  // Mantener por compatibilidad con código histórico (actualmente no usado en pantallas auditadas).
  async getUserRating(userId: string): Promise<any> {
    return ratingService.getUserRating(userId);
  }

  // ⚠️ Legacy method:
  // Backend callable `getRideRatings` ya no está exportado en functions/src/index.ts.
  // Mantener por compatibilidad con código histórico (actualmente no usado en pantallas auditadas).
  async getRideRatings(rideId: string): Promise<any> {
    return ratingService.getRideRatings(rideId);
  }

  // Para conductores
  async getAvailableRides(lat?: number, lng?: number, radius?: number, selectedVehicleType?: string): Promise<any[]> {
    const functions = await this.getFunctions();
    const getAvailableRidesFunction = httpsCallable(functions, 'getAvailableRides');
    const deviceId = await sessionService.getDeviceId();
    const normalizedVehicleType = normalizeVehicleTypeForMatching(selectedVehicleType ?? null);
    const response = await getAvailableRidesFunction({ 
      latitude: lat, 
      longitude: lng, 
      radius: radius || 1.5, // Radio por defecto: 1.5 km
      vehicleType: normalizedVehicleType || undefined,
      deviceId,
    });
    const result = response.data as { success: boolean; rides: any[] };
    return this.normalizeRideListPreservingRaw(result?.rides || []);
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

    return this.normalizeRidePreservingRaw(result.ride);
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
    return this.normalizeRidePreservingRaw(result.ride);
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

    return this.normalizeRidePreservingRaw(result.ride);
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

  /**
   * Genera un código corto de compartición para el tracking público del viaje.
   * El código resuelve el rideId en el servidor — el identificador real no se
   * expone en el enlace compartido y el código expira solo.
   */
  async createRideShareToken(rideId: string): Promise<{ code: string }> {
    const functions = await this.getFunctions();
    const createToken = httpsCallable(functions, 'createRideShareToken');
    const response = await createToken({ rideId });
    const data = response.data as { code?: string };
    if (!data?.code) {
      throw new Error('No se pudo generar el código de compartición');
    }
    return { code: data.code };
  }

  async updateRideStatus(rideId: string, status: Ride['status'], additionalData?: any): Promise<any> {
    const functions = await this.getFunctions();
    
    if (status === 'in_progress') {
      const startRideFunction = httpsCallable(functions, 'startRide');
      const deviceId = await sessionService.getDeviceId();
      const response = await startRideFunction({
        rideId,
        deviceId,
        ...(additionalData?.vehicleInspection ? { vehicleInspection: additionalData.vehicleInspection } : {}),
      });
      const startResult = response.data as { success?: boolean; ride?: any };
      const ride = this.normalizeRidePreservingRaw(startResult?.ride || { id: rideId, status: 'in_progress' });
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
      const data = response.data as Record<string, unknown>;
      const summary = {
        ...data,
        pgRideId: data.pgRideId,  // ← Extraer pgRideId
        ride: data?.ride ? this.normalizeRidePreservingRaw(data.ride) : data?.ride,
      };
      await analyticsService.logRideEvent(AnalyticsEvents.RIDE_COMPLETED, rideId, {
        finalFare: additionalData?.finalFare || 0,
        pgRideId: data.pgRideId,
      });
      return summary;
    }
    
    throw new Error(this.tr('errors.unsupportedStatus', { status }));
  }

  // Mantiene firma legacy, pero calcula usando el contrato HTTP vigente
  // (`calculateRidePriceHttp`) a través del centralizador de precios.
  async calculatePrice(distanceInMeters: number, extraStops: number = 0, isDesignatedDriver: boolean = false): Promise<{
    price: number;
    basePrice: number;
    distanceKm: number;
    multiplier: number;
    breakdown: string;
    pricingInfo: any;
  }> {
    const rideType = isDesignatedDriver ? 'designated_driver' : 'normal';
    const result = await calculateRidePriceCentralized(
      distanceInMeters,
      0,
      'car',
      rideType,
      undefined,
      undefined,
      { extraStops: Math.max(extraStops, 0) },
    );

    return {
      price: result.finalPrice,
      basePrice: result.basePrice,
      distanceKm: result.distanceKm,
      multiplier: result.multiplier,
      breakdown: result.breakdown ?? '',
      pricingInfo: {
        distancePrice: result.distancePrice,
        timePrice: result.timePrice,
        commission: result.commission,
        commissionRate: result.commissionRate,
        peakHourAdjustment: result.peakHourAdjustment,
        serviceCode: result.serviceCode,
        serviceId: result.serviceId,
        extraStopsCharge: result.extraStopsCharge,
      },
    };
  }
}

const ridesServiceInstance = new RidesService();

export async function rejectRide(rideId: string, reason: string): Promise<RejectRideResponse> {
  return ridesServiceInstance.rejectRide(rideId, reason);
}

export default ridesServiceInstance;
