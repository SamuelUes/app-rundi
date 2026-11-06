import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { BrandLoadingIndicator } from '../components/ui/BrandLoadingIndicator';
import { useAuth } from '../hooks/shared/auth/useAuth';
import { useAuthStore } from '../stores/authStore';
import { useTheme } from '../hooks/shared/theme/useTheme';
import AuthStack from './AuthStack';
import ClientStack from './ClientStack';
import DriverStack from './DriverStack';
import BiometricLockScreen from '../components/auth/BiometricLockScreen';
import { replace } from './NavigationService';

export default function AppNavigator() {
  const { user, loading, userMode } = useAuth();
  const biometricLocked = useAuthStore((s) => s.biometricLocked);
  const { colors } = useTheme();

  const prevUserModeRef = useRef<'client' | 'driver' | null>(null);

  useEffect(() => {
    if (!user) {
      prevUserModeRef.current = null;
      return;
    }

    const prevMode = prevUserModeRef.current;
    prevUserModeRef.current = userMode;

    const isDriverCapableNow =
      user.role === 'driver' || user.role === 'designated_driver';

    if (prevMode === 'client' && userMode === 'driver' && isDriverCapableNow) {
      replace('DriverPreflight', {
        role: 'driver',
        successRoute: 'DriverHome',
        activeRideRoute: 'ActiveRide',
        pendingPaymentsRoute: 'PendingPayments',
        rechargeFundsRoute: 'RechargeFunds',
        pendingApprovalRoute: 'DriverPendingApproval',
      });
    }
  }, [userMode, user]);

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <BrandLoadingIndicator />
      </View>
    );
  }

  // Si no hay usuario, mostrar pantallas de autenticación
  if (!user) {
    return <AuthStack />;
  }

  const isDriverCapable = user.role === 'driver' || user.role === 'designated_driver';

  // Sesión restaurada con desbloqueo biométrico activo: gate antes de los stacks.
  // Conductores exentos: su flujo de entrada ya exige biometría, el candado
  // de app sería redundante.
  if (biometricLocked && !isDriverCapable) {
    return <BiometricLockScreen />;
  }

  // Seleccionar stack según el modo activo y las capacidades del usuario
  if (userMode === 'driver' && isDriverCapable) {
    return <DriverStack />;
  }

  // Modo cliente (por defecto) o usuario sin capacidades de conductor
  return <ClientStack />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
