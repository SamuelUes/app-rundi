/**
 * Barrel export de stores (Zustand).
 * Una sola fuente de estado para la app.
 */
export type { User } from './authStore';
export { useAuthStore } from './authStore';
export { useLanguageStore } from './languageStore';
export {
  useThemeStore,
  useThemeColors,
  useIsDark,
  lightColors,
  darkColors,
} from './themeStore';
export {
  setPreflightResult,
  getPreflightResult,
  subscribePreflightResult,
  clearPreflightResult,
  type PreflightActionType,
  type PreflightAction,
  type PreflightSummary,
} from './preflightStore';
