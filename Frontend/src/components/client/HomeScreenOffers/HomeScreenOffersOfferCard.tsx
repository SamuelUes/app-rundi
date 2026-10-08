import React from 'react';
import { View, Text, TouchableOpacity, Image, Animated } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import StorageImage from '../../shared/StorageImage';
import type { OfferItem } from '../../../hooks/client/HomeScreenOffers/useRideOffers';
import type { TFunction } from 'i18next';

interface OfferEta {
  etaMins: number;
  arrivalLabel: string;
}

interface HomeScreenOffersOfferCardProps {
  item: OfferItem;
  selected: boolean;
  eta: OfferEta | undefined;
  etaValueText: string;
  arrivalLabel: string;
  plate: string;
  clientPriceLabel: string;
  driverPriceLabel: string;
  negotiationLabel: string | null;
  displayName: string;
  vehicleIconSource: any;
  ratingPrefix: string;
  photoUri: string | null;
  colors: any;
  acceptedAnim: Animated.Value;
  onSelect: () => void;
  onMessageDriver: () => void;
  onOpenNegotiation: () => void;
  styles: any;
  t: TFunction;
}

export function HomeScreenOffersOfferCard({
  item,
  selected,
  eta,
  etaValueText,
  arrivalLabel,
  plate,
  clientPriceLabel,
  driverPriceLabel,
  negotiationLabel,
  displayName,
  vehicleIconSource,
  ratingPrefix,
  photoUri,
  colors,
  acceptedAnim,
  onSelect,
  onMessageDriver,
  onOpenNegotiation,
  styles,
  t,
}: HomeScreenOffersOfferCardProps) {
  const priceTextColor = selected ? '#F8FAFC' : colors.text;
  const priceLabelColor = selected ? 'rgba(248, 250, 252, 0.88)' : colors.textSecondary;

  return (
    <TouchableOpacity
      onPress={onSelect}
      style={[styles.offerRow, selected ? styles.offerRowSelected : styles.offerRowDefault]}
      activeOpacity={0.8}
    >
      <View style={styles.offerAvatarWrap}>
        <View style={styles.offerAvatarFrame}>
          {photoUri ? (
            <StorageImage uri={photoUri} style={styles.offerAvatarPhoto} />
          ) : (
            <View style={styles.offerAvatarFallback}>
              <Text style={styles.offerAvatarFallbackText}>{(displayName || 'C').charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>
        <Image source={vehicleIconSource} style={styles.offerVehicleOverlay} />
      </View>
      <View style={styles.offerInfo}>
        <Text
          style={[styles.offerTitle, selected ? styles.offerTitleSelected : styles.offerTitleDefault]}
          numberOfLines={selected ? 2 : 1}
        >
          {displayName} - {plate}
        </Text>
        <Text
          style={[styles.offerSubtitle, selected ? styles.offerSubtitleSelected : styles.offerSubtitleDefault]}
          numberOfLines={2}
        >
          {ratingPrefix ? `${ratingPrefix} • ` : ''}
          {arrivalLabel}
        </Text>
        {selected && (
          <View style={styles.priceRow}>
            <View style={styles.priceHeaderRow}>
              <View style={styles.priceHeaderDot} />
              <Text style={[styles.priceLabel, { color: priceLabelColor }]}>{t('client.homeOffers.list.priceLabel')}</Text>
            </View>
            <View style={styles.priceItems}>
              <View style={styles.priceItemRow}>
                <Text style={[styles.priceItemLabel, { color: priceLabelColor }]}>
                  {t('client.homeOffers.list.clientPriceLabel')}
                </Text>
                <Text style={[styles.priceItemValue, { color: priceTextColor }]}>{clientPriceLabel}</Text>
              </View>
              <View style={styles.priceItemDivider} />
              <View style={styles.priceItemRow}>
                <Text style={[styles.priceItemLabel, { color: priceLabelColor }]}>
                  {t('client.homeOffers.list.driverPriceLabel')}
                </Text>
                <Text style={[styles.priceItemValue, { color: priceTextColor }]}>{driverPriceLabel}</Text>
              </View>
            </View>
          </View>
        )}
      </View>
      {selected ? (
        <View style={styles.selectedActions}>
          <TouchableOpacity onPress={onMessageDriver} style={styles.messageButton} activeOpacity={0.9}>
            <MaterialIcons name="chat" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          {item.status === 'accepted' ? (
            <Animated.View
              style={[
                styles.acceptedStatusChip,
                {
                  transform: [
                    {
                      scale: acceptedAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.6, 1],
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
              <Text style={styles.acceptedStatusText}>{t('client.homeOffers.list.acceptedPrimary')}</Text>
            </Animated.View>
          ) : (
            <TouchableOpacity onPress={onOpenNegotiation} style={styles.negotiatePill} activeOpacity={0.9}>
              <Text style={styles.negotiateText}>{t('client.homeOffers.negotiation.pill')}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : item.status === 'accepted' ? (
        <View style={styles.acceptedStatusChipSecondary}>
          <Text style={styles.acceptedStatusTextSecondary}>{t('client.homeOffers.list.acceptedSecondary')}</Text>
        </View>
      ) : (
        <View style={styles.offerEtaBadge}>
          <Text style={styles.offerEtaText}>{negotiationLabel ?? etaValueText}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
