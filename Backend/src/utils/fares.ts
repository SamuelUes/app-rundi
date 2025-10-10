import { distanceKm, LatLng } from './geocoding';

export async function estimateFare(origin: LatLng, destination: LatLng) {
  const km = await distanceKm(origin, destination);
  const base = 25; // MXN base fare
  const perKm = 6; // MXN per km
  const total = Math.max(base, base + perKm * km);
  return Math.round(total * 100) / 100;
}
