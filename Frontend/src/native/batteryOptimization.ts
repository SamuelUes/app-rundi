import { NativeModules, Platform } from 'react-native';

const Module = NativeModules.BatteryOptimizationModule as
  | {
      isIgnoringOptimizations: () => Promise<boolean>;
      requestIgnoreOptimizations: () => Promise<boolean>;
    }
  | undefined;

const isAndroid = Platform.OS === 'android';

export const batteryOptimization = {
  async isIgnoring(): Promise<boolean> {
    if (!isAndroid || !Module) return true;
    try {
      return await Module.isIgnoringOptimizations();
    } catch (error) {
      console.warn('[batteryOptimization] Error checking status:', error);
      return true;
    }
  },

  async requestIgnore(): Promise<boolean> {
    if (!isAndroid || !Module) return true;
    try {
      return await Module.requestIgnoreOptimizations();
    } catch (error) {
      console.warn('[batteryOptimization] Error requesting ignore:', error);
      return false;
    }
  },
};

export default batteryOptimization;
