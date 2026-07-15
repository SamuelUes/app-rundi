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
import { LoadingIcon } from '../../components/LoadingIcon';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import ridesService from '../../services/ridesService';
import { useTranslation } from 'react-i18next';

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
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Image
              source={require('../../assets/icons/back_button/back_button2x.png')}
              style={styles.backIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>

          <View style={styles.titleContainer}>
            <Text style={styles.title}>{t('shared.rideDetail.header.title')}</Text>
          </View>

          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(safeString(ride.status)) }]}>
            <Text style={styles.statusText}>{getStatusText(safeString(ride.status))}</Text>
          </View>
        </View>
        <Text style={styles.rideId}>
          {t('shared.rideDetail.header.rideId', {
            id: typeof ride.id === 'string' ? ride.id.slice(-8) : safeString(ride.id),
          })}
        </Text>
      </View>

      {/* Ruta - Soportar múltiples destinos */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('shared.rideDetail.sections.route.title')}</Text>
        <View style={styles.card}>
          {/* Si hay múltiples paradas, mostrar todas */}
          {ride.hasMultipleStops && ride.allAddresses && ride.allAddresses.length > 0 ? (
            ride.allAddresses.map((address: string, idx: number) => (
              <View key={`route-${idx}`}>
                <View style={styles.locationRow}>
                  <MaterialIcons name={idx === 0 ? 'circle' : idx === ride.allAddresses.length - 1 ? 'place' : 'location-on'} size={16} color={idx === 0 ? '#2196F3' : idx === ride.allAddresses.length - 1 ? '#F44336' : '#FF9800'} />
                  <View style={styles.locationInfo}>
                    <Text style={styles.locationLabel}>
                      {idx === 0
                        ? t('shared.rideDetail.sections.route.origin')
                        : idx === ride.allAddresses.length - 1
                          ? t('shared.rideDetail.sections.route.destination')
                          : t('shared.rideDetail.sections.route.stop', { index: idx })}
                    </Text>
                    <Text style={styles.locationText}>{safeString(address)}</Text>
                  </View>
                </View>
                {idx < ride.allAddresses.length - 1 && <View style={styles.routeLine} />}
              </View>
            ))
          ) : (
            // Si no hay múltiples paradas, mostrar origen y destino
            <>
              <View style={styles.locationRow}>
                <MaterialIcons name="circle" size={16} color="#2196F3" />
                <View style={styles.locationInfo}>
                  <Text style={styles.locationLabel}>{t('shared.rideDetail.sections.route.origin')}</Text>
                  <Text style={styles.locationText}>{safeString(ride.originAddress)}</Text>
                </View>
              </View>
              
              <View style={styles.routeLine} />
              
              <View style={styles.locationRow}>
                <MaterialIcons name="place" size={16} color="#F44336" />
                <View style={styles.locationInfo}>
                  <Text style={styles.locationLabel}>{t('shared.rideDetail.sections.route.destination')}</Text>
                  <Text style={styles.locationText}>{safeString(ride.destinationAddress)}</Text>
                </View>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Información del Viaje */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('shared.rideDetail.sections.info.title')}</Text>
        <View style={styles.card}>
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>{t('shared.rideDetail.sections.info.distance')}</Text>
              <Text style={styles.infoValue}>
                {t('shared.rideDetail.labels.distanceKilometers', { value: distanceKm })}
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>{t('shared.rideDetail.sections.info.duration')}</Text>
              <Text style={styles.infoValue}>{formatDuration(ride.estimatedDuration)}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>{t('shared.rideDetail.sections.info.finalPrice')}</Text>
              <Text style={styles.infoValue}>{formatCurrency(finalPrice)}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>{t('shared.rideDetail.sections.info.passengers')}</Text>
              <Text style={styles.infoValue}>{safeString(ride.passengers || 1)}</Text>
            </View>
          </View>
          
          {ride.notes && typeof ride.notes === 'string' && ride.notes.trim() !== '' ? (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>{t('shared.rideDetail.sections.info.notesLabel')}</Text>
              <Text style={styles.notesText}>{ride.notes}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Información de Cliente/Conductor */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {isDriver
            ? t('shared.rideDetail.sections.person.clientTitle')
            : t('shared.rideDetail.sections.person.driverTitle')}
        </Text>
        <View style={styles.card}>
          {isDriver ? (
            ride.client && typeof ride.client === 'object' ? (
              <View>
                <Text style={styles.personName}>
                  {safeString(ride.client.name, t('shared.rideDetail.sections.person.clientFallback'))}
                </Text>
                <Text style={styles.personDetail}>{safeString(ride.client.email)}</Text>
                {ride.client.phone && typeof ride.client.phone !== 'object' ? (
                  <Text style={styles.personDetail}>{safeString(ride.client.phone)}</Text>
                ) : null}
              </View>
            ) : (
              <Text style={styles.personName}>
                {t('shared.rideDetail.sections.person.missingClient')}
              </Text>
            )
          ) : (
            ride.driver && typeof ride.driver === 'object' ? (
              <View>
                <Text style={styles.personName}>
                  {safeString(ride.driver.name, t('shared.rideDetail.sections.person.driverFallback'))}
                </Text>
                <Text style={styles.personDetail}>{safeString(ride.driver.email)}</Text>
                {ride.driver.phone && typeof ride.driver.phone !== 'object' ? (
                  <Text style={styles.personDetail}>{safeString(ride.driver.phone)}</Text>
                ) : null}
                {ride.driver.licenseNumber && typeof ride.driver.licenseNumber !== 'object' ? (
                  <Text style={styles.personDetail}>
                    {t('shared.rideDetail.sections.person.license', {
                      value: safeString(ride.driver.licenseNumber),
                    })}
                  </Text>
                ) : null}
                {ride.driver.rating && parseFloat(String(ride.driver.rating)) > 0 ? (
                  <View style={styles.ratingRow}>
                    <Text style={styles.ratingStars}>
                      {'⭐'.repeat(Math.round(parseFloat(String(ride.driver.rating))))}
                    </Text>
                    <Text style={styles.ratingValue}>
                      {parseFloat(String(ride.driver.rating)).toFixed(1)}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <Text style={styles.personName}>
                {t('shared.rideDetail.sections.person.missingDriver')}
              </Text>
            )
          )}
        </View>
      </View>

      {/* Vehículo (solo clientes) */}
      {!isDriver && ride.vehicle && typeof ride.vehicle === 'object' ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('shared.rideDetail.sections.vehicle.title')}</Text>
          <View style={styles.card}>
            <Text style={styles.vehicleName}>
              {safeString(ride.vehicle.brand)} {safeString(ride.vehicle.model)} ({safeString(ride.vehicle.year)})
            </Text>
            <Text style={styles.vehicleDetail}>
              {safeString(ride.vehicle.color)} • {safeString(ride.vehicle.plate)}
            </Text>
            {ride.vehicle.registrationNumber && typeof ride.vehicle.registrationNumber !== 'object' ? (
              <Text style={styles.vehicleDetail}>
                {t('shared.rideDetail.sections.vehicle.registration', {
                  value: safeString(ride.vehicle.registrationNumber),
                })}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Fechas */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('shared.rideDetail.sections.timeline.title')}</Text>
        <View style={styles.card}>
          {ride.requestedAt && typeof ride.requestedAt !== 'object' ? (
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>{t('shared.rideDetail.sections.timeline.requested')}</Text>
              <Text style={styles.dateValue}>{formatDateTime(ride.requestedAt)}</Text>
            </View>
          ) : null}
          {ride.acceptedAt && typeof ride.acceptedAt !== 'object' ? (
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>{t('shared.rideDetail.sections.timeline.accepted')}</Text>
              <Text style={styles.dateValue}>{formatDateTime(ride.acceptedAt)}</Text>
            </View>
          ) : null}
          {ride.startedAt && typeof ride.startedAt !== 'object' ? (
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>{t('shared.rideDetail.sections.timeline.started')}</Text>
              <Text style={styles.dateValue}>{formatDateTime(ride.startedAt)}</Text>
            </View>
          ) : null}
          {ride.completedAt && typeof ride.completedAt !== 'object' ? (
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>{t('shared.rideDetail.sections.timeline.completed')}</Text>
              <Text style={styles.dateValue}>{formatDateTime(ride.completedAt)}</Text>
            </View>
          ) : null}
          {ride.canceledAt && typeof ride.canceledAt !== 'object' ? (
            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>{t('shared.rideDetail.sections.timeline.canceled')}</Text>
                {ride.cancelReason && typeof ride.cancelReason === 'string' ? (
                  <Text style={styles.cancelReason}>
                    {t('shared.rideDetail.sections.timeline.cancelReason', {
                      reason: ride.cancelReason,
                    })}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.dateValue}>{formatDateTime(ride.canceledAt)}</Text>
            </View>
          ) : null}
          {(!ride.canceledAt || typeof ride.canceledAt === 'object') && 
           ride.cancelReason && typeof ride.cancelReason === 'string' ? (
            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>{t('shared.rideDetail.sections.timeline.canceled')}</Text>
                <Text style={styles.cancelReason}>
                  {t('shared.rideDetail.sections.timeline.cancelReason', {
                    reason: ride.cancelReason,
                  })}
                </Text>
              </View>
              <Text style={styles.dateValue}>{t('shared.rideDetail.labels.notAvailable')}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Información de Pagos */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('shared.rideDetail.sections.payment.title')}</Text>
        <View style={styles.card}>
          {/* Precio Calculado por el Sistema */}
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>{t('shared.rideDetail.sections.payment.calculated')}</Text>
            <Text style={styles.priceValue}>{formatCurrency(finalPrice)}</Text>
          </View>

          {/* Precio Sugerido por Cliente */}
          {ride.clientSuggestedPrice ? (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>{t('shared.rideDetail.sections.payment.clientSuggested')}</Text>
              <Text style={[styles.priceValue, { color: '#FF9800' }]}>
                {formatCurrency(parseFloat(String(ride.clientSuggestedPrice)))}
              </Text>
            </View>
          ) : null}

          {/* Contraoferta del Conductor */}
          {ride.driverOfferedPrice ? (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>{t('shared.rideDetail.sections.payment.driverOffered')}</Text>
              <Text style={[styles.priceValue, { color: '#2196F3' }]}>
                {formatCurrency(parseFloat(String(ride.driverOfferedPrice)))}
              </Text>
            </View>
          ) : null}

          {/* Precio Final Acordado */}
          {ride.finalFare ? (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>{t('shared.rideDetail.sections.payment.finalAgreed')}</Text>
              <Text style={[styles.priceValue, { color: '#4CAF50', fontWeight: '700' }]}>
                {formatCurrency(parseFloat(String(ride.finalFare)))}
              </Text>
            </View>
          ) : null}
          
          <View style={styles.priceDivider} />

          {/* Estado del Pago */}
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>{t('shared.rideDetail.sections.payment.status')}</Text>
            <Text style={[styles.priceValue, { color: ride.payment ? getPaymentStatusColor(ride.payment.status) : colors.textSecondary }]}>
              {ride.payment
                ? getPaymentStatusText(ride.payment.status)
                : t('shared.rideDetail.sections.payment.noPayment')}
            </Text>
          </View>
          
          {/* Comisión - Calcular si no existe */}
          {(() => {
            // Obtener precio final de forma segura
            let finalFareNum = 0;
            if (ride.finalFare) {
              finalFareNum = typeof ride.finalFare === 'string' 
                ? parseFloat(ride.finalFare) 
                : ride.finalFare;
            } else if (ride.estimatedPrice) {
              finalFareNum = typeof ride.estimatedPrice === 'string'
                ? parseFloat(ride.estimatedPrice)
                : ride.estimatedPrice;
            }
            
            // Validar que sea un número válido
            if (isNaN(finalFareNum) || finalFareNum === 0) {
              return null; // No mostrar si no hay precio válido
            }
            
            const rideType = ride.rideType || 'normal';
            const commissionRate = rideType === 'designated_driver' ? 0.25 : 0.11;
            
            // Convertir commission a número de forma segura
            let commission = 0;
            if (ride.payment?.commission) {
              commission = typeof ride.payment.commission === 'string'
                ? parseFloat(ride.payment.commission)
                : ride.payment.commission;
            } else {
              commission = finalFareNum * commissionRate;
            }
            
            // Convertir tip a número de forma segura
            let tip = 0;
            if (ride.payment?.tip) {
              tip = typeof ride.payment.tip === 'string'
                ? parseFloat(ride.payment.tip)
                : ride.payment.tip;
            }
            
            // Calcular netAmount (validar que todos sean números)
            const netAmount = finalFareNum - commission + tip;
            
            // Validar que netAmount sea un número válido
            if (isNaN(netAmount)) {
              console.error('❌ netAmount es NaN:', { finalFareNum, commission, tip });
              return null;
            }
            
            return (
              <>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>
                    {t('shared.rideDetail.sections.payment.commission', {
                      rate: Math.round(commissionRate * 100),
                    })}
                  </Text>
                  <Text style={[styles.priceValue, { color: '#F44336' }]}>
                    -{formatCurrency(commission)}
                  </Text>
                </View>
                
                {/* Propina */}
                {tip > 0 ? (
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>{t('shared.rideDetail.sections.payment.tip')}</Text>
                    <Text style={[styles.priceValue, { color: '#4CAF50' }]}>
                      {formatCurrency(tip)}
                    </Text>
                  </View>
                ) : null}
                
                {/* Pago Final al Conductor */}
                <View style={[styles.priceRow, styles.finalPriceRow]}>
                  <Text style={styles.finalPriceLabel}>{t('shared.rideDetail.sections.payment.driverPayout')}</Text>
                  <Text style={styles.finalPriceValue}>
                    {formatCurrency(netAmount)}
                  </Text>
                </View>
              </>
            );
          })()}
        </View>
      </View>

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
