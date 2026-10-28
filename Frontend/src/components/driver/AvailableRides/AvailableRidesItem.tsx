import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import StorageImage from '../../shared/StorageImage';
import type { Ride } from '../../../utils/availableRidesHelpers';
import { haversineKm, isDesignatedRideRequest } from '../../../utils/availableRidesHelpers';
import { normalizeVehicleTypeForMatching } from '../../../services/ridesService';
import type { TFunction } from 'i18next';
import { getRideFeatureLabels } from '../../../utils/rideFeatureLabels';

interface AvailableRidesItemProps {
  ride: Ride;
  selected: boolean;
  isDark: boolean;
  colors: any;
  coords: { latitude: number; longitude: number } | null;
  onSelect: () => void;
  onViewDetails: () => void;
  onViewVehiclePhoto: (url: string) => void;
  onConfirmScheduled?: () => void;
  confirmingScheduled?: boolean;
  styles: any;
  t: TFunction;
}

const formatScheduledLabel = (scheduledAt: number, t: TFunction): string => {
  const date = new Date(scheduledAt);
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(date) - startOfDay(new Date())) / 86400000);

  if (dayDiff === 0) {
    return t('driver.available.rideCard.scheduledToday', { time });
  }
  if (dayDiff === 1) {
    return t('driver.available.rideCard.scheduledTomorrow', { time });
  }
  const dateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
  return t('driver.available.rideCard.scheduledDate', { date: dateStr, time });
};

export function AvailableRidesItem({
  ride,
  selected,
  isDark,
  colors,
  coords,
  onSelect,
  onViewDetails,
  onViewVehiclePhoto,
  onConfirmScheduled,
  confirmingScheduled,
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
  const isDesignatedRide = isDesignatedRideRequest(ride);
  const clientVehiclePhoto = ride.clientVehiclePhoto;
  const vehicleType = normalizeVehicleTypeForMatching(ride.vehicleType);
  const paymentMethod = (ride.paymentMethod || '').toLowerCase();
  const featureLabels = getRideFeatureLabels(ride, t);
  const isScheduled = Boolean(ride.isProgrammed) && Boolean(ride.scheduledAt);
  const scheduledLabel = isScheduled && ride.scheduledAt ? formatScheduledLabel(ride.scheduledAt, t) : null;

  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!isScheduled) return;
    setNowTick(Date.now());
    const id = setInterval(() => setNowTick(Date.now()), 20000);
    return () => clearInterval(id);
  }, [isScheduled]);

  const driverConfirmedPhase = Boolean(ride.driverConfirmed || ride.status === 'driver_confirmed');
  const clientConfirmedPhase = Boolean(
    driverConfirmedPhase ||
      ride.clientConfirmed ||
      ride.status === 'client_confirmed' ||
      ride.driverConfirmationRequestedAt,
  );
  const scheduledTimeReached =
    isScheduled && typeof ride.scheduledAt === 'number' && nowTick >= ride.scheduledAt;

  const scheduledPhase: 'waiting' | 'client_confirmed' | 'driver_confirmed' | 'time_reached' =
    !isScheduled
      ? 'waiting'
      : scheduledTimeReached
        ? 'time_reached'
        : driverConfirmedPhase
          ? 'driver_confirmed'
          : clientConfirmedPhase
            ? 'client_confirmed'
            : 'waiting';

  const scheduledStatusLabel = !isScheduled
    ? null
    : scheduledPhase === 'time_reached'
      ? t('driver.available.rideCard.scheduledTimeReached')
      : scheduledPhase === 'driver_confirmed'
        ? t('driver.available.rideCard.scheduledConfirmed')
        : scheduledPhase === 'client_confirmed'
          ? t('driver.available.rideCard.scheduledClientConfirmed')
          : t('driver.available.rideCard.scheduledWaiting');

  const scheduledPhaseCardStyle = (() => {
    if (!isScheduled || scheduledPhase === 'waiting') return null;
    if (scheduledPhase === 'time_reached') {
      return { borderStyle: 'solid' as const, borderColor: colors.primary, opacity: 1 };
    }
    return {
      borderStyle: 'solid' as const,
      borderColor: isDark ? '#FFD666' : '#D4AF37',
      opacity: 1,
    };
  })();

  const scheduledBannerTone = (() => {
    switch (scheduledPhase) {
      case 'time_reached':
        return {
          backgroundColor: colors.primary,
          borderColor: 'transparent',
          color: '#FFFFFF',
          icon: 'play-arrow' as keyof typeof MaterialIcons.glyphMap,
        };
      case 'client_confirmed':
        return {
          backgroundColor: isDark ? 'rgba(212,175,55,0.22)' : '#F6ECD4',
          borderColor: isDark ? 'rgba(255,214,102,0.5)' : '#D4AF37',
          color: isDark ? '#FFD666' : '#5D4B00',
          icon: 'how-to-reg' as keyof typeof MaterialIcons.glyphMap,
        };
      case 'driver_confirmed':
        return {
          backgroundColor: isDark ? 'rgba(76,175,80,0.16)' : 'rgba(46,125,50,0.10)',
          borderColor: isDark ? 'rgba(127,207,131,0.45)' : '#A5D6A7',
          color: isDark ? '#7FCF83' : '#2E7D32',
          icon: 'check-circle' as keyof typeof MaterialIcons.glyphMap,
        };
      default:
        return null;
    }
  })();

  const driverLat = coords?.latitude ?? null;
  const driverLng = coords?.longitude ?? null;
  const distanceToOriginKm =
    ride.distanceToOriginKm ??
    (driverLat !== null && driverLng !== null
      ? haversineKm(driverLat, driverLng, originLat, originLng)
      : 0);
  const AVERAGE_SPEED_KMH = 28;
  const etaToOriginMin = distanceToOriginKm > 0 ? Math.max(1, Math.round((distanceToOriginKm / AVERAGE_SPEED_KMH) * 60)) : 0;

  const tripDistanceKm = ride.estimatedDistance > 0 ? ride.estimatedDistance / 1000 : 0;
  const tripDurationMin = ride.estimatedDuration > 0 ? Math.max(1, Math.round(ride.estimatedDuration / 60)) : 0;

  const getInitials = (n?: string, fallback: string = 'CL') => {
    if (!n) return fallback;
    const parts = n.trim().split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  };

  const chipTone = (tone: 'gold' | 'neutral') =>
    tone === 'gold'
      ? {
          backgroundColor: isDark ? 'rgba(212,175,55,0.22)' : '#F6ECD4',
          color: isDark ? '#FFD666' : '#5D4B00',
        }
      : {
          backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)',
          color: isDark ? colors.textSecondary : '#4A4A4A',
        };

  const renderChip = (icon: keyof typeof MaterialIcons.glyphMap, label: string, tone: 'gold' | 'neutral' = 'neutral') => {
    const { backgroundColor, color } = chipTone(tone);
    return (
      <View style={[styles.metaChip, { backgroundColor }]}>
        <MaterialIcons name={icon} size={11} color={color} />
        <Text style={[styles.metaChipText, { color }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    );
  };

  const proximityLabel =
    distanceToOriginKm > 0
      ? `${t('driver.available.rideCard.distanceShort', { distance: distanceToOriginKm.toFixed(1) })} · ${t('driver.available.rideCard.etaShort', { minutes: etaToOriginMin })}`
      : t('driver.available.rideCard.calculating');

  return (
    <Pressable
      style={({ pressed }) => [
        styles.rideCard,
        isDark ? styles.rideCardDark : styles.rideCardLight,
        isDesignatedRide && (isDark ? styles.designatedCardDark : styles.designatedCard),
        isScheduled && (isDark ? styles.scheduledCardDark : styles.scheduledCardLight),
        scheduledPhaseCardStyle,
        selected && styles.selectedCardHighlight,
        pressed && { opacity: 0.96, transform: [{ scale: 0.99 }] },
      ]}
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${t('driver.available.rideCard.origin', { address: originAddress })}, ${t('driver.available.rideCard.destination', { address: destinationAddress })}, ${t('driver.available.rideCard.price', { amount: Number(price).toFixed(2) })}`}
    >
      {isScheduled ? (
        <View
          style={[
            styles.scheduledBanner,
            scheduledBannerTone
              ? {
                  backgroundColor: scheduledBannerTone.backgroundColor,
                  borderColor: scheduledBannerTone.borderColor,
                }
              : {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)',
                  borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                },
          ]}
        >
          <MaterialIcons
            name={scheduledBannerTone?.icon ?? 'event'}
            size={14}
            color={scheduledBannerTone?.color ?? colors.primary}
          />
          <Text
            style={[
              styles.scheduledBannerTitle,
              { color: scheduledBannerTone?.color ?? colors.text },
            ]}
            numberOfLines={1}
          >
            {scheduledLabel}
          </Text>
          <View
            style={[
              styles.scheduledBannerDot,
              { backgroundColor: (scheduledBannerTone?.color ?? colors.text) + '55' },
            ]}
          />
          <Text
            style={[
              styles.scheduledBannerStatus,
              { color: scheduledBannerTone?.color ?? colors.text + '99' },
            ]}
            numberOfLines={1}
          >
            {scheduledStatusLabel}
          </Text>
        </View>
      ) : null}

      <View style={styles.cardTopRow}>
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

        <View style={styles.cardHeaderColumn}>
          <Text style={[styles.clientName, { color: colors.text }]} numberOfLines={1}>
            {name}
          </Text>
          <View style={styles.metaChipsRow}>
            {isDesignatedRide
              ? renderChip('verified-user', t('driver.available.rideCard.designatedTag'), 'gold')
              : null}
            {featureLabels.map((label) =>
              renderChip(
                label === t('shared.searchRide.features.premium')
                  ? 'stars'
                  : label === t('shared.searchRide.features.senior')
                    ? 'accessible'
                    : label === t('shared.searchRide.features.petFriendly')
                      ? 'pets'
                      : 'nightlight',
                label,
                ['shared.searchRide.features.premium', 'shared.searchRide.features.senior', 'shared.searchRide.features.petFriendly']
                  .some((key) => label === t(key))
                  ? 'gold'
                  : 'neutral',
              ),
            )}
            {isScheduled && scheduledLabel
              ? renderChip('schedule', scheduledLabel, 'gold')
              : renderChip('near-me', proximityLabel, 'gold')}
            {tripDistanceKm > 0
              ? renderChip(
                  'route',
                  tripDurationMin > 0
                    ? t('driver.available.rideCard.tripWithDuration', {
                        distance: tripDistanceKm.toFixed(1),
                        minutes: tripDurationMin,
                      })
                    : t('driver.available.rideCard.tripDistance', {
                        distance: tripDistanceKm.toFixed(1),
                      }),
                )
              : null}
            {vehicleType
              ? renderChip(vehicleType === 'moto' ? 'two-wheeler' : 'directions-car', t(`driver.available.rideCard.vehicle${vehicleType === 'moto' ? 'Moto' : 'Auto'}`))
              : null}
            {paymentMethod === 'cash'
              ? renderChip('payments', t('driver.available.rideCard.paymentCash'))
              : null}
            {paymentMethod === 'card'
              ? renderChip('credit-card', t('driver.available.rideCard.paymentCard'))
              : null}
            {stopsCount > 0
              ? renderChip('alt-route', t('driver.available.rideCard.stops', { count: stopsCount }))
              : null}
          </View>
        </View>

        <View style={styles.priceColumn}>
          <Text style={[styles.priceValue, { color: colors.text }]}>
            {`C$${Number(price).toFixed(2)}`}
          </Text>
        </View>
      </View>

      <View style={styles.routeBlock}>
        <View style={styles.routeRail}>
          <View style={[styles.routeDotOrigin, { backgroundColor: colors.primary }]} />
          <View
            style={[
              styles.routeConnector,
              { backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)' },
            ]}
          />
          <View
            style={[
              styles.routeDotDestination,
              { borderColor: isDark ? '#C9C9C9' : '#3A3A3A' },
            ]}
          />
        </View>
        <View style={styles.routeTexts}>
          <Text
            style={[styles.routeText, { color: colors.text + 'CC' }]}
            numberOfLines={2}
            accessibilityLabel={t('driver.available.rideCard.origin', { address: originAddress })}
          >
            {originAddress}
          </Text>
          <Text
            style={[styles.routeText, { color: colors.text + 'CC' }]}
            numberOfLines={2}
            accessibilityLabel={t('driver.available.rideCard.destination', { address: destinationAddress })}
          >
            {destinationAddress}
          </Text>
        </View>
      </View>

      {ride.clientComment ? (
        <View
          style={[
            styles.commentBubble,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' },
          ]}
        >
          <MaterialIcons
            name="format-quote"
            size={13}
            color={colors.text + '80'}
            style={styles.commentIcon}
          />
          <Text style={[styles.commentText, { color: colors.text + 'B3' }]} numberOfLines={3}>
            {ride.clientComment}
          </Text>
        </View>
      ) : null}

      {isDesignatedRide && clientVehiclePhoto ? (
        <View style={styles.cardActionsRow}>
          <TouchableOpacity
            style={[styles.vehicleButton, { borderColor: colors.primary }]}
            onPress={() => onViewVehiclePhoto(clientVehiclePhoto)}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <MaterialIcons name="image" size={14} color={colors.primary} />
            <Text style={[styles.vehicleButtonText, { color: colors.primary }]}>
              {t('driver.available.rideCard.viewVehicle')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {scheduledPhase === 'client_confirmed' && onConfirmScheduled ? (
        <View style={styles.cardActionsRow}>
          <TouchableOpacity
            onPress={onConfirmScheduled}
            disabled={confirmingScheduled}
            style={[
              styles.viewButton,
              { backgroundColor: isDark ? '#D4AF37' : '#5D4B00' },
            ]}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            {confirmingScheduled ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <MaterialIcons name="check-circle" size={15} color="#FFFFFF" />
                <Text style={styles.viewButtonText}>
                  {t('driver.available.rideCard.confirmScheduled')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {selected ? (
        <View style={styles.cardActionsRow}>
          <TouchableOpacity
            onPress={onViewDetails}
            style={[styles.viewButton, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.viewButtonText}>{t('driver.available.rideCard.view')}</Text>
            <MaterialIcons name="arrow-forward" size={14} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      ) : null}
    </Pressable>
  );
}
