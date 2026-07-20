import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { LoadingIcon } from '../components/ui/LoadingIcon';
import { useAuth } from '../hooks/shared/auth/useAuth';
import AuthStack from './AuthStack';
import ClientStack from './ClientStack';
import DriverStack from './DriverStack';
import { replace } from './NavigationService';

export default function AppNavigator() {
  const { user, loading, userMode } = useAuth();

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
      <View style={styles.loading}>
        <LoadingIcon size={32} color="#007AFF" />
      </View>
    );
  }

  // Si no hay usuario, mostrar pantallas de autenticación
  if (!user) {
    return <AuthStack />;
  }

  const isDriverCapable = user.role === 'driver' || user.role === 'designated_driver';

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
    backgroundColor: '#fff',
  },
});
