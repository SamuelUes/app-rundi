import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribePreflightResult, getPreflightResult, type PreflightAction } from '../../../stores/preflightStore';
import ridesService from '../../../services/ride/ridesService';
import type { UpcomingProgrammedRide } from './useUpcomingProgrammedRide';
import type { TFunction } from 'i18next';

export type PendingAction = {
  type: 'pending_payment' | 'active_ride' | 'scheduled_ride';
  title: string;
  icon?: string;
  onPress: () => void;
};

interface ActiveRide {
  id: string;
  status: string;
  driverId?: string;
  driver?: { name?: string; photoURL?: string; vehicle?: any };
  vehicle?: any;
  finalFare?: number;
  estimatedPrice?: number;
  paymentMethod?: string;
  payment?: { method?: string };
}

export function usePendingActions(
  userId: string | undefined,
  activeRide: ActiveRide | null,
  upcomingRide: UpcomingProgrammedRide | null,
  navigation: any,
  t: TFunction,
) {
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [hasPendingPayments, setHasPendingPayments] = useState(false);
  const [totalDebt, setTotalDebt] = useState(0);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [preflightActions, setPreflightActions] = useState<PreflightAction[]>(
    () => getPreflightResult()?.actions ?? [],
  );

  // TODO: Conectar con servicio futuro de pagos pendientes
  useEffect(() => {
    setHasPendingPayments(false);
    setTotalDebt(0);
  }, [userId]);

  const getActiveRideLabel = useCallback(
    (status: string) => {
      switch (status) {
        case 'requested':
          return t('client.home.activeRide.requested');
        case 'driver_offered':
        case 'accepted':
          return t('client.home.activeRide.confirm');
        case 'driver_on_route':
        case 'driver_arrived':
          return t('client.home.activeRide.driverOnRoute');
        case 'in_progress':
          return t('client.home.activeRide.inProgress');
        case 'pending_payment':
          return t('client.home.activeRide.pendingPayment');
        default:
          return t('client.home.activeRide.default');
      }
    },
    [t],
  );

  const handleViewActiveRide = useCallback(async () => {
    try {
      if (!activeRide) return;

      if (['requested', 'driver_offered', 'pending_confirm', 'driver_assigned'].includes(activeRide.status)) {
        navigation.replace('HomeOffers', { rideId: activeRide.id });
        return;
      }

      if (['accepted', 'driver_on_route', 'in_progress'].includes(activeRide.status)) {
        navigation.replace('RideTracking', {
          rideId: activeRide.id,
          driverId: activeRide.driverId,
          driverName: activeRide.driver?.name || 'Conductor',
          vehiclePlate: activeRide.vehicle?.plate || activeRide.driver?.vehicle?.plate || 'N/A',
          vehicleBrand: activeRide.vehicle?.make || activeRide.vehicle?.brand || activeRide.driver?.vehicle?.brand || 'N/A',
          vehicleModel: activeRide.vehicle?.model || activeRide.driver?.vehicle?.model || 'N/A',
          vehicleColor: activeRide.vehicle?.color || activeRide.driver?.vehicle?.color || 'N/A',
          estimatedFare: activeRide.finalFare || activeRide.estimatedPrice || 0,
        });
        return;
      }

      if (activeRide.status === 'pending_payment') {
        const paymentMethod = activeRide.paymentMethod || activeRide.payment?.method || 'cash';
        const finalAmount = activeRide.finalFare || activeRide.estimatedPrice || 0;
        const driverName = activeRide.driver?.name || 'Conductor';
        const driverPhoto = activeRide.driver?.photoURL || undefined;

        if (paymentMethod === 'card') {
          navigation.replace('Payment', {
            rideId: activeRide.id,
            amount: finalAmount,
            driverId: activeRide.driverId,
            driverName,
            vehiclePlate: activeRide.vehicle?.plate || activeRide.driver?.vehicle?.plate || 'N/A',
            driverPhoto,
            isPendingPayment: true,
          });
        } else {
          navigation.replace('CashPayment', {
            rideId: activeRide.id,
            amount: finalAmount,
            driverName,
            driverPhoto,
          });
        }
        return;
      }
    } catch (error: any) {
      console.error('❌ Error al navegar a viaje activo:', error);
    }
  }, [activeRide, navigation]);

  const handleViewPendingPayments = useCallback(() => {
    navigation.replace('PendingPayments');
  }, [navigation]);

  // Viaje programado inminente (≤30min): confirmar la asistencia del cliente y
  // llevarlo a HomeOffers. El rideId se conserva cuando el cron lo promueve a
  // activeRides, así que la pantalla lo detecta sola al activarse.
  const handleViewScheduledRide = useCallback(async () => {
    if (!upcomingRide) return;
    try {
      if (!upcomingRide.clientConfirmed) {
        await ridesService.confirmProgrammedRideClient(upcomingRide.rideId);
      }
    } catch (error: any) {
      // 'not-found'/'failed-precondition' → ya promovido o cancelado; igual
      // navegamos porque HomeOffers resuelve el estado real del ride.
      console.warn('[usePendingActions] confirmProgrammedRideClient:', error?.code || error?.message || error);
    }

    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.setItem('ACTIVE_RIDE_ID', upcomingRide.rideId);
    } catch {
      // noop
    }

    navigation.navigate('HomeOffers', {
      rideId: upcomingRide.rideId,
      programmedRide: {
        driverId: upcomingRide.driverId ?? undefined,
        driver: upcomingRide.driver ?? undefined,
        scheduledAt: upcomingRide.scheduledAt,
        origin: upcomingRide.origin ?? undefined,
        destination: upcomingRide.destination ?? undefined,
      },
    });
  }, [upcomingRide, navigation]);

  // Suscribirse al preflight store
  useEffect(() => {
    const unsubscribePreflight = subscribePreflightResult((summary) => {
      if (!summary || summary.role !== 'client') {
        setPreflightActions([]);
        return;
      }
      setPreflightActions(summary.actions);
    });

    return () => {
      unsubscribePreflight();
    };
  }, []);

  // Auto-navegación: el viaje programado inminente del cliente fue promovido
  // con conductor (mismo rideId conservado) → va directo a tracking, igual
  // que si hubiera tocado el botón. Solo aplica al viaje programado; el flujo
  // normal de activeRide sigue manual.
  // El nodo programmedRides se borra al promoverse, así que el rideId se
  // memoriza — upcomingRide ya es null cuando activeRide aparece.
  const lastScheduledRideIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (upcomingRide?.rideId) {
      lastScheduledRideIdRef.current = upcomingRide.rideId;
    }
  }, [upcomingRide?.rideId]);

  useEffect(() => {
    if (!activeRide) return;
    if (activeRide.id !== lastScheduledRideIdRef.current) return;
    if (!['accepted', 'driver_on_route', 'in_progress'].includes(activeRide.status)) return;
    if (!activeRide.driverId && !activeRide.driver) return;
    handleViewActiveRide();
  }, [activeRide, handleViewActiveRide]);

  // Prioridad: active_ride > scheduled_ride inminente > pending_payment > preflight
  useEffect(() => {
    if (activeRide) {
      setPendingAction({
        type: 'active_ride',
        title: getActiveRideLabel(activeRide.status),
        onPress: handleViewActiveRide,
      });
      return;
    }

    if (upcomingRide?.isImminent) {
      setPendingAction({
        type: 'scheduled_ride',
        title: upcomingRide.driverId
          ? t('client.home.scheduledRide.imminentTitleDriver')
          : t('client.home.scheduledRide.imminentTitle'),
        icon: 'schedule',
        onPress: handleViewScheduledRide,
      });
      return;
    }

    if (hasPendingPayments) {
      const pendingCount = pendingPayments.length > 0 ? pendingPayments.length : 1;
      setPendingAction({
        type: 'pending_payment',
        title:
          pendingCount === 1
            ? t('client.home.pendingAction.paymentSingle')
            : t('client.home.pendingAction.paymentMultiple', { count: pendingCount }),
        onPress: handleViewPendingPayments,
      });
      return;
    }

    if (preflightActions.length > 0) {
      const nextAction = preflightActions.find(
        (action) => action.type === 'active_ride' || action.type === 'pending_payment',
      );

      if (nextAction) {
        const actionType = nextAction.type === 'pending_payment' ? 'pending_payment' : 'active_ride';
        setPendingAction({
          type: actionType,
          title: nextAction.title,
          onPress: () => {
            if (nextAction.routeName) {
              navigation.navigate(nextAction.routeName as any, nextAction.routeParams);
            }
          },
        });
        return;
      }
    }

    setPendingAction(null);
  }, [hasPendingPayments, pendingPayments, activeRide, upcomingRide, preflightActions, getActiveRideLabel, handleViewActiveRide, handleViewScheduledRide, handleViewPendingPayments, navigation, t]);

  return {
    pendingPayments,
    hasPendingPayments,
    totalDebt,
    pendingAction,
    handleViewActiveRide,
    handleViewPendingPayments,
  };
}
