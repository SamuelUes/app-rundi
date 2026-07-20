import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  Image,
  Modal,
  TextInput,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useVoiceAssistant } from '../../context/VoiceAssistantContext';
import { getDatabase, ref, onValue } from 'firebase/database';
import priceNegotiationService from '../../services/priceNegotiationService';
import ridesService, {
  rideMatchesVehicleType,
} from '../../services/ridesService';
import { RideListSkeleton } from '../../components/ui/SkeletonLoader';
import alertService from '../../services/alertService';
import { fetchClientProfile, ClientProfile } from '../../services/clientProfilesService';
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
  haversineKm,
} from '../../utils/availableRidesHelpers';
import { AvailableRidesItem } from '../../components/driver/AvailableRides/AvailableRidesItem';
import { AvailableRidesPhotoModal } from '../../components/driver/AvailableRides/AvailableRidesPhotoModal';
import { AvailableRidesAssignModal } from '../../components/driver/AvailableRides/AvailableRidesAssignModal';

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
    loading,
    refreshing,
    selectedRideId,
    setSelectedRideId,
    activeRideGuard,
    selectedDriverVehicleType,
    handleRefresh,
  } = useAvailableRidesData(user?.id, coords, serviceAreaId);
  const [clientProfiles, setClientProfiles] = useState<Record<string, ClientProfile | null>>({});
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

    const count = rides.length;
    speakVoice(t('driver.available.voice.ridesAvailable', { count }), 'status', undefined, true);
  }, [rides.length, loading, voiceSettings.enabled, speakVoice]);

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
      if (!rideMatchesVehicleType(ride, selectedDriverVehicleType)) {
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
            vehicleId: 'temp-vehicle-id',
            currentLocation: { lat: 0, lng: 0 },
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

  const groupedRides = useMemo(() => {
    const designated: Ride[] = [];
    const standard: Ride[] = [];

    rides.forEach((ride) => {
      if ((ride.rideType || '').toLowerCase() === 'designated_driver') {
        designated.push(ride);
      } else {
        standard.push(ride);
      }
    });

    return { designated, standard };
  }, [rides]);

  type SectionItem = { id: string; type: 'section' };
  type RideListItem = Ride | SectionItem;

  const listData = useMemo<RideListItem[]>(() => {
    const items: RideListItem[] = [...groupedRides.standard];
    if (groupedRides.designated.length > 0) {
      items.push({ id: 'section-designated', type: 'section' });
      items.push(...groupedRides.designated);
    }
    return items;
  }, [groupedRides]);

  useEffect(() => {
    const missingClientIds = rides
      .map((ride) => ride.clientId)
      .filter((id): id is string => Boolean(id) && !(id in clientProfiles));

    if (missingClientIds.length === 0) {
      return;
    }

    let cancelled = false;

    const loadProfiles = async () => {
      const entries: Array<[string, ClientProfile | null]> = await Promise.all(
        missingClientIds.map(async (clientId) => {
          try {
            const profile = await fetchClientProfile(clientId);
            return [clientId, profile ?? null];
          } catch (error) {
            console.warn('[AvailableRides] Error cargando perfil de cliente', clientId, error);
            return [clientId, null];
          }
        })
      );

      if (!cancelled && entries.length) {
        setClientProfiles((prev) => {
          const next = { ...prev };
          entries.forEach(([id, profile]) => {
            next[id] = profile;
          });
          return next;
        });
      }
    };

    loadProfiles();

    return () => {
      cancelled = true;
    };
  }, [rides, clientProfiles]);

  const handleSelectRide = (rideId: string) => {
    setSelectedRideId((current) => (current === rideId ? null : rideId));
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
    };

    navigation.navigate('RidePreview', { ride: payload });
  };

  const getInitials = (name?: string, fallback: string = 'CL') => {
    if (!name) return fallback;
    const parts = name.trim().split(' ');
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  };

  const renderRideItem = ({ item }: { item: RideListItem }) => {
    if ((item as any).type === 'section') {
      return (
        <View
          style={[
            styles.designatedSection,
            isDark ? styles.designatedSectionDark : styles.designatedSectionLight,
          ]}
        >
          <Text style={styles.sectionLabel}>{t('driver.available.sections.designatedTitle')}</Text>
          <Text style={[styles.sectionSubLabel, { color: colors.text + '99' }]}>
            {t('driver.available.sections.designatedSubtitle')}
          </Text>
        </View>
      );
    }

    const ride = item as Ride;
    const profile = ride.clientId ? clientProfiles[ride.clientId] : undefined;

    return (
      <AvailableRidesItem
        ride={ride}
        profile={profile}
        selected={selectedRideId === ride.id}
        isDark={isDark}
        colors={colors}
        coords={coords}
        onSelect={() => handleSelectRide(ride.id)}
        onViewDetails={() => handleViewRideDetails(ride)}
        onViewVehiclePhoto={(url) => setPhotoModalUrl(url)}
        styles={styles}
        t={t}
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <View style={[styles.header, { borderBottomColor: colors.border }]}> 
        <TouchableOpacity
          style={[
            styles.backButton,
            isDark ? styles.backButtonDark : styles.backButtonLight,
            { borderColor: isDark ? '#343434' : '#E8E8E8' },
          ]}
          onPress={() => navigation.goBack?.()}
          activeOpacity={0.8}
        > 
          <View style={[styles.backButtonInner, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF' }]}>
            <Image source={BACK_ICON} style={[styles.backIconImage, { tintColor: isDark ? '#FFFFFF' : colors.text }]} resizeMode="contain" />
          </View>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('driver.available.header.title')}</Text>
      </View>

      <View style={styles.assignBar}>
        <TouchableOpacity
          style={[
            styles.assignButton,
            {
              borderColor: colors.border,
              backgroundColor: isDark ? '#212121' : '#FFFFFF',
              shadowColor: isDark ? '#000000' : '#B87F1E',
            },
          ]}
          onPress={() => {
            setAssignRideIdInput('');
            setAssignModalVisible(true);
          }}
          activeOpacity={0.85}
        >
          <View style={styles.assignButtonContent}>
            <View style={[styles.assignButtonAccent, { backgroundColor: colors.primary }]} />
            <Text style={[styles.assignButtonText, { color: colors.text }]}>
              {t('driver.available.assignModal.assignProgrammedButton')}
            </Text>
            <View style={[styles.assignButtonPlus, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F4EFE4' }]}>
              <Text style={[styles.assignButtonPlusText, { color: colors.primary }]}>+</Text>
            </View>
          </View>
        </TouchableOpacity>
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
          <View
            style={[
              styles.emptyStateCard,
              {
                backgroundColor: isDark ? '#1D1D1D' : '#FFFFFF',
                borderColor: isDark ? '#333333' : '#E9E9E9',
              },
            ]}
          >
            <View style={[styles.emptyStateGlow, { backgroundColor: isDark ? 'rgba(212,175,55,0.18)' : '#F9EDCC' }]} />
            <MaterialIcons name="directions-car" size={64} color={colors.textSecondary} />
            <Text style={[styles.emptyStateTitle, { color: colors.text }]}>
              {t('common.components.emptyState.noRides.title')}
            </Text>
            <Text style={[styles.emptyStateMessage, { color: colors.text + '99' }]}>
              {t('common.components.emptyState.noRides.message')}
            </Text>
            <TouchableOpacity
              onPress={handleRefresh}
              style={[styles.emptyStateButton, { backgroundColor: colors.primary }]}
              activeOpacity={0.86}
            >
              <Text style={styles.emptyStateButtonText}>{t('common.components.emptyState.noRides.action')}</Text>
            </TouchableOpacity>
          </View>
        )}
      />

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
          const rideId = normalizedAssignRideId;
          if (!rideId) {
            alertService.showErrorAlert(t('driver.available.alerts.assignInvalidId'));
            return;
          }

          setAssigningProgrammedRide(true);
          try {
            const result = await ridesService.assignDriverToProgrammedRide(rideId);
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
  assignBar: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  assignButton: {
    borderWidth: 1,
    borderRadius: 17,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  assignButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  assignButtonAccent: {
    width: 5,
    height: 24,
    borderRadius: 99,
  },
  assignButtonText: {
    flex: 1,
    fontWeight: '800',
    fontSize: 15,
    textAlign: 'left',
    letterSpacing: -0.1,
  },
  assignButtonPlus: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assignButtonPlusText: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 21,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: 20,
  },
  backButton: {
    width: 42,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
  },
  backButtonLight: {
    backgroundColor: '#F6F6F6',
  },
  backButtonDark: {
    backgroundColor: '#242424',
  },
  backButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIconImage: {
    width: 16,
    height: 16,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '800',
    marginRight: 40,
    letterSpacing: -0.3,
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
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  rideCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E5E5',
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
  selectedCardHighlight: {
    borderColor: '#D4AF37',
    borderWidth: 1.5,
    shadowColor: '#D4AF37',
    shadowOpacity: 0.2,
    elevation: 3,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
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
    fontSize: 17,
    fontWeight: '700',
  },
  detailsColumn: {
    flex: 1,
    gap: 2,
  },
  clientName: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 1,
    marginTop: 1,
    letterSpacing: -0.2,
  },
  detailLine: {
    fontSize: 14,
    lineHeight: 17,
  },
  priceLine: {
    marginTop: 1,
  },
  cardBottomRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  metaActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 1,
    gap: 8,
  },
  distancePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginBottom: 2,
  },
  distancePillLight: {
    backgroundColor: '#FFF1CC',
  },
  distancePillDark: {
    backgroundColor: 'rgba(212,175,55,0.25)',
  },
  distancePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  distanceSubLabel: {
    fontSize: 11,
    flex: 1,
    fontWeight: '600',
  },
  viewButton: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderWidth: 1,
  },
  vehicleButton: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 5,
    backgroundColor: 'transparent',
  },
  vehicleButtonText: {
    fontWeight: '700',
    fontSize: 12,
  },
  viewButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyStateCard: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 22,
    alignItems: 'center',
    overflow: 'hidden',
  },
  emptyStateGlow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    top: -55,
    right: -35,
  },
  emptyStateIcon: {
    fontSize: 52,
    marginBottom: 8,
  },
  emptyStateTitle: {
    fontSize: 31,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.4,
  },
  emptyStateMessage: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 18,
    maxWidth: 300,
  },
  emptyStateButton: {
    borderRadius: 14,
    paddingHorizontal: 26,
    paddingVertical: 11,
    minWidth: 130,
    alignItems: 'center',
  },
  emptyStateButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
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
