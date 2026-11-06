import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, TouchableOpacity, Animated } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import StorageImage from '../../shared/StorageImage';
import type { OfferItem } from '../../../hooks/client/HomeScreenOffers/useRideOffers';
import type { TFunction } from 'i18next';

interface HomeScreenOffersOfferCardProps {
  item: OfferItem;
  selected: boolean;
  isDark: boolean;
  colors: any;
  arrivalLabel: string;
  plate: string;
  clientPriceLabel: string;
  driverPriceLabel: string;
  hasDriverPrice: boolean;
  negotiationLabel: string | null;
  displayName: string;
  vehicleType: string | null;
  ratingLabel: string | null;
  photoUri: string | null;
  acceptedAnim: Animated.Value;
  onSelect: () => void;
  onMessageDriver: () => void;
  onOpenNegotiation: () => void;
  styles: any;
  t: TFunction;
}

const TYPED_VEHICLE_LABELS = new Set(['sedan', 'suv', 'van', 'moto']);

const getInitials = (name?: string, fallback: string = 'C') => {
  if (!name) return fallback;
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
};

export function HomeScreenOffersOfferCard({
  item,
  selected,
  isDark,
  colors,
  arrivalLabel,
  plate,
  clientPriceLabel,
  driverPriceLabel,
  hasDriverPrice,
  negotiationLabel,
  displayName,
  vehicleType,
  ratingLabel,
  photoUri,
  acceptedAnim,
  onSelect,
  onMessageDriver,
  onOpenNegotiation,
  styles,
  t,
}: HomeScreenOffersOfferCardProps) {
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => {
    setPhotoFailed(false);
  }, [photoUri]);

  const isAccepted = item.status === 'accepted';

  const vehicleLabel = vehicleType
    ? t(
        `shared.profile.vehicle.typeLabels.${TYPED_VEHICLE_LABELS.has(vehicleType) ? vehicleType : 'other'}`,
        { type: vehicleType },
      )
    : null;

  const tripMetaParts: string[] = [];
  if (ratingLabel) {
    tripMetaParts.push(t('client.homeOffers.list.ratingPrefix', { rating: ratingLabel }));
  }
  if (plate && plate !== '—') {
    tripMetaParts.push(plate);
  }
  if (vehicleLabel) {
    tripMetaParts.push(vehicleLabel);
  }
  const tripMeta = tripMetaParts.join(' • ');

  const renderBadge = (
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    backgroundColor: string,
    color: string,
  ) => (
    <View style={[styles.offerChip, { backgroundColor }]} key={label}>
      <Ionicons name={icon} size={11} color={color} />
      <Text style={[styles.offerChipText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );

  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        styles.offerCard,
        {
          backgroundColor: selected
            ? isDark
              ? 'rgba(33,33,33,0.9)'
              : '#FFF6E6'
            : isDark
              ? '#1F1F1F'
              : '#F5F5F5',
          borderColor: selected
            ? isDark
              ? 'rgba(255,255,255,0.10)'
              : '#E3C592'
            : isDark
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(0,0,0,0.06)',
        },
        pressed && { opacity: 0.96, transform: [{ scale: 0.99 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${displayName}, ${arrivalLabel}, ${driverPriceLabel}`}
    >
      <View style={styles.offerTopRow}>
        <View
          style={[
            styles.offerAvatar,
            { backgroundColor: isDark ? 'rgba(179,135,55,0.30)' : '#F1E4C8' },
          ]}
        >
          {photoUri && !photoFailed ? (
            <StorageImage
              uri={photoUri}
              style={styles.offerAvatarPhoto}
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <Text style={[styles.offerAvatarInitials, { color: colors.primary }]}>
              {getInitials(displayName, t('client.homeOffers.list.initialFallback', 'D'))}
            </Text>
          )}
        </View>

        <View style={styles.offerInfo}>
          <Text style={[styles.offerName, { color: colors.text }]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.offerMetaText, { color: colors.textSecondary }]} numberOfLines={1}>
            {arrivalLabel}
          </Text>
          {tripMeta.length > 0 ? (
            <Text style={[styles.offerTripMeta, { color: colors.textSecondary }]} numberOfLines={1}>
              {tripMeta}
            </Text>
          ) : null}
          {isAccepted || negotiationLabel ? (
            <View style={styles.offerChipsRow}>
              {isAccepted
                ? renderBadge(
                    'checkmark-circle',
                    t('client.homeOffers.list.acceptedSecondary'),
                    isDark ? 'rgba(76,175,80,0.18)' : 'rgba(76,175,80,0.10)',
                    isDark ? '#A5D6A7' : '#2E7D32',
                  )
                : null}
              {negotiationLabel
                ? renderBadge(
                    'chatbubble-ellipses',
                    negotiationLabel,
                    isDark ? 'rgba(179,135,55,0.16)' : 'rgba(179,135,55,0.10)',
                    colors.primary,
                  )
                : null}
            </View>
          ) : null}
        </View>

        <View style={styles.offerPriceColumn}>
          {hasDriverPrice ? (
            <>
              <Text style={[styles.offerPriceValue, { color: colors.primary }]}>
                {driverPriceLabel}
              </Text>
              <Text style={[styles.offerPriceCaption, { color: colors.textTertiary }]}>
                {t('client.homeOffers.list.offerCaption')}
              </Text>
            </>
          ) : (
            <Text style={[styles.offerPricePending, { color: colors.textSecondary }]}>
              {driverPriceLabel}
            </Text>
          )}
        </View>
      </View>

      {selected ? (
        <>
          <View
            style={[
              styles.pricePanel,
              {
                backgroundColor: colors.card,
                borderColor: isDark ? 'rgba(179,135,55,0.40)' : 'rgba(179,135,55,0.30)',
              },
            ]}
          >
            <Text style={[styles.pricePanelTitle, { color: colors.textSecondary }]}>
              {t('client.homeOffers.list.priceLabel')}
            </Text>
            <View style={styles.priceItemRow}>
              <Text style={[styles.priceItemLabel, { color: colors.textSecondary }]}>
                {t('client.homeOffers.list.driverPriceLabel')}
              </Text>
              <Text
                style={[
                  hasDriverPrice ? styles.priceItemValueHero : styles.priceItemValue,
                  { color: hasDriverPrice ? colors.primary : colors.textSecondary },
                ]}
              >
                {driverPriceLabel}
              </Text>
            </View>
            <View
              style={[
                styles.priceItemDivider,
                { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5D5B8' },
              ]}
            />
            <View style={styles.priceItemRow}>
              <Text style={[styles.priceItemLabel, { color: colors.textSecondary }]}>
                {t('client.homeOffers.list.clientPriceLabel')}
              </Text>
              <Text style={[styles.priceItemValue, { color: colors.text }]}>
                {clientPriceLabel}
              </Text>
            </View>
          </View>

          <View style={styles.cardActionsRow}>
            <TouchableOpacity
              onPress={onMessageDriver}
              style={[
                styles.iconActionBtn,
                {
                  backgroundColor: isDark
                    ? 'rgba(81, 79, 189, 0.22)'
                    : 'rgba(107, 105, 218, 0.80)',
                },
              ]}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('client.homeOffers.a11y.messageDriver')}
            >
              <Ionicons
                name="chatbubble"
                size={19}
                color={
                  isDark
                    ? colors.textSecondary
                    : 'rgba(255, 255, 255, 0.8)'
                }
              />
            </TouchableOpacity>

            {isAccepted ? (
              <Animated.View
                style={[
                  styles.acceptedPill,
                  {
                    backgroundColor: isDark ? 'rgba(76,175,80,0.18)' : 'rgba(76,175,80,0.10)',
                    borderColor: isDark ? 'rgba(129,199,132,0.5)' : 'rgba(76,175,80,0.28)',
                    transform: [
                      {
                        scale: acceptedAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.85, 1],
                        }),
                      },
                    ],
                    opacity: acceptedAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 1],
                    }),
                  },
                ]}
              >
                <View
                  style={[
                    styles.acceptedIconWrap,
                    {
                      backgroundColor: isDark
                        ? 'rgba(129,199,132,0.22)'
                        : 'rgba(76,175,80,0.16)',
                    },
                  ]}
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={isDark ? '#A5D6A7' : '#2E7D32'}
                  />
                </View>
                <Text
                  style={[
                    styles.acceptedPillText,
                    { color: isDark ? '#A5D6A7' : '#2E7D32' },
                  ]}
                >
                  {t('client.homeOffers.list.acceptedPrimary')}
                </Text>
              </Animated.View>
            ) : (
              <TouchableOpacity
                onPress={onOpenNegotiation}
                style={[
                  styles.negotiatePill,
                  {
                    backgroundColor: isDark ? 'rgba(179,135,55,0.16)' : 'rgba(209, 150, 41, 0.42)',
                    borderColor: isDark ? 'rgba(179,135,55,0.45)' : 'rgba(179,135,55,0.30)',
                  },
                ]}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Ionicons name="swap-horizontal" size={18} color={colors.primary} />
                <Text style={[styles.negotiateText, { color: colors.primary }]}>
                  {t('client.homeOffers.negotiation.pill')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      ) : null}
    </Pressable>
  );
}
