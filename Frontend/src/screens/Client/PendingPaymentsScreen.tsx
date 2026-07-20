import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import SupportChatShortcut from '../../components/shared/SupportChatShortcut';
import { formatCurrency } from '../../utils/safeFormatters';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../../config/firebase';
import { fetchDriverProfile } from '../../services/driverProfilesService';
import alertService from '../../services/alertService';
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
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Cargar pagos pendientes y perfiles de conductores
  const loadPendingPayments = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const functions = await getFirebaseFunctions();
      const getPendingPaymentsFn = httpsCallable(functions, 'getPendingPayments');
      const result = await getPendingPaymentsFn();
      const data = result.data as any;

      console.log('💰 [PendingPaymentsScreen] Resultado:', data);

      if (data.success) {
        const profileCache = new Map<string, PendingPayment['driverProfile'] | null>();
        const formattedPayments: PendingPayment[] = await Promise.all(
          (data.payments || []).map(async (payment: any) => {
            const normalizedMethod = payment.paymentMethod === 'card' ? 'card' : 'card';
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
                finalAmount: payment.amount,
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
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('client.pendingPayments.title')}</Text>
        <View style={styles.backButton} />
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
            <MaterialIcons name="check-circle" size={64} color="#4CAF50" />
            <Text style={styles.emptyTitle}>{t('client.pendingPayments.emptyTitle')}</Text>
            <Text style={styles.emptyDescription}>
              {t('client.pendingPayments.emptyDescription')}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.infoCard}>
              <MaterialIcons name="lightbulb" size={24} color={colors.primary} />
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
                        <Image
                          source={{ uri: driverPhoto }}
                          style={styles.driverAvatar}
                          resizeMode="cover"
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
                      <View style={styles.routeIcon}>
                        <Text style={styles.routeIconText}>🔵</Text>
                      </View>
                      <Text style={styles.routeText} numberOfLines={1}>
                        {ride.origin?.address || t('client.pendingPayments.route.originFallback')}
                      </Text>
                    </View>
                    <View style={styles.routeDivider} />
                    <View style={styles.routeRow}>
                      <View style={styles.routeIcon}>
                        <Text style={styles.routeIconText}>🔴</Text>
                      </View>
                      <Text style={styles.routeText} numberOfLines={1}>
                        {ride.destination?.address || t('client.pendingPayments.route.destinationFallback')}
                      </Text>
                    </View>
                  </View>

                  {/* Footer con estado */}
                  <View style={styles.cardFooter}>
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusIcon}>⏳</Text>
                      <Text style={styles.statusText}>
                        {payment.status === 'pending_confirmation'
                          ? t('client.pendingPayments.status.pendingConfirmation')
                          : t('client.pendingPayments.status.pending')}
                      </Text>
                    </View>
                    <Text style={styles.actionText}>💳 {t('client.pendingPayments.actionPay')}</Text>
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

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 24,
    color: colors.text,
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
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  infoIcon: {
    fontSize: 24,
    marginRight: 12,
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
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  driverSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
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
    fontWeight: '600',
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
    fontWeight: '700',
    color: '#FF9800',
    marginBottom: 2,
  },
  paymentMethod: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  routeSection: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeIcon: {
    width: 24,
    alignItems: 'center',
  },
  routeIconText: {
    fontSize: 12,
  },
  routeText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    marginLeft: 8,
  },
  routeDivider: {
    width: 2,
    height: 12,
    backgroundColor: colors.border,
    marginLeft: 11,
    marginVertical: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF9800' + '20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF9800',
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
