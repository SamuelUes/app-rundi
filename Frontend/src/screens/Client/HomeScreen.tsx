/**
 * HomeScreen - Versión mejorada para clientes
 *
 * Esta pantalla permite al cliente ver su ubicación, conductores cercanos,
 * y acceder a la funcionalidad de solicitar viajes.
 *
 * Mejoras:
 * - Implementación de useFirebaseData para consultas optimizadas a Firebase
 * - Utilización de LoadingOverlay para estados de carga
 * - Alertas consistentes con alertService
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { getActiveRidesByAreaPath } from '../../utils/serviceArea';

import alertService from '../../services/alertService';
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import { useFirebaseData } from '../../hooks/shared/firebase/useFirebaseData';
import { getPreflightResult } from '../../stores/preflightStore';
import { useTranslation } from 'react-i18next';
import { useLocation } from '../../hooks/shared/location/useLocation';
import { useNearbyDrivers } from '../../hooks/client/HomeScreen/useNearbyDrivers';
import { useActiveRideDetection } from '../../hooks/client/HomeScreen/useActiveRideDetection';
import { useClientLocation } from '../../hooks/client/HomeScreen/useClientLocation';
import { useRegionAvailability } from '../../hooks/client/HomeScreen/useRegionAvailability';
import { usePendingActions } from '../../hooks/client/HomeScreen/usePendingActions';
import { useUpcomingProgrammedRide } from '../../hooks/client/HomeScreen/useUpcomingProgrammedRide';
import { useMapPinInteraction } from '../../hooks/client/HomeScreen/useMapPinInteraction';
import DynamicMap from '../../components/map/DynamicMap';
import { MAP_ICONS } from '../../constants/mapIcons';
import { HomeScreenHeader } from '../../components/client/HomeScreen/HomeScreenHeader';
import { HomeScreenLocationStatus } from '../../components/client/HomeScreen/HomeScreenLocationStatus';
import { HomeScreenBottomActions } from '../../components/client/HomeScreen/HomeScreenBottomActions';

// Importaciones para Firebase

const { USER_LOCATION_LIGHT, USER_LOCATION_DARK, USER_LOCATION_HOLDING_LIGHT, USER_LOCATION_HOLDING_DARK } = MAP_ICONS;

export default function HomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  const preflightSummary = getPreflightResult();
  const initialRegion = preflightSummary?.region;

  const initialCoords =
    initialRegion &&
    typeof initialRegion.latitude === 'number' &&
    typeof initialRegion.longitude === 'number'
      ? {
          latitude: initialRegion.latitude,
          longitude: initialRegion.longitude,
        }
      : null;

  const {
    coords,
    error: locationError,
    refreshLocation,
    loading: locationLoading,
  } = useLocation(initialCoords ? { initialCoords } : {});
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, isDark, insets), [colors, isDark, insets]);

  const [loadingMessage, setLoadingMessage] = useState(t('client.home.loading.preparing'));
  const [initializing, setInitializing] = useState(true);
  const pendingInitialTasks = useRef(new Set<string>([
    'location',
    'clientLocation',
    'driversInfo',
    'driverLocations',
    'activeRides',
  ]));

  const markTaskCompleted = useCallback((taskName: string) => {
    if (!pendingInitialTasks.current.has(taskName)) return;
    pendingInitialTasks.current.delete(taskName);
    if (pendingInitialTasks.current.size === 0) {
      setInitializing(false);
    }
  }, []);

  const {
    isOutsideSupportedArea,
    regionStatus,
    serviceAreaId,
    updateRegionForCoords,
  } = useRegionAvailability(initialRegion ?? null);

  const {
    clientLocationData,
    loadingClientLocation,
    savedAddress,
    manualOverride,
    saveClientLocation,
    committedCoords,
    effectiveCoords,
    storedCoords,
    resolveAddressText,
  } = useClientLocation(user?.id, coords, initialCoords, t);

  useEffect(() => {
    if (!loadingClientLocation) markTaskCompleted('clientLocation');
  }, [loadingClientLocation, markTaskCompleted]);

  // Datos de conductores disponibles
  const {
    data: driversInfo,
    loading: loadingDrivers,
  } = useFirebaseData<any>('driversInfo', { maxCacheAge: 10000 });

  useEffect(() => {
    if (!loadingDrivers) markTaskCompleted('driversInfo');
  }, [loadingDrivers, markTaskCompleted]);

  const [driverLocationsSnapshot, setDriverLocationsSnapshot] = useState<Record<string, any> | null>(null);
  const driverLocationsSignatureRef = useRef<string>('');

  // Listener para driverLocations en tiempo real
  useEffect(() => {
    let isMounted = true;
    let cleanupFn: (() => void) | null = null;

    const startDriverLocationsListener = async () => {
      try {
        const { getDatabase, ref: dbRef, onValue, off } = await import('firebase/database');
        const db = getDatabase();
        const path = serviceAreaId ? `driverLocationsByArea/${serviceAreaId}` : 'driverLocations';
        const driverLocationsRef = dbRef(db, path);

        const handleSnapshot = (snapshot: any) => {
          if (!isMounted) return;

          const data = snapshot.val();
          if (!data || typeof data !== 'object') {
            if (driverLocationsSignatureRef.current !== '') {
              driverLocationsSignatureRef.current = '';
              setDriverLocationsSnapshot(null);
            }
            return;
          }

          const entries = Object.entries<any>(data)
            .map(([driverId, payload]) => {
              const latitude = payload?.lat ?? payload?.latitude ?? payload?.coords?.latitude ?? null;
              const longitude = payload?.lng ?? payload?.longitude ?? payload?.coords?.longitude ?? null;
              if (latitude === null || longitude === null) return null;
              const heading = typeof payload?.heading === 'number' ? payload.heading : null;
              const status = payload?.status ?? payload?.driverStatus ?? payload?.availability;
              return {
                driverId,
                latitude: typeof latitude === 'number' ? latitude : parseFloat(latitude),
                longitude: typeof longitude === 'number' ? longitude : parseFloat(longitude),
                heading,
                status,
                raw: payload,
              };
            })
            .filter((entry): entry is NonNullable<typeof entry> => {
              return (
                entry !== null &&
                typeof entry.latitude === 'number' &&
                Number.isFinite(entry.latitude) &&
                typeof entry.longitude === 'number' &&
                Number.isFinite(entry.longitude)
              );
            })
            .sort((a, b) => a.driverId.localeCompare(b.driverId));

          const signature = entries
            .map((entry) =>
              `${entry.driverId}:${entry.latitude.toFixed(6)}:${entry.longitude.toFixed(6)}:${(entry.heading ?? 0).toFixed(2)}:${entry.status ?? ''}`,
            )
            .join('|');

          if (signature !== driverLocationsSignatureRef.current) {
            driverLocationsSignatureRef.current = signature;
            const snapshotRecord: Record<string, any> = {};
            entries.forEach((entry) => {
              snapshotRecord[entry.driverId] = entry.raw;
            });
            setDriverLocationsSnapshot(snapshotRecord);
          }
        };

        const handleError = (error: any) => {
          console.error('❌ [HomeScreen] Error escuchando driverLocations:', error);
          if (!isMounted) return;
          driverLocationsSignatureRef.current = '';
          setDriverLocationsSnapshot(null);
        };

        onValue(driverLocationsRef, handleSnapshot, handleError);
        cleanupFn = () => {
          off(driverLocationsRef, 'value', handleSnapshot);
        };
      } catch (error) {
        console.error('❌ [HomeScreen] Error iniciando listener de driverLocations:', error);
      }
    };

    startDriverLocationsListener().finally(() => markTaskCompleted('driverLocations'));

    return () => {
      isMounted = false;
      if (cleanupFn) cleanupFn();
    };
  }, [serviceAreaId]);

  // Viajes activos
  const activeRidesPath = useMemo(
    () => getActiveRidesByAreaPath(serviceAreaId || undefined),
    [serviceAreaId],
  );

  const {
    data: activeRidesData,
    loading: loadingRides,
  } = useFirebaseData<Record<string, any>>(activeRidesPath, { maxCacheAge: 5000 });

  useEffect(() => {
    if (!loadingRides) markTaskCompleted('activeRides');
  }, [loadingRides, markTaskCompleted]);

  const activeRide = useActiveRideDetection(user?.id, activeRidesData, navigation);
  const upcomingProgrammedRide = useUpcomingProgrammedRide(user?.id);

  const availableDrivers = useNearbyDrivers(
    coords,
    clientLocationData?.coords,
    manualOverride,
    driversInfo,
    driverLocationsSnapshot,
    loadingDrivers,
  );

  const {
    pendingAction,
    hasPendingPayments,
    handleViewActiveRide,
    handleViewPendingPayments,
  } = usePendingActions(user?.id, activeRide, upcomingProgrammedRide, navigation, t);

  // Recordatorio in-app: viaje programado a >30min pero el mismo día.
  const scheduledRideNotice = useMemo(() => {
    if (!upcomingProgrammedRide || upcomingProgrammedRide.isImminent || !upcomingProgrammedRide.isToday) {
      return null;
    }
    const time = new Date(upcomingProgrammedRide.scheduledAt).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
    const totalMinutes = Math.max(1, Math.round(upcomingProgrammedRide.msUntil / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const remaining =
      hours > 0 && minutes > 0
        ? t('client.home.scheduledRide.inHoursMinutes', { hours, minutes })
        : hours > 0
          ? t('client.home.scheduledRide.inHours', { hours })
          : t('client.home.scheduledRide.inMinutes', { minutes: totalMinutes });
    return t('client.home.scheduledRide.notice', { time, remaining });
  }, [upcomingProgrammedRide, t]);

  const {
    mapCenter,
    pendingAddress,
    hasPendingManualSelection,
    isResolvingAddress,
    isSavingLocation,
    isHoldingPin,
    isPinLocked,
    setIsPinLocked,
    centerPinBounce,
    markerBounce,
    handleRegionChangeCenter,
    handleRegionChangeCompleteCenter,
    handleMarkerPress,
  } = useMapPinInteraction(
    committedCoords,
    manualOverride,
    clientLocationData,
    savedAddress,
    saveClientLocation,
    updateRegionForCoords,
    resolveAddressText,
    t,
  );

  // Pin animations
  useEffect(() => {
    if (!isPinLocked) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(centerPinBounce, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(centerPinBounce, {
            toValue: 0,
            duration: 600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }

    centerPinBounce.stopAnimation(() => {
      centerPinBounce.setValue(0);
    });
  }, [centerPinBounce, isPinLocked]);

  useEffect(() => {
    if (isPinLocked && !isHoldingPin) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(markerBounce, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(markerBounce, {
            toValue: 0,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }

    markerBounce.stopAnimation(() => {
      markerBounce.setValue(0);
    });
  }, [isHoldingPin, isPinLocked, markerBounce]);

  const centerPinTranslateY = centerPinBounce.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });

  const markerBounceTranslateY = markerBounce.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -6],
  });

  const hasShownUnsupportedAlertRef = useRef(false);

  const handleCenterMap = useCallback(async () => {
    try {
      await refreshLocation();
    } catch (error) {
      console.error('❌ Error actualizando ubicación:', error);
      alertService.showErrorAlert(t('client.home.alerts.locationUpdateError'));
    }
  }, [refreshLocation]);

  const handleRequestRide = useCallback(() => {
    if (isOutsideSupportedArea) {
      alertService.showInfoAlert(
        t('client.home.alerts.regionUnavailableTitle'),
        regionStatus.message || t('client.home.alerts.regionUnavailableMessage'),
      );
      return;
    }

    if (hasPendingPayments) {
      handleViewPendingPayments();
      return;
    }

    navigation.navigate('SearchRide');
  }, [handleViewPendingPayments, hasPendingPayments, isOutsideSupportedArea, navigation, regionStatus.message]);

  const displayCoords = useMemo(() => {
    if (mapCenter) return mapCenter;
    return effectiveCoords;
  }, [mapCenter, effectiveCoords]);

  useEffect(() => {
    if (!locationLoading || !!coords || !!storedCoords) {
      markTaskCompleted('location');
    }
  }, [locationLoading, coords, storedCoords, markTaskCompleted]);

  // Mostrar alerta de región no soportada (una sola vez)
  useEffect(() => {
    if (!isOutsideSupportedArea) return;
    if (hasShownUnsupportedAlertRef.current) return;

    hasShownUnsupportedAlertRef.current = true;
    alertService.showInfoAlert(
      t('client.home.alerts.regionUnavailableTitle'),
      regionStatus.message || t('client.home.alerts.regionUnavailableGeneral'),
    );
  }, [isOutsideSupportedArea, regionStatus.message]);

  const waitingForLocation = locationLoading && !coords && !storedCoords;

  if (initializing) {
    return <LoadingOverlay visible message={loadingMessage} />;
  }

  if (waitingForLocation) {
    return <LoadingOverlay visible={true} message={loadingMessage} />;
  }

  if (locationError && !coords && !storedCoords) {
    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorIconDisc}>
          <MaterialIcons name="location-off" size={28} color="#C62828" />
        </View>
        <Text style={styles.errorText}>{t('client.home.errors.locationAccessTitle')}</Text>
        <Text style={styles.errorDescription}>{t('client.home.errors.locationAccessDescription')}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          activeOpacity={0.85}
          onPress={() => {
            setLoadingMessage(t('client.home.loading.obtainingLocation'));
            refreshLocation();
          }}
        >
          <MaterialIcons name="refresh" size={18} color="#241A09" />
          <Text style={styles.retryText}>{t('client.home.errors.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const locationStatusHint = isPinLocked
    ? t('client.home.locationStatus.locked')
    : hasPendingManualSelection
    ? isSavingLocation
      ? t('client.home.locationStatus.saving')
      : t('client.home.locationStatus.dragging')
    : t('client.home.locationStatus.unlocked');

  const markerIcon = isDark ? USER_LOCATION_DARK : USER_LOCATION_LIGHT;
  const markerHoldIcon = isDark ? USER_LOCATION_HOLDING_DARK : USER_LOCATION_HOLDING_LIGHT;

  const showUserLocationDot = !manualOverride?.active && isPinLocked && !hasPendingManualSelection;
  const showCenterPinOverlay = !isPinLocked;

  return (
      <View style={styles.container}>
      <DynamicMap
        latitude={displayCoords.latitude}
        longitude={displayCoords.longitude}
        style={styles.map}
        showUserLocation={showUserLocationDot}
        userLocation={showUserLocationDot ? coords || undefined : undefined}
        showMarker={isPinLocked}
        markerPosition={displayCoords}
        markerType="manual_origin"
        nearbyDrivers={availableDrivers}
        disableMarkerPress={isSavingLocation}
        onMarkerPress={handleMarkerPress}
        onRegionChangeCenter={handleRegionChangeCenter}
        onRegionChangeCompleteCenter={handleRegionChangeCompleteCenter}
        showPinBubbles={false}
        userLocationLightIcon={USER_LOCATION_LIGHT}
        userLocationDarkIcon={USER_LOCATION_DARK}
        userLocationHoldingLightIcon={USER_LOCATION_HOLDING_LIGHT}
        userLocationHoldingDarkIcon={USER_LOCATION_HOLDING_DARK}
        manualOriginIcon={isPinLocked ? markerIcon : markerHoldIcon}
        manualOriginHoldIcon={markerHoldIcon}
        manualOriginBounceValue={isPinLocked && !isHoldingPin ? markerBounceTranslateY : undefined}
        manualOriginScale={1.2}
        userLocationScale={1.2}
        autoFitEnabled={false}
      />

      {showCenterPinOverlay && (
        <View pointerEvents="none" style={styles.centerPinOverlay}>
          <Animated.Image
            source={markerHoldIcon}
            style={[styles.centerPinImage, { transform: [{ translateY: centerPinTranslateY }] }]}
            resizeMode="contain"
          />
        </View>
      )}

      <HomeScreenLocationStatus
        locationStatusHint={locationStatusHint}
        isSavingLocation={isSavingLocation}
        hasPendingManualSelection={hasPendingManualSelection}
        isPinLocked={isPinLocked}
        styles={styles}
        t={t}
      />

      <HomeScreenHeader
        userName={user?.name}
        userPhotoUri={user?.profilePhoto}
        onNavigateProfile={() => navigation.navigate('Profile')}
        onCenterMap={handleCenterMap}
        styles={styles}
        t={t}
      />

      <HomeScreenBottomActions
        pendingAction={pendingAction}
        isOutsideSupportedArea={isOutsideSupportedArea}
        regionStatus={regionStatus}
        scheduledRideNotice={scheduledRideNotice}
        onRequestRide={handleRequestRide}
        styles={styles}
        t={t}
      />
    </View>
  );
}

// Estilos
const createStyles = (
  colors: any,
  isDark: boolean,
  insets: { top: number; bottom: number },
) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  map: {
    flex: 1,
  },
  centerPinOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -32 }, { translateY: -64 }],
    zIndex: 30,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  centerPinImage: {
    width: 64,
    height: 64,
  },

  // Location status card (pin hint)
  statusCard: {
    position: 'absolute',
    top: insets.top + 68,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: isDark ? 'rgba(24,20,17,0.92)' : 'rgba(255,255,255,0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(28,25,23,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.35 : 0.12,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 20,
  },
  statusIconDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(179,135,55,0.16)',
  },
  statusTextCol: {
    flex: 1,
    gap: 2,
    alignItems: 'flex-start',
    position: 'relative',
  },
  statusText: {
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 18,
    color: isDark ? '#F5F1EA' : '#1C1917',
  },
  statusSavingText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  // Profile chip (top right)
  profileChip: {
    position: 'absolute',
    top: insets.top + 8,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    paddingLeft: 6,
    paddingRight: 14,
    borderRadius: 24,
    backgroundColor: isDark ? 'rgba(24,20,17,0.92)' : 'rgba(255,255,255,0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(28,25,23,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.4 : 0.14,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 20,
  },
  profileAvatarWrap: {
    width: 36,
    height: 36,
  },
  profileAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#B38737',
    overflow: 'hidden',
  },
  profileAvatarImage: {
    width: '100%',
    height: '100%',
  },
  profileAvatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#241A09',
  },
  profileName: {
    fontSize: 15,
    fontWeight: '700',
    color: isDark ? '#F5F1EA' : '#1C1917',
    maxWidth: 128,
  },

  // Map recenter FAB
  mapFab: {
    position: 'absolute',
    right: 16,
    bottom: insets.bottom + 142,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(24,20,17,0.92)' : 'rgba(255,255,255,0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(28,25,23,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.4 : 0.14,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 20,
  },
  mapFabPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.9,
  },

  // Bottom stack (region hint + CTA)
  bottomStack: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: insets.bottom + 10,
    gap: 12,
    zIndex: 25,
  },
  regionHintChip: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignContent: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: isDark ? 'rgba(24,20,17,0.9)' : 'rgba(255,255,255,0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(28,25,23,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.35 : 0.1,
    shadowRadius: 8,
    elevation: 6,
  },
  regionHintText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: isDark ? 'rgba(245,241,234,0.85)' : 'rgba(28,25,23,0.75)',
    textAlign: 'center',
  },
  scheduledRideChip: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: isDark ? 'rgba(43,32,7,0.92)' : 'rgba(255,247,230,0.95)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(212,175,55,0.4)' : 'rgba(179,135,55,0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.35 : 0.1,
    shadowRadius: 8,
    elevation: 6,
  },
  scheduledRideChipText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: isDark ? '#FFD666' : '#8A5800',
    textAlign: 'center',
  },
  requestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 60,
    borderRadius: 999,
    paddingLeft: 24,
    paddingRight: 13,
    backgroundColor: '#B38737',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 14,
  },
  requestButtonDisabled: {
    opacity: 0.45,
  },
  requestButtonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.95,
  },
  requestButtonLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#241A09',
  },
  requestArrowDisc: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(36,26,9,0.14)',
  },

  // Error fallback
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: colors.background,
  },
  errorIconDisc: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(198,40,40,0.1)',
    marginBottom: 18,
  },
  errorText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
    textAlign: 'center',
  },
  errorDescription: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 999,
    backgroundColor: '#B38737',
  },
  retryText: {
    color: '#241A09',
    fontSize: 15,
    fontWeight: '700',
  },
});