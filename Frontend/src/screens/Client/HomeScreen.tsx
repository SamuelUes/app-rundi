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
  Image,
  ImageBackground,
  Animated,
  Easing,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
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
import { useMapPinInteraction } from '../../hooks/client/HomeScreen/useMapPinInteraction';
import DynamicMap from '../../components/map/DynamicMap';
import { MAP_ICONS } from '../../constants/mapIcons';

// Importaciones para Firebase

const PROFILE_ICON_IMAGE = require('../../assets/icons/profile/profile-icon2.png');
const PENDING_ACTION_IMAGE = require('../../assets/icons/pending_acction/pending_acction2x.png');
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
  const styles = useMemo(() => createStyles(colors), [colors]);

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
  } = usePendingActions(user?.id, activeRide, navigation, t);

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
        <Text style={styles.errorText}>{t('client.home.errors.locationAccessTitle')}</Text>
        <Text style={styles.errorDescription}>{t('client.home.errors.locationAccessDescription')}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            setLoadingMessage(t('client.home.loading.obtainingLocation'));
            refreshLocation();
          }}
        >
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
        showPinBubbles
        originLabel={isResolvingAddress ? t('client.home.map.searchingAddress') : pendingAddress}
        userLocationLightIcon={USER_LOCATION_LIGHT}
        userLocationDarkIcon={USER_LOCATION_DARK}
        userLocationHoldingLightIcon={USER_LOCATION_HOLDING_LIGHT}
        userLocationHoldingDarkIcon={USER_LOCATION_HOLDING_DARK}
        manualOriginIcon={isPinLocked ? markerIcon : markerHoldIcon}
        manualOriginHoldIcon={markerHoldIcon}
        manualOriginBounceValue={isPinLocked && !isHoldingPin ? markerBounceTranslateY : undefined}
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

      <View
        style={[
          styles.locationStatusContainer,
          hasPendingManualSelection ? styles.locationStatusPending : styles.locationStatusIdle,
        ]}
      >
        <Text style={styles.locationStatusHint}>{locationStatusHint}</Text>
        {isSavingLocation && (
          <Text style={styles.locationStatusSaving}>{t('client.home.locationStatus.savingLabel')}</Text>
        )}
      </View>

      <TouchableOpacity
        style={styles.profileContainer}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('Profile')}
      >
        <Text style={styles.profileName}>{user?.name || t('client.home.profile.fallbackName')}</Text>
        <Image source={PROFILE_ICON_IMAGE} style={styles.profileAvatar} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.centerMapButton}
        onPress={handleCenterMap}
        activeOpacity={0.85}
      >
        <Text style={styles.centerMapIcon}>↻</Text>
      </TouchableOpacity>

      {pendingAction ? (
        <TouchableOpacity
          style={styles.pendingActionButton}
          activeOpacity={0.9}
          onPress={pendingAction.onPress}
        >
          <ImageBackground
            source={PENDING_ACTION_IMAGE}
            style={styles.pendingActionBackground}
            imageStyle={styles.pendingActionBackgroundInner}
            resizeMode="stretch"
          >
            <View style={styles.requestButtonContent}>
              <Text style={styles.requestButtonLabel}>{pendingAction.title}</Text>
            </View>
          </ImageBackground>
        </TouchableOpacity>
      ) : (
        <>
          <TouchableOpacity
            style={[
              styles.requestButtonWrapper,
              isOutsideSupportedArea && styles.requestButtonDisabled,
            ]}
            activeOpacity={0.9}
            onPress={handleRequestRide}
            disabled={isOutsideSupportedArea}
          >
            <ImageBackground
              source={PENDING_ACTION_IMAGE}
              style={styles.requestButtonBackground}
              imageStyle={styles.requestButtonBackgroundInner}
              resizeMode="stretch"
            >
              <View style={styles.requestButtonContent}>
                <Text style={styles.requestButtonLabel}>{t('client.home.requestRide')}</Text>
              </View>
            </ImageBackground>
          </TouchableOpacity>
          <View style={styles.regionHintContainer}>
            <Text style={styles.regionHintText} numberOfLines={2}>
              {!regionStatus.checked
                ? t('client.home.region.checking')
                : regionStatus.allowed
                ? regionStatus.areaName
                  ? t('client.home.region.availableNamed', { area: regionStatus.areaName })
                  : t('client.home.region.availableGeneric')
                : regionStatus.message || t('client.home.region.unavailableFallback')}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

// Estilos
const createStyles = (colors: any) => StyleSheet.create({
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
  locationStatusContainer: {
    position: 'absolute',
    top: 96,
    left: 45,
    right: 45,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(219, 193, 160, 0.9)',
    shadowColor: '#949393ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 8,
  },
  locationStatusPending: {
    borderColor: colors.primary,
  },
  locationStatusIdle: {
    borderColor: colors.border,
  },
  locationStatusTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  locationStatusAddress: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
    marginBottom: 6,
  },
  locationStatusHint: {
    fontSize: 16,
    color: 'rgba(131, 98, 66, 1)',
  },
  locationStatusSaving: {
    marginTop: 4,
    fontSize: 16,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  profileContainer: {
    position: 'absolute',
    top: 32,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background + 'CC',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 24,
    shadowColor: '#00000055',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  profileName: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 16,
    marginRight: 10,
  },
  profileAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  centerMapButton: {
    position: 'absolute',
    bottom: 130,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.card + 'F2',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00000055',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  centerMapIcon: {
    fontSize: 20,
    color: colors.text,
  },
  requestButtonWrapper: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 32,
    height: 64,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#00000055',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  requestButtonDisabled: {
    opacity: 0.5,
  },
  requestButtonBackground: {
    width: '100%',
    height: '100%',
  },
  requestButtonBackgroundInner: {
    borderRadius: 24,
  },
  requestButtonContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  requestButtonLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    alignItems: 'center'
  },
  requestButtonArrow: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  regionHintContainer: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 104,
    alignItems: 'center',
  },
  regionHintText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  pendingActionButton: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 32,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#00000055',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  pendingActionBackground: {
    width: '100%',
    minHeight: 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingActionBackgroundInner: {
    borderRadius: 24,
  },
  pendingActionLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  errorDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: '500',
  },
  retryButton: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 16,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  retryText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});