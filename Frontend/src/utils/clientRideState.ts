import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearPreflightResult } from '../state/preflightStore';

const ACTIVE_RIDE_STORAGE_KEY = 'ACTIVE_RIDE_ID';

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
