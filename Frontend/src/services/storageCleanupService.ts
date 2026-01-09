import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const STORAGE_VERSION_KEY = '@rundi_storage_version';
const CURRENT_STORAGE_VERSION = '1';

// Claves antiguas específicas que pueden limpiarse sin afectar la sesión activa
const LEGACY_KEYS_TO_REMOVE = ['@rundi_registration_draft', '@rundi_onboarding_state'];

export async function ensureFreshInstallCleanup(): Promise<void> {
  try {
    const version = await AsyncStorage.getItem(STORAGE_VERSION_KEY);
    if (version === CURRENT_STORAGE_VERSION) {
      return;
    }

    if (LEGACY_KEYS_TO_REMOVE.length) {
      try {
        await AsyncStorage.multiRemove(LEGACY_KEYS_TO_REMOVE);
      } catch (clearError) {
        console.warn('⚠️ [StorageCleanup] Error removing legacy keys:', clearError);
      }
    }

    try {
      await SecureStore.deleteItemAsync('registration_temp');
    } catch (secureError) {
      console.warn('⚠️ [StorageCleanup] Error clearing SecureStore registration_temp:', secureError);
    }

    try {
      await AsyncStorage.setItem(STORAGE_VERSION_KEY, CURRENT_STORAGE_VERSION);
    } catch (setError) {
      console.warn('⚠️ [StorageCleanup] Error writing storage version:', setError);
    }
  } catch (err) {
    console.warn('⚠️ [StorageCleanup] ensureFreshInstallCleanup failed:', err);
  }
}

export default {
  ensureFreshInstallCleanup,
};
