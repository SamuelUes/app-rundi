import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, TouchableOpacity, Animated } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import StorageImage from '../../shared/StorageImage';
import type { OfferItem } from '../../../hooks/client/HomeScreenOffers/useRideOffers';
import type { TFunction } from 'i18next';

interface HomeScreenOffersOfferCardProps {
  item: OfferItem;
  selected: boolean;
  isDark: boolean;
  colors: any;
  etaValueText: string;
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
  etaValueText,
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

  const chipTone = (tone: 'gold' | 'neutral' | 'green') => {
    if (tone === 'gold') {
      return {
        backgroundColor: isDark ? 'rgba(212,175,55,0.22)' : '#F6ECD4',
        color: isDark ? '#FFDD66' : '#5D4B00',
      };
    }
    if (tone === 'green') {
      return {
        backgroundColor: isDark ? 'rgba(76,175,80,0.16)' : 'rgba(46,125,50,0.10)',
        color: isDark ? '#A5D6A7' : '#2E7D32',
      };
    }
    return {
      backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)',
      color: isDark ? colors.textSecondary : '#4A4A4A',
    };
  };

  const renderChip = (
    icon: keyof typeof MaterialIcons.glyphMap,
    label: string,
    tone: 'gold' | 'neutral' | 'green' = 'neutral',
  ) => {
    const { backgroundColor, color } = chipTone(tone);
    return (
      <View style={[styles.offerChip, { backgroundColor }]} key={label}>
        <MaterialIcons name={icon} size={11} color={color} />
        <Text style={[styles.offerChipText, { color }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    );
  };

  const isAccepted = item.status === 'accepted';

  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        styles.offerCard,
        {
          backgroundColor: selected
            ? isDark
              ? '#2B2416'
              : '#FBF5E9'
            : isDark
              ? '#1F1F1F'
              : '#FFFFFF',
          borderColor: selected ? '#b38737' : isDark ? '#303030' : '#E9E9E9',
        },
        selected && styles.offerCardSelected,
        pressed && { opacity: 0.96, transform: [{ scale: 0.99 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${displayName}, ${arrivalLabel}, ${driverPriceLabel}`}
    >
      <View style={styles.offerTopRow}>
        <View
          style={[
            styles.offerAvatar,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.09)' : '#F2F2F2' },
          ]}
        >
          {photoUri && !photoFailed ? (
            <StorageImage
              uri={photoUri}
              style={styles.offerAvatarPhoto}
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <Text style={[styles.offerAvatarInitials, { color: colors.text }]}>
              {getInitials(displayName, t('client.homeOffers.list.initialFallback', 'D'))}
            </Text>
          )}
        </View>

        <View style={styles.offerInfo}>
          <Text style={[styles.offerName, { color: colors.text }]} numberOfLines={1}>
            {displayName}
          </Text>
          <View style={styles.offerChipsRow}>
            {isAccepted
              ? renderChip('check-circle', t('client.homeOffers.list.acceptedSecondary'), 'green')
              : null}
            {negotiationLabel ? renderChip('forum', negotiationLabel, 'gold') : null}
            {ratingLabel ? renderChip('star', ratingLabel, 'gold') : null}
            {renderChip('schedule', etaValueText)}
            {renderChip(vehicleType === 'moto' ? 'two-wheeler' : 'directions-car', plate)}
          </View>
        </View>

        <View style={styles.offerPriceColumn}>
          {hasDriverPrice ? (
            <>
              <Text style={[styles.offerPriceValue, { color: colors.text }]}>
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
                backgroundColor: isDark ? 'rgba(0,0,0,0.18)' : 'rgba(179,135,55,0.08)',
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(179,135,55,0.18)',
              },
            ]}
          >
            <Text style={[styles.pricePanelTitle, { color: colors.textTertiary }]}>
              {t('client.homeOffers.list.priceLabel')}
            </Text>
            <View style={styles.priceItemRow}>
              <Text style={[styles.priceItemLabel, { color: colors.textSecondary }]}>
                {t('client.homeOffers.list.clientPriceLabel')}
              </Text>
              <Text style={[styles.priceItemValue, { color: colors.text }]}>
                {clientPriceLabel}
              </Text>
            </View>
            <View
              style={[
                styles.priceItemDivider,
                { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' },
              ]}
            />
            <View style={styles.priceItemRow}>
              <Text style={[styles.priceItemLabel, { color: colors.textSecondary }]}>
                {t('client.homeOffers.list.driverPriceLabel')}
              </Text>
              <Text
                style={[
                  styles.priceItemValue,
                  { color: hasDriverPrice ? colors.primary : colors.text },
                ]}
              >
                {driverPriceLabel}
              </Text>
            </View>
          </View>

          <View style={styles.cardActionsRow}>
            <TouchableOpacity
              onPress={onMessageDriver}
              style={[styles.iconActionBtn, styles.iconActionBtnChat]}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('client.homeOffers.a11y.messageDriver')}
            >
              <MaterialIcons name="chat" size={17} color="#FFFFFF" />
            </TouchableOpacity>

            {isAccepted ? (
              <Animated.View
                style={[
                  styles.acceptedPill,
                  {
                    backgroundColor: isDark ? 'rgba(76,175,80,0.18)' : 'rgba(46,125,50,0.12)',
                    borderColor: isDark ? 'rgba(165,214,167,0.45)' : 'rgba(46,125,50,0.35)',
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
                <MaterialIcons
                  name="check-circle"
                  size={14}
                  color={isDark ? '#A5D6A7' : '#2E7D32'}
                />
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
                style={styles.negotiatePill}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <MaterialIcons name="swap-horiz" size={14} color="#FFFFFF" />
                <Text style={styles.negotiateText}>
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
