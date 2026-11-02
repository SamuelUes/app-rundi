import { useEffect, useRef } from 'react';
import type { TFunction } from 'i18next';
import type { VoiceAssistantCategory } from '../../../services/support/voiceAssistantService';
import type { SpeechOptions } from 'expo-speech';
import { haversineKm } from '../../../utils/geo/distance'; 

interface UseDriverVoiceAnnouncementsParams {
  voiceSettings: { enabled: boolean };
  isAvailable: boolean;
  activeRide: any;
  availableRideRequests: any[];
  pendingAction: any;
  coords: { latitude: number; longitude: number } | null;
  t: TFunction;
  speakVoice: (text: string, category?: VoiceAssistantCategory, options?: SpeechOptions, force?: boolean) => string | null;
  stopVoiceCategory: (category: VoiceAssistantCategory) => void;
}

export function useDriverVoiceAnnouncements({
  voiceSettings,
  isAvailable,
  activeRide,
  availableRideRequests,
  pendingAction,
  coords,
  t,
  speakVoice,
  stopVoiceCategory,
}: UseDriverVoiceAnnouncementsParams) {
  const announcedRideIdsRef = useRef<Set<string>>(new Set());
  const lastPendingActionRef = useRef<string | null>(null);
  const lastAvailabilityAnnouncementRef = useRef<boolean | null>(null);
  const lastActiveRideIdRef = useRef<string | null>(null);
  const initialVoiceWelcomeRef = useRef<boolean>(false);

  useEffect(() => {
    if (!voiceSettings.enabled) {
      announcedRideIdsRef.current.clear();
      lastPendingActionRef.current = null;
      initialVoiceWelcomeRef.current = false;
      stopVoiceCategory('navigation');
      stopVoiceCategory('status');
      return;
    }

    if (!initialVoiceWelcomeRef.current) {
      initialVoiceWelcomeRef.current = true;
      speakVoice(t('driver.home.voice.ready'), 'status', undefined, true);
    }
  }, [voiceSettings.enabled, speakVoice, stopVoiceCategory, t]);

  useEffect(() => {
    if (!voiceSettings.enabled) return;

    if (lastAvailabilityAnnouncementRef.current === null) {
      lastAvailabilityAnnouncementRef.current = isAvailable;
      if (isAvailable) {
        speakVoice(t('driver.home.voice.availabilityOn'), 'status');
      }
      return;
    }

    if (lastAvailabilityAnnouncementRef.current !== isAvailable) {
      lastAvailabilityAnnouncementRef.current = isAvailable;
      speakVoice(
        isAvailable ? t('driver.home.voice.availabilityOn') : t('driver.home.voice.availabilityOff'),
        'status',
      );
    }
  }, [isAvailable, voiceSettings.enabled, speakVoice, t]);

  useEffect(() => {
    if (!voiceSettings.enabled || !isAvailable || activeRide) return;

    const currentIds = new Set(availableRideRequests.map((ride) => ride.id));
    announcedRideIdsRef.current.forEach((id) => {
      if (!currentIds.has(id)) announcedRideIdsRef.current.delete(id);
    });

    availableRideRequests.forEach((ride) => {
      if (announcedRideIdsRef.current.has(ride.id)) return;
      announcedRideIdsRef.current.add(ride.id);

      let distanceKm: number | null = typeof ride.distanceKm === 'number' ? ride.distanceKm : null;
      if ((distanceKm === null || !Number.isFinite(distanceKm)) && coords) {
        distanceKm = haversineKm(coords.latitude, coords.longitude, ride.latitude, ride.longitude);
      }

      const priceAmount: number = typeof ride.priceAmount === 'number' ? ride.priceAmount : 0;
      const roundedPrice = Math.round(priceAmount);
      const distanceText = Number.isFinite(distanceKm as number)
        ? t('driver.home.voice.nearbyRideDistance', { distance: (distanceKm as number).toFixed(1) })
        : t('driver.home.voice.nearbyRideDistanceFallback');

      const phrase = t('driver.home.voice.nearbyRide', { distance: distanceText, price: roundedPrice });
      speakVoice(phrase, 'navigation');
    });
  }, [availableRideRequests, voiceSettings.enabled, isAvailable, activeRide, speakVoice, coords?.latitude, coords?.longitude, t]);

  useEffect(() => {
    if (!voiceSettings.enabled || !pendingAction) {
      if (!pendingAction) lastPendingActionRef.current = null;
      return;
    }

    const signature = `${pendingAction.type}:${pendingAction.title}:${pendingAction.subtitle}`;
    if (lastPendingActionRef.current === signature) return;
    lastPendingActionRef.current = signature;
    speakVoice(`${pendingAction.title}. ${pendingAction.subtitle}`, 'status');
  }, [pendingAction, voiceSettings.enabled, speakVoice]);

  useEffect(() => {
    if (!voiceSettings.enabled || !activeRide) {
      if (!activeRide) lastActiveRideIdRef.current = null;
      return;
    }

    if (lastActiveRideIdRef.current === activeRide.id) return;
    lastActiveRideIdRef.current = activeRide.id;

    const clientName = activeRide.client?.name || activeRide.clientName || t('driver.home.voice.clientFallback');
    const destinationText =
      activeRide.destinationAddress ||
      activeRide.destination?.address ||
      t('driver.home.voice.destinationFallback');

    speakVoice(t('driver.home.voice.activeRide', { client: clientName, destination: destinationText }), 'status');
  }, [activeRide, voiceSettings.enabled, speakVoice, t]);
}
