import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { StripeProvider } from '@stripe/stripe-react-native';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { FCMProvider } from './src/context/FCMContext';
import { usePresence } from './src/hooks/usePresence';
import AppNavigator from './src/navigation/AppNavigator';
import fcmService from './src/services/fcmService';

// Stripe Publishable Key (desde .env)
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLIC_KEY || 'pk_test_51SEkQKHVOBNC1WbUcQQAYs6FDD0dYO3wMA8dQzzHFTLFkEJsNpgBXe9V7ZOfQ85uvhivpzT88ntqoITyLoadFDGd00hoCYtolH';

function AppContent() {
  const { isDark } = useTheme();
  
  // Activar sistema de presencia automáticamente
  usePresence();

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
    <NavigationContainer>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
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
    </ThemeProvider>
  );
}
