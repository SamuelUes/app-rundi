import React from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { LatLngPoint } from '../../../utils/rideTrackingHelpers';

interface RideTrackingLocationsProps {
  originCoords: LatLngPoint | null;
  destinationCoords: LatLngPoint | null;
  waypointCoords: LatLngPoint[] | null;
  originAddress?: string;
  destinationAddress?: string;
  extraDestinations?: any[];
  colors: any;
  tr: (path: string, options?: Record<string, any>) => string;
  styles: any;
}

export function RideTrackingLocations({
  originCoords,
  destinationCoords,
  waypointCoords,
  originAddress,
  destinationAddress,
  extraDestinations,
  colors,
  tr,
  styles,
}: RideTrackingLocationsProps) {
  const waypoints = Array.isArray(waypointCoords) ? waypointCoords : [];
  const routePoints = [
    originCoords
      ? {
          kind: 'dot' as const,
          color: colors.secondary,
          label: tr('labels.pickupLabel'),
          address: originAddress || tr('labels.pickupFallback'),
        }
      : null,
    ...waypoints.map((waypoint, index) => {
      const stopLabel = tr('labels.stopLabel', { index: index + 1 });
      return {
        kind: 'dot' as const,
        color: colors.warning,
        label: stopLabel,
        address: extraDestinations?.[index]?.address || stopLabel,
      };
    }),
    destinationCoords
      ? {
          kind: 'pin' as const,
          color: colors.error,
          label: tr('labels.destinationLabel'),
          address: destinationAddress || tr('labels.destinationFallback'),
        }
      : null,
  ].filter((point): point is NonNullable<typeof point> => point !== null);

  if (routePoints.length === 0) return null;

  return (
    <View style={styles.routeCard}>
      {routePoints.map((point, index) => (
        <View key={`route-point-${index}`} style={styles.routeRow}>
          <View style={styles.routeIconCol}>
            <View style={[styles.routeLine, index === 0 && styles.routeLineHidden]} />
            {point.kind === 'pin' ? (
              <MaterialIcons name="place" size={22} color={point.color} />
            ) : (
              <View style={[styles.routeDot, { backgroundColor: point.color }]} />
            )}
            <View
              style={[
                styles.routeLine,
                index === routePoints.length - 1 && styles.routeLineHidden,
              ]}
            />
          </View>
          <View style={styles.routeTextCol}>
            <Text style={styles.locationLabel}>{point.label}</Text>
            <Text numberOfLines={2} style={styles.locationAddress}>
              {point.address}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
