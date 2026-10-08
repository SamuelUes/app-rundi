import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DriverStackParamList } from '../../navigation/DriverStack';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useVoiceAssistant } from '../../context/VoiceAssistantContext';
import { useLocation, DRIVER_LOCATION_OPTIONS } from '../../hooks/shared/location/useLocation';
import useDriverProximityTracking from '../../hooks/driver/DriverHomeScreen/useDriverProximityTracking';
import { subscribePreflightResult, getPreflightResult, type PreflightAction } from '../../stores/preflightStore';
import { useTranslation } from 'react-i18next';
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import DynamicMap from '../../components/map/DynamicMap';
import { useAcceptedRideListener } from '../../hooks/driver/DriverHomeScreen/useAcceptedRideListener';
import { useNearbyDriversMarkers } from '../../hooks/driver/DriverHomeScreen/useNearbyDriversMarkers';
import proximityService from '../../services/proximityService';
import type { DriverOfferCacheEntry } from '../../services/driverOfferCacheService';
import { useDriverActiveRides } from '../../hooks/driver/DriverHomeScreen/useDriverActiveRides';
import { usePendingPayments } from '../../hooks/driver/DriverHomeScreen/usePendingPayments';
import { useDriverAvailability } from '../../hooks/driver/DriverHomeScreen/useDriverAvailability';
import { useDriverWalletListener } from '../../hooks/driver/DriverHomeScreen/useDriverWalletListener';
import { useDriverInfoListener } from '../../hooks/driver/DriverHomeScreen/useDriverInfoListener';
import { useDriverPendingAction } from '../../hooks/driver/DriverHomeScreen/useDriverPendingAction';
import { useDriverVoiceAnnouncements } from '../../hooks/driver/DriverHomeScreen/useDriverVoiceAnnouncements';
import { useDriverTodayStats } from '../../hooks/driver/DriverHomeScreen/useDriverTodayStats';
import { useDriverOfferCache } from '../../hooks/driver/DriverHomeScreen/useDriverOfferCache';
import { useDriverMenu } from '../../hooks/driver/DriverHomeScreen/useDriverMenu';
import { DriverHomeHeader } from '../../components/driver/DriverHome/DriverHomeHeader';
import { DriverHomeBanners } from '../../components/driver/DriverHome/DriverHomeBanners';
import { DriverHomeSideMenu } from '../../components/driver/DriverHome/DriverHomeSideMenu';
import { DriverHomeBottomBar } from '../../components/driver/DriverHome/DriverHomeBottomBar';
import type { ImageSourcePropType } from 'react-native';

type NearbyDriverMarker = {
  id: string;
  latitude: number;
  longitude: number;
  heading?: number;
  vehicleType?: string | null;
  vehicleIconSource?: ImageSourcePropType;
};

type PendingOfferTarget = {
  entry: DriverOfferCacheEntry;
  ridePayload: Record<string, any> | null;
};

export default function DriverHomeScreenNewDesign({ navigation }: any) {
  const { t } = useTranslation();
  const { user, logout, logoutInProgress } = useAuth();
  const { settings: voiceSettings, speak: speakVoice, stopCategory: stopVoiceCategory } = useVoiceAssistant();
  const { colors, isDark } = useTheme();

  const preflightSummary = getPreflightResult();
  const initialRegion = preflightSummary?.role === 'driver' ? preflightSummary.region : undefined;

  const initialCoords =
    initialRegion &&
    typeof initialRegion.latitude === 'number' &&
    typeof initialRegion.longitude === 'number'
      ? { latitude: initialRegion.latitude, longitude: initialRegion.longitude }
      : null;

  const { coords, loading: locationLoading, error, refreshLocation } = useLocation(
    initialCoords ? { ...DRIVER_LOCATION_OPTIONS, initialCoords } : DRIVER_LOCATION_OPTIONS,
  );
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [loadingMessage, setLoadingMessage] = useState(t('driver.home.loading.initializing'));
  const [initializing, setInitializing] = useState(true);
  const pendingInitialTasks = useRef(new Set<string>(['location', 'driverInfo', 'availabilityState', 'todayStats']));

  const markTaskCompleted = useCallback((taskName: string) => {
    if (!pendingInitialTasks.current.has(taskName)) return;
    pendingInitialTasks.current.delete(taskName);
    if (pendingInitialTasks.current.size === 0) {
      setInitializing(false);
    }
  }, []);

  useAcceptedRideListener(navigation);
  useDriverProximityTracking();

  const [rechargeFundsSummaryInitial] = useState(() => {
    const summary = preflightSummary?.preflightData?.rechargeFunds;
    if (!summary) return null;
    return { availableBalance: Number(summary.availableBalance ?? 0), blocked: Boolean(summary.blocked) };
  });

  const { rechargeFundsSummary } = useDriverWalletListener(user?.id, rechargeFundsSummaryInitial, markTaskCompleted);
  const [preflightActions, setPreflightActions] = useState<PreflightAction[]>(() => preflightSummary?.actions ?? []);
  const [serviceAreaId] = useState<string | null>(initialRegion?.serviceAreaId ?? null);
  const [pendingOfferTarget, setPendingOfferTarget] = useState<PendingOfferTarget | null>(null);
  const hasInsufficientFunds = Boolean(rechargeFundsSummary?.blocked);

  const formatCurrency = useCallback(
    (value: number = 0) => `C$${Number.isFinite(value) ? value.toFixed(2) : '0.00'}`,
    [],
  );

  const {
    isAvailable, setIsAvailable,
    isDesignatedDriverMode, setIsDesignatedDriverMode,
    updatingStatus, handleAvailabilityToggle, handleDesignatedToggle,
  } = useDriverAvailability({
    userId: user?.id, userRole: user?.role, coords,
    hasInsufficientFunds, rechargeFundsSummary, tr: t, navigation, markTaskCompleted,
  });

  const { pendingPayments } = usePendingPayments({ userId: user?.id, markTaskCompleted });

  const {
    availableRideRequests, activeRide, pendingNegotiationRide,
  } = useDriverActiveRides({ userId: user?.id, coords, isAvailable, serviceAreaId, formatCurrency });

  const { currentVehicleType, currentVehicleIconSource, driverInfoCacheRef } = useDriverInfoListener(user?.id, markTaskCompleted);
  const nearbyDriversMarkers = useNearbyDriversMarkers(coords, isAvailable, user?.id, serviceAreaId, driverInfoCacheRef);
  const { offerCacheEntries } = useDriverOfferCache(user?.id);
  const { todayStats } = useDriverTodayStats(navigation, markTaskCompleted);
  const { menuVisible, menuOpacity, menuTranslate, panelWidth, openMenu, closeMenu, toggleMenu } = useDriverMenu();

  const { pendingAction } = useDriverPendingAction({
    hasInsufficientFunds, pendingPayments, pendingOfferTarget, pendingNegotiationRide,
    activeRide, preflightActions, preflightSummary, userId: user?.id, navigation, t,
  });

  useDriverVoiceAnnouncements({
    voiceSettings, isAvailable, activeRide, availableRideRequests,
    pendingAction, coords, t, speakVoice, stopVoiceCategory,
  });

  const handleNavigate = (route: keyof DriverStackParamList) => {
    closeMenu();
    navigation.navigate(route);
  };

  const handleLogout = async () => {
    if (logoutInProgress) return;
    try {
      await logout();
      closeMenu();
    } catch (error) {
      console.error('❌ Error cerrando sesión:', error);
    }
  };

  const handleRefreshLocation = useCallback(() => {
    setLoadingMessage(t('driver.home.loading.locating'));
    refreshLocation();
  }, [refreshLocation, t]);

  useEffect(() => {
    const unsubscribePreflight = subscribePreflightResult((summary) => {
      if (!summary || summary.role !== 'driver') {
        setPreflightActions([]);
        return;
      }
      setPreflightActions(summary.actions);
    });
    return () => {
      unsubscribePreflight();
      stopVoiceCategory('navigation');
      stopVoiceCategory('status');
    };
  }, [stopVoiceCategory]);

  useEffect(() => {
    if (!user?.id || !coords || !isAvailable) return;
    if (activeRide) return;
    proximityService.handleLocationForProximity(user.id, coords.latitude, coords.longitude);
    const interval = setInterval(() => {
      if (!activeRide) {
        proximityService.handleLocationForProximity(user.id, coords.latitude, coords.longitude);
      }
    }, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, coords?.latitude, coords?.longitude, isAvailable, activeRide?.id]);

  useEffect(() => {
    if (coords) {
      markTaskCompleted('location');
      return;
    }
    if (!locationLoading) {
      markTaskCompleted('location');
    }
  }, [coords, locationLoading, markTaskCompleted]);

  const hasPendingAction = Boolean(pendingAction);

  if (initializing) {
    return <LoadingOverlay visible message={loadingMessage} />;
  }

  if (locationLoading) {
    return <LoadingOverlay visible message={t('driver.home.loading.locating')} />;
  }

  if (error || !coords) {
    return (
      <View style={styles.fallbackContainer}>
        <View style={styles.fallbackIconDisc}>
          <MaterialIcons name="location-off" size={28} color="#C62828" />
        </View>
        <Text style={styles.fallbackTitle}>{t('driver.home.errors.location')}</Text>
        {Boolean(error) && <Text style={styles.fallbackText}>{error}</Text>}
        <TouchableOpacity
          style={styles.retryButton}
          activeOpacity={0.85}
          onPress={handleRefreshLocation}
        >
          <MaterialIcons name="refresh" size={18} color="#241A09" />
          <Text style={styles.retryButtonLabel}>{t('driver.home.buttons.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mapContainer}>
        <DynamicMap
          latitude={coords.latitude}
          longitude={coords.longitude}
          markerType="car"
          markerPosition={{ latitude: coords.latitude, longitude: coords.longitude }}
          rideRequests={availableRideRequests}
          markerVehicleType={currentVehicleType ?? undefined}
          markerVehicleIconSource={currentVehicleIconSource}
          markerVehicleHeading={typeof coords.heading === 'number' && Number.isFinite(coords.heading) ? coords.heading : undefined}
          onRideRequestPress={(ride: any) => {
            if (activeRide) {
              navigation.navigate('ActiveRide', { rideId: activeRide.id });
              return;
            }

            const origin = {
              lat: ride.latitude,
              lng: ride.longitude,
              address: ride.originAddress || t('driver.home.ride.originFallback'),
            };

            const destination = {
              lat: ride.destinationLat ?? ride.destination?.lat ?? ride.latitude,
              lng: ride.destinationLng ?? ride.destination?.lng ?? ride.longitude,
              address:
                ride.finalDestination ||
                ride.destinationAddress ||
                ride.destination?.address ||
                t('driver.home.ride.destinationFallback'),
            };

            const ridePreview = {
              id: String(ride.id),
              clientId: String(ride.clientId || ''),
              clientName: ride.clientName,
              origin,
              destination,
              estimatedPrice: Number.isFinite(ride.priceAmount) ? Number(ride.priceAmount) : 0,
              estimatedDistance: typeof ride.distanceKm === 'number' ? ride.distanceKm : undefined,
              clientSuggestedPrice: Number.isFinite(ride.clientSuggestedPrice) ? Number(ride.clientSuggestedPrice) : undefined,
              driverOfferedPrice: null,
              paymentMethod: ride.paymentMethod,
            };

            navigation.navigate('RidePreview', {
              ride: ridePreview,
              proximity: true,
            });
          }}
        />

        <DriverHomeHeader
          userName={user?.name}
          isAvailable={isAvailable}
          activeRideId={activeRide?.id}
          onToggleMenu={toggleMenu}
          onCloseMenu={closeMenu}
          onNavigateProfile={() => navigation.navigate('DriverProfile')}
          styles={styles}
          t={t}
        />
      </View>

      <DriverHomeBanners
        activeRide={activeRide}
        hasPendingAction={hasPendingAction}
        hasInsufficientFunds={hasInsufficientFunds}
        rechargeFundsSummary={rechargeFundsSummary}
        pendingPayments={pendingPayments}
        pendingAction={pendingAction}
        colors={colors}
        onActiveRidePress={() =>
          navigation.replace('ActiveRide', {
            rideId: activeRide.id,
            clientId: activeRide.clientId,
            origin: activeRide.origin,
            destination: activeRide.destination,
            estimatedFare: activeRide.finalFare || activeRide.estimatedPrice,
          })
        }
        onRechargePress={() => navigation.navigate('RechargeFunds')}
        onPendingPaymentPress={() => {
          const firstPayment = pendingPayments[0];
          navigation.navigate('PaymentConfirmation', {
            rideId: firstPayment.rideId,
            amount: firstPayment.finalAmount,
            method: firstPayment.method,
          });
        }}
        styles={styles}
        t={t}
      />

      <DriverHomeSideMenu
        visible={menuVisible}
        menuOpacity={menuOpacity}
        menuTranslate={menuTranslate}
        panelWidth={panelWidth}
        userName={user?.name}
        userRole={user?.role}
        colors={colors}
        onClose={closeMenu}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        styles={styles}
        t={t}
      />

      <DriverHomeBottomBar
        userRole={user?.role}
        isAvailable={isAvailable}
        isDesignatedDriverMode={isDesignatedDriverMode}
        updatingStatus={updatingStatus}
        hasPendingAction={hasPendingAction}
        hasInsufficientFunds={hasInsufficientFunds}
        todayEarnings={todayStats.earnings}
        formatCurrency={formatCurrency}
        availableRequestsCount={availableRideRequests?.length ?? 0}
        onToggleAvailability={() => handleAvailabilityToggle(!isAvailable)}
        onToggleDesignated={handleDesignatedToggle}
        onNavigateAvailableRides={() => navigation.navigate('AvailableRides')}
        onNavigateEarnings={() => navigation.navigate('Earnings')}
        styles={styles}
        t={t}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    mapContainer: {
      flex: 1,
    },

    // Map overlay chips (header controls)
    overlayHeader: {
      position: 'absolute',
      top: Platform.select({ ios: 12, android: 16 }),
      left: 16,
      right: 16,
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    leftHeaderGroup: {
      gap: 10,
      alignItems: 'center',
    },
    chipButton: {
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
    },
    emergencyChipButton: {
      width: 40,
      height: 40,
    },
    profileChip: {
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
    },
    profileAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#B38737',
    },
    profileAvatarText: {
      fontFamily: '',
      fontSize: 15,
      fontWeight: '800',
      color: '#241A09',
    },
    profileStatusDot: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      width: 13,
      height: 13,
      borderRadius: 7,
      borderWidth: 2.5,
      borderColor: isDark ? '#181411' : '#FFFFFF',
    },
    profileName: {
      fontFamily: '',
      fontSize: 15,
      fontWeight: '700',
      color: isDark ? '#F5F1EA' : '#1C1917',
      maxWidth: 128,
    },

    // Fallback (location error)
    fallbackContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 28,
      backgroundColor: colors.background,
    },
    fallbackIconDisc: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(198,40,40,0.1)',
      marginBottom: 18,
    },
    fallbackTitle: {
      fontFamily: '',
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 6,
    },
    fallbackText: {
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
    retryButtonLabel: {
      fontFamily: '',
      color: '#241A09',
      fontSize: 15,
      fontWeight: '700',
    },
    // Floating banners (stacked above the dock)
    bannerStack: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: Platform.select({ ios: 112, android: 104 }),
      gap: 10,
      zIndex: 25,
    },
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 22,
      paddingVertical: 14,
      paddingLeft: 14,
      paddingRight: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.26,
      shadowRadius: 16,
      elevation: 14,
    },
    bannerPressed: {
      transform: [{ scale: 0.98 }],
      opacity: 0.96,
    },
    bannerDanger: {
      backgroundColor: '#C62828',
    },
    bannerGold: {
      backgroundColor: '#B38737',
    },
    bannerInk: {
      backgroundColor: isDark ? '#241F1B' : '#1C1917',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.08)',
    },
    bannerIconDisc: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bannerIconDiscOnColor: {
      backgroundColor: 'rgba(255,255,255,0.2)',
    },
    bannerIconDiscOnGold: {
      backgroundColor: 'rgba(36,26,9,0.14)',
    },
    bannerIconDiscOnInk: {
      backgroundColor: 'rgba(179,135,55,0.22)',
    },
    bannerTextCol: {
      flex: 1,
      gap: 2,
    },
    bannerTitle: {
      fontFamily: '',
      fontSize: 15,
      fontWeight: '700',
    },
    bannerTitleLight: {
      color: '#FFFFFF',
    },
    bannerTitleDark: {
      color: '#241A09',
    },
    bannerSubtitle: {
      fontFamily: '',
      fontSize: 12.5,
      fontWeight: '500',
      lineHeight: 17,
    },
    bannerSubtitleLight: {
      color: 'rgba(255,255,255,0.8)',
    },
    bannerSubtitleDark: {
      color: 'rgba(36,26,9,0.72)',
    },
    bannerChevron: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bannerChevronLight: {
      backgroundColor: 'rgba(255,255,255,0.18)',
    },
    bannerChevronDark: {
      backgroundColor: 'rgba(36,26,9,0.14)',
    },
    // Side menu (floating panel)
    menuOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 50,
      alignItems: 'flex-end',
    },
    menuBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(12,9,6,0.42)',
    },
    menuContainer: {
      marginTop: Platform.select({ ios: 64, android: 72 }),
      marginBottom: Platform.select({ ios: 24, android: 20 }),
      marginRight: 12,
      backgroundColor: isDark ? '#1C1814' : 'rgba(255,255,255,0.98)',
      borderRadius: 24,
      padding: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(28,25,23,0.08)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: isDark ? 0.5 : 0.22,
      shadowRadius: 24,
      elevation: 24,
    },
    menuHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 4,
      paddingBottom: 14,
      marginBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(28,25,23,0.08)',
    },
    menuAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#B38737',
    },
    menuAvatarText: {
      fontFamily: '',
      fontSize: 17,
      fontWeight: '800',
      color: '#241A09',
    },
    menuHeaderTextCol: {
      flex: 1,
      gap: 1,
    },
    menuHeaderName: {
      fontFamily: '',
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    menuHeaderRole: {
      fontFamily: '',
      fontSize: 12,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    menuCloseBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(28,25,23,0.06)',
    },
    menuSection: {
      gap: 4,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 9,
      paddingHorizontal: 10,
      borderRadius: 16,
    },
    menuItemIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(179,135,55,0.14)',
    },
    menuLabel: {
      flex: 1,
      fontFamily: '',
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
    menuDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(28,25,23,0.08)',
      marginVertical: 10,
      marginHorizontal: 4,
    },
    logoutItem: {
      backgroundColor: 'rgba(198,40,40,0.08)',
    },
    logoutIconBadge: {
      backgroundColor: 'rgba(198,40,40,0.14)',
    },
    logoutLabel: {
      flex: 1,
      fontFamily: '',
      color: '#D32F2F',
      fontSize: 15,
      fontWeight: '700',
    },
    // Bottom dock
    bottomBar: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: Platform.select({ ios: 24, android: 20 }),
      gap: 10,
      zIndex: 30,
    },
    designatedChip: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderRadius: 999,
      backgroundColor: isDark ? '#241F1B' : '#1C1917',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.1)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.22,
      shadowRadius: 10,
      elevation: 10,
    },
    designatedChipActive: {
      backgroundColor: '#B38737',
      borderColor: 'transparent',
    },
    designatedChipDisabled: {
      opacity: 0.5,
    },
    designatedChipLabel: {
      fontFamily: '',
      fontSize: 13,
      fontWeight: '700',
      color: 'rgba(255,255,255,0.75)',
    },
    designatedChipLabelActive: {
      color: '#241A09',
    },
    dock: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 9,
      borderRadius: 30,
      backgroundColor: isDark ? '#241F1B' : '#1C1917',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.08)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.35,
      shadowRadius: 22,
      elevation: 20,
    },
    dockCompact: {
      alignSelf: 'flex-start',
    },
    availabilityButton: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    availabilityButtonOff: {
      backgroundColor: 'rgba(255,255,255,0.07)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.14)',
    },
    availabilityButtonOn: {
      backgroundColor: '#B38737',
    },
    availabilityPressed: {
      transform: [{ scale: 0.92 }],
    },
    availabilityLoadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 28,
      backgroundColor: 'rgba(0,0,0,0.32)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    earningsArea: {
      flex: 1,
      justifyContent: 'center',
      gap: 2,
      paddingLeft: 6,
      paddingVertical: 6,
      borderRadius: 20,
    },
    earningsAreaPressed: {
      backgroundColor: 'rgba(255,255,255,0.06)',
    },
    earningsLabel: {
      fontFamily: '',
      fontSize: 10.5,
      fontWeight: '700',
      letterSpacing: 1.1,
      textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.5)',
    },
    earningsValue: {
      fontFamily: '',
      fontSize: 19,
      fontWeight: '800',
      color: '#FFFFFF',
      fontVariant: ['tabular-nums'],
    },
    requestsButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#B38737',
      borderRadius: 999,
      paddingVertical: 13,
      paddingHorizontal: 16,
    },
    requestsButtonPressed: {
      transform: [{ scale: 0.96 }],
      opacity: 0.94,
    },
    requestsLabel: {
      fontFamily: '',
      fontSize: 14,
      fontWeight: '800',
      color: '#241A09',
    },
    requestsBadge: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 5,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#241A09',
    },
    requestsBadgeText: {
      fontFamily: '',
      fontSize: 11,
      fontWeight: '800',
      color: '#E8C88A',
    },
  });

