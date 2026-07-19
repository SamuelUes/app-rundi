import { useEffect } from 'react';
import { Platform } from 'react-native';
import { EventEmitter } from 'expo';
import { navigate, navigationRef } from '../../../navigation/NavigationService';
import { FALLBACK_OVERLAY_RIDE_ID } from '../../../services/proximityService';
import { fetchRidePreview } from '../../../services/ridePreviewService';
import { OverlayPermissionModule } from '../../../../modules/rundi-native/src';

/**
 * Hook para detectar cuando la app se abre desde el overlay
 * y navegar a RidePreviewScreen con los datos del viaje
 */
export function useOverlayDeepLink() {
  useEffect(() => {
    if (Platform.OS !== 'android' || !OverlayPermissionModule) {
      return;
    }

    // Escuchar evento de apertura desde overlay via EventEmitter
    const emitter = new EventEmitter(OverlayPermissionModule);
    const subscription = (emitter.addListener as (event: string, cb: (data: { rideId: string }) => void) => { remove: () => void })('onOverlayOpened', async (data) => {
      console.log('🫧 [useOverlayDeepLink] App opened from overlay:', data);

      const { rideId } = data;
      if (!rideId) {
        console.warn('⚠️ [useOverlayDeepLink] No rideId provided');
        return;
      }

      const ensureNavigationReady = async () => {
        const maxWait = 3000;
        const startTime = Date.now();
        while (!navigationRef.isReady() && Date.now() - startTime < maxWait) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return navigationRef.isReady();
      };

      if (rideId === FALLBACK_OVERLAY_RIDE_ID) {
        console.log('🏠 [useOverlayDeepLink] Fallback overlay detected, preparing to navigate to DriverHome');
        const ready = await ensureNavigationReady();
        if (!ready) {
          console.warn('⚠️ [useOverlayDeepLink] Navigation not ready for fallback after 3s');
          return;
        }
        navigate('DriverHome');
        return;
      }

      const navigationReady = await ensureNavigationReady();
      if (!navigationReady) {
        console.warn('⚠️ [useOverlayDeepLink] Navigation not ready after 3s');
        return;
      }

      try {
        const ride = await fetchRidePreview(rideId);

        if (!ride) {
          console.warn('⚠️ [useOverlayDeepLink] Ride not found:', rideId);
          return;
        }

        console.log('🚀 [useOverlayDeepLink] Navigating to RidePreview:', ride.id);

        // Navegar a RidePreviewScreen
        navigate('RidePreview', { ride, proximity: true });
      } catch (error) {
        console.error('❌ [useOverlayDeepLink] Error loading ride data:', error);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);
}
