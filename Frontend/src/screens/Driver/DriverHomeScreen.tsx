import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DriverStackParamList } from '../../navigation/DriverStack';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Image,
  ImageBackground,
  Animated,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from '../../components/LoadingIcon';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useVoiceAssistant } from '../../context/VoiceAssistantContext';
import { useLocation, DRIVER_LOCATION_OPTIONS } from '../../hooks/shared/location/useLocation';
import useDriverProximityTracking from '../../hooks/driver/DriverHomeScreen/useDriverProximityTracking';
import { subscribePreflightResult, getPreflightResult, type PreflightAction } from '../../stores/preflightStore';
import { useTranslation } from 'react-i18next';
import LoadingOverlay from '../../components/LoadingOverlay';
import DynamicMap from '../../components/DynamicMap';
import EmergencyButton from '../../components/EmergencyButton';
import mapsService from '../../services/mapsService';
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
    clientNamesCache,
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
    mapsService.fetchProviderFromBackend();
  }, []);

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
      <View style={[styles.fallbackContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.fallbackText, { color: colors.text }]}>
          <MaterialIcons name="error-outline" size={18} color={colors.error || '#F44336'} /> {
            error || t('driver.home.errors.location')
          }
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={handleRefreshLocation}
        >
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

        <View style={styles.overlayHeader}>
          <View style={styles.leftHeaderGroup}>
            <TouchableOpacity
              style={styles.menuButton}
              activeOpacity={0.85}
              onPress={toggleMenu}
              accessibilityRole="button"
            >
              <View style={styles.menuIconGlyph}>
                <View style={styles.menuIconLine} />
                <View style={styles.menuIconLine} />
                <View style={styles.menuIconLine} />
              </View>
            </TouchableOpacity>

            <EmergencyButton
              rideId={activeRide?.id}
              style={styles.emergencyHeaderButton}
              onOpen={closeMenu}
            />
          </View>

          <TouchableOpacity
            style={styles.rightHeaderGroup}
            activeOpacity={0.9}
            onPress={() => navigation.navigate('DriverProfile')}
          >
            <View style={styles.headerNameBubble}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {user?.name || t('driver.home.header.profileFallback')}
              </Text>
              <Image
                source={require('../../assets/icons/profile/profile-icon2.png')}
                style={styles.profileBubbleIcon}
              />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {activeRide && !hasPendingAction && (
        <TouchableOpacity
          style={styles.activeRideCard}
          onPress={() =>
            navigation.replace('ActiveRide', {
              rideId: activeRide.id,
              clientId: activeRide.clientId,
              origin: activeRide.origin,
              destination: activeRide.destination,
              estimatedFare: activeRide.finalFare || activeRide.estimatedPrice,
            })
          }
        >
          <View style={styles.activeRideIconWrapper}>
            <MaterialIcons name="directions-car" size={28} color={colors.primary} />
          </View>
          <View style={styles.activeRideContent}>
            <Text style={styles.activeRideTitle}>
              {t('driver.home.banners.activeRideTitle')}
            </Text>
            <Text style={styles.activeRideSubtitle} numberOfLines={1}>
              {activeRide?.client?.name || activeRide?.clientName || t('driver.home.ride.clientFallback')} ·{' '}
              {activeRide?.destinationAddress || t('driver.home.ride.destinationFallback')}
            </Text>
          </View>
          <Text style={styles.activeRideArrow}>→</Text>
        </TouchableOpacity>
      )}

      {/* ✅ Banner de comisiones pendientes */}
      {rechargeFundsSummary && hasInsufficientFunds && (
        <TouchableOpacity
          style={[styles.pendingBanner, { backgroundColor: '#E53935' }]}
          onPress={() => {
            navigation.navigate('RechargeFunds');
          }}
        >
          <View style={styles.pendingBannerContent}>
            <Text style={styles.pendingBannerTitle}>
              {t('driver.home.banners.rechargeTitle')}
            </Text>
            <Text style={styles.pendingBannerSubtitle}>
              {t('driver.home.banners.rechargeSubtitle', {
                amount: Number(rechargeFundsSummary.availableBalance).toFixed(2),
              })}
            </Text>
          </View>
          <Text style={styles.pendingBannerArrow}>→</Text>
        </TouchableOpacity>
      )}

      {pendingPayments.length > 0 && !hasPendingAction && !hasInsufficientFunds && (
        <TouchableOpacity
          style={styles.pendingBanner}
          onPress={() => {
            const firstPayment = pendingPayments[0];
            navigation.navigate('PaymentConfirmation', {
              rideId: firstPayment.rideId,
              amount: firstPayment.finalAmount,
              method: firstPayment.method,
            });
          }}
        >
          <View style={styles.pendingBannerIcon}>
            <Text style={styles.pendingBannerEmoji}>💳</Text>
          </View>
          <View style={styles.pendingBannerContent}>
            <Text style={styles.pendingBannerTitle}>
              {t('driver.home.banners.paymentsTitle')}
            </Text>
            <Text style={styles.pendingBannerSubtitle}>
              {pendingPayments.length === 1
                ? t('driver.home.banners.paymentsSubtitleSingle')
                : t('driver.home.banners.paymentsSubtitleOther', { count: pendingPayments.length })}
            </Text>
          </View>
          <Text style={styles.pendingBannerArrow}>→</Text>
        </TouchableOpacity>
      )}

      {pendingAction && !hasInsufficientFunds && (
        <TouchableOpacity
          style={styles.pendingActionButton}
          activeOpacity={0.85}
          onPress={pendingAction.onPress}
        >
          <ImageBackground
            source={require('../../assets/icons/pending_acction/pending_acction2x.png')}
            style={styles.pendingActionImage}
            imageStyle={styles.pendingActionImageInner}
            resizeMode="stretch"
          >
            <View style={styles.pendingActionContent}>
              <View style={styles.pendingActionTextBlock}>
                <Text style={styles.pendingActionTitle}>{pendingAction.title}</Text>
                <Text style={styles.pendingActionSubtitle} numberOfLines={1}>
                  {pendingAction.subtitle}
                </Text>
              </View>
            </View>
          </ImageBackground>
        </TouchableOpacity>
      )}

      {menuVisible && (
        <Animated.View style={[styles.menuOverlay, { opacity: menuOpacity }]}> 
          <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={closeMenu} />
          <Animated.View
            style={[
              styles.menuContainer,
              {
                transform: [{ translateX: menuTranslate }],
                width: panelWidth,
              },
            ]}
          >
            <View style={styles.menuTopAccent} />
            <View style={styles.menuHeaderRow}>
              <Text style={styles.menuHeader}>{t('driver.home.menu.title')}</Text>
              <TouchableOpacity onPress={closeMenu} style={styles.menuCloseBtn}>
                <Text style={styles.menuCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.menuSection}>
              <TouchableOpacity style={styles.menuItem} onPress={() => handleNavigate('Earnings')}>
                <View style={styles.menuIconBadge}>
                  <Text style={styles.menuEmoji}>💵</Text>
                </View>
                <Text style={styles.menuLabel}>{t('driver.home.menu.earnings')}</Text>
                <Text style={styles.menuItemArrow}>›</Text>
              </TouchableOpacity>
              {(user?.role === 'driver' || user?.role === 'designated_driver') && (
                <TouchableOpacity style={styles.menuItem} onPress={() => handleNavigate('RechargeFunds')}>
                  <View style={styles.menuIconBadge}>
                    <Text style={styles.menuEmoji}>💼</Text>
                  </View>
                  <Text style={styles.menuLabel}>{t('driver.home.menu.commissions')}</Text>
                  <Text style={styles.menuItemArrow}>›</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.menuItem} onPress={() => handleNavigate('RideHistory')}>
                <View style={styles.menuIconBadge}>
                  <Text style={styles.menuEmoji}>📜</Text>
                </View>
                <Text style={styles.menuLabel}>{t('driver.home.menu.history')}</Text>
                <Text style={styles.menuItemArrow}>›</Text>
              </TouchableOpacity>
              {/* Tarjetas desactivadas temporalmente
              <TouchableOpacity style={styles.menuItem} onPress={() => handleNavigate('PaymentMethods')}>
                <View style={styles.menuIconBadge}>
                  <Text style={styles.menuEmoji}>💳</Text>
                </View>
                <Text style={styles.menuLabel}>{t('driver.home.menu.paymentMethods')}</Text>
                <Text style={styles.menuItemArrow}>›</Text>
              </TouchableOpacity>
              */}
              <TouchableOpacity style={styles.menuItem} onPress={() => handleNavigate('Settings')}>
                <View style={styles.menuIconBadge}>
                  <MaterialIcons name="settings" size={24} color={colors.primary} />
                </View>
                <Text style={styles.menuLabel}>{t('driver.home.menu.settings')}</Text>
                <Text style={styles.menuItemArrow}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => handleNavigate('Help')}>
                <View style={styles.menuIconBadge}>
                  <MaterialIcons name="help-outline" size={24} color={colors.primary} />
                </View>
                <Text style={styles.menuLabel}>{t('driver.home.menu.help')}</Text>
                <Text style={styles.menuItemArrow}>›</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.menuDivider} />

            <TouchableOpacity style={[styles.menuItem, styles.logoutItem]} onPress={handleLogout}>
              <View style={[styles.menuIconBadge, styles.logoutIconBadge]}>
                <Text style={styles.logoutEmoji}>🚪</Text>
              </View>
              <Text style={styles.logoutLabel}>{t('driver.home.menu.logout')}</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}

      <View style={styles.bottomBar} pointerEvents="box-none">
        {user?.role === 'designated_driver' && (
          <View style={styles.designatedToggleContainer}>
            <View style={styles.iconButtonWrapper}>
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={!isAvailable}
                onPress={handleDesignatedToggle}
              >
                <View style={styles.designatedButton}>
                  <Image
                    source={
                      isDesignatedDriverMode
                      
                        ? require('../../assets/icons/ready_status/readydesignado3x.png' )
                        : require('../../assets/icons/ready_status/unready3x.png')
                    }
                    style={[styles.statusImage, !isAvailable && styles.disabledImage]}
                  />
                  {isDesignatedDriverMode && (
                    <Text style={styles.designatedStatusLabel}>{t('driver.home.designated.activeLabel')}</Text>
                  )}
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.controlsRow} pointerEvents="box-none">
          <View style={styles.iconButtonWrapper}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => handleAvailabilityToggle(!isAvailable)}
              disabled={updatingStatus}
            >
              <View style={styles.statusButtonContainer}>
                <Image
                  source={
                    isAvailable
                      ? require('../../assets/icons/ready_status/ready3x.png')
                      : require('../../assets/icons/ready_status/unready3x.png')
                  }
                  style={[styles.statusImage, updatingStatus && styles.statusImageDim]}
                />
                {updatingStatus && (
                  <View style={styles.statusLoadingOverlay}>
                    <LoadingIcon icon="refresh" size={20} color="#FFFFFF" animation="spin" />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>

          {!hasPendingAction && !hasInsufficientFunds && (
            <View style={styles.earningsSplitContainer}>
              <View style={[styles.earningsButton, styles.earningsStatsCard]}>
                <ImageBackground
                  source={require('../../assets/icons/driver_home_bar/driver_home_net2x.png')}
                  style={styles.earningsImage}
                  imageStyle={styles.earningsImageInner}
                  resizeMode="stretch"
                >
                  <View style={styles.earningsLeft}>
                    <View style={styles.earningsBadge}>
                      <Text style={styles.earningsBadgeLabel}>{t('driver.home.stats.totalToday')}</Text>
                    </View>
                    <Text style={styles.earningsValue}>{formatCurrency(todayStats.earnings)}</Text>
                  </View>
                </ImageBackground>
              </View>

              <TouchableOpacity
                style={[styles.earningsButton, styles.requestsButton]}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('AvailableRides')}
              >
                <ImageBackground
                  source={require('../../assets/icons/driver_home_bar/driver_requests2x.png')}
                  style={styles.earningsImage}
                  imageStyle={styles.earningsImageInner}
                  resizeMode="stretch"
                >
                  <View style={styles.earningsRequestsContent}>
                    <Text style={styles.earningsCta}>{t('driver.home.cta.viewRequests')}</Text>
                  </View>
                </ImageBackground>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
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
    overlayHeader: {
      position: 'absolute',
      top: Platform.select({ ios: 16, android: 24 }),
      left: 20,
      right: 20,
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    leftHeaderGroup: {
      top: 10,
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 8,
    },
    menuButton: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(17,24,39,0.88)' : 'rgba(255,255,255,0.88)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(17,24,39,0.1)',
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: 'rgba(15,23,42,0.22)',
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.26,
      shadowRadius: 8,
      elevation: 4,
    },
    menuIconGlyph: {
      width: 18,
      gap: 3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuIconLine: {
      width: '100%',
      height: 2,
      borderRadius: 10,
      backgroundColor: isDark ? '#F8FAFC' : '#111827',
    },
    emergencyHeaderButton: {
      width: 52,
      height: 52,
    },
    rightHeaderGroup: {
      top: 10,
    },
    headerNameBubble: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(15,23,42,0.9)' : 'rgba(255,255,255,0.92)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.4 : 0.18,
      shadowRadius: 10,
      elevation: 6,
    },
    headerGreeting: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.6,
      color: colors.textSecondary,
      textTransform: 'uppercase',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? '#F8FAFC' : '#111827',
      maxWidth: 140,
    },
    profileBubbleIcon: {
      width: 26,
      height: 26,
      resizeMode: 'contain',
      tintColor: isDark ? '#F8FAFC' : '#111827',
    },
    fallbackContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    fallbackText: {
      fontSize: 16,
      marginBottom: 16,
      textAlign: 'center',
    },
    retryButton: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 14,
    },
    retryButtonLabel: {
      color: '#FFFFFF',
      fontWeight: '600',
    },
    mapWrapper: {
      // removed: map now full bleed
    },
    activeRideCard: {
      position: 'absolute',
      left: 24,
      right: 24,
      bottom: 220,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#20263A',
      borderRadius: 18,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 12,
    },
    activeRideIconWrapper: {
      width: 48,
      height: 48,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.15)',
      marginRight: 12,
    },
    activeRideEmoji: {
      fontSize: 24,
    },
    activeRideContent: {
      flex: 1,
    },
    activeRideTitle: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 16,
    },
    activeRideSubtitle: {
      color: 'rgba(255,255,255,0.75)',
      fontSize: 13,
      marginTop: 4,
    },
    activeRideArrow: {
      color: '#FFFFFF',
      fontSize: 20,
      fontWeight: '700',
      marginLeft: 12,
    },
    pendingBanner: {
      position: 'absolute',
      left: 20,
      right: 20,
      bottom: 160,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FF6B6B',
      borderRadius: 18,
      padding: 18,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.28,
      shadowRadius: 10,
      elevation: 10,
    },
    pendingBannerIcon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.22)',
      marginRight: 14,
    },
    pendingBannerEmoji: {
      fontSize: 24,
    },
    pendingBannerContent: {
      flex: 1,
    },
    pendingBannerTitle: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 16,
    },
    pendingBannerSubtitle: {
      color: 'rgba(255,255,255,0.82)',
      fontSize: 13,
      marginTop: 2,
    },
    pendingBannerArrow: {
      color: '#FFFFFF',
      fontSize: 20,
      fontWeight: '700',
      marginLeft: 16,
    },
    pendingActionButton: {
      position: 'absolute',
      left: 20,
      right: 20,
      bottom: 120,
      borderRadius: 20,
      overflow: 'hidden',
      shadowColor: 'rgba(15,23,42,0.38)',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.32,
      shadowRadius: 14,
      elevation: 18,
    },
    pendingActionImage: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
    },
    pendingActionImageInner: {
      borderRadius: 18,
    },
    pendingActionContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: 12,
      paddingRight: 20,
      paddingVertical: 10,
      gap: 16,
    },
    pendingActionTextBlock: {
      flex: 1,
    },
    pendingActionTitle: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 4,
    },
    pendingActionSubtitle: {
      color: 'rgba(255,255,255,0.92)',
      fontSize: 13,
      fontWeight: '500',
    },
    pendingActionArrow: {
      color: '#FFFFFF',
      fontSize: 24,
      fontWeight: '700',
    },
    menuOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 50,
      justifyContent: 'flex-start',
      alignItems: 'flex-end',
    },
    menuBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.28)',
    },
    menuContainer: {
      marginTop: Platform.select({ ios: 66, android: 74 }),
      marginBottom: Platform.select({ ios: 24, android: 20 }),
      marginRight: 14,
      backgroundColor: isDark ? 'rgba(15,23,42,0.97)' : 'rgba(255,255,255,0.98)',
      borderRadius: 20,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)',
      shadowColor: 'rgba(15,23,42,0.36)',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.28,
      shadowRadius: 16,
      elevation: 18,
    },
    menuTopAccent: {
      height: 4,
      borderRadius: 999,
      marginHorizontal: 8,
      marginBottom: 10,
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.9)' : 'rgba(202, 138, 4, 0.82)',
    },
    menuHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
      paddingHorizontal: 6,
    },
    menuHeader: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
    },
    menuCloseBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)',
    },
    menuCloseIcon: {
      fontSize: 16,
      color: colors.text,
      fontWeight: '700',
    },
    menuSection: {
      gap: 8,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(248,250,252,0.95)',
      borderRadius: 12,
      paddingVertical: 11,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)',
    },
    menuIconBadge: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.06)',
    },
    menuEmoji: {
      fontSize: 15,
    },
    menuLabel: {
      flex: 1,
      color: colors.text,
      fontSize: 14,
      fontWeight: '500',
    },
    menuItemArrow: {
      fontSize: 20,
      lineHeight: 20,
      color: isDark ? 'rgba(248,250,252,0.72)' : 'rgba(15,23,42,0.42)',
      fontWeight: '500',
      marginRight: 2,
    },
    menuDivider: {
      height: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.1)',
      marginVertical: 14,
      marginHorizontal: 6,
    },
    logoutItem: {
      backgroundColor: isDark ? 'rgba(239,68,68,0.16)' : 'rgba(239,68,68,0.1)',
      borderColor: 'rgba(239,68,68,0.28)',
    },
    logoutIconBadge: {
      backgroundColor: isDark ? 'rgba(239,68,68,0.22)' : 'rgba(239,68,68,0.14)',
    },
    logoutEmoji: {
      fontSize: 14,
    },
    logoutLabel: {
      flex: 1,
      color: '#EF4444',
      fontSize: 14,
      fontWeight: '600',
    },
    bottomBar: {
      position: 'absolute',
      left: 20,
      right: 20,
      bottom: Platform.select({ ios: 24, android: 20 }),
      gap: 6, 
      zIndex: 30,
      //pointerEvents: 'box-none',
    },
    controlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      pointerEvents: 'box-none',
    },
    iconButtonWrapper: {
      shadowColor: 'rgba(15,23,42,0.4)',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 4,
      //borderRadius: 20,
      overflow: 'hidden',
    },
    statusImage: {
      width: 60,
      height: 60,
      resizeMode: 'cover',
    },
    statusButtonContainer: {
      width: 60,
      height: 60,
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusImageDim: {
      opacity: 0.6,
    },
    statusLoadingOverlay: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.25)',
      borderRadius: 20,
    },
    disabledImage: {
      opacity: 0.55,
    },
    designatedToggleContainer: {
      gap: 8,
    },
    designatedButton: {
      backgroundColor: 'transparent',
      borderRadius: 0,
      paddingVertical: 0,
    },
    designatedStatusLabel: {
      color: '#FFFFFF',
      fontFamily: 'PlusJakartSans',
      fontSize: 10,
      fontWeight: '600',
      alignItems: 'center',
      letterSpacing: 0.3,
      top: -56,
    },
    earningsSplitContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 12,
    },
    earningsStatsCard: {
      flexBasis: '100%',
      maxWidth: 80,
    },
    earningsButton: {
      flex: 1,
      borderRadius: 1,
      overflow: 'hidden',
      shadowColor: 'rgba(15,23,42,0.38)',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 16,
      minHeight: 56,
    },
    requestsButton: {
      flexBasis: 'auto',
    },
    earningsImage: {
      flex: 1,
      width: '100%',
      height: '100%',
      justifyContent: 'center',
    },
    earningsImageInner: {
      borderRadius: 1,
    },
    earningsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: 12,
      paddingRight: 20,
      paddingVertical: 10,
      gap: 16,
    },
    earningsLeft: {
      alignItems: 'flex-start',
      gap: 2,
    },
    earningsRequestsContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 25,
      paddingVertical: 12,
      gap: 16,
    },
    earningsBadge: {
      backgroundColor: 'transparent',
      borderRadius: 0,
      paddingHorizontal: 7,
      paddingVertical: 0,
      alignItems: 'center',
    },
    earningsBadgeLabel: {
      color: '#FFFFFF',
      fontFamily: 'PlusJakartSans',
      fontSize: 11,
      fontWeight: '600',
      alignItems: 'center',
      letterSpacing: 0.3,
    },
    earningsValue: {
      color: '#FFFFFF',
      fontFamily: 'PlusJakartSans',
      fontSize: 16,
      fontWeight: '800',
      paddingHorizontal: 10,
    },
    earningsRight: {
      alignItems: 'flex-end',
      gap: 4,
    },
    earningsCta: {
      color: '#FFFFFF',
      fontFamily: 'PlusJakartSans',
      fontSize: 17,
      paddingVertical: 6,
      fontWeight: '800',
    },
    chipDisabled: {
      opacity: 0.4,
    },
  });

