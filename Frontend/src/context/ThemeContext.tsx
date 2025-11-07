/**
 * Theme Context - Dark Mode Support
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

type Theme = 'light' | 'dark' | 'auto';

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  setTheme: (theme: Theme) => void;
  colors: typeof lightColors;
  mapTrafficEnabled: boolean;
  setMapTrafficEnabled: (value: boolean) => void;
}

const lightColors = {
  background: '#FFFFFF',
  surface: '#F5F5F5',
  card: '#FFFFFF',
  text: '#000000',
  textSecondary: '#666666',
  textTertiary: '#999999',
  primary: '#2196F3',
  primaryDark: '#1976D2',
  success: '#4CAF50',
  error: '#FF4444',
  warning: '#FFA726',
  border: '#E0E0E0',
  shadow: '#000000',
  overlay: 'rgba(0, 0, 0, 0.5)',
  disabled: '#CCCCCC',
};

const darkColors = {
  background: '#121212',
  surface: '#1E1E1E',
  card: '#2C2C2C',
  text: '#FFFFFF',
  textSecondary: '#B3B3B3',
  textTertiary: '#808080',
  primary: '#64B5F6',
  primaryDark: '#42A5F5',
  success: '#81C784',
  error: '#EF5350',
  warning: '#FFB74D',
  border: '#3A3A3A',
  shadow: '#000000',
  overlay: 'rgba(0, 0, 0, 0.7)',
  disabled: '#555555',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = '@driveangel_theme';
const MAP_TRAFFIC_STORAGE_KEY = '@driveangel_map_traffic';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('auto');
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(
    Appearance.getColorScheme() || 'light'
  );
  const [mapTrafficEnabled, setMapTrafficEnabledState] = useState<boolean>(true);

  // Cargar tema guardado
  useEffect(() => {
    loadPreferences();
  }, []);

  // Escuchar cambios del sistema
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemTheme(colorScheme || 'light');
    });

    return () => subscription.remove();
  }, []);

  const loadPreferences = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme && ['light', 'dark', 'auto'].includes(savedTheme)) {
        setThemeState(savedTheme as Theme);
      }

      const savedTraffic = await AsyncStorage.getItem(MAP_TRAFFIC_STORAGE_KEY);
      if (savedTraffic !== null) {
        setMapTrafficEnabledState(savedTraffic === 'true');
      }
    } catch (error) {
      console.error('Error loading theme preferences:', error);
    }
  };

  const setTheme = async (newTheme: Theme) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme);
      setThemeState(newTheme);
      console.log(`✅ Tema cambiado a: ${newTheme}`);
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  };

  const setMapTrafficEnabled = async (value: boolean) => {
    try {
      await AsyncStorage.setItem(MAP_TRAFFIC_STORAGE_KEY, value ? 'true' : 'false');
      setMapTrafficEnabledState(value);
      console.log(`✅ Tráfico en mapa ${value ? 'activado' : 'desactivado'}`);
    } catch (error) {
      console.error('Error saving traffic preference:', error);
    }
  };

  // Determinar si usar dark mode
  const isDark = theme === 'dark' || (theme === 'auto' && systemTheme === 'dark');

  // Seleccionar colores según el tema
  const colors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider
      value={{ theme, isDark, setTheme, colors, mapTrafficEnabled, setMapTrafficEnabled }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

// Export colors for use in StyleSheet
export { lightColors, darkColors };
