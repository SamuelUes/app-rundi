/**
 * Suppress React Native Firebase warnings that are not actionable.
 */
import { LogBox } from 'react-native';

LogBox.ignoreLogs([
  'Setting a timer for a long period',
  "AsyncStorage has been extracted from react-native core",
  "expo-app-loading is deprecated",
  "Firebase 'analytics' is not assigned",
  "Firebase 'auth' is not assigned",
  "Firebase 'database' is not assigned",
  "Firebase 'firestore' is not assigned",
  "Firebase 'messaging' is not assigned",
  'RCTBridge required dispatch_sync to load a module',
  'Require cycle:',
  'ViewPropTypes will be removed',
  'This method is deprecated (as well as all React Native Firebase namespaced API)',
]);
