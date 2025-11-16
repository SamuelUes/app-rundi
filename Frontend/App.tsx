import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { StripeProvider } from '@stripe/stripe-react-native';
import { AuthProvider } from './src/context/AuthContext';
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

// Stripe Publishable Key (desde .env)
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLIC_KEY || 'pk_test_51SEkQKHVOBNC1WbUcQQAYs6FDD0dYO3wMA8dQzzHFTLFkEJsNpgBXe9V7ZOfQ85uvhivpzT88ntqoITyLoadFDGd00hoCYtolH';

function AppContent() {
  const { isDark } = useTheme();
  // Inicializar listeners de notificaciones (Expo Notifications)
  useNotifications();
  
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
  
  return (
    <SafeAreaProvider>
      <TopToastProvider>
        <NavigationContainer ref={navigationRef}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <AppNavigator />
        </NavigationContainer>
      </TopToastProvider>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <VoiceAssistantProvider>
        <StripeProvider
          publishableKey={STRIPE_PUBLISHABLE_KEY}
          merchantIdentifier="merchant.com.driveangel.ni"
          urlScheme="driveangel"
        >
          <AuthProvider>
            <FCMProvider>
              <AppContent />
            </FCMProvider>
          </AuthProvider>
        </StripeProvider>
      </VoiceAssistantProvider>
    </ThemeProvider>
  );
}
