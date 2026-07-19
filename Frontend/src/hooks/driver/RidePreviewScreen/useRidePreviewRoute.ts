import { useEffect, useState } from 'react';
import mapsService from '../../../services/mapsService';
import alertService from '../../../services/alertService';
import type { RideLocation, RidePreviewData } from './useRidePreviewData';

export function useRidePreviewRoute(
  currentRide: RidePreviewData,
  t: (path: string, options?: Record<string, any>) => string,
) {
  const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [loadingRoute, setLoadingRoute] = useState(false);

  useEffect(() => {
    const loadRoute = async () => {
      setLoadingRoute(true);
      try {
        const segments: Array<{ latitude: number; longitude: number }> = [];
        let currentPoint = {
          latitude: currentRide.origin.lat,
          longitude: currentRide.origin.lng,
        };

        const targets: RideLocation[] = [];
        if (currentRide.extraDestinations && currentRide.extraDestinations.length > 0) {
          targets.push(...currentRide.extraDestinations);
        }
        targets.push(currentRide.destination);

        for (const target of targets) {
          const segment = await mapsService.getDirections(currentPoint, {
            latitude: target.lat,
            longitude: target.lng,
          });

          if (segment?.polyline?.length) {
            segments.push(...segment.polyline);
          } else {
            segments.push(currentPoint, { latitude: target.lat, longitude: target.lng });
          }

          currentPoint = { latitude: target.lat, longitude: target.lng };
        }

        setRouteCoordinates(segments);
      } catch (error) {
        console.error('[useRidePreviewRoute] Error calculando ruta:', error);
        alertService.showInfoAlert(
          t('driver.ridePreview.alerts.routeErrorTitle'),
          t('driver.ridePreview.alerts.routeErrorBody'),
        );
        setRouteCoordinates([
          { latitude: currentRide.destination.lat, longitude: currentRide.destination.lng },
        ]);
      } finally {
        setLoadingRoute(false);
      }
    };

    loadRoute();
  }, [currentRide.destination, currentRide.extraDestinations, currentRide.origin, t]);

  return { routeCoordinates, loadingRoute };
}
