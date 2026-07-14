import { Platform } from 'react-native';
import { requireNativeModule } from 'expo';

const Module = requireNativeModule<{
  scheduleLocationIntegrity: (intervalMinutes: number) => Promise<boolean>;
  cancelLocationIntegrity: () => Promise<boolean>;
}>('WorkManagerModule');

const isAndroid = Platform.OS === 'android';

export const workManager = {
  async schedule(intervalMinutes: number) {
    if (!isAndroid || !Module) return;
    try {
      await Module.scheduleLocationIntegrity(intervalMinutes);
    } catch (error) {
      console.warn('[workManager] Error scheduling job:', error);
    }
  },

  async cancel() {
    if (!isAndroid || !Module) return;
    try {
      await Module.cancelLocationIntegrity();
    } catch (error) {
      console.warn('[workManager] Error cancelling job:', error);
    }
  },
};

export default workManager;
