import AsyncStorage from '@react-native-async-storage/async-storage';
import { isValidCoordLocal, type Coords } from '../geo/rideCoords';

export interface SavedLocation {
  label: string;
  coords: Coords;
}

export type RecentLocationKind = 'origin' | 'destination';

export interface RecentLocationsStore {
  origin: SavedLocation[];
  destination: SavedLocation[];
}

export const RECENT_LOCATIONS_LIMIT = 5;

const COORD_MATCH_EPSILON = 0.0001;

const storageKey = (userId: string) => `searchRideRecentLocations:${userId}`;

export function pushRecentLocation(
  list: SavedLocation[],
  entry: SavedLocation,
): SavedLocation[] {
  const filtered = list.filter(
    (loc) =>
      Math.abs(loc.coords.latitude - entry.coords.latitude) >= COORD_MATCH_EPSILON ||
      Math.abs(loc.coords.longitude - entry.coords.longitude) >= COORD_MATCH_EPSILON,
  );
  return [entry, ...filtered].slice(0, RECENT_LOCATIONS_LIMIT);
}

function sanitizeList(value: unknown): SavedLocation[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is SavedLocation =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as SavedLocation).label === 'string' &&
        isValidCoordLocal((item as SavedLocation).coords),
    )
    .slice(0, RECENT_LOCATIONS_LIMIT);
}

export async function loadRecentLocations(userId: string): Promise<RecentLocationsStore> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return { origin: [], destination: [] };
    const parsed = JSON.parse(raw);
    return {
      origin: sanitizeList(parsed?.origin),
      destination: sanitizeList(parsed?.destination),
    };
  } catch (error) {
    console.warn('[recentLocations] load failed', error);
    return { origin: [], destination: [] };
  }
}

export async function saveRecentLocations(userId: string, store: RecentLocationsStore) {
  try {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(store));
  } catch (error) {
    console.warn('[recentLocations] save failed', error);
  }
}
