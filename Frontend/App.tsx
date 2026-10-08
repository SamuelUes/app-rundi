import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from './src/hooks/shared/auth/useAuth';
import { useTheme, useThemeInit } from './src/hooks/shared/theme/useTheme';
import { VoiceAssistantProvider } from './src/context/VoiceAssistantContext';
import { FCMProvider } from './src/context/FCMContext';
import { useLanguageStore } from './src/stores/languageStore';
import { useAuthInit } from './src/hooks/shared/auth/useAuthInit';
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
import AppSplashOverlay from './src/components/ui/AppSplashOverlay';
// import { initializeReactNativeFirebase } from './src/config/firebase-rn-native';
// import { getApp } from '@react-native-firebase/app';

// Stripe Publishable Key (desde .env)
//const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLIC_KEY || 'pk_test_51SEkQKHVOBNC1WbUcQQAYs6FDD0dYO3wMA8dQzzHFTLFkEJsNpgBXe9V7ZOfQ85uvhivpzT88ntqoITyLoadFDGd00hoCYtolH';

// Mantener el splash nativo hasta que el overlay JS este pintado (transicion seamless)
SplashScreen.preventAutoHideAsync().catch(() => {});

function AppContent() {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const isLanguageReady = useLanguageStore((s) => s.isReady);
  const loadLanguage = useLanguageStore((s) => s.loadLanguage);
  const [fontsLoaded, fontError] = useFonts({
    Montserrat: require('./src/assets/fonts/Montserrat-VariableFont_wght.ttf'),
    PlusJakartSans: require('./src/assets/fonts/PlusJakartaSans-VariableFont_wght.ttf'),
  });
  const [splashDismissed, setSplashDismissed] = React.useState(false);
  const [loadTimedOut, setLoadTimedOut] = React.useState(false);
  const requireBackgroundLocation =
    user?.role === 'driver' || user?.role === 'designated_driver';

  // Inicializaciones de stores (reemplazan a los Providers legacy no-op)
  useThemeInit();
  useAuthInit();
  React.useEffect(() => {
    loadLanguage();
  }, [loadLanguage]);

  // Fallback: no dejar el splash indefinidamente si algo tarda demasiado
  React.useEffect(() => {
    const timer = setTimeout(() => setLoadTimedOut(true), 6000);
    return () => clearTimeout(timer);
  }, []);

  // Inicializar listeners de notificaciones (Expo Notifications)
  useNotifications();

  // Activar sistema de presencia y sincronización de perfil de conductor
  usePresence();
  useDriverProfileSync();
  // Iniciar tracking de proximidad para conductores (permite viaje por aproximación)
  useDriverProximityTracking();

  // Mantener la pantalla encendida mientras la app está en primer plano
  useKeepAwake();

  const appReady = (fontsLoaded || !!fontError) && (isLanguageReady || loadTimedOut);
  const hideNativeSplash = React.useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      <View
        style={{ flex: 1, backgroundColor: '#0F2628' }}
        onLayout={hideNativeSplash}
      >
        {appReady && (
          <TopToastProvider>
            <LocationPermissionGate requireBackground={requireBackgroundLocation}>
              <NavigationContainer ref={navigationRef}>
                <AppNavigator />
              </NavigationContainer>
            </LocationPermissionGate>
          </TopToastProvider>
        )}
        {!splashDismissed && (
          <AppSplashOverlay
            ready={appReady}
            onFinished={() => setSplashDismissed(true)}
          />
        )}
        <StatusBar style={appReady && !isDark ? 'dark' : 'light'} />
      </View>
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
      <VoiceAssistantProvider>
        <FCMProvider>
          <AppContent />
        </FCMProvider>
      </VoiceAssistantProvider>
    </I18nextProvider>
  );
}
