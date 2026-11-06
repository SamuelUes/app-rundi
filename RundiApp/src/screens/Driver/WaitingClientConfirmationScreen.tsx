import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';
import { liveTripDocId } from '../../live/tripIds';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../config/firebase';
import { FS_COL } from '../../constants/firestore';
import ridesService from '../../services/ride/ridesService';
import { formatCurrency } from '../../utils/format/safeFormatters';
import { SafeAreaView } from 'react-native-safe-area-context';

interface WaitingClientConfirmationScreenProps {
  route: {
    params: {
      rideId: string;
      clientId: string;
      origin: { lat: number; lng: number; address: string };
      destination: { lat: number; lng: number; address: string };
      estimatedFare: number;
      extraDestinations?: Array<{ lat: number; lng: number; address?: string }>;
    };
  };
  navigation: any;
}

const OFFER_WAIT_TIMEOUT_S = 120; // TTL de la oferta pendiente: se retira sola si el cliente no responde
const LOW_TIME_THRESHOLD_S = 30;
const SONAR_DURATION_MS = 2200;

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

interface PendingViewProps {
  colors: any;
  styles: any;
  t: (key: string, opts?: any) => string;
  ns: string;
  remaining: number;
  origin: { lat: number; lng: number; address: string };
  destination: { lat: number; lng: number; address: string };
  extraDestinations: Array<{ lat: number; lng: number; address?: string }>;
  estimatedFare: number;
}

function PendingView({
  colors,
  styles,
  t,
  ns,
  remaining,
  origin,
  destination,
  extraDestinations,
  estimatedFare,
}: PendingViewProps) {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(remaining / OFFER_WAIT_TIMEOUT_S)).current;

  const isLowTime = remaining <= LOW_TIME_THRESHOLD_S;
  const accent = isLowTime ? colors.warning : colors.primary;

  // Sonar: dos anillos que se expanden y desvanecen, desfasados medio ciclo
  useEffect(() => {
    const pulse = (value: Animated.Value) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration: SONAR_DURATION_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
    const loop1 = pulse(ring1);
    const loop2 = Animated.sequence([Animated.delay(SONAR_DURATION_MS / 2), pulse(ring2)]);
    loop1.start();
    loop2.start();
    return () => {
      loop1.stop();
      loop2.stop();
    };
  }, [ring1, ring2]);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: remaining / OFFER_WAIT_TIMEOUT_S,
      duration: 400,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  }, [remaining, progress]);

  const ringStyle = (value: Animated.Value) => ({
    backgroundColor: accent,
    opacity: value.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.28, 0] }),
    transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
  });

  const badgeDotStyle = {
    opacity: ring1.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 1, 0.5] }),
  };

  const routePoints = [
    { kind: 'dot' as const, color: colors.secondary, label: t(`${ns}.pending.originLabel`), address: origin.address },
    ...extraDestinations.map((stop, index) => ({
      kind: 'dot' as const,
      color: colors.warning,
      label: t(`${ns}.pending.stopLabel`, { index: index + 1 }),
      address: stop.address || t(`${ns}.pending.stopFallback`),
    })),
    { kind: 'dot' as const, color: colors.error, label: t(`${ns}.pending.destinationLabel`), address: destination.address },
  ];

  const tips = [
    { icon: 'directions-car' as const, text: t(`${ns}.tips.tipVehicle`) },
    { icon: 'my-location' as const, text: t(`${ns}.tips.tipGps`) },
    { icon: 'people-outline' as const, text: t(`${ns}.tips.tipAlternateDriver`) },
  ];

  return (
    <>
      {/* Estado de la oferta */}
      <View style={styles.statusChip}>
        <Animated.View style={[styles.statusDot, badgeDotStyle]} />
        <Text style={styles.statusChipText}>{t(`${ns}.pending.statusBadge`)}</Text>
      </View>

      <Text style={styles.title}>{t(`${ns}.pending.title`)}</Text>
      <Text style={styles.subtitle}>{t(`${ns}.pending.subtitle`)}</Text>

      {/* Countdown con anillos sonar */}
      <View style={styles.heroWrap}>
        <Animated.View style={[styles.sonarRing, ringStyle(ring1)]} />
        <Animated.View style={[styles.sonarRing, ringStyle(ring2)]} />
        <View style={[styles.heroCircle, { borderColor: accent }]}>
          <Text style={[styles.countdown, { color: accent }]}>{formatTime(remaining)}</Text>
        </View>
      </View>

      <Text style={styles.expiresText}>{t(`${ns}.pending.expiresLabel`)}</Text>
      <View style={styles.progressTrack}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              backgroundColor: accent,
              width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            },
          ]}
        />
      </View>

      {/* Detalles del viaje */}
      <View style={styles.detailsCard}>
        <Text style={styles.detailsTitle}>{t(`${ns}.pending.tripDetails`)}</Text>

        {routePoints.map((point, index) => (
          <View key={`route-point-${index}`} style={styles.routeRow}>
            <View style={styles.routeIconCol}>
              <View style={[styles.routeLine, index === 0 && styles.routeLineHidden]} />
              {point.kind === 'dot' ? (
                <View style={[styles.routeDot, { backgroundColor: point.color }]} />
              ) : (
                <MaterialIcons name="place" size={22} color={point.color} />
              )}
              <View style={[styles.routeLine, index === routePoints.length - 1 && styles.routeLineHidden]} />
            </View>
            <View style={styles.routeTextCol}>
              <Text style={styles.locationLabel}>{point.label}</Text>
              <Text style={styles.locationAddress}>{point.address}</Text>
            </View>
          </View>
        ))}

        <View style={styles.fareContainer}>
          <Text style={styles.fareLabel}>{t(`${ns}.pending.fareLabel`)}</Text>
          <Text style={styles.fareValue}>{formatCurrency(estimatedFare)}</Text>
        </View>
      </View>

      {/* Consejos */}
      <View style={styles.tipsCard}>
        <View style={styles.tipsHeader}>
          <MaterialIcons name="lightbulb-outline" size={18} color={colors.warning} />
          <Text style={styles.tipsTitle}>{t(`${ns}.tips.title`)}</Text>
        </View>
        {tips.map((tip, index) => (
          <View key={`tip-${index}`} style={styles.tipRow}>
            <MaterialIcons name={tip.icon} size={18} color={colors.textTertiary} />
            <Text style={styles.tipText}>{tip.text}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

function AcceptedView({ colors, styles, t, ns }: { colors: any; styles: any; t: any; ns: string }) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, speed: 14, bounciness: 9, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [scale, opacity]);

  return (
    <View style={styles.successContainer}>
      <Animated.View
        style={[
          styles.successCircle,
          { backgroundColor: `${colors.success}1A` },
          { transform: [{ scale }], opacity },
        ]}
      >
        <MaterialIcons name="check-circle" size={72} color={colors.success} />
      </Animated.View>
      <Text style={styles.successTitle}>{t(`${ns}.accepted.title`)}</Text>
      <Text style={styles.successSubtitle}>{t(`${ns}.accepted.subtitle`)}</Text>
      <LoadingIcon size={32} color={colors.primary} style={{ marginTop: 20 }} />
    </View>
  );
}

export default function WaitingClientConfirmationScreen({ route, navigation }: WaitingClientConfirmationScreenProps) {
  const {
    rideId,
    clientId,
    origin,
    destination,
    estimatedFare,
    extraDestinations = [],
  } = route.params;
  const { colors } = useTheme();
  const { user } = useAuth();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [timeWaiting, setTimeWaiting] = useState(0);
  const [offerStatus, setOfferStatus] = useState<'pending' | 'accepted' | 'rejected'>('pending');
  const withdrawHandledRef = useRef(false);
  const navigationScheduledRef = useRef(false);
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ns = 'driver.WaitingClientConfirmation';

  const remaining = Math.max(OFFER_WAIT_TIMEOUT_S - timeWaiting, 0);

  const withdrawOffer = async (reason: string) => {
    try {
      await ridesService.rejectRide(rideId, reason);
    } catch (error: any) {
      console.warn('[WaitingClientConfirmation] No se pudo retirar la oferta:', error?.message || error);
      throw error;
    }
  };

  // Listener para el estado de la oferta (trips_live + mi doc de oferta)
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    let cancelled = false;
    console.log('🕐 Esperando confirmación del cliente para viaje:', rideId);

    const handleAccepted = (fare: any) => {
      setOfferStatus('accepted');
      if (!navigationScheduledRef.current) {
        navigationScheduledRef.current = true;
        navigationTimeoutRef.current = setTimeout(() => {
          navigationTimeoutRef.current = null;
          if (navigation.isFocused?.() === false) return;
          navigation.replace('ActiveRide', {
            rideId: rideId,
            clientId: clientId,
            origin: origin,
            destination: destination,
            estimatedFare: fare || estimatedFare,
          });
        }, 1500);
      }
    };

    const handleTerminalOffer = (status: string) => {
      if (status === 'accepted') {
        handleAccepted(estimatedFare);
        return;
      }
      if (status === 'rejected' || status === 'canceled') {
        setOfferStatus('rejected');
        const key = status === 'rejected' ? 'offerRejectedMe' : 'offerClosed';
        Alert.alert(
          t(`${ns}.alerts.${key}Title`),
          t(`${ns}.alerts.${key}Message`),
          [{ text: 'OK', onPress: () => navigation.replace('AvailableRides') }]
        );
      }
    };

    const handleRideData = (data: any) => {

      if (!data) {
        console.log('⚠️ Viaje no encontrado, regresando...');
        Alert.alert(
          t(`${ns}.alerts.rideMissingTitle`),
          t(`${ns}.alerts.rideMissingMessage`),
          [{ text: 'OK', onPress: () => navigation.replace('AvailableRides') }]
        );
        return;
      }

      console.log('📊 Estado del viaje:', data.status);

      // Si el cliente aceptó la oferta (o el viaje avanzó) y este conductor fue el seleccionado
      if (
        (data.status === 'accepted' || data.status === 'driver_on_route' || data.status === 'driver_arrived' || data.status === 'in_progress') &&
        data.driverId === user?.id
      ) {
        console.log('✅ ¡Cliente aceptó tu oferta!');
        setOfferStatus('accepted');

        // Navegar a ActiveRideScreen — una sola vez: el nodo recibe escrituras
        // de tracking cada pocos segundos y cada snapshot re-agendaba un
        // replace, duplicando la pantalla.
        if (!navigationScheduledRef.current) {
          navigationScheduledRef.current = true;
          navigationTimeoutRef.current = setTimeout(() => {
            navigationTimeoutRef.current = null;
            if (navigation.isFocused?.() === false) return;
            navigation.replace('ActiveRide', {
              rideId: rideId,
              clientId: clientId,
              origin: origin,
              destination: destination,
              estimatedFare: data.finalFare || estimatedFare,
            });
          }, 1500);
        }
        return;
      }

      // Si el cliente aceptó OTRO conductor
      if (data.status === 'accepted' && data.driverId !== user?.id) {
        console.log('❌ Cliente eligió otro conductor');
        setOfferStatus('rejected');

        Alert.alert(
          t(`${ns}.alerts.offerRejectedTitle`),
          t(`${ns}.alerts.offerRejectedMessage`),
          [{ text: 'OK', onPress: () => navigation.replace('AvailableRides') }]
        );
        return;
      }

      // Verificar si nuestra oferta fue rechazada específicamente
      if (data.offers && user?.id) {
        const myOffer = data.offers[user.id];
        if (myOffer && myOffer.status === 'rejected') {
          console.log('❌ Cliente rechazó tu oferta específicamente');
          setOfferStatus('rejected');

          Alert.alert(
            t(`${ns}.alerts.offerRejectedMeTitle`),
            t(`${ns}.alerts.offerRejectedMeMessage`),
            [{ text: 'OK', onPress: () => navigation.replace('AvailableRides') }]
          );
          return;
        }
      }

      // Si el viaje fue cancelado
      if (data.status === 'canceled') {
        console.log('⚠️ Viaje cancelado');
        Alert.alert(
          t(`${ns}.alerts.rideCanceledTitle`),
          t(`${ns}.alerts.rideCanceledMessage`),
          [{ text: 'OK', onPress: () => navigation.replace('AvailableRides') }]
        );
        return;
      }
    };

    (async () => {
      const db = await getFirebaseFirestore();
      if (cancelled) return;
      unsubs.push(
        onSnapshot(doc(db, FS_COL.tripsLive, await liveTripDocId(rideId)), (snap) => {
          handleRideData(snap.data());
        }, (err) => {
          // trips_live es ilegible para el oferente mientras negocia
          // (no participante): el doc de mi oferta cubre esa ventana.
          console.warn('[WaitingClientConfirmation] trips_live listener:', err);
        }),
      );
      // Mi oferta (legible siempre): cubre aceptación, rechazo y cierre
      // mientras trips_live sigue denegado durante la negociación.
      if (user?.id) {
        unsubs.push(
          onSnapshot(doc(db, FS_COL.driverOffers, `${rideId}_${user.id}`), (snap) => {
            const offer = snap.data();
            if (offer) handleTerminalOffer(String(offer.status));
          }),
        );
      }
    })();

    // Timer para contar tiempo de espera
    const timer = setInterval(() => {
      setTimeWaiting(prev => prev + 1);
    }, 1000);

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
      clearInterval(timer);
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
        navigationTimeoutRef.current = null;
      }
    };
  }, [rideId]);

  // TTL de la oferta: si el cliente no responde en OFFER_WAIT_TIMEOUT_S, se retira sola
  useEffect(() => {
    if (offerStatus !== 'pending' || withdrawHandledRef.current) return;
    if (timeWaiting < OFFER_WAIT_TIMEOUT_S) return;
    withdrawHandledRef.current = true;

    withdrawOffer('driver_offer_expired')
      .catch(() => {})
      .finally(() => {
        Alert.alert(
          t(`${ns}.alerts.offerExpiredTitle`),
          t(`${ns}.alerts.offerExpiredMessage`),
          [{ text: 'OK', onPress: () => navigation.replace('AvailableRides') }]
        );
      });
  }, [timeWaiting, offerStatus, rideId, navigation, t]);

  const handleCancelOffer = async () => {
    Alert.alert(
      t(`${ns}.alerts.cancelOfferTitle`),
      t(`${ns}.alerts.cancelOfferMessage`),
      [
        { text: t(`${ns}.alerts.cancelOfferNo`), style: 'cancel' },
        {
          text: t(`${ns}.alerts.cancelOfferYes`),
          style: 'destructive',
          onPress: async () => {
            if (withdrawHandledRef.current) {
              navigation.replace('AvailableRides');
              return;
            }
            withdrawHandledRef.current = true;
            try {
              await withdrawOffer('driver_withdrew_offer');
              navigation.replace('AvailableRides');
            } catch (error: any) {
              withdrawHandledRef.current = false;
              Alert.alert(
                t(`${ns}.alerts.cancelErrorTitle`),
                error?.message || t(`${ns}.alerts.cancelErrorMessage`)
              );
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {offerStatus === 'accepted' ? (
        <AcceptedView colors={colors} styles={styles} t={t} ns={ns} />
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <PendingView
              colors={colors}
              styles={styles}
              t={t}
              ns={ns}
              remaining={remaining}
              origin={origin}
              destination={destination}
              extraDestinations={extraDestinations}
              estimatedFare={estimatedFare}
            />
          </ScrollView>
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancelOffer}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={t(`${ns}.buttons.cancelOffer`)}
            >
              <MaterialIcons name="close" size={18} color={colors.error} />
              <Text style={styles.cancelButtonText}>{t(`${ns}.buttons.cancelOffer`)}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  statusChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginTop: 20,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 8,
  },
  heroWrap: {
    height: 190,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sonarRing: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
  },
  heroCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdown: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  expiresText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 4,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: 12,
    marginBottom: 24,
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 3,
  },
  detailsCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 14,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 44,
  },
  routeIconCol: {
    width: 24,
    alignItems: 'center',
  },
  routeLine: {
    width: 2,
    flex: 1,
    minHeight: 6,
    backgroundColor: colors.border,
  },
  routeLineHidden: {
    backgroundColor: 'transparent',
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  routeTextCol: {
    flex: 1,
    paddingLeft: 14,
    justifyContent: 'center',
  },
  locationLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textTertiary,
    marginBottom: 2,
  },
  locationAddress: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
    fontWeight: '500',
  },
  fareContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  fareLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  fareValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  tipsCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cancelButton: {
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.error,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.error,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
