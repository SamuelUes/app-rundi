import React, {
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';

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
  const hasLoadedRef = useRef(false);
  const { t } = useTranslation();

  const refresh = useCallback(
    async (options?: { showLoading?: boolean }) => {
      const shouldShowLoading = options?.showLoading ?? !hasLoadedRef.current;
      if (shouldShowLoading) {
        setState((prev) => ({ ...prev, loading: true }));
      }

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
        console.log('[LocationPermissionGate] State after refresh:', {
          servicesEnabled,
          foregroundStatus: foregroundResponse.status,
          foregroundCanAskAgain: (foregroundResponse as any).canAskAgain,
          backgroundStatus: backgroundResponse ? backgroundResponse.status : null,
          backgroundCanAskAgain: backgroundResponse ? (backgroundResponse as any).canAskAgain : null,
        });
        hasLoadedRef.current = true;
      } catch (error) {
        console.warn('[LocationPermissionGate] Error checking permissions:', error);
        setState((prev) => ({ ...prev, loading: false }));
      }
    },
    [requireBackground],
  );

  useEffect(() => {
    refresh({ showLoading: true });
  }, [refresh]);

  useEffect(() => {
    const lastAppStateRef = { current: AppState.currentState };
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previous = lastAppStateRef.current;
      lastAppStateRef.current = nextState;
      if (nextState === 'active' && previous !== 'active') {
        refresh();
      }
    });

    return () => {
      subscription.remove();
    };
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
  const autoRequestedRef = useRef({ foreground: false, background: false });

  useEffect(() => {
    if (loading || requesting !== null) {
      return;
    }

    if (servicesEnabled === false) {
      return;
    }

    const foregroundNeedsRequest =
      !foreground?.granted && foreground?.canAskAgain !== false && !autoRequestedRef.current.foreground;

    if (foregroundNeedsRequest) {
      console.log('[LocationPermissionGate] Auto-requesting foreground permission...', {
        status: foreground?.status,
        canAskAgain: foreground?.canAskAgain,
      });
      autoRequestedRef.current.foreground = true;
      requestForeground();
      return;
    }

    const shouldRequestBackground =
      requireBackground &&
      foreground?.granted &&
      !background?.granted &&
      background?.canAskAgain !== false &&
      !autoRequestedRef.current.background;

    if (shouldRequestBackground) {
      console.log('[LocationPermissionGate] Auto-requesting background permission...', {
        status: background?.status,
        canAskAgain: background?.canAskAgain,
      });
      autoRequestedRef.current.background = true;
      requestBackground();
    }
  }, [
    background?.canAskAgain,
    background?.granted,
    foreground?.canAskAgain,
    foreground?.granted,
    loading,
    requireBackground,
    requestBackground,
    requestForeground,
    requesting,
    servicesEnabled,
  ]);

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
              <Text style={styles.spinnerLabel}>{t('shared.permissions.gate.spinner')}</Text>
            </View>
          ) : (
            <>
              {!servicesEnabled && (
                <View style={styles.section}>
                  <Text style={styles.title}>{t('shared.permissions.gate.services.title')}</Text>
                  <Text style={styles.message}>{t('shared.permissions.gate.services.description')}</Text>
                  <Pressable style={styles.primaryButton} onPress={openAppSettings}>
                    <Text style={styles.primaryButtonText}>
                      {t('shared.permissions.gate.services.primary')}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => refresh({ showLoading: true })}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {t('shared.permissions.gate.services.secondary')}
                    </Text>
                  </Pressable>
                </View>
              )}

              {servicesEnabled && !foreground?.granted && (
                <View style={styles.section}>
                  <Text style={styles.title}>{t('shared.permissions.gate.foreground.title')}</Text>
                  <Text style={styles.message}>
                    {t('shared.permissions.gate.foreground.description')}
                  </Text>
                  {foregroundDeniedPermanently ? (
                    <Pressable style={styles.primaryButton} onPress={openAppSettings}>
                      <Text style={styles.primaryButtonText}>
                        {t('shared.permissions.gate.foreground.primarySettings')}
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={styles.primaryButton}
                      onPress={requestForeground}
                      disabled={requesting === 'foreground'}
                    >
                      <Text style={styles.primaryButtonText}>
                        {t('shared.permissions.gate.foreground.primary')}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => refresh({ showLoading: true })}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {t('shared.permissions.gate.foreground.secondary')}
                    </Text>
                  </Pressable>
                </View>
              )}

              {servicesEnabled && foreground?.granted && requireBackground && !background?.granted && (
                <View style={styles.section}>
                  <Text style={styles.title}>{t('shared.permissions.gate.background.title')}</Text>
                  <Text style={styles.message}>
                    {t('shared.permissions.gate.background.description')}
                  </Text>
                  {backgroundDeniedPermanently ? (
                    <Pressable style={styles.primaryButton} onPress={openAppSettings}>
                      <Text style={styles.primaryButtonText}>
                        {t('shared.permissions.gate.background.primary')}
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={styles.primaryButton}
                      onPress={requestBackground}
                      disabled={requesting === 'background'}
                    >
                      <Text style={styles.primaryButtonText}>
                        {t('shared.permissions.gate.background.primary')}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => refresh({ showLoading: true })}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {t('shared.permissions.gate.background.secondary')}
                    </Text>
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
