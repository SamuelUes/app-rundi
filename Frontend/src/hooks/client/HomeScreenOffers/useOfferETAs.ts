import { useMemo } from 'react';
import { haversineKm } from '../../../utils/distance';
import type { OfferItem } from './useRideOffers';

interface LatLng {
  latitude: number;
  longitude: number;
}

export interface OfferETA {
  etaMins: number;
  arrivalLabel: string;
}

export function useOfferETAs(
  offers: OfferItem[],
  getDriverCoordinate: (driverId: string, axis: 'lat' | 'lng') => number | null,
  originCoords: LatLng | null,
) {
  return useMemo(() => {
    const map: Record<string, OfferETA> = {};
    const origin = originCoords;
    if (!origin) return map;

    (offers || []).forEach((offer) => {
      const lat = getDriverCoordinate(offer.driverId, 'lat');
      const lng = getDriverCoordinate(offer.driverId, 'lng');
      if (lat === null || lng === null) return;

      const distKm = haversineKm(origin.latitude, origin.longitude, lat, lng);
      const avgSpeedKmH = 24;
      const mins = Math.max(1, Math.round((distKm / avgSpeedKmH) * 60));
      const arrival = new Date(Date.now() + mins * 60000);
      const hours = arrival.getHours();
      const minutes = arrival.getMinutes();
      const h12 = ((hours + 11) % 12) + 1;
      const ampm = hours >= 12 ? 'pm' : 'am';
      const arrivalLabel = `${h12}:${minutes.toString().padStart(2, '0')}${ampm}`;
      map[offer.driverId] = { etaMins: mins, arrivalLabel };
    });

    return map;
  }, [offers, getDriverCoordinate, originCoords]);
}
