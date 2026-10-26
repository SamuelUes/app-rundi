/**
 * CashPaymentScreen - Versión mejorada
 * 
 * Esta pantalla permite al cliente ver y confirmar el pago en efectivo.
 * 
 * Mejoras:
 * - Implementación de LoadingOverlay para estados de carga
 * - Alertas consistentes con alertService
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { getAuth } from 'firebase/auth';
import { getDatabase, ref, onValue, off } from 'firebase/database';
import { formatNicaraguaTime } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/safeFormatters';
import { useTranslation } from 'react-i18next';

// Servicios optimizados
import alertService from '../../services/alertService';
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import SupportChatShortcut from '../../components/shared/SupportChatShortcut';
import StorageImage from '../../components/shared/StorageImage';
import sessionService from '../../services/sessionService';
import BiometricService from '../../services/biometricService';

const resolveDriverName = (driverInfo: any): string | null => {
  const fullName = [driverInfo?.firstName, driverInfo?.lastName].filter(Boolean).join(' ').trim();
  return (
    fullName ||
    driverInfo?.fullName ||
    driverInfo?.name ||
    driverInfo?.displayName ||
    null
  );
};

// Crear estilos fuera del componente para mejor rendimiento
const createStyles = (colors: any, accentAlt: string) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 24,
  },
  header: {
    alignItems: 'center',
    marginTop: 48,
    marginBottom: 22,
  },
  headerIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: accentAlt + '1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 25,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  receiptCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  driverSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  driverAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  driverAvatarText: {
    fontSize: 21,
    fontWeight: '700',
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 3,
  },
  driverRating: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  amountBlock: {
    alignItems: 'center',
    paddingVertical: 22,
  },
  amountLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  amountValue: {
    fontSize: 38,
    fontWeight: '800',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  dashedDivider: {
    height: 0,
    borderTopWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    marginBottom: 6,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
  },
  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  detailLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '600',
  },
  codeValue: {
    fontSize: 17,
    color: accentAlt,
    fontWeight: '800',
    letterSpacing: 3,
    fontVariant: ['tabular-nums'],
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 16,
    marginBottom: 4,
    backgroundColor: colors.warning + '14',
    borderWidth: 1,
    borderColor: colors.warning + '40',
  },
  statusIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.warning + '26',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBody: {
    flex: 1,
  },
  waitingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 3,
  },
  waitingDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  confirmButton: {
    height: 56,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  confirmButtonDisabled: {
    opacity: 0.7,
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  secondaryButton: {
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.text,
  },
});

export default function CashPaymentScreen({ route, navigation }: any) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { rideId, amount: paramAmount, driverName: paramDriverName, driverPhoto } = route.params;
  const accentAlt = isDark ? colors.SecondBorder : colors.primary;
  const styles = useMemo(() => createStyles(colors, accentAlt), [colors, accentAlt]);
  
  const [ride, setRide] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string>('pending');
  const [driverPhotoURL, setDriverPhotoURL] = useState<string | null>(null);
  const [driverNameFromInfo, setDriverNameFromInfo] = useState<string | null>(null);
  const [biometricRequested, setBiometricRequested] = useState(false);
  const [currentPaymentMethod, setCurrentPaymentMethod] = useState<string>('cash');
  const currentPaymentMethodRef = useRef<string>('cash');
  const fetchedDriverInfoForRef = useRef<string | null>(null);
  const isNavigatingRef = useRef(false);
  const sawPaymentDataRef = useRef(false);
  const lastPaymentStatusRef = useRef<string | null>(null);
  const [cashCode, setCashCode] = useState<string | null>(null);
  
  // Cargar detalles del viaje
  useEffect(() => {
    setLoading(true);
    
    const db = getDatabase();
    const rideRef = ref(db, `activeRides/${rideId}`);
    const paymentRef = ref(db, `paymentStatus/${rideId}`);
    
    console.log('💳 [CashPaymentScreen] Iniciando listeners para rideId:', rideId);
    
    // Listener para el viaje
    const unsubscribeRide = onValue(rideRef, async (snapshot) => {
      console.log('📦 Snapshot recibido de activeRides');
      const data = snapshot.val();
      console.log('📦 Datos:', data ? 'Viaje encontrado' : 'null');
      
      if (data) {
        setRide(data);
        setLoading(false);
        
        // ✅ MEJORADO: Detectar cambio de método de pago
        const ridePaymentMethod = data.paymentMethod || 'cash';
        if (ridePaymentMethod !== currentPaymentMethodRef.current) {
          currentPaymentMethodRef.current = ridePaymentMethod;
          setCurrentPaymentMethod(ridePaymentMethod);
        }
        
        if (data.driver?.photoURL) {
          setDriverPhotoURL(data.driver.photoURL);
        }

        // Obtener nombre/foto del conductor desde driversInfo
        if (data.driverId && fetchedDriverInfoForRef.current !== data.driverId) {
          console.log('📸🪪 Obteniendo perfil del conductor desde driversInfo:', data.driverId);
          try {
            const { get } = await import('firebase/database');
            const driverInfoRef = ref(db, `driversInfo/${data.driverId}`);
            const driverInfoSnapshot = await get(driverInfoRef);
            const driverInfo = driverInfoSnapshot.val();

            const resolvedName = resolveDriverName(driverInfo);
            const resolvedPhoto =
              driverInfo?.photoURL ||
              driverInfo?.profilePhoto ||
              driverInfo?.photoUrl ||
              null;

            if (resolvedName) {
              setDriverNameFromInfo(resolvedName);
            }

            if (resolvedPhoto) {
              console.log('✅ Foto de perfil encontrada:', resolvedPhoto);
              setDriverPhotoURL(resolvedPhoto);
            }

            fetchedDriverInfoForRef.current = data.driverId;
          } catch (error) {
            console.error('❌ Error obteniendo perfil del conductor:', error);
          }
        }
      } else {
        console.log('⚠️ Viaje no encontrado en activeRides, puede estar completado');
        // No mostrar error aquí, esperar a que paymentStatus confirme
      }
    });
    
    // Listener para el estado del pago
    const unsubscribePayment = onValue(paymentRef, (snapshot) => {
      const paymentData = snapshot.val();
      console.log('💰 Estado de pago actualizado:', paymentData);
      
      if (paymentData) {
        sawPaymentDataRef.current = true;
        lastPaymentStatusRef.current = paymentData.status ?? null;
        setPaymentStatus(paymentData.status);

        if (paymentData.code && typeof paymentData.code === 'string') {
          setCashCode(paymentData.code);
        } else {
          setCashCode(null);
        }

        const methodFromStatus = paymentData.method || paymentData.paymentMethod;

        if (
          methodFromStatus &&
          methodFromStatus !== currentPaymentMethodRef.current
        ) {
          console.log(`🔄 [CashPaymentScreen] Método actualizado vía paymentStatus: ${currentPaymentMethodRef.current} → ${methodFromStatus}`);
          currentPaymentMethodRef.current = methodFromStatus;
          setCurrentPaymentMethod(methodFromStatus);

          if (methodFromStatus === 'card' && !isNavigatingRef.current) {
            isNavigatingRef.current = true;

            const finalAmount = (() => {
              if (typeof paymentData.amount === 'number') return paymentData.amount;
              if (typeof paymentData.amount === 'string') return parseFloat(paymentData.amount);
              if (typeof paymentData.finalAmount === 'number') return paymentData.finalAmount;
              if (typeof paymentData.finalAmount === 'string') return parseFloat(paymentData.finalAmount);
              if (ride?.finalFare) {
                return typeof ride.finalFare === 'string' ? parseFloat(ride.finalFare) : ride.finalFare;
              }
              return typeof paramAmount === 'string' ? parseFloat(paramAmount) : paramAmount || 0;
            })();

            alertService.showInfoAlert(
              t('client.cashPayment.alerts.methodChangedTitle'),
              t('client.cashPayment.alerts.methodChangedMessage'),
              () => {
                navigation.replace('Payment', {
                  rideId,
                  amount: finalAmount,
                  driverName: driverNameFromInfo || ride?.driver?.name || paramDriverName,
                  driverPhoto: driverPhotoURL || ride?.driver?.photoURL || driverPhoto,
                });
              }
            );
          }
        }
      } else if (sawPaymentDataRef.current && !isNavigatingRef.current) {
        // El nodo paymentStatus se eliminó tras el archivado: el pago ya
        // llegó a su estado terminal (completado o cancelado).
        isNavigatingRef.current = true;
        if (lastPaymentStatusRef.current === 'canceled') {
          alertService.showInfoAlert(
            t('client.cashPayment.alerts.paymentCancelledTitle'),
            t('client.cashPayment.alerts.paymentCancelledMessage'),
            () => navigation.replace('Rating', { rideId })
          );
        } else {
          console.log('✅ Pago archivado, navegando a calificación');
          navigation.replace('Rating', { rideId });
        }
      }

      if (paymentData) {
        // Pago completado (terminal canónico o legacy) → calificación
        if (
          ['confirmed', 'completed', 'payment_completed'].includes(paymentData.status) &&
          !isNavigatingRef.current
        ) {
          console.log('✅ Pago confirmado, navegando a calificación');
          isNavigatingRef.current = true;
          navigation.replace('Rating', { 
            rideId
          });
        } else if (paymentData.status === 'canceled' && !isNavigatingRef.current) {
          isNavigatingRef.current = true;
          alertService.showInfoAlert(
            t('client.cashPayment.alerts.paymentCancelledTitle'),
            t('client.cashPayment.alerts.paymentCancelledMessage'),
            () => navigation.replace('Rating', { rideId })
          );
        }
      }
    });
    
    return () => {
      console.log('🔇 Limpiando listeners de CashPaymentScreen');
      off(rideRef);
      off(paymentRef);
    };
  }, [rideId, navigation]);
  
  useEffect(() => {
    if (biometricRequested) {
      return;
    }

    const timer = setTimeout(() => {
      if (biometricRequested) {
        return;
      }

      if (paymentStatus === 'pending' || paymentStatus === 'pending_capture') {
        setBiometricRequested(true);
        handleConfirmPayment();
      } else {
        setBiometricRequested(true);
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [paymentStatus, biometricRequested]);
  
  // Confirmar pago en efectivo
  const handleConfirmPayment = async () => {
    if (confirming) {
      return;
    }

    try {
      console.log('💳 Cliente confirmando pago para rideId:', rideId);

      const finalAmount = ride?.finalFare || ride?.estimatedPrice || paramAmount || 0;
      const numericAmount = typeof finalAmount === 'string' ? parseFloat(finalAmount) : finalAmount;

      const biometricResult = await BiometricService.authenticate(
        t('client.cashPayment.biometricPrompt', { amount: formatCurrency(numericAmount) })
      );

      let authenticationMethod: 'biometric' | 'manual' = 'manual';
      let biometricType: string | null = null;
      let biometricAuthenticated = false;

      if (!biometricResult.success) {
        if (biometricResult.errorCode === 'NOT_SUPPORTED') {
          biometricType = 'no_exist';
          console.log('Biometría no soportada por el dispositivo. Continuando como autenticación manual.');
        } else if (biometricResult.errorCode === 'NOT_ENROLLED') {
          biometricType = 'not_enrolled';
          console.log('No hay biometría registrada en el dispositivo. Continuando como autenticación manual.');
        } else {
          alertService.showErrorAlert(
            biometricResult.error || t('client.cashPayment.alerts.identityError')
          );
          return;
        }
      } else {
        authenticationMethod = 'biometric';
        biometricType = biometricResult.biometryType || 'biometric';
        biometricAuthenticated = true;
      }

      setConfirming(true);
      
      const auth = getAuth();
      
      if (!auth.currentUser) {
        alertService.showErrorAlert(t('client.cashPayment.alerts.loginRequired'));
        return;
      }
      
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { initializeFirebase } = await import('../../config/firebase');
      
      const { app } = await initializeFirebase();
      if (!app) {
        throw new Error('Firebase no inicializado');
      }
      
      const functions = getFunctions(app);
      const confirmCashPaymentFn = httpsCallable(functions, 'confirmCashPayment');
      
      const deviceId = await sessionService.getDeviceId();
      const result = await confirmCashPaymentFn({
        rideId,
        amount: numericAmount,
        tip: 0,
        confirmedBy: 'client',
        deviceId,
        authenticationMethod,
        biometricType,
        biometricAuthenticated,
      });
      
      const data = result.data as any;
      console.log('✅ Respuesta del backend:', data);
      
      if (data.bothConfirmed) {
        alertService.showSuccessAlert(
          t('client.cashPayment.alerts.paymentConfirmedTitle'),
          t('client.cashPayment.alerts.paymentConfirmedMessage'),
          () => {
            navigation.replace('Rating', { rideId });
          }
        );
      } else {
        alertService.showSuccessAlert(
          t('client.cashPayment.alerts.confirmationStoredTitle'),
          t('client.cashPayment.alerts.confirmationStoredMessage')
        );
        setPaymentStatus('pending_confirmation');
      }
      
    } catch (error: any) {
      console.error('❌ Error confirmando pago:', error);
      alertService.showErrorAlert(
        error.message || t('client.cashPayment.alerts.confirmError')
      );
    } finally {
      setConfirming(false);
    }
  };
  
  // Mostrar pantalla de carga
  if (loading || !ride) {
    return <LoadingOverlay visible={true} message={t('client.cashPayment.loading')} />;
  }
  
  // Valores seguros
  const driverName =
    driverNameFromInfo ||
    (ride?.driver?.name ? String(ride.driver.name) : null) ||
    (paramDriverName ? String(paramDriverName) : null) ||
    t('common.roles.driver');
  const driverInitial = driverName.charAt(0).toUpperCase();
  const driverRating = ride?.driver?.rating ? parseFloat(ride.driver.rating) : 0;
  const amount = ride?.finalFare || ride?.estimatedPrice || paramAmount || 0;
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  const serviceCode = ride?.pricingSnapshot?.serviceCode ?? ride?.serviceCode;
  const featureCodes: string[] = Array.isArray(ride?.featureCodes)
    ? ride.featureCodes
    : Array.isArray(ride?.pricingSnapshot?.featureCodes)
      ? ride.pricingSnapshot.featureCodes
      : [];
  const serviceLabel = serviceCode === 'motorcycle'
    ? t('shared.searchRide.vehicle.motoLabel')
    : serviceCode === 'designated_driver_auto'
      ? `${t('shared.searchRide.vehicle.designatedLabel')} · ${t('shared.searchRide.vehicle.autoLabel')}`
      : serviceCode === 'designated_driver_moto'
        ? `${t('shared.searchRide.vehicle.designatedLabel')} · ${t('shared.searchRide.vehicle.modeMoto')}`
      : serviceCode === 'normal'
          ? t('shared.searchRide.vehicle.autoLabel')
          : serviceCode === 'night'
            ? t('shared.payment.summary.nightFeature')
          : serviceCode || '';
  
  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerIconWrap}>
            <MaterialIcons name="payments" size={26} color={accentAlt} />
          </View>
          <Text style={styles.title}>{t('client.cashPayment.header.title')}</Text>
          <Text style={styles.subtitle}>{t('client.cashPayment.header.subtitle')}</Text>
        </View>

        {/* Recibo del pago */}
        <View style={styles.receiptCard}>
          {/* Foto y nombre del conductor */}
          <View style={styles.driverSection}>
            {(driverPhotoURL || ride?.driver?.photoURL) ? (
              <StorageImage
                uri={driverPhotoURL || ride.driver.photoURL}
                style={styles.driverAvatar}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.driverAvatar, { backgroundColor: colors.primary + '1F' }]}>
                <Text style={[styles.driverAvatarText, { color: colors.primary }]}>
                  {driverInitial}
                </Text>
              </View>
            )}
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>
                {driverName}
              </Text>
              {driverRating > 0 && !isNaN(driverRating) && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <MaterialIcons name="star" size={14} color="#E8A93C" />
                  <Text style={styles.driverRating}>{driverRating.toFixed(1)}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Monto destacado */}
          <View style={styles.amountBlock}>
            <Text style={styles.amountLabel}>{t('client.cashPayment.detail.amount')}</Text>
            <Text style={styles.amountValue}>
              {formatCurrency(numericAmount)}
            </Text>
          </View>

          {!!serviceLabel && (
            <View style={styles.detailRow}>
              <View style={styles.detailLeft}>
                <MaterialIcons name="local-taxi" size={16} color={colors.textTertiary} />
                <Text style={styles.detailLabel}>{t('shared.payment.summary.service')}</Text>
              </View>
              <Text style={styles.detailValue}>{serviceLabel}</Text>
            </View>
          )}
          {featureCodes.length > 0 && (
            <View style={styles.detailRow}>
              <View style={styles.detailLeft}>
                <MaterialIcons name="nightlight" size={16} color={colors.textTertiary} />
                <Text style={styles.detailLabel}>{t('shared.payment.summary.features')}</Text>
              </View>
              <Text style={styles.detailValue}>
                {featureCodes.map((code) =>
                  code === 'night'
                    ? t('shared.payment.summary.nightFeature')
                    : code === 'designated_driver_moto_discount'
                      ? t('shared.payment.summary.designatedMotoAdjustment')
                      : code.replace(/_/g, ' '),
                ).join(' / ')}
              </Text>
            </View>
          )}

          <View style={styles.dashedDivider} />

          <View style={styles.detailRow}>
            <View style={styles.detailLeft}>
              <MaterialIcons name="schedule" size={16} color={colors.textTertiary} />
              <Text style={styles.detailLabel}>{t('client.cashPayment.detail.time')}</Text>
            </View>
            <Text style={styles.detailValue}>
              {formatNicaraguaTime(new Date())}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailLeft}>
              <MaterialIcons name="payments" size={16} color={colors.textTertiary} />
              <Text style={styles.detailLabel}>{t('client.cashPayment.detail.method')}</Text>
            </View>
            <Text style={styles.detailValue}>{t('client.cashPayment.detail.methodValueCash')}</Text>
          </View>

          {cashCode && (
            <View style={styles.detailRow}>
              <View style={styles.detailLeft}>
                <MaterialIcons name="vpn-key" size={16} color={colors.textTertiary} />
                <Text style={styles.detailLabel}>
                  {t('client.cashPayment.detail.codeLabel')}
                </Text>
              </View>
              <Text style={styles.codeValue}>{cashCode}</Text>
            </View>
          )}
        </View>

        {/* Estado del pago */}
        {paymentStatus === 'pending_confirmation' && (
          <View style={styles.statusCard}>
            <View style={styles.statusIconWrap}>
              <MaterialIcons name="hourglass-top" size={20} color={colors.warning} />
            </View>
            <View style={styles.statusBody}>
              <Text style={styles.waitingTitle}>{t('client.cashPayment.waiting.title')}</Text>
              <Text style={styles.waitingDescription}>
                {t('client.cashPayment.waiting.description')}
              </Text>
            </View>
          </View>
        )}

        <SupportChatShortcut
          rideId={rideId}
          initialCategory="payment"
          initialTitle={t('client.cashPayment.support.title')}
          label={t('client.cashPayment.support.label')}
          description={t('client.cashPayment.support.description')}
        />
      </ScrollView>

      <View style={styles.footer}>
        {paymentStatus === 'pending' || paymentStatus === 'pending_capture' || paymentStatus === 'pending_confirmation' ? (
          <TouchableOpacity
            onPress={handleConfirmPayment}
            style={[styles.confirmButton, confirming && styles.confirmButtonDisabled]}
            disabled={confirming}
            activeOpacity={0.85}
          >
            {confirming ? (
              <LoadingIcon size={20} color="#fff" />
            ) : (
              <MaterialIcons name="check-circle" size={20} color="#fff" />
            )}
            <Text style={styles.confirmButtonText}>
              {confirming ? t('client.cashPayment.buttons.processing') : t('client.cashPayment.buttons.confirm')}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.secondaryButton, {borderColor: colors.border}]}
            onPress={() => navigation.goBack()}
          >
            <Text style={[styles.secondaryButtonText, {color: colors.text}]}>
              {t('common.actions.back')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
