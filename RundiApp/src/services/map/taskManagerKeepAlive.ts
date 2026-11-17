import { AppRegistry, Platform } from 'react-native';

// Expo SDK 57 registers an immediately resolved headless task. React Native
// then pauses timers while Expo's location task is still awaiting Firestore.
let running = 0;
let completedBeforeStart = false;
let resolveHeadless: (() => void) | null = null;

export function registerTaskManagerKeepAlive(): void {
  if (Platform.OS !== 'android') return;
  AppRegistry.registerHeadlessTask('expo-task-manager', () => () => new Promise<void>((resolve) => {
    if (completedBeforeStart && running === 0) {
      completedBeforeStart = false;
      resolve();
      return;
    }
    resolveHeadless = resolve;
  }));
}

export function beginTaskManagerWork(): void {
  running += 1;
}

export function endTaskManagerWork(): void {
  running -= 1;
  if (running !== 0) return;
  if (resolveHeadless) {
    const resolve = resolveHeadless;
    resolveHeadless = null;
    resolve();
  } else {
    completedBeforeStart = true;
  }
}
