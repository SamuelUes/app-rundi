import { useCallback, useEffect, useState } from 'react';
import { subscribePreflightResult, getPreflightResult, type PreflightAction } from '../../../stores/preflightStore';
import type { TFunction } from 'i18next';

export type PendingAction = {
  type: 'pending_payment' | 'active_ride';
  title: string;
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
        case 'pending_confirm':
        case 'driver_offered':
        case 'driver_assigned':
          return t('client.home.activeRide.confirm');
        case 'accepted':
        case 'driver_on_route':
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

  // Prioridad: active_ride > pending_payment > preflight
  useEffect(() => {
    if (activeRide) {
      setPendingAction({
        type: 'active_ride',
        title: getActiveRideLabel(activeRide.status),
        onPress: handleViewActiveRide,
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
  }, [hasPendingPayments, pendingPayments, activeRide, preflightActions, getActiveRideLabel, handleViewActiveRide, handleViewPendingPayments, navigation, t]);

  return {
    pendingPayments,
    hasPendingPayments,
    totalDebt,
    pendingAction,
    handleViewActiveRide,
    handleViewPendingPayments,
  };
}
