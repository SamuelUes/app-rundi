import React, { PropsWithChildren, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';

interface LocationPermissionGateProps extends PropsWithChildren {
  requireBackground: boolean;
}

type PermissionSnapshot = Pick<Location.PermissionResponse, 'granted' | 'canAskAgain' | 'status'>;

type GateState = {
  foreground: PermissionSnapshot | null;
  background: PermissionSnapshot | null;
  servicesEnabled: boolean | null;
  loading: boolean;
};

const initialState: GateState = {
  foreground: null,
  background: null,
  servicesEnabled: null,
  loading: true,
};

const LocationPermissionGate: React.FC<LocationPermissionGateProps> = ({
  requireBackground,
  children,
}) => {
  const [state, setState] = useState<GateState>(initialState);
  const [requesting, setRequesting] = useState<'foreground' | 'background' | null>(null);

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const [foregroundResponse, backgroundResponse, servicesEnabled] = await Promise.all([
        Location.getForegroundPermissionsAsync(),
        requireBackground ? Location.getBackgroundPermissionsAsync() : Promise.resolve(null),
        Location.hasServicesEnabledAsync(),
      ]);

      setState({
        foreground: foregroundResponse,
        background: backgroundResponse,
        servicesEnabled,
        loading: false,
      });
    } catch (error) {
      console.warn('[LocationPermissionGate] Error checking permissions:', error);
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [requireBackground]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openAppSettings = useCallback(async () => {
    try {
      if (Platform.OS === 'ios') {
        await Linking.openURL('app-settings:');
      } else {
        await Linking.openSettings();
      }
    } catch (error) {
      console.warn('[LocationPermissionGate] Unable to open settings:', error);
    }
  }, []);

  const requestForeground = useCallback(async () => {
    setRequesting('foreground');
    try {
      await Location.requestForegroundPermissionsAsync();
    } finally {
      setRequesting(null);
      refresh();
    }
  }, [refresh]);

  const requestBackground = useCallback(async () => {
    setRequesting('background');
    try {
      await Location.requestBackgroundPermissionsAsync();
    } finally {
      setRequesting(null);
      refresh();
    }
  }, [refresh]);

  const { foreground, background, servicesEnabled, loading } = state;

  const canRenderChildren = useMemo(() => {
    if (loading) return false;
    if (!servicesEnabled) return false;
    if (!foreground?.granted) return false;
    if (requireBackground && !background?.granted) return false;
    return true;
  }, [background?.granted, foreground?.granted, loading, requireBackground, servicesEnabled]);

  if (canRenderChildren) {
    return <>{children}</>;
  }

  const showSpinner = loading || requesting !== null;
  const foregroundDeniedPermanently = foreground && !foreground.canAskAgain && !foreground.granted;
  const backgroundDeniedPermanently = background && !background.canAskAgain && !background.granted;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.card}>
          {showSpinner ? (
            <View style={styles.spinnerContainer}>
              <ActivityIndicator size="large" color="#e58b1e" />
              <Text style={styles.spinnerLabel}>Verificando permisos de ubicación…</Text>
            </View>
          ) : (
            <>
              {!servicesEnabled && (
                <View style={styles.section}>
                  <Text style={styles.title}>Activa los servicios de ubicación</Text>
                  <Text style={styles.message}>
                    Para continuar, enciende los servicios de ubicación del sistema. Sin ellos no podremos
                    compartir tu ubicación en primer plano ni en segundo plano.
                  </Text>
                  <Pressable style={styles.primaryButton} onPress={openAppSettings}>
                    <Text style={styles.primaryButtonText}>Abrir ajustes</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryButton} onPress={refresh}>
                    <Text style={styles.secondaryButtonText}>Ya lo activé, reintentar</Text>
                  </Pressable>
                </View>
              )}

              {servicesEnabled && !foreground?.granted && (
                <View style={styles.section}>
                  <Text style={styles.title}>Permiso de ubicación requerido</Text>
                  <Text style={styles.message}>
                    Necesitamos acceso a tu ubicación mientras usas la app para poder asignarte viajes y mostrar
                    la información correcta en el mapa.
                  </Text>
                  {foregroundDeniedPermanently ? (
                    <Pressable style={styles.primaryButton} onPress={openAppSettings}>
                      <Text style={styles.primaryButtonText}>Abrir ajustes del sistema</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={styles.primaryButton}
                      onPress={requestForeground}
                      disabled={requesting === 'foreground'}
                    >
                      <Text style={styles.primaryButtonText}>Permitir ubicación</Text>
                    </Pressable>
                  )}
                  <Pressable style={styles.secondaryButton} onPress={refresh}>
                    <Text style={styles.secondaryButtonText}>Reintentar</Text>
                  </Pressable>
                </View>
              )}

              {servicesEnabled && foreground?.granted && requireBackground && !background?.granted && (
                <View style={styles.section}>
                  <Text style={styles.title}>Activa la ubicación en segundo plano</Text>
                  <Text style={styles.message}>
                    Cuando la app está en segundo plano seguimos compartiendo tu ubicación para notificarte
                    viajes cercanos y continuar los trayectos en curso. Actívalo para seguir usando la app.
                  </Text>
                  {backgroundDeniedPermanently ? (
                    <Pressable style={styles.primaryButton} onPress={openAppSettings}>
                      <Text style={styles.primaryButtonText}>Abrir ajustes del sistema</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={styles.primaryButton}
                      onPress={requestBackground}
                      disabled={requesting === 'background'}
                    >
                      <Text style={styles.primaryButtonText}>Permitir en segundo plano</Text>
                    </Pressable>
                  )}
                  <Pressable style={styles.secondaryButton} onPress={refresh}>
                    <Text style={styles.secondaryButtonText}>Ya lo activé, reintentar</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  //  backgroundColor: '#e58b1e',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    elevation: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  section: {
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0D47A1',
  },
  message: {
    fontSize: 16,
    lineHeight: 22,
    color: '#37474F',
  },
  primaryButton: {
    backgroundColor: '#1E88E5',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  secondaryButton: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#90CAF9',
  },
  secondaryButtonText: {
    color: '#1E88E5',
    fontWeight: '600',
    fontSize: 16,
  },
  spinnerContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  spinnerLabel: {
    fontSize: 16,
    color: '#37474F',
  },
});

export default LocationPermissionGate;
