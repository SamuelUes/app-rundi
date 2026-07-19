import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { VoiceAssistantProvider } from './src/context/VoiceAssistantContext';
import { FCMProvider } from './src/context/FCMContext';
import { LanguageProvider, useLanguage } from './src/context/LanguageContext';
import { I18nextProvider } from 'react-i18next';
import i18n from './src/i18n';
import { usePresence } from './src/hooks/shared/presence/usePresence';
import { useDriverProfileSync } from './src/hooks/driver/DriverProfileScreen/useDriverProfileSync';
import useDriverProximityTracking from './src/hooks/driver/DriverHomeScreen/useDriverProximityTracking';
import AppNavigator from './src/navigation/AppNavigator';
import { useKeepAwake } from 'expo-keep-awake';
import TopToastProvider from './src/components/toast/TopToastProvider';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { navigationRef } from './src/navigation/NavigationService';
import { useNotifications } from './src/hooks/shared/notifications/useNotifications';
import LocationPermissionGate from './src/components/permissions/LocationPermissionGate';
// import { initializeReactNativeFirebase } from './src/config/firebase-rn-native';
// import { getApp } from '@react-native-firebase/app';

// Stripe Publishable Key (desde .env)
//const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLIC_KEY || 'pk_test_51SEkQKHVOBNC1WbUcQQAYs6FDD0dYO3wMA8dQzzHFTLFkEJsNpgBXe9V7ZOfQ85uvhivpzT88ntqoITyLoadFDGd00hoCYtolH';

function AppContent() {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const { isReady: isLanguageReady } = useLanguage();
  const [fontsLoaded] = useFonts({
    Montserrat: require('./src/assets/fonts/Montserrat-VariableFont_wght.ttf'),
    PlusJakartSans: require('./src/assets/fonts/PlusJakartaSans-VariableFont_wght.ttf'),
  });
  const requireBackgroundLocation =
    user?.role === 'driver' || user?.role === 'designated_driver';
  // Inicializar listeners de notificaciones (Expo Notifications)
  useNotifications();
  
  // Activar sistema de presencia y sincronización de perfil de conductor
  usePresence();
  useDriverProfileSync();
  // Iniciar tracking de proximidad para conductores (permite viaje por aproximación)
  useDriverProximityTracking();

  // Mantener la pantalla encendida mientras la app está en primer plano
  useKeepAwake();

  if (!fontsLoaded || !isLanguageReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: isDark ? '#111827' : '#ffffff' }}>
        <ActivityIndicator size="large" color={isDark ? '#ffffff' : '#111827'} />
      </View>
    );
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
  // Inicializar React Native Firebase al iniciar la app
  // useEffect(() => {
  //   try {
  //     console.log('🔧 Verificando React Native Firebase...');
  //     // React Native Firebase se inicializa automáticamente con google-services.json
  //     // Solo verificamos que esté disponible
  //     const app = getApp();
  //     console.log('✅ React Native Firebase disponible:', app.name);
  //   } catch (error) {
  //     console.error('❌ React Native Firebase no disponible:', error);
  //     console.log('💡 Esto es normal si no hay google-services.json configurado');
  //   }
  // }, []);

  return (
    <I18nextProvider i18n={i18n}>
      <LanguageProvider>
        <ThemeProvider>
          <VoiceAssistantProvider>
            <AuthProvider>
              <FCMProvider>
                <AppContent />
              </FCMProvider>
            </AuthProvider>
          </VoiceAssistantProvider>
        </ThemeProvider>
      </LanguageProvider>
    </I18nextProvider>
  );
}
