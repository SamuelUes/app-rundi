export type RecurringRideVehicleType = 'moto' | 'auto' | 'designated_driver';
export type RecurringRideDesignatedMode = 'auto' | 'moto';
export type RecurringRidePaymentMethod = 'cash' | 'card';

export interface RecurringRidePoint {
  lat: number;
  lng: number;
  address: string;
}

export interface RecurringRide {
  id: string;
  title: string;
  origin: RecurringRidePoint;
  destination: RecurringRidePoint;
  extraStops: RecurringRidePoint[];
  vehicleType: RecurringRideVehicleType;
  designatedDriverMode?: RecurringRideDesignatedMode;
  paymentMethod: RecurringRidePaymentMethod;
  passengers: number;
  comment?: string;
  priceSuggestion?: number | null;
  createdAt: number;
  updatedAt: number;
}

export type RecurringRideInput = Omit<RecurringRide, 'id' | 'createdAt' | 'updatedAt'>;
