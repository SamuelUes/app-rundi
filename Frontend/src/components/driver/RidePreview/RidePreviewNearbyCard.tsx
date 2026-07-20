import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { TFunction } from 'i18next';

interface NearbyRideItem {
  id?: string;
  distanceMeters?: number;
  estimatedDistance?: number;
  estimatedPrice?: number;
  origin?: { address?: string };
}

interface RidePreviewNearbyCardProps {
  nearbyQueue: NearbyRideItem[];
  colors: any;
  isDark: boolean;
  formatCurrency: (value?: number | null) => string;
  onSwitchToNearby: () => void;
  styles: any;
  t: TFunction;
}

export function RidePreviewNearbyCard({
  nearbyQueue,
  colors,
  isDark,
  formatCurrency,
  onSwitchToNearby,
  styles,
  t,
}: RidePreviewNearbyCardProps) {
  if (!nearbyQueue || nearbyQueue.length === 0) return null;
  const next = nearbyQueue[0];
  const labelDistance =
    typeof next?.distanceMeters === 'number'
      ? t('driver.ridePreview.nearby.distanceMeters', {
          distance: Math.max(1, Math.round(next.distanceMeters)),
        })
      : typeof next?.estimatedDistance === 'number'
        ? t('driver.ridePreview.nearby.distanceKilometers', {
            distance: Math.round((next.estimatedDistance || 0) / 100) / 10,
          })
        : t('driver.ridePreview.nearby.distanceFallback');
  const priceText =
    typeof next?.estimatedPrice === 'number'
      ? formatCurrency(next.estimatedPrice)
      : t('driver.ridePreview.nearby.priceFallback');
  const originText = next?.origin?.address || t('driver.ridePreview.nearby.originFallback');

  return (
    <View
      style={[
        styles.nearbyCard,
        {
          backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.95)',
          borderColor: colors.border,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.nearbyTitle, { color: colors.text }]}>{t('driver.ridePreview.nearby.title')}</Text>
        <Text style={[styles.nearbySubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
          {labelDistance} • {priceText} • {originText}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.nearbyButton, { backgroundColor: colors.primary }]}
        onPress={onSwitchToNearby}
      >
        <Text style={styles.nearbyButtonText}>{t('driver.ridePreview.nearby.view')}</Text>
      </TouchableOpacity>
    </View>
  );
}
