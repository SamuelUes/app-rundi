import { useEffect } from 'react';
import { Platform } from 'react-native';
import { EventEmitter } from 'expo';
import { navigate, navigationRef } from '../navigation/NavigationService';
import { getDatabase, ref, get } from 'firebase/database';
import { FALLBACK_OVERLAY_RIDE_ID } from '../services/proximityService';
import { OverlayPermissionModule } from '../../modules/rundi-native/src';

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
        // Obtener datos del viaje desde Firebase
        const db = getDatabase();
        const rideRef = ref(db, `activeRides/${rideId}`);
        const snapshot = await get(rideRef);
        
        if (!snapshot.exists()) {
          console.warn('⚠️ [useOverlayDeepLink] Ride not found:', rideId);
          return;
        }

        const rideData = snapshot.val();
        
        // Construir objeto de viaje para RidePreviewScreen
        const ride = {
          id: rideId,
          clientId: rideData.clientId || '',
          clientName: rideData.clientName,
          clientPhone: rideData.clientPhone,
          origin: rideData.origin || { lat: 0, lng: 0 },
          destination: rideData.destination || { lat: 0, lng: 0 },
          extraDestinations: rideData.extraDestinations || [],
          estimatedPrice: rideData.estimatedPrice || 0,
          estimatedDistance: rideData.estimatedDistance,
          estimatedDuration: rideData.estimatedDuration,
          clientSuggestedPrice: rideData.clientSuggestedPrice,
          driverOfferedPrice: rideData.driverOfferedPrice,
          paymentMethod: rideData.paymentMethod || 'cash',
          negotiationStatus: rideData.negotiationStatus,
        };

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
