/// <reference types="react-native-dotenv" />

declare module '@env' {
  export const API_BASE_URL: string;
  export const GOOGLE_MAPS_API_KEY: string;
  export const TOMTOM_API_KEY: string;
  export const STRIPE_PUBLIC_KEY: string;
  // Add other environment variables here as needed
}
