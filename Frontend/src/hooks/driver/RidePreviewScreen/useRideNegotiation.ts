import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TextInput } from 'react-native';
import priceNegotiationService from '../../../services/priceNegotiationService';
import driverOfferCacheService, { DriverOfferCacheEntry } from '../../../services/driverOfferCacheService';
import alertService from '../../../services/alertService';
import type { RidePreviewData } from './useRidePreviewData';
import {
  computeQuickSuggestions,
  computeFinalPricePreview,
  buildOfferCacheEntry,
  formatCurrency,
} from '../../../utils/ridePreviewHelpers';
import type { TFunction } from 'i18next';

export function useRideNegotiation(
  ride: RidePreviewData,
  currentRide: RidePreviewData,
  userId: string | undefined,
  resolvedClientName: string,
  setRideData: React.Dispatch<React.SetStateAction<RidePreviewData>>,
  setCounterOfferTouched: (touched: boolean) => void,
  t: TFunction,
) {
  const [counterOffer, setCounterOffer] = useState(
    ride.driverOfferedPrice ? Math.round(ride.driverOfferedPrice).toString() : '',
  );
  const [lastSuggestedPrice, setLastSuggestedPrice] = useState<number | null>(
    typeof ride.driverOfferedPrice === 'number' ? Math.round(ride.driverOfferedPrice) : null,
  );
  const [sendingOffer, setSendingOffer] = useState(false);
  const [customOfferVisible, setCustomOfferVisible] = useState(false);
  const [manualOfferLock, setManualOfferLock] = useState(false);
  const customOfferInputRef = useRef<TextInput | null>(null);

  const hasPendingOffer = useMemo(() => {
    const status = (currentRide.negotiationStatus || '').toLowerCase();
    const driverStatus = (currentRide.driverOfferStatus || '').toLowerCase();
    return status === 'driver_offered' || driverStatus === 'pending' || driverStatus === 'waiting';
  }, [currentRide.negotiationStatus, currentRide.driverOfferStatus]);

  const navigationLocked = manualOfferLock || hasPendingOffer;

  const quickSuggestions = useMemo(
    () => computeQuickSuggestions(currentRide.estimatedPrice || 0),
    [currentRide.estimatedPrice],
  );

  const finalPricePreview = useMemo(
    () => computeFinalPricePreview(counterOffer, currentRide, t),
    [counterOffer, currentRide, t],
  );

  useEffect(() => {
    if (typeof currentRide.driverOfferedPrice === 'number' && !Number.isNaN(currentRide.driverOfferedPrice)) {
      setLastSuggestedPrice(Math.round(currentRide.driverOfferedPrice));
    } else {
      setLastSuggestedPrice(null);
    }
  }, [currentRide.driverOfferedPrice]);

  useEffect(() => {
    if (hasPendingOffer) {
      setManualOfferLock(false);
    }
  }, [hasPendingOffer]);

  useEffect(() => {
    setManualOfferLock(false);
  }, [ride.id]);

  const cacheCurrentOffer = useCallback(
    async (overrides?: Partial<DriverOfferCacheEntry>) => {
      if (!userId) return;
      const entry = buildOfferCacheEntry(currentRide, userId, resolvedClientName, overrides);
      await driverOfferCacheService.save(entry);
    },
    [currentRide, userId, resolvedClientName],
  );

  const submitCounterOffer = useCallback(
    async (value: number): Promise<boolean> => {
      if (!userId) {
        alertService.showErrorAlert(t('driver.ridePreview.alerts.missingUser'));
        return false;
      }
      let success = false;
      try {
        setSendingOffer(true);
        await priceNegotiationService.negotiatePrice(
          currentRide.id,
          value,
          'driver',
          currentRide.estimatedPrice,
          userId,
        );
        setCounterOffer(value.toString());
        setLastSuggestedPrice(value);
        success = true;
        setRideData((prev) => ({
          ...prev,
          driverOfferedPrice: value,
          negotiationStatus: 'driver_offered',
          driverOfferStatus: 'pending',
        }));
        setManualOfferLock(true);
        await cacheCurrentOffer({
          offeredPrice: value,
          negotiationStatus: 'driver_offered',
        });
      } catch (error: any) {
        alertService.showErrorAlert(error?.message || t('driver.ridePreview.alerts.counterOfferError'));
      } finally {
        setSendingOffer(false);
      }
      return success;
    },
    [userId, currentRide, t, setRideData, cacheCurrentOffer],
  );

  const handleApplySuggestion = useCallback(
    async (value: number) => {
      const rounded = Math.round(value);
      setCounterOfferTouched(true);
      setCounterOffer(rounded.toString());
      await submitCounterOffer(rounded);
    },
    [setCounterOfferTouched, submitCounterOffer],
  );

  const handleCustomOfferPress = useCallback(() => {
    setCustomOfferVisible((prev) => {
      const next = !prev;
      if (next) {
        setCounterOfferTouched(true);
        if (!counterOffer) {
          const baseSource =
            typeof currentRide.clientSuggestedPrice === 'number' && currentRide.clientSuggestedPrice > 0
              ? Math.round(currentRide.clientSuggestedPrice)
              : Math.round(currentRide.estimatedPrice || 0);
          if (baseSource > 0) {
            setCounterOffer(baseSource.toString());
          }
        }
        setTimeout(() => customOfferInputRef.current?.focus(), 80);
      } else {
        customOfferInputRef.current?.blur();
      }
      return next;
    });
  }, [counterOffer, currentRide.clientSuggestedPrice, currentRide.estimatedPrice, setCounterOfferTouched]);

  const handleCustomOfferChange = useCallback((text: string) => {
    const sanitized = text.replace(/[^0-9]/g, '');
    setCounterOfferTouched(true);
    setCounterOffer(sanitized);
  }, [setCounterOfferTouched]);

  const handleSendCustomOffer = useCallback(async () => {
    if (sendingOffer) return;
    const numericValue = Number(counterOffer.replace(/[^0-9]/g, ''));
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      alertService.showInfoAlert(
        t('driver.ridePreview.alerts.invalidPriceTitle'),
        t('driver.ridePreview.alerts.invalidPriceBody'),
      );
      return;
    }
    const roundedValue = Math.round(numericValue);
    setCounterOffer(roundedValue.toString());
    const wasSuccessful = await submitCounterOffer(roundedValue);
    if (wasSuccessful) {
      setCustomOfferVisible(false);
      customOfferInputRef.current?.blur();
    }
  }, [counterOffer, sendingOffer, submitCounterOffer, t]);

  return {
    counterOffer,
    setCounterOffer,
    lastSuggestedPrice,
    sendingOffer,
    customOfferVisible,
    setCustomOfferVisible,
    customOfferInputRef,
    manualOfferLock,
    setManualOfferLock,
    hasPendingOffer,
    navigationLocked,
    quickSuggestions,
    finalPricePreview,
    cacheCurrentOffer,
    submitCounterOffer,
    handleApplySuggestion,
    handleCustomOfferPress,
    handleCustomOfferChange,
    handleSendCustomOffer,
    formatCurrencyFn: (v: number | null | undefined) => formatCurrency(v, t),
  };
}
