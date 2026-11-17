import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import ridesService from '../../services/ride/ridesService';
import { useTranslation } from 'react-i18next';
import { RideDetailsHeader } from '../../components/shared/RideDetails/RideDetailsHeader';
import { RideDetailsRoute } from '../../components/shared/RideDetails/RideDetailsRoute';
import { RideDetailsInfo } from '../../components/shared/RideDetails/RideDetailsInfo';
import { RideDetailsPerson } from '../../components/shared/RideDetails/RideDetailsPerson';
import { RideDetailsVehicle } from '../../components/shared/RideDetails/RideDetailsVehicle';
import { RideDetailsTimeline } from '../../components/shared/RideDetails/RideDetailsTimeline';
import { RideDetailsPayment } from '../../components/shared/RideDetails/RideDetailsPayment';

const STATUS_KEY_MAP: Record<string, string> = {
  completed: 'completed',
  rating_completed: 'ratingCompleted',
  rating_skipped: 'ratingSkipped',
  canceled: 'canceled',
  in_progress: 'inProgress',
  pending_payment: 'pendingPayment',
  accepted: 'accepted',
  driver_offered: 'driverOffered',
  driver_on_route: 'driverOnRoute',
  driver_arrived: 'driverArrived',
  requested: 'requested',
};

// Estados de pago SQL → clave de etiqueta. confirmed/payment_completed son
// los terminales reales del backend.
const PAYMENT_STATUS_KEY_MAP: Record<string, string> = {
  completed: 'completed',
  payment_completed: 'completed',
  confirmed: 'completed',
  pending: 'pending',
  pending_confirmation: 'pending',
  pending_capture: 'pending',
  payment_in_progress: 'pending',
  in_progress: 'pending',
  processing: 'pending',
  failed: 'failed',
  canceled: 'failed',
  no_payment_data: 'noData',
};

const DATE_LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  es: 'es-ES',
  zh: 'zh-CN',
};

export default function RideDetailsScreen({ navigation, route }: any) {
  const { rideId } = route.params;
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { t, i18n } = useTranslation();
  const dateLocale = useMemo(
    () => DATE_LOCALE_MAP[i18n.language] || DATE_LOCALE_MAP.es,
    [i18n.language],
  );

  const [ride, setRide] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRideDetails();
  }, [rideId]);

  const loadRideDetails = async () => {
    try {
      setLoading(true);
      const rideData = await ridesService.getRideDetails(rideId);
      if (rideData) {
        setRide(rideData);
      }
    } catch (error) {
      console.error('Error loading ride details:', error);
      Alert.alert(t('shared.rideDetail.alert.title'), t('shared.rideDetail.alert.message'));
    } finally {
      setLoading(false);
    }
  };

  // Helper: Convertir cualquier valor a string seguro
  const safeString = (value: any, fallback?: string): string => {
    const defaultFallback = fallback ?? t('shared.rideDetail.labels.notAvailable');
    if (value === null || value === undefined) return defaultFallback;
    if (typeof value === 'object') return defaultFallback;
    if (value === '') return defaultFallback;
    return String(value);
  };

  // Helper: Formatear fecha
  const formatDateTime = (dateString: any): string => {
    if (!dateString || typeof dateString === 'object') {
      return t('shared.rideDetail.labels.notAvailable');
    }
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return t('shared.rideDetail.labels.notAvailable');
      }
      return date.toLocaleString(dateLocale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return t('shared.rideDetail.labels.notAvailable');
    }
  };

  // Helper: Formatear duración
  const formatDuration = (seconds: any): string => {
    const sec = parseInt(String(seconds || 0));
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    if (hours > 0) {
      return t('shared.rideDetail.labels.durationHoursMinutes', { hours, minutes });
    }
    return t('shared.rideDetail.labels.durationMinutes', { minutes });
  };

  const formatCurrency = (amount: number) =>
    t('shared.rideDetail.labels.currency', { amount: amount.toFixed(2) });

  // Helper: Obtener color de estado
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed':
      case 'rating_completed':
      case 'rating_skipped':
        return '#4CAF50';
      case 'canceled': return '#F44336';
      case 'in_progress':
      case 'pending_payment':
        return '#FF9800';
      case 'accepted':
      case 'driver_offered':
      case 'driver_on_route':
      case 'driver_arrived':
        return '#2196F3';
      default: return colors.textSecondary;
    }
  };

  // Helper: Obtener texto de estado
  const getStatusText = (status: string): string => {
    const key = STATUS_KEY_MAP[status] ?? 'default';
    return t(`shared.rideDetail.status.${key}`, { status: safeString(status) });
  };

  // Helper: Obtener color de estado de pago
  const getPaymentStatusColor = (status: string): string => {
    switch (status) {
      case 'completed':
      case 'payment_completed':
      case 'confirmed':
        return '#4CAF50';
      case 'failed':
      case 'canceled':
        return '#F44336';
      case 'no_payment_data': return '#757575';
      default: return '#FF9800';
    }
  };

  // Helper: Obtener texto de estado de pago
  const getPaymentStatusText = (status: string): string => {
    const key = PAYMENT_STATUS_KEY_MAP[status] ?? 'default';
    return t(`shared.rideDetail.paymentStatus.${key}`, { status: safeString(status) });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingIcon size={32} color={colors.primary} />
        <Text style={styles.loadingText}>{t('shared.rideDetail.loading')}</Text>
      </View>
    );
  }

  if (!ride) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={48} color="#f44336" />
        <Text style={styles.errorTitle}>{t('shared.rideDetail.errors.notFound')}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={loadRideDetails}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <MaterialIcons name="refresh" size={18} color="#1A1206" />
          <Text style={styles.retryButtonText}>{t('shared.rideDetail.actions.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isDriver =
    user?.role === 'driver' || user?.role === 'designated_driver';

  const distanceMeters = Number(ride.distance ?? ride.estimatedDistance ?? 0) || 0;
  const distanceKm = (distanceMeters / 1000).toFixed(1);
  const durationSeconds = Number(ride.duration ?? ride.estimatedDuration ?? 0) || 0;

  const primaryPayment = ride.primaryPayment || null;
  const payments: any[] = Array.isArray(ride.payments) ? ride.payments : [];

  const finalPrice = (() => {
    if (ride.finalFare !== undefined && ride.finalFare !== null) {
      return Number(ride.finalFare) || 0;
    }
    if (primaryPayment?.amount !== undefined) {
      return Number(primaryPayment.amount) || 0;
    }
    if (ride.estimatedPrice !== undefined) {
      return Number(ride.estimatedPrice) || 0;
    }
    return 0;
  })();

  const commission = (() => {
    if (ride.commission !== undefined && ride.commission !== null) {
      return Number(ride.commission) || 0;
    }
    if (primaryPayment?.commission !== undefined && primaryPayment.commission !== null) {
      return Number(primaryPayment.commission) || 0;
    }
    return 0;
  })();

  const tip = primaryPayment?.tip ? Number(primaryPayment.tip) || 0 : 0;
  const driverNet = ride.payment?.finalAmount ?? (primaryPayment ? (Number(primaryPayment.amount) || 0) - commission + tip : null);

  const paymentStatus = primaryPayment?.status ?? (payments[0]?.status ?? 'no_payment_data');
  const paymentMethod = primaryPayment?.paymentMethod ?? (payments[0]?.paymentMethod ?? ride.paymentType ?? 'no_payment_data');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <RideDetailsHeader
        rideId={ride.id}
        status={ride.status}
        getStatusColor={getStatusColor}
        getStatusText={getStatusText}
        safeString={safeString}
        onBack={() => navigation.goBack()}
        t={t}
        styles={styles}
      />

      <RideDetailsRoute ride={ride} safeString={safeString} colors={colors} t={t} styles={styles} />

      <RideDetailsInfo
        ride={ride}
        distanceKm={distanceKm}
        formatDuration={formatDuration}
        formatCurrency={formatCurrency}
        finalPrice={finalPrice}
        safeString={safeString}
        t={t}
        styles={styles}
      />

      <RideDetailsPerson
        isDriver={isDriver}
        ride={ride}
        safeString={safeString}
        colors={colors}
        t={t}
        styles={styles}
      />

      {!isDriver && (
        <RideDetailsVehicle ride={ride} safeString={safeString} colors={colors} t={t} styles={styles} />
      )}

      <RideDetailsTimeline ride={ride} formatDateTime={formatDateTime} t={t} styles={styles} />

      <RideDetailsPayment
        ride={ride}
        finalPrice={finalPrice}
        formatCurrency={formatCurrency}
        getPaymentStatusColor={getPaymentStatusColor}
        getPaymentStatusText={getPaymentStatusText}
        colors={colors}
        t={t}
        styles={styles}
      />

      <View style={{ height: 28 }} />
    </ScrollView>
  );
}

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    paddingBottom: 16,
    paddingTop: 6,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 20,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 20,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#1A1206',
    fontSize: 15,
    fontWeight: '700',
  },
  header: {
    marginTop: 50,
    marginHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface || colors.background,
    borderWidth: 0.1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
    marginRight: 4,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  rideId: {
    fontSize: 11,
    letterSpacing: 0.5,
    color: colors.textTertiary || colors.textSecondary,
    marginTop: 3,
  },
  section: {
    marginTop: 16,
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  card: {
    backgroundColor: isDark ? '#2C2C2C' : '#fafafa',
    borderRadius: 18,
    padding: 16,
    borderWidth: 0.1,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 4,
  },
  routeMarkerCol: {
    width: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 15,
  },
  routeRing: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2.5,
    borderColor: colors.secondary,
  },
  routeStopDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2.5,
    borderColor: colors.warning,
  },
  routeConnector: {
    width: 2,
    height: 16,
    borderRadius: 1,
    backgroundColor: colors.border,
    marginLeft: 8,
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  locationText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    lineHeight: 20,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  infoItem: {
    width: '50%',
    paddingVertical: 8,
    paddingRight: 10,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  notesBox: {
    marginTop: 10,
    padding: 12,
    backgroundColor: colors.surface2 || colors.background,
    borderRadius: 12,
  },
  notesLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  notesText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  personAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '26',
  },
  personAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: colors.primary + '26',
  },
  personAvatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
  },
  personBody: {
    flex: 1,
  },
  personName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  personMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 4,
  },
  personDetail: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
  },
  ratingValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  vehicleTile: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface || colors.background,
  },
  vehicleIconImage: {
    width: 32,
    height: 32,
  },
  vehicleBody: {
    flex: 1,
  },
  vehicleName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 3,
  },
  vehicleDetail: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 5,
  },
  timelineMarkerCol: {
    width: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  timelineDotCanceled: {
    backgroundColor: colors.error,
  },
  timelineConnector: {
    width: 2,
    height: 12,
    borderRadius: 1,
    backgroundColor: colors.border,
    marginLeft: 8,
  },
  dateLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    paddingTop: 2,
  },
  dateValue: {
    fontSize: 12,
    color: colors.textSecondary,
    paddingTop: 4,
    fontVariant: ['tabular-nums'],
  },
  cancelReason: {
    fontSize: 12,
    color: colors.error,
    fontStyle: 'italic',
    marginTop: 4,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
  },
  priceLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  priceValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  priceDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 10,
  },
  paymentStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  paymentStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  paymentStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  payoutBand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  payoutLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1206',
  },
  payoutValue: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1A1206',
    fontVariant: ['tabular-nums'],
  },
});
