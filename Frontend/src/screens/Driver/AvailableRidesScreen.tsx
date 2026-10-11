import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  Image,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useVoiceAssistant } from '../../context/VoiceAssistantContext';
import { getDatabase, ref, onValue } from 'firebase/database';
import priceNegotiationService from '../../services/priceNegotiationService';
import ridesService from '../../services/ridesService';
import { RideListSkeleton } from '../../components/ui/SkeletonLoader';
import alertService from '../../services/alertService';
import { hasSavedCard } from '../../utils/cardUtils';
import { useLocation } from '../../hooks/shared/location/useLocation';
import { useAcceptedRideListener } from '../../hooks/driver/DriverHomeScreen/useAcceptedRideListener';
import { useAvailableRidesData } from '../../hooks/driver/AvailableRidesScreen/useAvailableRidesData';
import rechargeFundsService from '../../services/rechargeFundsService';
import { getPreflightResult } from '../../stores/preflightStore';
import { useTranslation } from 'react-i18next';
import {
  type Ride,
  extractProgrammedRideId,
  checkRideDriverCompatibility,
  isDesignatedRideRequest,
} from '../../utils/availableRidesHelpers';
import { AvailableRidesItem } from '../../components/driver/AvailableRides/AvailableRidesItem';
import { AvailableRidesPhotoModal } from '../../components/driver/AvailableRides/AvailableRidesPhotoModal';
import { AvailableRidesAssignModal } from '../../components/driver/AvailableRides/AvailableRidesAssignModal';
import { AvailableRidesEmpty } from '../../components/driver/AvailableRides/AvailableRidesEmpty';
import { AvailableRidesOffline } from '../../components/driver/AvailableRides/AvailableRidesOffline';
import driversService from '../../services/driversService';
import driverAvailabilityService from '../../services/driverAvailabilityService';

const BACK_ICON = require('../../assets/icons/back_button/back_button2x.png');

const SCREEN_ENTRY_WINDOW_MS = 3000;
let screenEntryCountInWindow = 0;
let screenEntryWindowStartTs = 0;

export default function AvailableRidesScreeNewDesign({ navigation }: any) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const { coords } = useLocation();
  const { settings: voiceSettings, speak: speakVoice, stopCategory: stopCategory } = useVoiceAssistant();

  const preflightSummary = getPreflightResult();
  const initialRegion = preflightSummary?.role === 'driver' ? preflightSummary.region : undefined;
  const [serviceAreaId] = useState<string | null>(initialRegion?.serviceAreaId ?? null);

  const {
    rides,
    scheduledRides,
    loading,
    refreshing,
    selectedRideId,
    setSelectedRideId,
    activeRideGuard,
    selectedDriverVehicleType,
    driverIsDesignatedMode,
    isDriverOnline,
    driverStatusLoaded,
    handleRefresh,
  } = useAvailableRidesData(user?.id, coords, serviceAreaId);
  const [rechargeFundsSummary, setRechargeFundsSummary] = useState<{ availableBalance: number; blocked: boolean } | null>(
    () => {
      const summary = preflightSummary?.preflightData?.rechargeFunds;
      if (!summary) {
        return null;
      }
      return {
        availableBalance: Number(summary.availableBalance ?? 0),
        blocked: Boolean(summary.blocked),
      };
    },
  );
  const isScreenFocusedRef = useRef(false);
  const [photoModalUrl, setPhotoModalUrl] = useState<string | null>(null);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [assignRideIdInput, setAssignRideIdInput] = useState('');
  const [assigningProgrammedRide, setAssigningProgrammedRide] = useState(false);
  const [activatingAvailability, setActivatingAvailability] = useState(false);
  const normalizedAssignRideId = useMemo(
    () => extractProgrammedRideId(assignRideIdInput),
    [assignRideIdInput],
  );

  useEffect(() => {
    const focusUnsubscribe = navigation.addListener('focus', () => {
      isScreenFocusedRef.current = true;

      const now = Date.now();
      if (!screenEntryWindowStartTs || now - screenEntryWindowStartTs > SCREEN_ENTRY_WINDOW_MS) {
        screenEntryWindowStartTs = now;
        screenEntryCountInWindow = 1;
      } else {
        screenEntryCountInWindow += 1;
      }

      console.log('🟣 [AvailableRidesScreeNewDesign] ENTRADAS AL SCREEN EN VENTANA DE 3s', {
        countInWindow: screenEntryCountInWindow,
        windowStartedAt: screenEntryWindowStartTs,
        now,
        elapsedMsSinceWindowStart: now - screenEntryWindowStartTs,
      });
    });
    const blurUnsubscribe = navigation.addListener('blur', () => {
      isScreenFocusedRef.current = false;
    });

    return () => {
      focusUnsubscribe();
      blurUnsubscribe();
    };
  }, [navigation]);

  useEffect(() => {
    if (!voiceSettings.enabled) return;
    if (!isScreenFocusedRef.current) return;
    if (loading) return;
    if (!isDriverOnline) return;

    const count = rides.length;
    speakVoice(t('driver.available.voice.ridesAvailable', { count }), 'status', undefined, true);
  }, [rides.length, loading, voiceSettings.enabled, speakVoice, isDriverOnline]);

  useEffect(() => {
    return () => {
      stopCategory('navigation');
      stopCategory('status');
    };
  }, [stopCategory]);

  // Monitorear rides aceptados globalmente
  useAcceptedRideListener(navigation);

  // 🔒 Guard: Si ya tengo un viaje activo, redirigir a ActiveRide
  useEffect(() => {
    if (activeRideGuard) {
      navigation.replace('ActiveRide', { rideId: activeRideGuard.id });
    }
  }, [activeRideGuard, navigation]);

  // ✅ Realtime DB: resumen de fondos del conductor
  useEffect(() => {
    if (!user?.id) return;
    const db = getDatabase();
    const walletRef = ref(db, `drivers/${user.id}/wallet`);
    let active = true;

    const unsubscribe = onValue(
      walletRef,
      (snapshot) => {
        if (!active) return;
        const data = snapshot.val() || {};
        const availableBalance = Number(
          data.availableBalance ?? data.balance ?? data.currentBalance ?? data.currentRechargeBalance ?? 0,
        );
        setRechargeFundsSummary({
          availableBalance: Number.isFinite(availableBalance) ? availableBalance : 0,
          blocked: Boolean(data.blocked) || Number(availableBalance || 0) <= 0,
        });
      },
      (err) => {
        console.error('❌ [AvailableRidesScreeNewDesign] Error escuchando wallet del conductor:', err);
      },
    );

    const navUnsubscribe = navigation?.addListener?.('focus', async () => {
      try {
        const summary = await rechargeFundsService.getSummary(10);
        setRechargeFundsSummary({
          availableBalance: Number(summary.availableBalance || 0),
          blocked: Boolean(summary.blocked),
        });
      } catch (error) {
        console.warn('⚠️ [AvailableRidesScreeNewDesign] No se pudo refrescar resumen de fondos:', error);
      }
    });

    return () => {
      active = false;
      unsubscribe();
      navUnsubscribe?.();
    };
  }, [navigation, user?.id]);

  const ensureCardForCardPayments = async (ride: Ride): Promise<boolean> => {
    const ridePaymentMethod = ride?.paymentMethod || ride?.rideType;
    if ((ridePaymentMethod || '').toLowerCase() !== 'card') {
      return true;
    }

    if (await hasSavedCard()) {
      return true;
    }

    alertService.showConfirmAlert(
      t('driver.available.alerts.cardRequiredTitle'),
      t('driver.available.alerts.cardRequiredBody'),
      () => {
        // navigation.navigate('PaymentMethods');
      },
      undefined,
      t('driver.available.alerts.cardRequiredConfirm'),
      t('driver.available.alerts.cardRequiredCancel'),
    );

    return false;
  };

  const handleAcceptRide = async (ride: Ride) => {
    try {
      if (!checkRideDriverCompatibility(ride, selectedDriverVehicleType, driverIsDesignatedMode).ok) {
        alertService.showErrorAlert(t('driver.available.alerts.errorAcceptRide'));
        return;
      }

      // 🔒 Bloquear aceptar si ya tengo un viaje activo
      if (activeRideGuard) {
        alertService.showInfoAlert(
          t('driver.available.alerts.activeRideTitle'),
          t('driver.available.alerts.activeRideBody'),
          () => navigation.replace('ActiveRide', { rideId: activeRideGuard.id })
        );
        return;
      }

      // ✅ Bloquear aceptar si no hay fondos disponibles
      if (rechargeFundsSummary && (Number(rechargeFundsSummary.availableBalance) <= 0 || rechargeFundsSummary.blocked)) {
        const currentBalance = Number(rechargeFundsSummary.availableBalance || 0).toFixed(2);
        alertService.showInfoAlert(
          t('driver.available.alerts.rechargeRequiredTitle'),
          t('driver.available.alerts.rechargeRequiredBody', { amount: currentBalance }),
          () => navigation.navigate('RechargeFunds'),
        );
        return;
      }

      if (!(await ensureCardForCardPayments(ride))) {
        return;
      }

      if (
        (typeof ride.clientSuggestedPrice === 'number' &&
          Number.isFinite(ride.clientSuggestedPrice) &&
          ride.clientSuggestedPrice > 0) ||
        (typeof ride.estimatedPrice === 'number' &&
          Number.isFinite(ride.estimatedPrice) &&
          ride.estimatedPrice > 0)
      ) {
        try {
          const priceToShow =
            typeof ride.clientSuggestedPrice === 'number' &&
            Number.isFinite(ride.clientSuggestedPrice) &&
            ride.clientSuggestedPrice > 0
              ? ride.clientSuggestedPrice
              : ride.estimatedPrice;

          await priceNegotiationService.acceptClientPrice(ride.id);

          alertService.showSuccessAlert(
            t('driver.available.alerts.offerSentTitle'),
            t('driver.available.alerts.offerAcceptedBody', { amount: Number(priceToShow).toFixed(2) }),
          );

          navigation.replace('WaitingClientConfirmation', {
            rideId: ride.id,
            clientId: ride.clientId,
            origin: ride.origin,
            destination: ride.destination,
            estimatedFare: ride.clientSuggestedPrice,
            extraDestinations: (ride.extraDestinations || []).map((stop) => ({
              lat: stop.lat,
              lng: stop.lng,
              address: stop.address,
            })),
          });
        } catch (error: any) {
          console.error('❌ Error completo:', error);
          alertService.showErrorAlert(error?.message || t('driver.available.alerts.errorSendOffer'));
        }
      } else {
        try {
          const acceptData = {
            driverId: user?.id || '',
          };

          await ridesService.acceptRide(ride.id, acceptData);

          alertService.showSuccessAlert(
            t('driver.available.alerts.offerSentTitle'),
            t('driver.available.alerts.offerGenericBody'),
          );

          navigation.replace('WaitingClientConfirmation', {
            rideId: ride.id,
            clientId: ride.clientId,
            origin: ride.origin,
            destination: ride.destination,
            estimatedFare: ride.estimatedPrice,
            extraDestinations: (ride.extraDestinations || []).map((stop) => ({
              lat: stop.lat,
              lng: stop.lng,
              address: stop.address,
            })),
          });
        } catch (error: any) {
          alertService.showErrorAlert(error?.message || t('driver.available.alerts.errorAcceptRide'));
        }
      }
    } catch (error: any) {
      alertService.showErrorAlert(error?.message || t('driver.available.alerts.errorAcceptRide'));
    }
  };

  const handleGoOnline = useCallback(async () => {
    if (!user?.id || activatingAvailability) return;

    setActivatingAvailability(true);
    try {
      const location = coords
        ? { latitude: coords.latitude, longitude: coords.longitude }
        : undefined;
      const result = await driversService.updateStatus('available', location);
      const status = String(result?.status || '').toLowerCase();

      if (status === 'available' || status === 'busy') {
        await driverAvailabilityService.saveAvailabilityState({
          isAvailable: true,
          isDesignatedDriverMode: driverIsDesignatedMode,
          lastUpdate: new Date().toISOString(),
          coords: location,
        });
        if (location) {
          driverAvailabilityService.startHeartbeat(location);
        }
      } else {
        alertService.showErrorAlert(t('driver.home.alerts.availabilityUpdateFailed'));
      }
    } catch (error: any) {
      alertService.showErrorAlert(
        error?.message || t('driver.home.alerts.availabilityUpdateFailed'),
      );
    } finally {
      setActivatingAvailability(false);
    }
  }, [user?.id, activatingAvailability, coords, driverIsDesignatedMode, t]);

  const groupedRides = useMemo(() => {
    const designated: Ride[] = [];
    const standard: Ride[] = [];

    rides.forEach((ride) => {
      if (isDesignatedRideRequest(ride)) {
        designated.push(ride);
      } else {
        standard.push(ride);
      }
    });

    return { designated, standard };
  }, [rides]);

  type SectionItem = { id: string; type: 'section'; kind: 'designated' | 'scheduled' };
  type RideListItem = Ride | SectionItem;

  const listData = useMemo<RideListItem[]>(() => {
    const items: RideListItem[] = [];
    if (scheduledRides.length > 0) {
      items.push({ id: 'section-scheduled', type: 'section', kind: 'scheduled' });
      items.push(...scheduledRides);
    }
    items.push(...groupedRides.standard);
    if (groupedRides.designated.length > 0) {
      items.push({ id: 'section-designated', type: 'section', kind: 'designated' });
      items.push(...groupedRides.designated);
    }
    return items;
  }, [groupedRides, scheduledRides]);

  const handleSelectRide = (rideId: string) => {
    setSelectedRideId((current) => (current === rideId ? null : rideId));
  };

  const [confirmingScheduledRideId, setConfirmingScheduledRideId] = useState<string | null>(null);

  const handleConfirmScheduledRide = async (ride: Ride) => {
    if (confirmingScheduledRideId) {
      return;
    }
    setConfirmingScheduledRideId(ride.id);
    try {
      await ridesService.confirmProgrammedRideDriver(ride.id);
      alertService.showSuccessAlert(
        t('driver.available.alerts.scheduledConfirmedTitle'),
        t('driver.available.alerts.scheduledConfirmedBody'),
      );
    } catch (error: any) {
      alertService.showErrorAlert(
        error?.message || t('driver.available.alerts.scheduledConfirmError'),
      );
    } finally {
      setConfirmingScheduledRideId(null);
    }
  };

  const handleViewRideDetails = (ride: Ride) => {
    if (typeof navigation?.navigate !== 'function') {
      return;
    }

    const originLat = ride.origin?.lat ?? 0;
    const originLng = ride.origin?.lng ?? 0;
    const destinationLat = ride.destination?.lat ?? 0;
    const destinationLng = ride.destination?.lng ?? 0;

    const payload = {
      id: ride.id,
      clientId: ride.clientId,
      clientName: ride.clientName,
      clientPhone: ride.clientPhone,
      origin: {
        lat: originLat,
        lng: originLng,
        address: ride.origin?.address || t('driver.available.rideCard.placeholders.originAddress'),
      },
      destination: {
        lat: destinationLat,
        lng: destinationLng,
        address: ride.destination?.address || t('driver.available.rideCard.placeholders.destinationAddress'),
      },
      extraDestinations: (ride.extraDestinations || []).map((stop) => ({
        lat: stop.lat,
        lng: stop.lng,
        address: stop.address,
      })),
      estimatedPrice: ride.estimatedPrice || 0,
      estimatedDistance: ride.estimatedDistance,
      estimatedDuration: ride.estimatedDuration,
      clientSuggestedPrice: ride.clientSuggestedPrice,
      driverOfferedPrice: ride.driverOfferedPrice,
      paymentMethod: ride.paymentMethod,
      rideType: ride.rideType,
      clientVehiclePhoto: ride.clientVehiclePhoto || null,
      clientComment: ride.clientComment,
      isProgrammed: Boolean(ride.isProgrammed),
      scheduledAt: ride.scheduledAt ?? null,
    };

    navigation.navigate('RidePreview', { ride: payload });
  };

  const renderRideItem = ({ item }: { item: RideListItem }) => {
    if ((item as any).type === 'section') {
      const section = item as SectionItem;
      const isScheduledSection = section.kind === 'scheduled';
      return (
        <View
          style={[
            styles.designatedSection,
            isDark ? styles.designatedSectionDark : styles.designatedSectionLight,
          ]}
        >
          <View style={styles.sectionTitleRow}>
            <MaterialIcons
              name={isScheduledSection ? 'event' : 'verified-user'}
              size={15}
              color={isDark ? '#FFD666' : '#D18A1B'}
            />
            <Text style={styles.sectionLabel}>
              {isScheduledSection
                ? t('driver.available.sections.scheduledTitle')
                : t('driver.available.sections.designatedTitle')}
            </Text>
          </View>
          <Text style={[styles.sectionSubLabel, { color: colors.text + '99' }]}>
            {isScheduledSection
              ? t('driver.available.sections.scheduledSubtitle')
              : t('driver.available.sections.designatedSubtitle')}
          </Text>
        </View>
      );
    }

    const ride = item as Ride;

    return (
      <AvailableRidesItem
        ride={ride}
        selected={selectedRideId === ride.id}
        isDark={isDark}
        colors={colors}
        coords={coords}
        onSelect={() => handleSelectRide(ride.id)}
        onViewDetails={() => handleViewRideDetails(ride)}
        onViewVehiclePhoto={(url) => setPhotoModalUrl(url)}
        onConfirmScheduled={
          ride.isProgrammed ? () => handleConfirmScheduledRide(ride) : undefined
        }
        confirmingScheduled={confirmingScheduledRideId === ride.id}
        styles={styles}
        t={t}
      />
    );
  };

  const fundsLow =
    rechargeFundsSummary != null &&
    (rechargeFundsSummary.blocked || Number(rechargeFundsSummary.availableBalance) <= 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [
            styles.headerIconButton,
            {
              backgroundColor: isDark ? '#242424' : '#F6F6F6',
              borderColor: isDark ? '#343434' : '#E8E8E8',
            },
            pressed && { opacity: 0.75, transform: [{ scale: 0.95 }] },
          ]}
          onPress={() => navigation.goBack?.()}
          accessibilityRole="button"
          accessibilityLabel={t('common.actions.back')}
        >
          <Image
            source={BACK_ICON}
            style={[styles.backIconImage, { tintColor: isDark ? '#FFFFFF' : colors.text }]}
            resizeMode="contain"
          />
        </Pressable>

        <View style={styles.headerTextWrap}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {t('driver.available.header.title')}
          </Text>
          {rides.length > 0 ? (
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              {t('driver.available.header.count', { count: rides.length })}
            </Text>
          ) : null}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.headerIconButton,
            {
              backgroundColor: isDark ? '#242424' : '#F6F6F6',
              borderColor: isDark ? '#343434' : '#E8E8E8',
            },
            pressed && { opacity: 0.75, transform: [{ scale: 0.95 }] },
          ]}
          onPress={handleRefresh}
          disabled={refreshing}
          accessibilityRole="button"
          accessibilityLabel={t('common.components.emptyState.noRides.action')}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <MaterialIcons name="refresh" size={20} color={isDark ? '#FFFFFF' : colors.text} />
          )}
        </Pressable>
      </View>

      {driverStatusLoaded && !isDriverOnline ? (
        <View style={styles.offlineGateWrap}>
          <AvailableRidesOffline
            isDark={isDark}
            colors={colors}
            activating={activatingAvailability}
            onActivate={handleGoOnline}
            styles={styles}
            t={t}
          />
        </View>
      ) : (
        <>
      {fundsLow ? (
        <Pressable
          style={({ pressed }) => [
            styles.fundsBanner,
            {
              backgroundColor: isDark ? 'rgba(255,183,77,0.10)' : 'rgba(255,167,38,0.10)',
              borderColor: isDark ? 'rgba(255,183,77,0.4)' : '#F0C878',
            },
            pressed && { opacity: 0.85 },
          ]}
          onPress={() => navigation.navigate('RechargeFunds')}
          accessibilityRole="button"
        >
          <View
            style={[
              styles.fundsBannerIcon,
              { backgroundColor: isDark ? 'rgba(255,183,77,0.18)' : 'rgba(255,167,38,0.2)' },
            ]}
          >
            <MaterialIcons
              name="account-balance-wallet"
              size={16}
              color={isDark ? '#FFB74D' : '#8A5800'}
            />
          </View>
          <View style={styles.fundsBannerTextWrap}>
            <Text style={[styles.fundsBannerTitle, { color: isDark ? '#FFB74D' : '#8A5800' }]}>
              {t('driver.available.fundsBanner.title')}
            </Text>
            <Text style={[styles.fundsBannerBody, { color: colors.text + '99' }]} numberOfLines={2}>
              {t('driver.available.fundsBanner.body', {
                amount: Number(rechargeFundsSummary?.availableBalance ?? 0).toFixed(2),
              })}
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={colors.text + '66'} />
        </Pressable>
      ) : null}

      <View style={styles.assignBar}>
        <Pressable
          style={({ pressed }) => [
            styles.assignButton,
            {
              borderColor: colors.border,
              backgroundColor: isDark ? '#212121' : '#FFFFFF',
              shadowColor: isDark ? '#000000' : '#B87F1E',
            },
            pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
          ]}
          onPress={() => {
            setAssignRideIdInput('');
            setAssignModalVisible(true);
          }}
          accessibilityRole="button"
        >
          <View
            style={[
              styles.assignIconWrap,
              { backgroundColor: isDark ? 'rgba(212,175,55,0.18)' : 'rgba(179,135,55,0.12)' },
            ]}
          >
            <MaterialIcons name="event-note" size={17} color={colors.primary} />
          </View>
          <Text style={[styles.assignButtonText, { color: colors.text }]}>
            {t('driver.available.assignModal.assignProgrammedButton')}
          </Text>
          <View style={[styles.assignButtonPlus, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="add" size={16} color="#FFFFFF" />
          </View>
        </Pressable>
      </View>

      <FlatList
        data={listData}
        renderItem={renderRideItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, listData.length === 0 && styles.listContentEmpty]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={loading ? (
          <RideListSkeleton />
        ) : (
          <AvailableRidesEmpty
            isDark={isDark}
            colors={colors}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            styles={styles}
            t={t}
          />
        )}
      />
        </>
      )}

      <AvailableRidesPhotoModal
        visible={!!photoModalUrl}
        photoUrl={photoModalUrl}
        isDark={isDark}
        colors={colors}
        onClose={() => setPhotoModalUrl(null)}
        styles={styles}
        t={t}
      />

      <AvailableRidesAssignModal
        visible={assignModalVisible}
        assignRideIdInput={assignRideIdInput}
        normalizedAssignRideId={normalizedAssignRideId}
        assigningProgrammedRide={assigningProgrammedRide}
        isDark={isDark}
        colors={colors}
        onInputChange={setAssignRideIdInput}
        onCancel={() => setAssignModalVisible(false)}
        onConfirm={async () => {
          const codeCandidate = assignRideIdInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
          const isClaimCode = /^[A-Z0-9]{6}$/.test(codeCandidate);
          const rideId = normalizedAssignRideId;

          if (!isClaimCode && !rideId) {
            alertService.showErrorAlert(t('driver.available.alerts.assignInvalidId'));
            return;
          }

          setAssigningProgrammedRide(true);
          try {
            const result = isClaimCode
              ? await ridesService.claimProgrammedRideByCode(codeCandidate)
              : await ridesService.assignDriverToProgrammedRide(rideId as string);
            if (!result?.success) {
              throw new Error(result?.message || 'No se pudo asignar el viaje programado.');
            }
            alertService.showSuccessAlert(
              t('driver.available.alerts.assignSuccessTitle'),
              t('driver.available.alerts.assignSuccessBody'),
              {
                duration: 3500,
              },
            );
            setAssignModalVisible(false);
            setAssignRideIdInput('');
          } catch (err: any) {
            alertService.showErrorAlert(
              err?.message || t('driver.available.alerts.assignError'),
            );
          } finally {
            setAssigningProgrammedRide(false);
          }
        }}
        styles={styles}
        t={t}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 40,
  },
  headerIconButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
  },
  backIconImage: {
    width: 17,
    height: 17,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  fundsBanner: {
    marginHorizontal: 16,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fundsBannerIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fundsBannerTextWrap: {
    flex: 1,
  },
  fundsBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  fundsBannerBody: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
    lineHeight: 16,
  },
  assignBar: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 12,
  },
  assignButton: {
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  assignIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assignButtonText: {
    flex: 1,
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: -0.1,
  },
  assignButtonPlus: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  offlineGateWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  designatedSection: {
    padding: 14,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  designatedSectionLight: {
    backgroundColor: '#FFF7E5',
    borderColor: '#F5D38C',
  },
  designatedSectionDark: {
    backgroundColor: 'rgba(209,138,27,0.15)',
    borderColor: '#D18A1B',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#D18A1B',
  },
  sectionSubLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  rideCard: {
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  rideCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7E7E7',
  },
  rideCardDark: {
    backgroundColor: '#1F1F1F',
    borderColor: '#303030',
    shadowOpacity: 0.2,
  },
  designatedCard: {
    borderColor: '#E3C580',
    backgroundColor: '#FFF9F0',
  },
  designatedCardDark: {
    borderColor: '#D4AF37',
    backgroundColor: '#2B2007',
  },
  scheduledCardLight: {
    borderStyle: 'dashed',
    opacity: 0.82,
    shadowOpacity: 0,
    elevation: 0,
  },
  scheduledCardDark: {
    borderStyle: 'dashed',
    opacity: 0.82,
    shadowOpacity: 0,
    elevation: 0,
  },
  scheduledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  scheduledBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.1,
    flexShrink: 1,
  },
  scheduledBannerDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
  },
  scheduledBannerStatus: {
    fontSize: 11.5,
    fontWeight: '600',
    flexShrink: 1,
  },
  selectedCardHighlight: {
    borderColor: '#b38737',
    borderWidth: 1.5,
    backgroundColor: 'rgba(179,135,55,0.05)',
    shadowColor: '#b38737',
    shadowOpacity: 0.2,
    elevation: 3,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  avatarPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 13,
  },
  avatarPlaceholderLight: {
    backgroundColor: '#F2F2F2',
  },
  avatarPlaceholderDark: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  avatarInitials: {
    fontSize: 16,
    fontWeight: '800',
  },
  cardHeaderColumn: {
    flex: 1,
    paddingTop: 1,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  metaChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 6,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  metaChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  priceColumn: {
    alignItems: 'flex-end',
    paddingTop: 2,
    paddingLeft: 4,
  },
  priceValue: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  routeBlock: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 10,
  },
  routeRail: {
    width: 12,
    alignItems: 'center',
    paddingVertical: 5,
  },
  routeDotOrigin: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  routeConnector: {
    width: 2,
    flex: 1,
    minHeight: 12,
    marginVertical: 3,
    borderRadius: 1,
  },
  routeDotDestination: {
    width: 9,
    height: 9,
    borderRadius: 2.5,
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  routeTexts: {
    flex: 1,
    gap: 8,
  },
  routeText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  commentBubble: {
    flexDirection: 'row',
    gap: 6,
    borderRadius: 10,
    padding: 9,
    marginTop: 12,
  },
  commentIcon: {
    marginTop: 1,
  },
  commentText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  cardActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  vehicleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 7,
    backgroundColor: 'transparent',
  },
  vehicleButtonText: {
    fontWeight: '700',
    fontSize: 12,
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  viewButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  emptyStateCard: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 28,
    alignItems: 'center',
    overflow: 'hidden',
  },
  emptyStateGlow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    top: -70,
    right: -45,
  },
  radarWrap: {
    width: 130,
    height: 130,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  radarRing: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1.5,
  },
  radarCoreOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarCoreInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  emptyStateMessage: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 18,
    maxWidth: 280,
  },
  emptyStateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  emptyStateButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  emptyHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 14,
  },
  emptyHintText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modalContent: {
    width: '100%',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  modalImage: {
    width: '100%',
    height: 320,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: '#000',
  },
  closeModalButton: {
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  closeModalText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },

  assignOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  assignModalCard: {
    width: '100%',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  assignModalTopAccent: {
    alignSelf: 'center',
    width: 56,
    height: 4,
    borderRadius: 99,
    marginBottom: 12,
  },
  assignModalTitle: {
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  assignModalSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 14,
  },
  assignInputWrap: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 7,
    paddingBottom: 8,
  },
  assignInputLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  assignInput: {
    paddingVertical: 0,
    fontSize: 14,
  },
  assignActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  assignActionButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignCancelButton: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  assignActionText: {
    fontWeight: '800',
    fontSize: 14,
  },
  assignActionTextPrimary: {
    fontWeight: '800',
    fontSize: 14,
    color: '#FFFFFF',
  },
});
