import { getAuth } from 'firebase/auth';
import { collection, doc, getDocs, query, where, type DocumentData } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../config/firebase';
import analyticsService, { AnalyticsEvents } from '../analytics/analyticsService';
import ratingService from './ratingService';
import { calculateRidePrice as calculateRidePriceCentralized } from '../../utils/ride/priceCalculatorCentralize';
import {
  acceptRide as v2AcceptRide,
  cancelRide as v2CancelRide,
  completeRide as v2CompleteRide,
  confirmDriver as v2ConfirmDriver,
  getMyRides as v2GetMyRides,
  getRideDetail as v2GetRideDetail,
  rejectRide as v2RejectRide,
  requestRide as v2RequestRide,
  transitionRide as v2TransitionRide,
  type RideSummary,
} from '../../api/rides';
import {
  assignProgrammedDriver,
  cancelProgrammedRide as v2CancelProgrammedRide,
  claimProgrammedRide,
  confirmProgrammedRide,
  createProgrammedRide as v2CreateProgrammedRide,
} from '../../api/programmed';
import { createRideShareToken as v2CreateRideShareToken } from '../../api/platform';
import { FS_COL } from '../../constants/firestore';
import { getCurrentServiceAreaId } from '../../utils/geo/serviceArea';
import { markRideCanceledLocally } from '../../utils/ride/clientRideState';
import type { RequestRideRequest } from '../../types/rideApi';
import i18n from '../../i18n';

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
  serviceId?: string; // ID of the canonical Service; night is legacy-only
  selectedFeatureCodes?: string[];
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
  serviceId?: string | null;
  serviceCode?: string | null;
  featureCodes?: string[];
  pricingSnapshot?: Record<string, unknown> | null;
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
    serviceId: raw?.serviceId ?? raw?.service_id ?? null,
    serviceCode: raw?.serviceCode ?? raw?.service_code ?? raw?.pricingSnapshot?.serviceCode ?? null,
    featureCodes: Array.isArray(raw?.featureCodes ?? raw?.feature_codes)
      ? (raw?.featureCodes ?? raw?.feature_codes).filter((code: unknown): code is string => typeof code === 'string')
      : Array.isArray(raw?.pricingSnapshot?.featureCodes)
        ? raw.pricingSnapshot.featureCodes.filter((code: unknown): code is string => typeof code === 'string')
        : [],
    pricingSnapshot: raw?.pricingSnapshot ?? raw?.pricing_snapshot ?? null,
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

  private currentUid(): string {
    const uid = getAuth().currentUser?.uid;
    if (!uid) throw new Error(this.tr('errors.notAuthenticated'));
    return uid;
  }

  async requestRide(data: RequestRideData): Promise<Ride> {
    try {
      if (!data.clientId) {
        throw new Error(this.tr('errors.clientIdRequired'));
      }
      if (!data.origin || !data.destination) {
        throw new Error(this.tr('errors.locationsRequired'));
      }
      if (!data.estimatedPrice || data.estimatedPrice <= 0) {
        throw new Error(this.tr('errors.estimatedPricePositive'));
      }

      // trips_live doc id generado client-side (el consumer lo usa como id del doc vivo).
      const db = await getFirebaseFirestore();
      const firebaseRideId = doc(collection(db, FS_COL.tripsLive)).id;

      const body = {
        rideType: data.rideType ?? 'normal',
        vehicleType: data.vehicleType ?? 'auto',
        estimatedDistance: data.estimatedDistance,
        estimatedDuration: data.estimatedDuration,
        estimatedPrice: data.estimatedPrice,
        clientSuggestedPrice: data.clientSuggestedPrice,
        passengers: data.passengers,
        notes: data.notes ?? data.clientComment,
        paymentType: data.paymentMethod === 'card' ? 'card_local' : 'cash',
        serviceId: data.serviceId,
        clientVehiclePhoto: data.clientVehiclePhoto,
        firebaseRideId,
        originLat: data.origin.lat,
        originLng: data.origin.lng,
        serviceAreaId: getCurrentServiceAreaId(),
        serviceCode: data.serviceId,
        // contexto extra (el backend lo ignora hasta extender el payload/outbox)
        origin: data.origin,
        destination: data.destination,
        extraDestinations: data.extraDestinations,
        selectedFeatureCodes: data.selectedFeatureCodes,
        designatedDriverVehicle: data.designatedDriverVehicle,
      } as unknown as RequestRideRequest;

      const { ride } = await v2RequestRide(body);

      await analyticsService.logRideEvent(AnalyticsEvents.RIDE_REQUESTED, ride.id, {
        estimatedPrice: data.estimatedPrice,
        rideType: data.rideType || 'normal',
        vehicleType: data.vehicleType || 'auto',
      });

      return this.normalizeRidePreservingRaw({ ...ride, firebaseRideId: ride.firebaseRideId ?? firebaseRideId });
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

    const { id } = await v2CreateProgrammedRide({
      scheduledAt: data.scheduledAt,
      origin: data.origin,
      destination: data.destination,
      extraDestinations: data.extraDestinations,
      estimatedPrice: data.estimatedPrice,
      clientSuggestedPrice: data.clientSuggestedPrice,
      rideType: data.rideType ?? 'normal',
      vehicleType: data.vehicleType ?? 'auto',
      passengers: data.passengers,
      paymentMethod: data.paymentMethod ?? 'cash',
      serviceId: data.serviceId,
      serviceAreaId: getCurrentServiceAreaId(),
      notes: data.notes,
      clientVehiclePhoto: data.clientVehiclePhoto,
      designatedDriverVehicle: data.designatedDriverVehicle,
      selectedFeatureCodes: data.selectedFeatureCodes,
    });

    await analyticsService.logRideEvent(AnalyticsEvents.RIDE_REQUESTED, id, {
      isProgrammed: true,
      scheduledAt: data.scheduledAt,
      estimatedPrice: data.estimatedPrice,
      rideType: data.rideType || 'normal',
      vehicleType: data.vehicleType || 'auto',
    });

    return { id, status: 'scheduled', scheduledAt: data.scheduledAt, claimCode: null };
  }

  async assignDriverToProgrammedRide(rideId: string): Promise<{ success: boolean; ride?: any; message?: string }> {
    await assignProgrammedDriver(rideId, this.currentUid());
    return { success: true };
  }

  async claimProgrammedRideByCode(code: string): Promise<{ success: boolean; ride?: any; message?: string }> {
    // v2: el backend resuelve shareCode→docId server-side (las reglas no
    // permiten query por shareCode de docs ajenos desde el cliente).
    try {
      await claimProgrammedRide(code.trim().toUpperCase());
      return { success: true };
    } catch (error: any) {
      return { success: false, message: error?.message || this.tr('errors.programmedNotFound') };
    }
  }

  async confirmProgrammedRideClient(rideId: string): Promise<{ success: boolean; ride?: any; message?: string }> {
    await confirmProgrammedRide(rideId, 'client');
    return { success: true };
  }

  async confirmProgrammedRideDriver(rideId: string): Promise<{ success: boolean; ride?: any; message?: string }> {
    await confirmProgrammedRide(rideId, 'driver');
    return { success: true };
  }

  async cancelProgrammedRide(rideId: string, reason?: string): Promise<{ success: boolean; ride?: any; message?: string }> {
    await v2CancelProgrammedRide(rideId, reason);
    return { success: true };
  }

  async getMyRides(
    userId: string,
    userType: 'client' | 'driver' = 'client',
    options?: { pageSize?: number },
  ): Promise<Ride[]> {
    try {
      const limit = Math.min(Math.max(options?.pageSize ?? 100, 1), 100); // backend cap: 100
      const rides = await v2GetMyRides({ role: userType, limit });
      return this.normalizeRideListPreservingRaw(rides);
    } catch (error: any) {
      console.error('❌ Error getting my rides:', error.message);
      return [];
    }
  }

  async getDriverRides(_driverId: string): Promise<Ride[]> {
    return this.getMyRides(_driverId, 'driver');
  }

  async getRideDetails(rideId: string): Promise<Ride> {
    const summary = await v2GetRideDetail(rideId);
    return this.normalizeRidePreservingRaw(summary);
  }

  async cancelRide(
    rideId: string,
    reason?: string,
    _options?: { canceledBy?: 'client' | 'driver' },
  ): Promise<{
    success: boolean;
    ride: Ride;
    canceledBy: string;
    progressPercentage: string;
    message: string;
  }> {
    const { ride } = await v2CancelRide(rideId, { reason });
    markRideCanceledLocally(rideId);
    await analyticsService.logRideEvent(AnalyticsEvents.RIDE_CANCELED, ride.id, {
      reason: reason || null,
    });
    return {
      success: true,
      ride: this.normalizeRidePreservingRaw(ride),
      canceledBy: 'actor',
      progressPercentage: '0',
      message: '',
    };
  }

  async findAvailableDrivers(_location: Location): Promise<Driver[]> {
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
    friendliness?: number,
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

  async getUserRating(userId: string): Promise<any> {
    return ratingService.getUserRating(userId);
  }

  async getRideRatings(rideId: string): Promise<any> {
    return ratingService.getRideRatings(rideId);
  }

  /** Viajes 'requested' del área → REALTIME_trips_live (matching client-side). */
  async getAvailableRides(
    lat?: number,
    lng?: number,
    radius?: number,
    selectedVehicleType?: string,
  ): Promise<any[]> {
    const db = await getFirebaseFirestore();
    const snap = await getDocs(
      query(
        collection(db, FS_COL.tripsLive),
        where('serviceAreaId', '==', getCurrentServiceAreaId()),
        where('status', '==', 'requested'),
      ),
    );
    let rides = snap.docs.map((d: DocumentData) => ({ id: d.id, ...(d.data() as any) }));
    const normalizedVehicleType = normalizeVehicleTypeForMatching(selectedVehicleType ?? null);
    if (normalizedVehicleType) {
      rides = rides.filter((r: any) => rideMatchesVehicleType(r, normalizedVehicleType));
    }
    if (lat != null && lng != null && radius) {
      const radiusKm = radius;
      rides = rides.filter((r: any) => {
        const oLat = r?.origin?.latitude ?? r?.origin?.lat ?? r?.originLat;
        const oLng = r?.origin?.longitude ?? r?.origin?.lng ?? r?.originLng;
        if (typeof oLat !== 'number' || typeof oLng !== 'number') return true;
        const dLat = (oLat - lat) * Math.PI / 180;
        const dLng = (oLng - lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(oLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        return 2 * 6371 * Math.asin(Math.sqrt(a)) <= radiusKm;
      });
    }
    return this.normalizeRideListPreservingRaw(rides);
  }

  async acceptRide(rideId: string, data: AcceptRideData): Promise<Ride> {
    const { ride } = await v2AcceptRide(rideId, {
      driverId: data.driverId || this.currentUid(),
      offeredPrice: data.offeredPrice ?? data.driverProposedPrice,
    });
    await analyticsService.logRideEvent(AnalyticsEvents.RIDE_ACCEPTED, ride.id, {
      driverId: data.driverId,
      vehicleId: data.vehicleId,
    });
    return this.normalizeRidePreservingRaw(ride);
  }

  async markDriverOnRoute(rideId: string): Promise<Ride> {
    const { ride } = await v2TransitionRide(rideId, { from: 'accepted', to: 'driver_on_route' });
    await analyticsService.logRideEvent(AnalyticsEvents.RIDE_DRIVER_ON_ROUTE, rideId);
    return this.normalizeRidePreservingRaw(ride);
  }

  async markDriverArrived(rideId: string): Promise<Ride> {
    const { ride } = await v2TransitionRide(rideId, { from: 'driver_on_route', to: 'driver_arrived' });
    await analyticsService.logRideEvent(AnalyticsEvents.RIDE_DRIVER_ON_ROUTE, rideId);
    return this.normalizeRidePreservingRaw(ride);
  }

  async confirmDriver(rideId: string, selectedDriverId: string): Promise<Ride> {
    const { ride } = await v2ConfirmDriver(rideId, selectedDriverId);
    await analyticsService.logRideEvent(AnalyticsEvents.CLIENT_CONFIRMED_DRIVER, ride.id, {
      driverId: selectedDriverId,
    });
    return this.normalizeRidePreservingRaw(ride);
  }

  async rejectRide(rideId: string, reason?: string): Promise<RejectRideResponse> {
    await v2RejectRide(rideId, reason);
    await analyticsService.logRideEvent(AnalyticsEvents.DRIVER_REJECTED_RIDE, rideId, { reason: reason || null });
    return { success: true, ride: { id: rideId } };
  }

  async rejectDriver(rideId: string, reason?: string): Promise<void> {
    await v2RejectRide(rideId, reason ?? 'driver_rejected');
  }

  async createRideShareToken(rideId: string): Promise<{ code: string }> {
    const { token } = await v2CreateRideShareToken(rideId);
    return { code: token };
  }

  async updateRideStatus(rideId: string, status: Ride['status'], additionalData?: any): Promise<any> {
    if (status === 'in_progress') {
      const { ride } = await v2TransitionRide(rideId, { from: 'driver_arrived', to: 'in_progress' });
      await analyticsService.logRideEvent(AnalyticsEvents.RIDE_STARTED, rideId);
      return this.normalizeRidePreservingRaw(ride);
    }
    if (status === 'completed' || status === 'pending_payment') {
      const { ride } = await v2CompleteRide(rideId, {
        finalFare: additionalData?.finalFare || 0,
        actualDistance: additionalData?.actualDistance || 0,
        actualDuration: additionalData?.actualDuration || 0,
        tip: additionalData?.tip,
      });
      await analyticsService.logRideEvent(AnalyticsEvents.RIDE_COMPLETED, rideId, {
        finalFare: additionalData?.finalFare || 0,
      });
      return { ride: this.normalizeRidePreservingRaw(ride), pgRideId: ride.id };
    }
    throw new Error(this.tr('errors.unsupportedStatus', { status }));
  }

  // Mantiene firma legacy; delega en el centralizador (que ya llama /pricing v2).
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
