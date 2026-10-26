import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';

interface RoutePoint {
  address?: string;
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
}

interface ActiveRideAddressesCardProps {
  pickupLabel: string;
  destinationLabel: string;
  origin: RoutePoint | undefined;
  destination: RoutePoint | undefined;
  extraDestinations: RoutePoint[] | undefined;
  etaMinutesLabel: string;
  etaDistanceLabel: string;
  colors: any;
  onNavigate: () => void;
  styles: any;
  t: TFunction;
}

const coordsText = (point?: RoutePoint | null): string | null => {
  const lat = point?.lat ?? point?.latitude;
  const lng = point?.lng ?? point?.longitude;
  if (typeof lat === 'number' && typeof lng === 'number') {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
  return null;
};

const resolveAddress = (point: RoutePoint | undefined, fallback: string): string =>
  point?.address || coordsText(point) || fallback;

export function ActiveRideAddressesCard({
  pickupLabel,
  destinationLabel,
  origin,
  destination,
  extraDestinations,
  etaMinutesLabel,
  etaDistanceLabel,
  colors,
  onNavigate,
  styles,
  t,
}: ActiveRideAddressesCardProps) {
  const stops = Array.isArray(extraDestinations) ? extraDestinations : [];
  const routePoints = [
    {
      kind: 'dot' as const,
      color: colors.secondary,
      label: pickupLabel,
      address: resolveAddress(origin, pickupLabel),
    },
    ...stops.map((stop: RoutePoint, index: number) => ({
      kind: 'dot' as const,
      color: colors.warning,
      label: t('driver.activeRide.labels.stopLabel', { index: index + 1 }),
      address: resolveAddress(
        stop,
        t('driver.activeRide.labels.stopLabel', { index: index + 1 }),
      ),
    })),
    {
      kind: 'dot' as const,
      color: colors.error,
      label: destinationLabel,
      address: resolveAddress(destination, destinationLabel),
    },
  ];

  return (
    <View style={styles.routeCard}>
      {routePoints.map((point, index) => (
        <View key={`route-point-${index}`} style={styles.routeRow}>
          <View style={styles.routeIconCol}>
            <View style={[styles.routeLine, index === 0 && styles.routeLineHidden]} />
            {point.kind === 'dot' ? (
              <View style={[styles.routeDot, { backgroundColor: point.color }]} />
            ) : (
              <MaterialIcons name="place" size={22} color={point.color} />
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

      <View style={styles.routeFooter}>
        <View style={styles.etaGroup}>
          <MaterialIcons name="schedule" size={18} color={colors.textSecondary} />
          <View>
            <Text style={styles.etaCaption}>
              {t('driver.activeRide.labels.estimatedTitle')}
            </Text>
            <Text style={styles.etaValue}>
              {etaMinutesLabel} · {etaDistanceLabel}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.navigateButton}
          onPress={onNavigate}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('driver.activeRide.accessibility.navigate')}
        >
          <MaterialIcons name="navigation" size={16} color="#FFFFFF" />
          <Text style={styles.navigateButtonText}>
            {t('driver.activeRide.navigation.button')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
