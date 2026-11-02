import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
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
  const title =
    nearbyQueue.length > 1
      ? `${t('driver.ridePreview.nearby.title')} (${nearbyQueue.length})`
      : t('driver.ridePreview.nearby.title');

  return (
    <View
      style={[
        styles.nearbyCard,
        {
          backgroundColor: isDark ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.96)',
          borderColor: colors.border,
        },
      ]}
    >
      <View
        style={[
          styles.nearbyIconWrap,
          { backgroundColor: isDark ? 'rgba(179,135,55,0.25)' : 'rgba(179,135,55,0.14)' },
        ]}
      >
        <MaterialIcons name="near-me" size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.nearbyTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.nearbySubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
          {labelDistance} • {priceText} • {originText}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.nearbyButton, { backgroundColor: colors.primary }]}
        onPress={onSwitchToNearby}
        accessibilityRole="button"
        accessibilityLabel={t('driver.ridePreview.nearby.view')}
      >
        <Text style={styles.nearbyButtonText}>{t('driver.ridePreview.nearby.view')}</Text>
      </TouchableOpacity>
    </View>
  );
}
