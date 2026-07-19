/**
 * Theme Context - Backward-compatible wrapper around themeStore (Zustand)
 * Use useThemeStore directly in new code. This wrapper exists for legacy imports.
 */

import React, { ReactNode, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import {
  useThemeStore,
  useThemeColors,
  useIsDark,
  lightColors,
  darkColors,
} from '../stores/themeStore';

type Theme = 'light' | 'dark' | 'auto';

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  setTheme: (theme: Theme) => void;
  colors: typeof lightColors;
  mapTrafficEnabled: boolean;
  setMapTrafficEnabled: (value: boolean) => void;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
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

  return <>{children}</>;
}

export function useTheme(): ThemeContextType {
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
