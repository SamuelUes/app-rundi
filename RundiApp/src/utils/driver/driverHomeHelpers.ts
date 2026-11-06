import type { TFunction } from 'i18next';
import type { DriverStackParamList } from '../../navigation/DriverStack';
import type { DriverOfferCacheEntry } from '../../services/driver/driverOfferCacheService';
import { parseCoordinateValue as parseCoordinate } from '../geo/coordinates';
import { extractRequestedFeatureCodes } from '../ride/rideFeatureLabels';

export { parseCoordinate };

export const ACTIVE_RIDE_STATUSES = ['accepted', 'driver_on_route', 'driver_arrived', 'in_progress'];
export const MIN_RECHARGE_BALANCE_REQUIRED = 0;

export const isPendingDispatchOffer = (status: unknown, expiresAtMs: number | null, now: number): boolean =>
  status === 'pending' && (expiresAtMs === null || expiresAtMs > now);

export type RawRideStop = {
  lat?: number | string;
  lng?: number | string;
  latitude?: number | string;
  longitude?: number | string;
  address?: string;
};

export const parseBlockedFlag = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
};

export const getActiveRidePendingCopy = (ride: any, t: TFunction) => {
  const status: string = ride?.status || '';
  const clientName = ride?.client?.name || ride?.clientName || t('driver.home.ride.clientFallback');
  const destinationText =
    ride?.destinationAddress ||
    ride?.destination?.address ||
    t('driver.home.ride.destinationFallback');

  switch (status) {
    case 'driver_on_route':
      return {
        title: t('driver.home.activeRideStatus.driverOnRoute.title'),
        subtitle: t('driver.home.activeRideStatus.driverOnRoute.subtitle', { client: clientName }),
      };
    case 'driver_arrived':
      return {
        title: t('driver.home.activeRideStatus.driverArrived.title'),
        subtitle: t('driver.home.activeRideStatus.driverArrived.subtitle', { client: clientName }),
      };
    case 'in_progress':
      return {
        title: t('driver.home.activeRideStatus.inProgress.title'),
        subtitle: destinationText,
      };
    case 'accepted':
    default:
      return {
        title: t('driver.home.activeRideStatus.accepted.title'),
        subtitle: t('driver.home.activeRideStatus.accepted.subtitle', { client: clientName }),
      };
  }
};

export const getDriverOfferFromRide = (ridePayload: any, driverId: string) => {
  if (!ridePayload || !driverId) return null;
  const sources = [
    ridePayload?.offers,
    ridePayload?.driverOffers,
    ridePayload?.offersByDriver,
    ridePayload?.negotiation?.offers,
  ];

  for (const source of sources) {
    if (source && typeof source === 'object' && source[driverId]) {
      return source[driverId];
    }
  }

  return null;
};

export const hasDriverOfferInRide = (ridePayload: any, driverId: string) => {
  if (!ridePayload || !driverId) return false;
  const offer = getDriverOfferFromRide(ridePayload, driverId);
  if (!offer) return false;

  const status = String(offer?.status || offer?.state || '').toLowerCase();
  if (status && ['rejected', 'declined', 'cancelled', 'canceled', 'expired'].includes(status)) {
    return false;
  }

  return true;
};

export const normalizeRidePreviewPayload = (
  ridePayload: any,
  cacheEntry: DriverOfferCacheEntry,
  driverId: string,
): DriverStackParamList['RidePreview']['ride'] => {
  const fallbackOriginLat = cacheEntry.origin?.lat ?? 0;
  const fallbackOriginLng = cacheEntry.origin?.lng ?? 0;
  const fallbackDestinationLat = cacheEntry.destination?.lat ?? 0;
  const fallbackDestinationLng = cacheEntry.destination?.lng ?? 0;

  const originLat =
    parseCoordinate(
      ridePayload?.origin?.lat ??
        ridePayload?.originLatitude ??
        ridePayload?.origin?.latitude ??
        ridePayload?.pickup?.lat,
    ) ?? fallbackOriginLat;
  const originLng =
    parseCoordinate(
      ridePayload?.origin?.lng ??
        ridePayload?.originLongitude ??
        ridePayload?.origin?.longitude ??
        ridePayload?.pickup?.lng,
    ) ?? fallbackOriginLng;
  const destinationLat =
    parseCoordinate(
      ridePayload?.destination?.lat ??
        ridePayload?.destinationLatitude ??
        ridePayload?.destination?.latitude,
    ) ?? fallbackDestinationLat;
  const destinationLng =
    parseCoordinate(
      ridePayload?.destination?.lng ??
        ridePayload?.destinationLongitude ??
        ridePayload?.destination?.longitude,
    ) ?? fallbackDestinationLng;

  const extraStopsFromRide =
    Array.isArray(ridePayload?.extraDestinations) && ridePayload.extraDestinations.length > 0
      ? ridePayload.extraDestinations
      : Array.isArray(ridePayload?.extra_destinations)
        ? ridePayload.extra_destinations
        : null;

  const normalizedStops =
    extraStopsFromRide && extraStopsFromRide.length > 0
      ? extraStopsFromRide
          .map((stop: RawRideStop) => {
            const lat = parseCoordinate(stop?.lat ?? stop?.latitude);
            const lng = parseCoordinate(stop?.lng ?? stop?.longitude);
            if (lat === null || lng === null) {
              return null;
            }
            return {
              lat,
              lng,
              address: stop?.address,
            };
          })
          .filter(
            (
              stop: { lat: number; lng: number; address?: string } | null,
            ): stop is {
              lat: number;
              lng: number;
              address?: string;
            } => Boolean(stop),
          )
      : cacheEntry.extraDestinations;

  const driverOffer = getDriverOfferFromRide(ridePayload, driverId);

  const estimatedPrice =
    typeof ridePayload?.estimatedPrice === 'number' && Number.isFinite(ridePayload.estimatedPrice)
      ? ridePayload.estimatedPrice
      : typeof cacheEntry.estimatedPrice === 'number'
        ? cacheEntry.estimatedPrice
        : 0;

  return {
    id: ridePayload?.id || cacheEntry.rideId,
    clientId: ridePayload?.clientId || cacheEntry.clientId,
    clientName:
      ridePayload?.client?.name || ridePayload?.clientName || cacheEntry.clientName || undefined,
    clientPhone:
      ridePayload?.client?.phone ||
      ridePayload?.clientPhone ||
      ridePayload?.client?.phoneNumber ||
      undefined,
    origin: {
      lat: originLat,
      lng: originLng,
      address:
        ridePayload?.origin?.address ||
        ridePayload?.originAddress ||
        cacheEntry.origin?.address ||
        undefined,
    },
    destination: {
      lat: destinationLat,
      lng: destinationLng,
      address:
        ridePayload?.destination?.address ||
        ridePayload?.destinationAddress ||
        cacheEntry.destination?.address ||
        undefined,
    },
    extraDestinations: normalizedStops || undefined,
    estimatedPrice,
    featureCodes: extractRequestedFeatureCodes(ridePayload),
    estimatedDistance:
      typeof ridePayload?.estimatedDistance === 'number'
        ? ridePayload.estimatedDistance
        : cacheEntry.estimatedDistance ?? undefined,
    estimatedDuration:
      typeof ridePayload?.estimatedDuration === 'number'
        ? ridePayload.estimatedDuration
        : cacheEntry.estimatedDuration ?? undefined,
    clientSuggestedPrice:
      typeof ridePayload?.clientSuggestedPrice === 'number'
        ? ridePayload.clientSuggestedPrice
        : cacheEntry.clientSuggestedPrice ?? undefined,
    driverOfferedPrice:
      typeof ridePayload?.driverOfferedPrice === 'number'
        ? ridePayload.driverOfferedPrice
        : typeof cacheEntry.offeredPrice === 'number'
          ? cacheEntry.offeredPrice
          : typeof driverOffer?.offeredPrice === 'number'
            ? driverOffer.offeredPrice
            : null,
    paymentMethod:
      (ridePayload?.paymentMethod as 'cash' | 'card' | undefined) ??
      cacheEntry.paymentMethod ??
      undefined,
  };
};
