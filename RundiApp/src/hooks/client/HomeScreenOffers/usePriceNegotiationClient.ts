import { useCallback } from 'react';
import type { TFunction } from 'i18next';
import ridesService from '../../../services/ride/ridesService';
import priceNegotiationService from '../../../services/ride/priceNegotiationService';
import alertService from '../../../services/notification/alertService';
import { clearClientActiveRideState } from '../../../utils/ride/clientRideState';
import type { OfferItem } from './useRideOffers';

interface RideSnapshot {
  estimatedPrice?: number;
  estimatedFare?: number;
  rideType?: string;
  vehicleType?: string;
  clientSuggestedPrice?: number;
  driverOfferedPrice?: number;
  negotiationStatus?: string;
  acceptedClientPrice?: number;
  negotiation?: {
    clientSuggestedPrice?: number;
    driverOfferedPrice?: number;
  };
  pricingSnapshot?: {
    dynamicMinimumFare?: number;
  };
}

export function usePriceNegotiationClient(
  rideId: string | null,
  selectedOffer: OfferItem | undefined,
  rideSnapshot: RideSnapshot | null,
  negotiationBasePrice: number | null,
  driverFallbackName: string,
  navigation: any,
  t: TFunction,
  resetRideOffers: () => void,
) {
  const isDesignatedRide =
    String(rideSnapshot?.rideType ?? '').toLowerCase() === 'designated_driver' ||
    String(rideSnapshot?.vehicleType ?? '').toLowerCase() === 'designated_driver';

  const navigateToTracking = useCallback(
    (driverId: string, driverName: string) => {
      const params = {
        rideId,
        driverId,
        driverName: driverName || driverFallbackName,
        showDesignatedDriverEvidenceNotice: isDesignatedRide,
      };
      if (navigation?.replace) {
        navigation.replace('RideTracking', params);
      } else {
        navigation?.navigate?.('RideTracking', params);
      }
    },
    [navigation, rideId, driverFallbackName, isDesignatedRide],
  );

  const onAcceptDriverOffer = useCallback(async () => {
    if (!rideId || !selectedOffer) return;
    try {
      await priceNegotiationService.acceptDriverOffer(
        rideId,
        selectedOffer.driverId,
        selectedOffer.offeredPrice || 0,
      );
      await ridesService.confirmDriver(rideId, selectedOffer.driverId);
      navigateToTracking(selectedOffer.driverId, selectedOffer.driver?.name || driverFallbackName);
    } catch (e: any) {
      alertService.showErrorAlert(e?.message || t('client.homeOffers.alerts.acceptOfferError'));
    }
  }, [rideId, selectedOffer, navigateToTracking, driverFallbackName, t]);

  const onSendCounterOffer = useCallback(
    async (price: number) => {
      if (!rideId || !selectedOffer) return;
      try {
        await priceNegotiationService.negotiatePrice(
          rideId,
          price,
          'client',
          negotiationBasePrice ?? undefined,
          undefined,
          rideSnapshot?.pricingSnapshot?.dynamicMinimumFare,
        );
      } catch (e: any) {
        alertService.showErrorAlert(e?.message || t('client.homeOffers.alerts.counterOfferError'));
      }
    },
    [rideId, selectedOffer, negotiationBasePrice, t],
  );

  const onAcceptAndStartRide = useCallback(async () => {
    if (!rideId || !selectedOffer) return;
    try {
      await ridesService.confirmDriver(rideId, selectedOffer.driverId);
      navigateToTracking(selectedOffer.driverId, selectedOffer?.driver?.name || 'Conductor');
    } catch (e: any) {
      alertService.showErrorAlert(e?.message || t('client.homeOffers.alerts.confirmFromModalError'));
    }
  }, [rideId, selectedOffer, navigateToTracking, t]);

  const cancelSearch = useCallback(async () => {
    if (!rideId) return;
    try {
      await ridesService.cancelRide(rideId, t('client.homeOffers.cancelReason'));
      await clearClientActiveRideState();
      resetRideOffers();
      alertService.showSuccessAlert(
        t('client.homeOffers.alerts.cancelSuccessTitle'),
        t('client.homeOffers.alerts.cancelSuccessMessage'),
      );
      navigation.replace('ClientHome');
    } catch (e: any) {
      alertService.showErrorAlert(e?.message || t('client.homeOffers.alerts.cancelError'));
    }
  }, [rideId, navigation, t, resetRideOffers]);

  const confirmSelectedDriver = useCallback(
    async (selectedDriverId: string | null) => {
      if (!rideId || !selectedDriverId) return;
      try {
        await ridesService.confirmDriver(rideId, selectedDriverId);
        alertService.showSuccessAlert(
          t('client.homeOffers.alerts.confirmSuccessTitle'),
          t('client.homeOffers.alerts.confirmSuccessMessage'),
        );
        const driverName =
          selectedOffer?.driver?.name || driverFallbackName;
        navigateToTracking(selectedDriverId, driverName);
      } catch (e: any) {
        alertService.showErrorAlert(e?.message || t('client.homeOffers.alerts.confirmError'));
      }
    },
    [rideId, selectedOffer, navigateToTracking, driverFallbackName, t],
  );

  return {
    onAcceptDriverOffer,
    onSendCounterOffer,
    onAcceptAndStartRide,
    cancelSearch,
    confirmSelectedDriver,
  };
}
