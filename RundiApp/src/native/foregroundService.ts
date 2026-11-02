import { NativeModules, Platform } from 'react-native';

const Module = NativeModules.ForegroundServiceModule as
  | {
      start: (title: string | null, body: string | null) => Promise<boolean>;
      stop: () => Promise<boolean>;
    }
  | undefined;

const isAndroid = Platform.OS === 'android';

export const foregroundService = {
  async start(options?: { title?: string; body?: string }) {
    if (!isAndroid || !Module) return;
    const title = options?.title ?? null;
    const body = options?.body ?? null;
    try {
      await Module.start(title, body);
    } catch (error) {
      console.warn('[foregroundService] Error starting service:', error);
    }
  },

  async stop() {
    if (!isAndroid || !Module) return;
    try {
      await Module.stop();
    } catch (error) {
      console.warn('[foregroundService] Error stopping service:', error);
    }
  },
};

export default foregroundService;
