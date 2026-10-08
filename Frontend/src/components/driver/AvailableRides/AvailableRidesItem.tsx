import React from 'react';
import { View, Text, Pressable, TouchableOpacity } from 'react-native';
import StorageImage from '../../shared/StorageImage';
import type { Ride } from '../../../utils/availableRidesHelpers';
import { haversineKm } from '../../../utils/availableRidesHelpers';
import type { TFunction } from 'i18next';

interface AvailableRidesItemProps {
  ride: Ride;
  selected: boolean;
  isDark: boolean;
  colors: any;
  coords: { latitude: number; longitude: number } | null;
  onSelect: () => void;
  onViewDetails: () => void;
  onViewVehiclePhoto: (url: string) => void;
  styles: any;
  t: TFunction;
}

export function AvailableRidesItem({
  ride,
  selected,
  isDark,
  colors,
  coords,
  onSelect,
  onViewDetails,
  onViewVehiclePhoto,
  styles,
  t,
}: AvailableRidesItemProps) {
  const name = ride.client?.name || ride.clientName || t('driver.available.rideCard.clientFallback');
  const photoUrl = ride.client?.photoUrl || null;

  const originLat = ride?.origin?.lat ?? 0;
  const originLng = ride?.origin?.lng ?? 0;
  const destLat = ride?.destination?.lat ?? 0;
  const destLng = ride?.destination?.lng ?? 0;

  const originAddress = ride?.origin?.address || `${originLat.toFixed(4)}, ${originLng.toFixed(4)}`;
  const destinationAddress = ride?.destination?.address || `${destLat.toFixed(4)}, ${destLng.toFixed(4)}`;

  const price = ride.clientSuggestedPrice ?? ride.estimatedPrice ?? 0;
  const stopsCount = (ride.extraDestinations || []).length;
  const isDesignatedRide = (ride.rideType || '').toLowerCase() === 'designated_driver';
  const clientVehiclePhoto = ride.clientVehiclePhoto;

  const driverLat = coords?.latitude ?? null;
  const driverLng = coords?.longitude ?? null;
  const distanceToOriginKm =
    driverLat !== null && driverLng !== null
      ? haversineKm(driverLat, driverLng, originLat, originLng)
      : 0;
  const AVERAGE_SPEED_KMH = 28;
  const etaToOriginMin = distanceToOriginKm > 0 ? Math.max(1, Math.round((distanceToOriginKm / AVERAGE_SPEED_KMH) * 60)) : 0;

  const getInitials = (n?: string, fallback: string = 'CL') => {
    if (!n) return fallback;
    const parts = n.trim().split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  };

  return (
    <Pressable
      style={[
        styles.rideCard,
        isDark ? styles.rideCardDark : styles.rideCardLight,
        isDesignatedRide && (isDark ? styles.designatedCardDark : styles.designatedCard),
        selected && styles.selectedCardHighlight,
      ]}
      onPress={onSelect}
    >
      <View style={styles.cardRow}>
        <View
          style={[
            styles.avatarPlaceholder,
            isDark ? styles.avatarPlaceholderDark : styles.avatarPlaceholderLight,
          ]}
        >
          {photoUrl ? (
            <StorageImage uri={photoUrl} style={styles.avatarImage} />
          ) : (
            <Text style={[styles.avatarInitials, { color: colors.text }]}>
              {getInitials(name, t('driver.available.rideCard.initialFallback'))}
            </Text>
          )}
        </View>

        <View style={styles.detailsColumn}>
          <View
            style={[
              styles.distancePill,
              isDark ? styles.distancePillDark : styles.distancePillLight,
            ]}
          >
            <Text style={[styles.distancePillText, { color: isDark ? '#FFD666' : '#5D4B00' }]}>
              {distanceToOriginKm > 0
                ? t('driver.available.rideCard.distanceToOrigin', { distance: distanceToOriginKm.toFixed(1) })
                : t('driver.available.rideCard.calculating')}
            </Text>
          </View>
          <Text style={[styles.clientName, { color: colors.text }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.detailLine, { color: colors.text + '99' }]} numberOfLines={1}>
            {t('driver.available.rideCard.origin', { address: originAddress })}
          </Text>
          <Text style={[styles.detailLine, { color: colors.text + '99' }]} numberOfLines={1}>
            {t('driver.available.rideCard.destination', { address: destinationAddress })}
          </Text>
          {stopsCount > 0 ? (
            <Text style={[styles.detailLine, { color: colors.text + '99' }]} numberOfLines={1}>
              {t('driver.available.rideCard.stops', { count: stopsCount })}
            </Text>
          ) : null}
          {ride.clientComment ? (
            <Text style={[styles.detailLine, { color: colors.text + 'B3' }]} numberOfLines={2}>
              {`Nota: ${ride.clientComment}`}
            </Text>
          ) : null}
          <Text style={[styles.detailLine, styles.priceLine, { color: colors.text + 'B3' }]} numberOfLines={1}>
            {t('driver.available.rideCard.price', { amount: Number(price).toFixed(2) })}
          </Text>

          <View style={styles.cardBottomRow}>
            <Text style={[styles.distanceSubLabel, { color: colors.text + '99' }]}>
              {distanceToOriginKm > 0 ? t('driver.available.rideCard.etaToOrigin', { minutes: etaToOriginMin }) : ''}
            </Text>
            <View style={styles.metaActions}>
              {isDesignatedRide && clientVehiclePhoto ? (
                <TouchableOpacity
                  style={[styles.vehicleButton, { borderColor: colors.primary }]}
                  onPress={() => onViewVehiclePhoto(clientVehiclePhoto)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.vehicleButtonText, { color: colors.primary }]}>
                    {t('driver.available.rideCard.viewVehicle')}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {selected && (
                <TouchableOpacity
                  onPress={onViewDetails}
                  style={[styles.viewButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  activeOpacity={0.85}
                >
                  <Text style={styles.viewButtonText}>{t('driver.available.rideCard.view')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
