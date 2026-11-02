/// <reference types="react-native-dotenv" />

declare module '@env' {
  // API v2 (backend Go / Cloud Run)
  export const API_BASE_URL_V2: string;
  export const API_BASE_URL_V2_PRODUCTION: string;
  export const API_BASE_URL_LOCAL: string;
  export const DOMAIN: string;

  // Google Maps
  export const GOOGLE_MAPS_API_KEY: string;

  // Google OAuth
  export const GOOGLE_CLIENT_ID: string;
  export const EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: string;
  export const EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: string;
  export const EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: string;
  export const EXPO_PUBLIC_GOOGLE_CLIENT_ID: string;
  export const REACT_APP_GOOGLE_CLIENT_ID: string;
  export const REACT_APP_GOOGLE_CLIENT_ID_ANDROID: string;
  export const REACT_APP_GOOGLE_CLIENT_ID_ANDROID_AUTO_GOOGLE: string;
  export const REACT_APP_GOOGLE_CLIENT_ID_IOS: string;
  export const REACT_APP_GOOGLE_CLIENT_ID_IOS_AUTO_GOOGLE: string;
  export const REACT_APP_GOOGLE_CLIENT_AUTO_ID: string;
  export const REACT_APP_GOOGLE_WEB_CLIENT_ID: string;

  // Firebase (proyecto rundi-dev-2 — una sola Firestore DB, sin RTDB)
  export const FIREBASE_API_KEY: string;
  export const FIREBASE_AUTH_DOMAIN: string;
  export const FIREBASE_PROJECT_ID: string;
  export const FIREBASE_STORAGE_BUCKET: string;
  export const FIREBASE_MESSAGING_SENDER_ID: string;
  export const FIREBASE_APP_ID: string;
  export const FIREBASE_MEASUREMENT_ID: string;
  export const FIRESTORE_DATABASE_ID: string;
  export const FIREBASE_EMULATOR_HOST: string;
  export const USE_FIREBASE_EMULATORS: string;

  // React App aliases (compatibilidad web)
  export const REACT_APP_FIREBASE_API_KEY: string;
  export const REACT_APP_FIREBASE_AUTH_DOMAIN: string;
  export const REACT_APP_FIREBASE_PROJECT_ID: string;

  // Backend mode
  export const BACKEND_MODE: string;

  // Calls
  export const CALLS_REQUEST_BASE_URL: string;
  export const CALLS_REQUEST_PATH: string;

  // Notifications / Expo
  export const EXPO_PUBLIC_NOTIFICATIONS_PROJECT_ID: string;
  export const EXPO_NOTIFICATIONS_PROJECT_ID: string;
  export const EXPO_PROJECT_ID: string;
  export const EAS_PROJECT_ID: string;

  // Misc
  export const SENTRY_DSN: string;
  export const APP_ENV: string;
  export const NODE_ENV: string;
}
