import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import SupportChatShortcut from '../../components/shared/SupportChatShortcut';
import StorageImage from '../../components/shared/StorageImage';
import { formatCurrency } from '../../utils/format/safeFormatters';
import { withAlpha } from '../../utils/format/colors';
import { getPendingPayments } from '../../api/payments';
import { fetchDriverProfile } from '../../services/driver/driverProfilesService';
import alertService from '../../services/notification/alertService';
import { useTranslation } from 'react-i18next';

interface PendingPayment {
  rideId: string;
  payment: any;
  ride: any;
  driverProfile?: {
    name: string;
    photo?: string | null;
  };
}

export default function PendingPaymentsScreen({ navigation }: any) {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { t } = useTranslation();
  
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Cargar pagos pendientes y perfiles de conductores
  const loadPendingPayments = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const data = await getPendingPayments();
      console.log('💰 [PendingPaymentsScreen] Resultado:', data);

      if (data) {
        const profileCache = new Map<string, PendingPayment['driverProfile'] | null>();
        const formattedPayments: PendingPayment[] = await Promise.all(
          (data.payments || []).map(async (payment: any) => {
            const normalizedMethod = payment.paymentMethod === 'card' ? 'card' : 'cash';
            const driverId = payment.driverId || payment.driver_id || null;

            let driverProfile: PendingPayment['driverProfile'] | undefined;
            if (driverId) {
              if (profileCache.has(driverId)) {
                driverProfile = profileCache.get(driverId) ?? undefined;
              } else {
                const profile = await fetchDriverProfile(driverId).catch(() => null);
                if (profile) {
                  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
                  driverProfile = {
                    name: fullName || payment.driverName || 'Conductor',
                    photo: profile.profilePhoto || null,
                  };
                } else {
                  driverProfile = undefined;
                }
                profileCache.set(driverId, driverProfile ?? null);
              }
            }

            if (!driverProfile) {
              driverProfile = {
                name: payment.driverName || t('client.pendingPayments.driverFallback'),
                photo: payment.driverPhoto || null,
              };
            }

            return {
              rideId: payment.rideId,
              payment: {
                status: 'pending',
                method: normalizedMethod,
                finalAmount: payment.total,
                createdAt: payment.createdAt,
              },
              ride: {
                origin: { address: payment.origin },
                destination: { address: payment.destination },
                finalFare: payment.amount,
                driver: {
                  name: driverProfile.name,
                  photoURL: driverProfile.photo,
                },
                completedAt: payment.createdAt,
              },
              driverProfile,
            } as PendingPayment;
          })
        );

        console.log(`📊 Total pagos pendientes: ${formattedPayments.length}`);
        setPendingPayments(formattedPayments);
      } else {
        setPendingPayments([]);
      }
    } catch (error) {
      console.error('❌ Error cargando pagos pendientes:', error);
      setPendingPayments([]);
      alertService.showErrorAlert(t('client.pendingPayments.alerts.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPendingPayments();
  }, [user?.id]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPendingPayments();
    alertService.showSuccessAlert(
      t('client.pendingPayments.alerts.refreshSuccessTitle'),
      t('client.pendingPayments.alerts.refreshSuccessMessage'),
    );
    setRefreshing(false);
  };

  const handlePaymentPress = (pendingPayment: PendingPayment) => {
    const { rideId, payment, ride } = pendingPayment;
    
    console.log('💰 Navegando a pago pendiente:', rideId);
    if (payment.method === 'cash') {
      navigation.navigate('CashPayment', {
        rideId,
        amount: payment.finalAmount,
        driverName: ride.driver?.name || t('client.pendingPayments.driverFallback'),
        driverPhoto: ride.driver?.photoURL,
      });
      return;
    }
    
    // IMPORTANTE: Los pagos pendientes SOLO se pueden pagar con tarjeta (transferencia bancaria)
    // Esto es una política de negocio para garantizar el cobro de deudas
    navigation.navigate('Payment', {
      rideId,
      amount: payment.finalAmount || ride.finalFare || ride.estimatedPrice,
      driverName: ride.driver?.name || t('client.pendingPayments.driverFallback'),
      driverPhoto: ride.driver?.photoURL,
      isPendingPayment: true, // Flag para indicar que es un pago de deuda
    });
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return t('client.pendingPayments.date.justNow');
    if (diffMins < 60) {
      return t('client.pendingPayments.date.minutes', {
        count: diffMins,
      });
    }
    if (diffHours < 24) {
      return t('client.pendingPayments.date.hours', {
        count: diffHours,
      });
    }
    if (diffDays === 1) return t('client.pendingPayments.date.yesterday');
    if (diffDays < 7) {
      return t('client.pendingPayments.date.days', {
        count: diffDays,
      });
    }
    
    return date.toLocaleDateString('es-NI', { 
      day: 'numeric', 
      month: 'short',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  if (loading) {
    return <LoadingOverlay visible={true} message={t('client.pendingPayments.loading')} />;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={21} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('client.pendingPayments.title')}</Text>
        <View style={styles.backButtonPlaceholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {pendingPayments.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="checkmark-circle-outline" size={34} color={colors.success} />
            </View>
            <Text style={styles.emptyTitle}>{t('client.pendingPayments.emptyTitle')}</Text>
            <Text style={styles.emptyDescription}>
              {t('client.pendingPayments.emptyDescription')}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.infoCard}>
              <Ionicons name="bulb-outline" size={22} color={colors.primary} />
              <Text style={styles.infoText}>
                {t('client.pendingPayments.info.message', { count: pendingPayments.length })}{' '}
                {t('client.pendingPayments.info.instruction')}
              </Text>
            </View>

            {pendingPayments.map((pendingPayment) => {
              const { rideId, payment, ride } = pendingPayment;
              const amount = payment.finalAmount || ride.finalFare || ride.estimatedPrice;
              const driverName =
                pendingPayment.driverProfile?.name ||
                ride.driver?.name ||
                t('client.pendingPayments.driverFallback');
              const driverPhoto = pendingPayment.driverProfile?.photo || ride.driver?.photoURL;
              const paymentMethod = t('client.pendingPayments.paymentMethod');
              const createdAt = payment.createdAt || ride.completedAt || Date.now();
              const stops: any[] = Array.isArray(ride?.extraDestinations)
                ? ride.extraDestinations
                : Array.isArray(ride?.stops)
                  ? ride.stops
                  : [];

              return (
                <TouchableOpacity
                  key={rideId}
                  style={styles.paymentCard}
                  onPress={() => handlePaymentPress(pendingPayment)}
                  activeOpacity={0.7}
                >
                  {/* Header de la tarjeta */}
                  <View style={styles.cardHeader}>
                    <View style={styles.driverSection}>
                      {driverPhoto ? (
                        <StorageImage
                          uri={driverPhoto}
                          style={styles.driverAvatar}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={[styles.driverAvatar, { backgroundColor: colors.primary + '30' }]}>
                          <Text style={[styles.driverAvatarText, { color: colors.primary }]}>
                            {driverName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={styles.driverInfo}>
                        <Text style={styles.driverName}>{driverName}</Text>
                        <Text style={styles.paymentDate}>{formatDate(createdAt)}</Text>
                      </View>
                    </View>
                    <View style={styles.amountSection}>
                      <Text style={styles.amount}>{formatCurrency(amount)}</Text>
                      <Text style={styles.paymentMethod}>{paymentMethod}</Text>
                    </View>
                  </View>

                  {/* Ruta del viaje */}
                  <View style={styles.routeSection}>
                    <View style={styles.routeRow}>
                      <View style={styles.routeMarkerColumn}>
                        <View style={[styles.routeDot, styles.originDot]} />
                        <View style={styles.routeLine} />
                      </View>
                      <View style={styles.routeTextWrap}>
                        <Text style={styles.routeLabel}>{t('shared.payment.summary.origin')}</Text>
                        <Text style={styles.routeText} numberOfLines={1}>
                          {ride.origin?.address || t('client.pendingPayments.route.originFallback')}
                        </Text>
                      </View>
                    </View>
                    {stops.map((stop: any, index: number) => (
                      <View style={styles.routeRow} key={index}>
                        <View style={styles.routeMarkerColumn}>
                          <View style={[styles.routeDot, styles.stopDot]} />
                          <View style={styles.routeLine} />
                        </View>
                        <View style={styles.routeTextWrap}>
                          <Text style={styles.routeLabel}>
                            {t('client.programmedRides.stop', { number: index + 1 })}
                          </Text>
                          <Text style={styles.routeText} numberOfLines={1}>
                            {stop?.address || stop || t('client.pendingPayments.route.destinationFallback')}
                          </Text>
                        </View>
                      </View>
                    ))}
                    <View style={styles.routeRow}>
                      <View style={styles.routeMarkerColumn}>
                        <View style={[styles.routeDot, styles.destinationDot]} />
                      </View>
                      <View style={styles.routeTextWrap}>
                        <Text style={styles.routeLabel}>{t('shared.payment.summary.destination')}</Text>
                        <Text style={styles.routeText} numberOfLines={1}>
                          {ride.destination?.address || t('client.pendingPayments.route.destinationFallback')}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Footer con estado */}
                  <View style={styles.cardFooter}>
                    <View style={styles.statusBadge}>
                      <Ionicons name="hourglass-outline" size={13} color={styles.statusText.color} />
                      <Text style={styles.statusText}>
                        {payment.status === 'pending_confirmation'
                          ? t('client.pendingPayments.status.pendingConfirmation')
                          : t('client.pendingPayments.status.pending')}
                      </Text>
                    </View>
                    <View style={styles.payAction}>
                      <Ionicons name="card-outline" size={16} color={colors.primary} />
                      <Text style={styles.actionText}>{t('client.pendingPayments.actionPay')}</Text>
                      {/* <Ionicons name="chevron-forward" size={14} color={colors.primary} /> */}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}

            <SupportChatShortcut
              style={{ marginTop: 8 }}
              initialCategory="payment"
              initialTitle={t('client.pendingPayments.supportTitle')}
              label={t('client.pendingPayments.supportLabel')}
              description={t(
                'client.pendingPayments.supportDescription',
              )}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  backButtonPlaceholder: {
    width: 40,
    height: 40,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: colors.primary + '15',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  paymentCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 3, color: withAlpha(colors.shadow, 0.16) }],
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  driverSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  driverAvatarText: {
    fontSize: 20,
    fontWeight: '700',
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  paymentDate: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  amountSection: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 20,
    fontWeight: '800',
    color: isDark ? '#E8C47F' : '#946D29',
    marginBottom: 2,
    fontVariant: ['tabular-nums'],
  },
  paymentMethod: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  routeSection: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    gap: 12,
  },
  routeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  routeMarkerColumn: {
    width: 20,
    alignItems: 'center',
    paddingTop: 3,
  },
  routeDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 3,
  },
  originDot: {
    borderColor: '#398BFA',
  },
  stopDot: {
    borderColor: '#dd9251',
  },
  destinationDot: {
    borderColor: '#E35B5B',
  },
  routeLine: {
    width: 1,
    backgroundColor: colors.border,
    flex: 1,
    marginTop: 4,
    marginBottom: -13,
  },
  routeTextWrap: {
    flex: 1,
    gap: 3,
  },
  routeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  routeText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '700',
    lineHeight: 20,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: isDark ? '#38342B' : '#F4F0E8',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: isDark ? '#E3C98F' : '#846126',
  },
  payAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? '#3E3321' : '#F4EBDC',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  emptyDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 20,
  },
});
