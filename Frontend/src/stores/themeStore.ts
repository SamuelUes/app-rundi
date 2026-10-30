/**
 * Theme Store (Zustand)
 * Replaces ThemeContext with a simpler, provider-free store.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance, useColorScheme } from 'react-native';

type Theme = 'light' | 'dark' | 'auto';

const THEME_STORAGE_KEY = '@rundi_theme';
const MAP_TRAFFIC_STORAGE_KEY = '@rundi_map_traffic';

export const lightColors = {
  background: '#FFFFFF',
  surface: '#F5F5F5',
  surface2: '#ededed',
  card: '#FFFFFF',
  text: '#000000',
  textSecondary: '#666666',
  textTertiary: '#999999',
  primary: '#b38737',
  secondary: '#2196F3',
  primaryDark: '#1976D2',
  success: '#4CAF50',
  error: '#FF4444',
  warning: '#FFA726',
  border: '#E0E0E0',
  SecondBorder: '#6e44ff',
  shadow: '#000000',
  overlay: 'rgba(0, 0, 0, 0.5)',
  disabled: '#CCCCCC',
  button: 'rgba(95, 93, 93, 0.34)',
};

export const darkColors = {
  background: '#121212',
  surface: '#1E1E1E',
  surface2: '#484848',
  card: '#2C2C2C',
  card2: '#4f4f4f',
  text: '#FFFFFF',
  textSecondary: '#B3B3B3',
  textTertiary: '#808080',
  primary: '#b38737',
  secondary: '#2196F3',
  primaryDark: '#42A5F5',
  success: '#81C784',
  error: '#EF5350',
  warning: '#FFB74D',
  border: '#3A3A3A',
  SecondBorder: '#6e44ff',
  shadow: '#000000',
  overlay: 'rgba(0, 0, 0, 0.7)',
  disabled: '#555555',
  button: 'rgba(95, 93, 93, 0.34)',
};

interface ThemeState {
  theme: Theme;
  systemTheme: 'light' | 'dark';
  mapTrafficEnabled: boolean;
  setTheme: (theme: Theme) => Promise<void>;
  setSystemTheme: (theme: 'light' | 'dark') => void;
  setMapTrafficEnabled: (value: boolean) => Promise<void>;
  loadPreferences: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'auto',
  systemTheme: Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
  mapTrafficEnabled: true,

  setTheme: async (newTheme: Theme) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme);
      set({ theme: newTheme });
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  },

  setSystemTheme: (theme: 'light' | 'dark') => set({ systemTheme: theme }),

  setMapTrafficEnabled: async (value: boolean) => {
    try {
      await AsyncStorage.setItem(MAP_TRAFFIC_STORAGE_KEY, value ? 'true' : 'false');
      set({ mapTrafficEnabled: value });
    } catch (error) {
      console.error('Error saving traffic preference:', error);
    }
  },

  loadPreferences: async () => {
    try {
      const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme && ['light', 'dark', 'auto'].includes(savedTheme)) {
        set({ theme: savedTheme as Theme });
      }
      const savedTraffic = await AsyncStorage.getItem(MAP_TRAFFIC_STORAGE_KEY);
      if (savedTraffic !== null) {
        set({ mapTrafficEnabled: savedTraffic === 'true' });
      }
    } catch (error) {
      console.error('Error loading theme preferences:', error);
    }
  },
}));

// Derived selectors
export function useThemeColors() {
  const isDark = useThemeStore((s) => s.theme === 'dark' || (s.theme === 'auto' && s.systemTheme === 'dark'));
  return isDark ? darkColors : lightColors;
}

export function useIsDark() {
  return useThemeStore((s) => s.theme === 'dark' || (s.theme === 'auto' && s.systemTheme === 'dark'));
}
