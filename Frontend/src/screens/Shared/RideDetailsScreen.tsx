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
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import ridesService from '../../services/ridesService';
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
  canceled: 'canceled',
  in_progress: 'inProgress',
  accepted: 'accepted',
  requested: 'requested',
};

const PAYMENT_STATUS_KEY_MAP: Record<string, string> = {
  completed: 'completed',
  pending: 'pending',
  failed: 'failed',
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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
      case 'completed': return '#4CAF50';
      case 'canceled': return '#F44336';
      case 'in_progress': return '#FF9800';
      case 'accepted': return '#2196F3';
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
      case 'completed': return '#4CAF50';
      case 'pending': return '#FF9800';
      case 'failed': return '#F44336';
      case 'no_payment_data': return '#757575';
      default: return colors.textSecondary;
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
        <TouchableOpacity style={styles.retryButton} onPress={loadRideDetails}>
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

      <RideDetailsRoute ride={ride} safeString={safeString} t={t} styles={styles} />

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
        t={t}
        styles={styles}
      />

      {!isDriver && (
        <RideDetailsVehicle ride={ride} safeString={safeString} t={t} styles={styles} />
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

const createStyles = (colors: any) => StyleSheet.create({
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
  errorEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    backgroundColor: colors.card,
    marginTop: 12,
    marginHorizontal: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface || colors.background,
    borderWidth: 0.5,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  backIcon: {
    width: 26,
    height: 26,
  },
  titleContainer: {
    flex: 1,
    marginRight: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  rideId: {
    fontSize: 12,
    letterSpacing: 0.4,
    color: colors.textSecondary,
  },
  section: {
    marginTop: 12,
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 9,
  },
  locationIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  locationText: {
    fontSize: 14,
    color: colors.text,
  },
  routeLine: {
    width: 2,
    height: 26,
    backgroundColor: colors.border,
    marginLeft: 10,
    marginVertical: 4,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  infoItem: {
    width: '50%',
    paddingVertical: 9,
    paddingRight: 8,
  },
  infoLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  notesBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: colors.surface || colors.background,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  notesText: {
    fontSize: 14,
    color: colors.text,
  },
  personName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  personDetail: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  ratingStars: {
    fontSize: 16,
    marginRight: 4,
  },
  ratingValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  vehicleName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  vehicleDetail: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dateLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  dateValue: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  cancelReason: {
    fontSize: 12,
    color: '#F44336',
    fontStyle: 'italic',
    marginTop: 4,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  priceLabel: {
    fontSize: 13,
    color: colors.text,
  },
  priceValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  priceDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  finalPriceRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 8,
    paddingTop: 12,
    backgroundColor: colors.surface || colors.background,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  finalPriceLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  finalPriceValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
  },
});
