import AsyncStorage from '@react-native-async-storage/async-storage';

export interface DriverOfferCacheEntry {
  rideId: string;
  driverId: string;
  clientId: string;
  clientName?: string | null;
  origin: {
    lat: number;
    lng: number;
    address?: string;
  };
  destination: {
    lat: number;
    lng: number;
    address?: string;
  };
  extraDestinations?: Array<{ lat: number; lng: number; address?: string }>;
  offeredPrice?: number | null;
  clientSuggestedPrice?: number | null;
  estimatedPrice?: number | null;
  estimatedDistance?: number | null;
  estimatedDuration?: number | null;
  paymentMethod?: 'cash' | 'card' | null;
  clientVehiclePhoto?: string | null;
  rideType?: string | null;
  negotiationStatus?: string | null;
  createdAt: number;
}

const STORAGE_PREFIX = '@driver_offer_cache_v1';
export const DRIVER_OFFER_CACHE_EXPIRATION_MS = 30 * 60 * 1000; // 30 minutos

const buildKey = (driverId: string, rideId: string) => `${STORAGE_PREFIX}:${driverId}:${rideId}`;

const parseEntry = (raw: string | null): DriverOfferCacheEntry | null => {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as DriverOfferCacheEntry;
  } catch (error) {
    console.warn('[driverOfferCache] Failed to parse cache entry', error);
    return null;
  }
};

const driverOfferCacheService = {
  async save(entry: DriverOfferCacheEntry): Promise<void> {
    try {
      const payload = {
        ...entry,
        createdAt: entry.createdAt ?? Date.now(),
      };
      const key = buildKey(entry.driverId, entry.rideId);
      await AsyncStorage.setItem(key, JSON.stringify(payload));
      console.log('[driverOfferCache] Saved cache', key, payload);
    } catch (error) {
      console.warn('[driverOfferCache] Failed to save cache', error);
    }
  },

  async get(driverId: string, rideId: string): Promise<DriverOfferCacheEntry | null> {
    try {
      const key = buildKey(driverId, rideId);
      const raw = await AsyncStorage.getItem(key);
      const entry = parseEntry(raw);

      if (!entry) {
        return null;
      }

      if (Date.now() - entry.createdAt > DRIVER_OFFER_CACHE_EXPIRATION_MS) {
        await AsyncStorage.removeItem(key);
        return null;
      }

      return entry;
    } catch (error) {
      console.warn('[driverOfferCache] Failed to read cache', error);
      return null;
    }
  },

  async getAll(driverId: string): Promise<DriverOfferCacheEntry[]> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const driverPrefix = `${STORAGE_PREFIX}:${driverId}:`;
      const driverKeys = keys.filter((key) => key.startsWith(driverPrefix));

      if (driverKeys.length === 0) {
        return [];
      }

      const items = await AsyncStorage.multiGet(driverKeys);
      const now = Date.now();
      const validEntries: DriverOfferCacheEntry[] = [];
      const expiredKeys: string[] = [];

      items.forEach(([key, value]) => {
        const entry = parseEntry(value);
        if (!entry) {
          expiredKeys.push(key);
          return;
        }

        if (now - entry.createdAt > DRIVER_OFFER_CACHE_EXPIRATION_MS) {
          expiredKeys.push(key);
          return;
        }

        validEntries.push(entry);
      });

      if (expiredKeys.length > 0) {
        await AsyncStorage.multiRemove(expiredKeys);
      }

      return validEntries.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.warn('[driverOfferCache] Failed to read cache entries', error);
      return [];
    }
  },

  async clearEntry(driverId: string, rideId: string): Promise<void> {
    try {
      const key = buildKey(driverId, rideId);
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.warn('[driverOfferCache] Failed to clear entry', error);
    }
  },

  async clearAll(driverId: string): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const driverPrefix = `${STORAGE_PREFIX}:${driverId}:`;
      const driverKeys = keys.filter((key) => key.startsWith(driverPrefix));

      if (driverKeys.length === 0) return;
      await AsyncStorage.multiRemove(driverKeys);
    } catch (error) {
      console.warn('[driverOfferCache] Failed to clear cache', error);
    }
  },
};

export default driverOfferCacheService;
