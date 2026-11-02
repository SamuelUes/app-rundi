import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearPreflightResult } from '../../stores/preflightStore';

const ACTIVE_RIDE_STORAGE_KEY = 'ACTIVE_RIDE_ID';

// Ids cancelados localmente esta sesión — la proyección a trips_live tarda
// ~15-20s; mientras tanto el doc sigue 'requested' y la UI lo oculta igual.
const locallyCanceledRideIds = new Set<string>();

export function markRideCanceledLocally(rideId: string) {
  locallyCanceledRideIds.add(rideId);
}

export function isRideCanceledLocally(rideId: string): boolean {
  return locallyCanceledRideIds.has(rideId);
}

export async function clearClientActiveRideState() {
  try {
    await AsyncStorage.removeItem(ACTIVE_RIDE_STORAGE_KEY);
  } catch (error) {
    console.warn('⚠️ [clientRideState] Error removing ACTIVE_RIDE_ID from storage:', error);
  }

  try {
    clearPreflightResult();
  } catch (error) {
    console.warn('⚠️ [clientRideState] Error clearing preflight result:', error);
  }
}
