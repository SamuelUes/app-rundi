import { useCallback, useRef, useState } from 'react';
import { Animated } from 'react-native';
import ridesService from '../../../services/ridesService';
import priceNegotiationService from '../../../services/priceNegotiationService';
import driverOfferCacheService from '../../../services/driverOfferCacheService';
import proximityService from '../../../services/proximityService';
import alertService from '../../../services/alertService';
import { hasSavedCard } from '../../../utils/cardUtils';
import type { RidePreviewData } from '../../driver/RidePreviewScreen/useRidePreviewData';
import type { TFunction } from 'i18next';

export function useRideActions(
  currentRide: RidePreviewData,
  userId: string | undefined,
  activeRideGuard: string | null,
  setRideData: React.Dispatch<React.SetStateAction<RidePreviewData>>,
  setManualOfferLock: (locked: boolean) => void,
  cacheCurrentOffer: (overrides?: any) => Promise<void>,
  markDismissed: (rideId: string) => Promise<void>,
  formatCurrencyFn: (v: number | null | undefined) => string,
  navigation: any,
  t: TFunction,
) {
  const [acceptingRide, setAcceptingRide] = useState(false);
  const [isRejectingRide, setIsRejectingRide] = useState(false);
  const acceptButtonScale = useRef(new Animated.Value(1)).current;
  const rejectButtonScale = useRef(new Animated.Value(1)).current;
  const allowNavigationRef = useRef(false);

  const ensureCardForCardPayments = async (): Promise<boolean> => {
    const method = currentRide.paymentMethod;
    if ((method || '').toLowerCase() !== 'card') {
      return true;
    }
    if (await hasSavedCard()) {
      return true;
    }
    alertService.showConfirmAlert(
      t('driver.ridePreview.alerts.cardRequiredTitle'),
      t('driver.ridePreview.alerts.cardRequiredBody'),
      () => navigation.navigate('PaymentMethods'),
      undefined,
      t('driver.ridePreview.alerts.cardRequiredConfirm'),
      t('driver.ridePreview.alerts.cardRequiredCancel'),
    );
    return false;
  };

  const handleAcceptRide = useCallback(async () => {
    if (acceptingRide) return;

    try {
      if (activeRideGuard) {
        alertService.showInfoAlert(
          t('driver.ridePreview.alerts.activeRideTitle'),
          t('driver.ridePreview.alerts.activeRideBody'),
          () => navigation.replace('ActiveRide', { rideId: activeRideGuard }),
        );
        return;
      }

      if (!(await ensureCardForCardPayments())) {
        return;
      }

      setAcceptingRide(true);
      Animated.timing(acceptButtonScale, {
        toValue: 0.95,
        duration: 130,
        useNativeDriver: true,
      }).start();

      // Viaje programado: no existe en activeRides — "Aceptar" equivale a
      // confirmar la asignación. El scheduler lo promueve en scheduledAt.
      if (currentRide.isProgrammed) {
        await ridesService.confirmProgrammedRideDriver(currentRide.id);
        alertService.showSuccessAlert(
          t('driver.available.alerts.scheduledConfirmedTitle'),
          t('driver.available.alerts.scheduledConfirmedBody'),
        );
        setManualOfferLock(true);
        allowNavigationRef.current = true;
        navigation.goBack();
        return;
      }

      const hasClientSuggested =
        typeof currentRide.clientSuggestedPrice === 'number' &&
        Number.isFinite(currentRide.clientSuggestedPrice) &&
        currentRide.clientSuggestedPrice > 0;
      const hasEstimatedPrice =
        typeof currentRide.estimatedPrice === 'number' &&
        Number.isFinite(currentRide.estimatedPrice) &&
        currentRide.estimatedPrice > 0;

      let cachedOfferValue: number | null = null;
      if (hasClientSuggested || hasEstimatedPrice) {
        const priceToShow = hasClientSuggested
          ? currentRide.clientSuggestedPrice
          : currentRide.estimatedPrice;

        await priceNegotiationService.acceptClientPrice(currentRide.id);
        alertService.showSuccessAlert(
          t('driver.ridePreview.alerts.offerSentTitle'),
          t('driver.ridePreview.alerts.offerAcceptedBody', {
            amount: formatCurrencyFn(priceToShow || 0),
          }),
        );
        cachedOfferValue = Number(priceToShow) || null;
        setRideData((prev) => ({
          ...prev,
          driverOfferedPrice: priceToShow ?? prev.driverOfferedPrice ?? null,
          negotiationStatus: 'driver_accepted',
          driverOfferStatus: 'pending',
        }));
      } else {
        const acceptData = {
          driverId: userId || '',
        };
        await ridesService.acceptRide(currentRide.id, acceptData);
        alertService.showSuccessAlert(
          t('driver.ridePreview.alerts.offerSentTitle'),
          t('driver.ridePreview.alerts.offerNotifiedBody'),
        );
        setRideData((prev) => ({
          ...prev,
          negotiationStatus: prev.negotiationStatus || 'driver_offered',
          driverOfferStatus: 'pending',
        }));
      }

      setManualOfferLock(true);
      await cacheCurrentOffer({
        offeredPrice: cachedOfferValue,
        negotiationStatus: 'driver_accepted',
      });

      navigation.replace('WaitingClientConfirmation', {
        rideId: currentRide.id,
        clientId: currentRide.clientId,
        origin: {
          lat: currentRide.origin.lat,
          lng: currentRide.origin.lng,
          address: currentRide.origin.address || t('driver.ridePreview.labels.originFallback'),
        },
        destination: {
          lat: currentRide.destination.lat,
          lng: currentRide.destination.lng,
          address: currentRide.destination.address || t('driver.ridePreview.labels.destinationFallback'),
        },
        estimatedFare: currentRide.clientSuggestedPrice || currentRide.estimatedPrice,
        extraDestinations: (currentRide.extraDestinations || []).map((stop) => ({
          lat: stop.lat,
          lng: stop.lng,
          address: stop.address,
        })),
      });
    } catch (error: any) {
      const message = String(error?.message || '');
      alertService.showErrorAlert(
        message.includes('CREW_FOLLOWER_CANNOT_ACCEPT')
          ? t('driver.crew.errors.followerCannotAccept')
          : error?.message || t('driver.ridePreview.alerts.acceptRideError'),
      );
    } finally {
      Animated.timing(acceptButtonScale, {
        toValue: 1,
        duration: 170,
        useNativeDriver: true,
      }).start();
      setAcceptingRide(false);
    }
  }, [
    acceptingRide,
    activeRideGuard,
    currentRide,
    userId,
    navigation,
    t,
    setRideData,
    setManualOfferLock,
    cacheCurrentOffer,
    formatCurrencyFn,
  ]);

  const handleRejectRide = useCallback(() => {
    if (isRejectingRide) return;

    setIsRejectingRide(true);
    Animated.timing(rejectButtonScale, {
      toValue: 0.95,
      duration: 130,
      useNativeDriver: true,
    }).start();

    const finishReject = () => {
      Animated.timing(rejectButtonScale, {
        toValue: 1,
        duration: 170,
        useNativeDriver: true,
      }).start();
      setIsRejectingRide(false);
    };

    const negotiationStatus = String(currentRide.negotiationStatus || '').toLowerCase();
    const driverOfferStatus = String(currentRide.driverOfferStatus || '').toLowerCase();
    const hasOfferedOrNegotiatedPrice =
      (typeof currentRide.driverOfferedPrice === 'number' &&
        Number.isFinite(currentRide.driverOfferedPrice) &&
        currentRide.driverOfferedPrice > 0) ||
      negotiationStatus.startsWith('driver_') ||
      ['pending', 'waiting', 'accepted'].includes(driverOfferStatus);

    ridesService
      .rejectRide(currentRide.id, hasOfferedOrNegotiatedPrice ? 'driver_withdrew_offer' : 'not_interested')
      .catch((error: any) => {
        console.warn('[useRideActions] No se pudo registrar rechazo de ride:', error);
      })
      .finally(() => {
        markDismissed(currentRide.id)
          .catch((error) => {
            console.warn('[useRideActions] No se pudo descartar ride:', error);
          })
          .finally(() => {
            finishReject();
            if (userId) {
              driverOfferCacheService.clearEntry(userId, currentRide.id).catch((err) =>
                console.warn('[useRideActions] Failed to clear cache entry', err),
              );
            }
            allowNavigationRef.current = true;
            navigation.goBack();
          });
      });
  }, [isRejectingRide, currentRide, userId, navigation, markDismissed]);

  return {
    acceptingRide,
    isRejectingRide,
    acceptButtonScale,
    rejectButtonScale,
    allowNavigationRef,
    handleAcceptRide,
    handleRejectRide,
  };
}
