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
  etaLabel: string;
  plate: string;
  clientPriceLabel: string;
  driverPriceLabel: string;
  currentPriceLabel: string;
  currentPricePending: boolean;
  previousPriceLabel: string | null;
  offerCaption: string;
  hasDriverPrice: boolean;
  negotiationLabel: string | null;
  driverAcceptedMyPrice: boolean;
  confirming: boolean;
  displayName: string;
  vehicleType: string | null;
  ratingLabel: string | null;
  photoUri: string | null;
  acceptedAnim: Animated.Value;
  onSelect: () => void;
  onMessageDriver: () => void;
  onOpenNegotiation: () => void;
  onConfirmDriver: () => void;
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
  etaLabel,
  plate,
  clientPriceLabel,
  driverPriceLabel,
  currentPriceLabel,
  currentPricePending,
  previousPriceLabel,
  offerCaption,
  hasDriverPrice,
  negotiationLabel,
  driverAcceptedMyPrice,
  confirming,
  displayName,
  vehicleType,
  ratingLabel,
  photoUri,
  acceptedAnim,
  onSelect,
  onMessageDriver,
  onOpenNegotiation,
  onConfirmDriver,
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

  const driverDetails = [arrivalLabel, vehicleLabel, plate !== '—' ? plate : null]
    .filter(Boolean)
    .join(' · ');

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
              ? 'rgba(255,255,255,0.12)'
              : 'rgba(227, 197, 146, 0.1)'
            : isDark
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(0,0,0,0.0)',
        },
        pressed && { opacity: 0.96, transform: [{ scale: 0.99 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${displayName}, ${arrivalLabel}, ${driverPriceLabel}`}
    >
      <View style={styles.offerPriceHeader}>
        <View style={styles.offerPriceHeading}>
          <Text style={[styles.offerPriceEyebrow, { color: colors.textSecondary }]}>
            {offerCaption}
          </Text>
          <View style={styles.offerPriceLine}>
            <Text
              style={[
                currentPricePending ? styles.offerPricePending : styles.offerPriceValue,
                { color: currentPricePending ? colors.textSecondary : colors.primary },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {currentPriceLabel}
            </Text>
            {previousPriceLabel ? (
              <Text
                style={[styles.offerPreviousPrice, { color: colors.textTertiary }]}
                numberOfLines={1}
              >
                {previousPriceLabel}
              </Text>
            ) : null}
          </View>
        </View>
        <View
          style={[
            styles.offerEtaBadge,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)' },
          ]}
        >
          <Ionicons name="time-outline" size={15} color={colors.primary} />
          <Text style={[styles.offerEtaText, { color: colors.text }]}>
            {etaLabel}
          </Text>
        </View>
      </View>

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
          <View style={styles.offerDriverHeading}>
            <Text style={[styles.offerName, { color: colors.text }]} numberOfLines={1}>
              {displayName}
            </Text>
            {ratingLabel ? (
              <View style={styles.offerRatingBadge}>
                <Ionicons name="star" size={12} color={colors.primary} />
                <Text style={[styles.offerRatingText, { color: colors.text }]}>
                  {ratingLabel}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.offerMetaText, { color: colors.textSecondary }]} numberOfLines={2}>
            {driverDetails}
          </Text>
          {isAccepted || negotiationLabel ? (
            <View style={styles.offerStatusRow}>
              <Ionicons
                name={isAccepted ? 'checkmark-circle' : 'chatbubble-ellipses'}
                size={12}
                color={isAccepted ? (isDark ? '#A5D6A7' : '#2E7D32') : colors.textTertiary}
              />
              <Text
                style={[
                  styles.offerStatusText,
                  { color: isAccepted ? (isDark ? '#A5D6A7' : '#2E7D32') : colors.textTertiary },
                ]}
                numberOfLines={1}
              >
                {isAccepted ? t('client.homeOffers.list.acceptedSecondary') : negotiationLabel}
              </Text>
            </View>
          ) : null}
        </View>

      </View>

      {selected ? (
        <>
          {/* <View
            style={[
              styles.pricePanel,
              { backgroundColor: 'transparent' },
            ]}
          >
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
          </View> */}

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
            ) : driverAcceptedMyPrice ? (
              <TouchableOpacity
                onPress={onConfirmDriver}
                style={[
                  styles.negotiatePill,
                  {
                    backgroundColor: isDark ? 'rgba(76,175,80,0.18)' : 'rgba(76,175,80,0.14)',
                    borderColor: isDark ? 'rgba(129,199,132,0.5)' : 'rgba(76,175,80,0.35)',
                  },
                ]}
                activeOpacity={0.85}
                disabled={confirming}
                accessibilityRole="button"
              >
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={isDark ? '#A5D6A7' : '#2E7D32'}
                />
                <Text
                  style={[
                    styles.negotiateText,
                    { color: isDark ? '#A5D6A7' : '#2E7D32' },
                  ]}
                >
                  {t('client.homeOffers.primaryAction.confirmDriver')}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={onOpenNegotiation}
                style={[
                  styles.negotiatePill,
                  {
                    backgroundColor: isDark
                      ? 'rgba(212,175,55,0.12)'
                      : 'rgba(179,135,55,0.20)',
                    borderColor: isDark ? 'rgba(212,175,55,0.36)' : 'rgba(179,135,55,0.38)',
                  },
                ]}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Ionicons
                  name="swap-horizontal"
                  size={19}
                  color={isDark ? '#FFD666' : '#8A5800'}
                />
                <Text
                  style={[
                    styles.negotiateText,
                    { color: isDark ? '#FFD666' : '#8A5800' },
                  ]}
                >
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
