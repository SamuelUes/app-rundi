import React from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';

interface RideDetailsRouteProps {
  ride: any;
  safeString: (value: any, fallback?: string) => string;
  t: TFunction;
  styles: any;
}

export function RideDetailsRoute({
  ride,
  safeString,
  t,
  styles,
}: RideDetailsRouteProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('shared.rideDetail.sections.route.title')}</Text>
      <View style={styles.card}>
        {ride.hasMultipleStops && ride.allAddresses && ride.allAddresses.length > 0 ? (
          ride.allAddresses.map((address: string, idx: number) => (
            <View key={`route-${idx}`}>
              <View style={styles.locationRow}>
                <MaterialIcons name={idx === 0 ? 'circle' : idx === ride.allAddresses.length - 1 ? 'place' : 'location-on'} size={16} color={idx === 0 ? '#2196F3' : idx === ride.allAddresses.length - 1 ? '#F44336' : '#FF9800'} />
                <View style={styles.locationInfo}>
                  <Text style={styles.locationLabel}>
                    {idx === 0
                      ? t('shared.rideDetail.sections.route.origin')
                      : idx === ride.allAddresses.length - 1
                        ? t('shared.rideDetail.sections.route.destination')
                        : t('shared.rideDetail.sections.route.stop', { index: idx })}
                  </Text>
                  <Text style={styles.locationText}>{safeString(address)}</Text>
                </View>
              </View>
              {idx < ride.allAddresses.length - 1 && <View style={styles.routeLine} />}
            </View>
          ))
        ) : (
          <>
            <View style={styles.locationRow}>
              <MaterialIcons name="circle" size={16} color="#2196F3" />
              <View style={styles.locationInfo}>
                <Text style={styles.locationLabel}>{t('shared.rideDetail.sections.route.origin')}</Text>
                <Text style={styles.locationText}>{safeString(ride.originAddress)}</Text>
              </View>
            </View>

            <View style={styles.routeLine} />

            <View style={styles.locationRow}>
              <MaterialIcons name="place" size={16} color="#F44336" />
              <View style={styles.locationInfo}>
                <Text style={styles.locationLabel}>{t('shared.rideDetail.sections.route.destination')}</Text>
                <Text style={styles.locationText}>{safeString(ride.destinationAddress)}</Text>
              </View>
            </View>
          </>
        )}
      </View>
    </View>
  );
}
