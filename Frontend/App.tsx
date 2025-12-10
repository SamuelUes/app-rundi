import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { VoiceAssistantProvider } from './src/context/VoiceAssistantContext';
import { FCMProvider } from './src/context/FCMContext';
import { usePresence } from './src/hooks/usePresence';
import { useDriverProfileSync } from './src/hooks/useDriverProfileSync';
import useDriverProximityTracking from './src/hooks/useDriverProximityTracking';
import AppNavigator from './src/navigation/AppNavigator';
import fcmService from './src/services/fcmService';
import { useKeepAwake } from 'expo-keep-awake';
import TopToastProvider from './src/components/toast/TopToastProvider';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { navigationRef } from './src/navigation/NavigationService';
import { useNotifications } from './src/hooks/useNotifications';
import { useOverlayDeepLink } from './src/hooks/useOverlayDeepLink';
import LocationPermissionGate from './src/components/permissions/LocationPermissionGate';

// Stripe Publishable Key (desde .env)
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLIC_KEY || 'pk_test_51SEkQKHVOBNC1WbUcQQAYs6FDD0dYO3wMA8dQzzHFTLFkEJsNpgBXe9V7ZOfQ85uvhivpzT88ntqoITyLoadFDGd00hoCYtolH';

function AppContent() {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const [fontsLoaded] = useFonts({
    Montserrat: require('./src/assets/fonts/Montserrat-VariableFont_wght.ttf'),
  });
  const requireBackgroundLocation =
    user?.role === 'driver' || user?.role === 'designated_driver';
  // Inicializar listeners de notificaciones (Expo Notifications)
  useNotifications();
  
  // Detectar apertura desde overlay y navegar a RidePreviewScreen
  useOverlayDeepLink();
  
  // Activar sistema de presencia y sincronización de perfil de conductor
  usePresence();
  useDriverProfileSync();
  // Iniciar tracking de proximidad para conductores (permite viaje por aproximación)
  useDriverProximityTracking();

  // Mantener la pantalla encendida mientras la app está en primer plano
  useKeepAwake();

  // Inicializar FCM al abrir la app
  useEffect(() => {
    const initializeFCM = async () => {
      try {
        console.log('🔔 Inicializando FCM en App.tsx...');
        // El FCMProvider ya maneja la inicialización
        // Este efecto es solo para logging
      } catch (error) {
        console.error('❌ Error inicializando FCM:', error);
      }
    };

    initializeFCM();
  }, []);
  
  if (!fontsLoaded) {
    return null;
  }
  
  return (
    <SafeAreaProvider>
      <TopToastProvider>
        <LocationPermissionGate requireBackground={requireBackgroundLocation}>
          <NavigationContainer ref={navigationRef}>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <AppNavigator />
          </NavigationContainer>
        </LocationPermissionGate>
      </TopToastProvider>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <VoiceAssistantProvider>
          <AuthProvider>
            <FCMProvider>
              <AppContent />
            </FCMProvider>
          </AuthProvider>
      </VoiceAssistantProvider>
    </ThemeProvider>
  );
}
