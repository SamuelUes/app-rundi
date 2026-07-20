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
  return (
    <View style={styles.locationsContainer}>
      {originCoords && (
        <View style={styles.locationItem}>
          <MaterialIcons name="place" size={20} color={colors.primary} />
          <View style={styles.locationContent}>
            <Text style={[styles.locationLabel, { color: colors.textSecondary }]}>
              {tr('labels.pickupLabel')}
            </Text>
            <Text style={[styles.locationAddress, { color: colors.text }]}>
              {originAddress || tr('labels.pickupFallback')}
            </Text>
          </View>
        </View>
      )}

      {waypointCoords && waypointCoords.length > 0 && (
        <>
          {waypointCoords.map((waypoint, index) => {
            const extraDest = extraDestinations?.[index];
            return (
              <View key={`waypoint-${index}`} style={styles.locationItem}>
                <Text style={styles.locationIcon}>🟠</Text>
                <View style={styles.locationContent}>
                  <Text style={[styles.locationLabel, { color: colors.textSecondary }]}>
                    {tr('labels.stopLabel', { index: index + 1 })}
                  </Text>
                  <Text style={[styles.locationAddress, { color: colors.text }]}>
                    {extraDest?.address || tr('labels.stopLabel', { index: index + 1 })}
                  </Text>
                </View>
              </View>
            );
          })}
        </>
      )}

      {destinationCoords && (
        <View style={styles.locationItem}>
          <Text style={styles.locationIcon}>🎯</Text>
          <View style={styles.locationContent}>
            <Text style={[styles.locationLabel, { color: colors.textSecondary }]}>
              {tr('labels.destinationLabel')}
            </Text>
            <Text style={[styles.locationAddress, { color: colors.text }]}>
              {destinationAddress || tr('labels.destinationFallback')}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
