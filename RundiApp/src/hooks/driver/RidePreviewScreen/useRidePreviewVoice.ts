import { useEffect, useRef } from 'react';
import type { RidePreviewData } from './useRidePreviewData';

export function useRidePreviewVoice(
  voiceEnabled: boolean,
  currentRide: RidePreviewData,
  totalDistanceKm: number | null,
  speakVoice: (text: string, category: any, opts?: any, force?: boolean) => any,
  t: (path: string, options?: Record<string, any>) => string,
) {
  const lastVoiceSummaryRef = useRef<string | null>(null);
  const lastClientOfferSpokenRef = useRef<number | null>(null);

  useEffect(() => {
    if (!voiceEnabled) {
      lastVoiceSummaryRef.current = null;
      lastClientOfferSpokenRef.current = null;
      return;
    }

    const netPrice = Math.round(
      typeof currentRide.clientSuggestedPrice === 'number' && Number.isFinite(currentRide.clientSuggestedPrice)
        ? currentRide.clientSuggestedPrice
        : currentRide.estimatedPrice || 0,
    );
    const distanceFix = typeof totalDistanceKm === 'number' && Number.isFinite(totalDistanceKm)
      ? totalDistanceKm.toFixed(1)
      : null;

    const signature = [currentRide.id, netPrice, distanceFix || 'na'].join('|');
    if (lastVoiceSummaryRef.current === signature) return;
    lastVoiceSummaryRef.current = signature;

    const summaryKey = distanceFix
      ? 'driver.ridePreview.voice.summaryWithDistance'
      : 'driver.ridePreview.voice.summary';
    const voiceMessage = t(summaryKey, {
      price: netPrice,
      distance: distanceFix,
    });
    speakVoice(voiceMessage, 'navigation', undefined, true);
  }, [
    voiceEnabled,
    currentRide.id,
    currentRide.clientSuggestedPrice,
    currentRide.estimatedPrice,
    totalDistanceKm,
    speakVoice,
    t,
  ]);

  useEffect(() => {
    if (!voiceEnabled) {
      return;
    }

    const status = (currentRide.negotiationStatus || '').toLowerCase();
    if (status !== 'client_suggested') {
      lastClientOfferSpokenRef.current = null;
      return;
    }

    const value = typeof currentRide.clientSuggestedPrice === 'number' ? currentRide.clientSuggestedPrice : null;
    if (value === null || !Number.isFinite(value) || value <= 0) {
      return;
    }

    const rounded = Math.round(value);
    if (lastClientOfferSpokenRef.current === rounded) {
      return;
    }

    lastClientOfferSpokenRef.current = rounded;
    speakVoice(t('driver.ridePreview.voice.clientOffer', { amount: rounded }), 'status', undefined, true);
  }, [voiceEnabled, currentRide.negotiationStatus, currentRide.clientSuggestedPrice, speakVoice, t]);
}
