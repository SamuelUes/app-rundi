/**
 * Hook de tema — fachada delgada sobre themeStore (Zustand).
 * Reemplazo directo del legacy `context/ThemeContext.tsx` (sin Provider, sin Context).
 *
 * Expone la misma API que `useTheme` anterior para que los consumidores no cambien.
 */
import { useColorScheme } from 'react-native';
import { useEffect } from 'react';
import {
  useThemeStore,
  useThemeColors,
  useIsDark,
  lightColors,
  darkColors,
} from '../../../stores/themeStore';

export type Theme = 'light' | 'dark' | 'auto';

export interface ThemeApi {
  theme: Theme;
  isDark: boolean;
  setTheme: (theme: Theme) => void;
  colors: typeof lightColors;
  mapTrafficEnabled: boolean;
  setMapTrafficEnabled: (value: boolean) => void;
}

/**
 * Inicializa el store de tema: carga preferencias guardadas y sincroniza
 * con el color scheme del sistema. Llamar una sola vez en la raíz de la app.
 */
export function useThemeInit() {
  const loadPreferences = useThemeStore((s) => s.loadPreferences);
  const setSystemTheme = useThemeStore((s) => s.setSystemTheme);
  const colorScheme = useColorScheme();

  useEffect(() => {
    loadPreferences();
  }, []);

  useEffect(() => {
    if (colorScheme === 'dark' || colorScheme === 'light') {
      setSystemTheme(colorScheme);
    }
  }, [colorScheme]);
}

export function useTheme(): ThemeApi {
  const theme = useThemeStore((s) => s.theme);
  const isDark = useIsDark();
  const colors = useThemeColors();
  const mapTrafficEnabled = useThemeStore((s) => s.mapTrafficEnabled);
  const setTheme = useThemeStore((s) => s.setTheme);
  const setMapTrafficEnabled = useThemeStore((s) => s.setMapTrafficEnabled);

  return { theme, isDark, setTheme, colors, mapTrafficEnabled, setMapTrafficEnabled };
}

// Export colors for use in StyleSheet
export { lightColors, darkColors };
