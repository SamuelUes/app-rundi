import React from 'react';
import { View, Text } from 'react-native';
import type { TFunction } from 'i18next';

interface RideDetailsRouteProps {
  ride: any;
  safeString: (value: any, fallback?: string) => string;
  colors: any;
  t: TFunction;
  styles: any;
}

export function RideDetailsRoute({
  ride,
  safeString,
  colors,
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
              <View style={styles.routeRow}>
                <View style={styles.routeMarkerCol}>
                  {idx === 0 ? (
                    <View style={styles.routeRing} />
                  ) : idx === ride.allAddresses.length - 1 ? (
                    <View style={[styles.routeRing, { borderColor: colors.error }]} />
                  ) : (
                    <View style={styles.routeStopDot} />
                  )}
                </View>
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
              {idx < ride.allAddresses.length - 1 && <View style={styles.routeConnector} />}
            </View>
          ))
        ) : (
          <>
            <View style={styles.routeRow}>
              <View style={styles.routeMarkerCol}>
                <View style={styles.routeRing} />
              </View>
              <View style={styles.locationInfo}>
                <Text style={styles.locationLabel}>{t('shared.rideDetail.sections.route.origin')}</Text>
                <Text style={styles.locationText}>{safeString(ride.originAddress)}</Text>
              </View>
            </View>

            <View style={styles.routeConnector} />

            <View style={styles.routeRow}>
              <View style={styles.routeMarkerCol}>
                <View style={[styles.routeRing, { borderColor: colors.error }]} />
              </View>
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
