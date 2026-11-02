import { useEffect, useState } from 'react';
import type { TFunction } from 'i18next';
import type { DriverOfferCacheEntry } from '../../../services/driver/driverOfferCacheService';
import {
  getActiveRidePendingCopy,
  parseCoordinate,
  normalizeRidePreviewPayload,
  type RawRideStop,
} from '../../../utils/driver/driverHomeHelpers';
import type { PreflightAction } from '../../../stores/preflightStore';

type PendingAction =
  | { type: 'pending_payment'; title: string; subtitle: string; onPress: () => void }
  | { type: 'active_ride'; title: string; subtitle: string; onPress: () => void }
  | { type: 'pending_offer'; title: string; subtitle: string; onPress: () => void };

interface PendingOfferTarget {
  entry: DriverOfferCacheEntry;
  ridePayload: Record<string, any> | null;
}

interface UseDriverPendingActionParams {
  hasInsufficientFunds: boolean;
  pendingPayments: any[];
  pendingOfferTarget: PendingOfferTarget | null;
  pendingNegotiationRide: any;
  activeRide: any;
  preflightActions: PreflightAction[];
  preflightSummary: any;
  userId: string | undefined;
  navigation: any;
  t: TFunction;
}

export function useDriverPendingAction({
  hasInsufficientFunds,
  pendingPayments,
  pendingOfferTarget,
  pendingNegotiationRide,
  activeRide,
  preflightActions,
  preflightSummary,
  userId,
  navigation,
  t,
}: UseDriverPendingActionParams) {
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  useEffect(() => {
    if (hasInsufficientFunds) {
      setPendingAction(null);
      return;
    }

    if (pendingPayments.length > 0) {
      const firstPayment = pendingPayments[0];
      const baseAmount =
        typeof firstPayment.finalAmount === 'number'
          ? firstPayment.finalAmount
          : typeof firstPayment.amount === 'number'
            ? firstPayment.amount
            : 0;

      setPendingAction({
        type: 'pending_payment',
        title: t('driver.home.pendingAction.paymentTitle'),
        subtitle:
          pendingPayments.length === 1
            ? t('driver.home.pendingAction.paymentSingleSubtitle')
            : t('driver.home.pendingAction.paymentMultipleSubtitle', { count: pendingPayments.length }),
        onPress: () => {
          navigation.replace('PaymentConfirmation', {
            rideId: firstPayment.rideId,
            amount: baseAmount,
            paymentMethod: firstPayment.method || firstPayment.paymentMethod || 'cash',
            clientName: t('driver.home.ride.clientFallback'),
            fromHome: true,
          });
        },
      });
      return;
    }

    if (pendingOfferTarget && userId) {
      const normalizedRide = normalizeRidePreviewPayload(
        pendingOfferTarget.ridePayload,
        pendingOfferTarget.entry,
        userId,
      );
      setPendingAction({
        type: 'pending_offer',
        title: t('driver.home.activeRideStatus.offerMade.title'),
        subtitle: t('driver.home.activeRideStatus.offerMade.subtitle'),
        onPress: () => {
          navigation.replace('RidePreview', { ride: normalizedRide, proximity: true });
        },
      });
      return;
    }

    if (pendingNegotiationRide) {
      const ride = pendingNegotiationRide;
      const originLat = parseCoordinate(ride?.origin?.lat ?? ride?.origin?.latitude ?? ride?.originLatitude) ?? 0;
      const originLng = parseCoordinate(ride?.origin?.lng ?? ride?.origin?.longitude ?? ride?.originLongitude) ?? 0;
      const destinationLat = parseCoordinate(ride?.destination?.lat ?? ride?.destination?.latitude ?? ride?.destinationLatitude) ?? 0;
      const destinationLng = parseCoordinate(ride?.destination?.lng ?? ride?.destination?.longitude ?? ride?.destinationLongitude) ?? 0;
      const originAddress = ride?.origin?.address ?? ride?.originAddress ?? t('driver.home.ride.originFallback');
      const destinationAddress = ride?.destination?.address ?? ride?.destinationAddress ?? t('driver.home.ride.destinationFallback');
      const extraDestinations = Array.isArray(ride?.extraDestinations)
        ? ride.extraDestinations.map((stop: RawRideStop) => ({
            lat: parseCoordinate(stop?.lat ?? stop?.latitude) ?? 0,
            lng: parseCoordinate(stop?.lng ?? stop?.longitude) ?? 0,
            address: stop?.address,
          }))
        : [];
      const estimatedFare = Number.isFinite(ride?.finalFare)
        ? Number(ride.finalFare)
        : Number.isFinite(ride?.clientSuggestedPrice)
          ? Number(ride.clientSuggestedPrice)
          : Number.isFinite(ride?.estimatedPrice)
            ? Number(ride.estimatedPrice)
            : 0;

      setPendingAction({
        type: 'active_ride',
        title: t('driver.home.pendingAction.negotiationTitle'),
        subtitle: t('driver.home.pendingAction.negotiationSubtitle'),
        onPress: () => {
          navigation.replace('WaitingClientConfirmation', {
            rideId: ride.id,
            clientId: ride.clientId,
            origin: { lat: originLat, lng: originLng, address: originAddress },
            destination: { lat: destinationLat, lng: destinationLng, address: destinationAddress },
            estimatedFare,
            extraDestinations,
          });
        },
      });
      return;
    }

    if (activeRide) {
      const copy = getActiveRidePendingCopy(activeRide, t);
      setPendingAction({
        type: 'active_ride',
        title: copy.title,
        subtitle: copy.subtitle,
        onPress: () => {
          navigation.replace('ActiveRide', {
            rideId: activeRide.id,
            clientId: activeRide.clientId,
            origin: activeRide.origin,
            destination: activeRide.destination,
            estimatedFare: activeRide.finalFare || activeRide.estimatedPrice,
          });
        },
      });
      return;
    }

    if (preflightActions.length > 0) {
      const priority = ['active_ride', 'pending_payment'] as const;
      const nextAction = priority
        .map((type) => preflightActions.find((action) => action.type === type))
        .find((action) => {
          if (!action) return false;
          if (action.type === 'active_ride' && !activeRide) return false;
          if (
            action.type === 'pending_payment' &&
            pendingPayments.length === 0 &&
            Number(preflightSummary?.preflightData?.pendingPayments?.count ?? 0) === 0
          ) {
            return false;
          }
          return true;
        });

      if (nextAction) {
        const actionType = nextAction.type === 'pending_payment' ? 'pending_payment' : 'active_ride';
        const subtitle = nextAction.subtitle || t('driver.home.pendingAction.genericSubtitle');
        setPendingAction({
          type: actionType,
          title: nextAction.title,
          subtitle,
          onPress: () => {
            if (nextAction.routeName) {
              navigation.replace(nextAction.routeName as any, nextAction.routeParams);
            }
          },
        });
        return;
      }
    }

    setPendingAction(null);
  }, [
    hasInsufficientFunds, pendingPayments, pendingOfferTarget, pendingNegotiationRide,
    activeRide, preflightActions, navigation, t, userId,
    preflightSummary?.preflightData?.pendingPayments?.count,
  ]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', (e: any) => {
      if (e?.data?.state?.routeNames?.[e.data.state.index] === 'DriverHome') {
        setPendingAction((prev) => (prev?.type === 'pending_payment' ? null : prev));
      }
    });
    return () => { unsubscribe?.(); };
  }, [navigation]);

  return { pendingAction };
}
