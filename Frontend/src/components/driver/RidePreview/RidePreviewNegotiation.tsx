import React from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from '../../ui/LoadingIcon';
import type { TFunction } from 'i18next';

interface RidePreviewNegotiationProps {
  negotiationStatus: string | null | undefined;
  driverOfferedPrice: number | null | undefined;
  clientSuggestedPrice: number | null | undefined;
  estimatedPrice: number;
  counterOffer: string;
  lastSuggestedPrice: number | null;
  sendingOffer: boolean;
  customOfferVisible: boolean;
  quickSuggestions: number[];
  finalPricePreview: string;
  isDesignatedRide: boolean;
  isProgrammedRide: boolean;
  clientVehiclePhoto: string | null | undefined;
  colors: any;
  isDark: boolean;
  formatCurrency: (value?: number | null) => string;
  customOfferInputRef: React.RefObject<TextInput | null>;
  onCustomOfferPress: () => void;
  onCustomOfferChange: (text: string) => void;
  onSendCustomOffer: () => void;
  onApplySuggestion: (value: number) => void;
  onOpenPhotoModal: (url: string) => void;
  styles: any;
  t: TFunction;
}

export function RidePreviewNegotiation({
  negotiationStatus,
  driverOfferedPrice,
  clientSuggestedPrice,
  estimatedPrice,
  counterOffer,
  lastSuggestedPrice,
  sendingOffer,
  customOfferVisible,
  quickSuggestions,
  finalPricePreview,
  isDesignatedRide,
  isProgrammedRide,
  clientVehiclePhoto,
  colors,
  isDark,
  formatCurrency,
  customOfferInputRef,
  onCustomOfferPress,
  onCustomOfferChange,
  onSendCustomOffer,
  onApplySuggestion,
  onOpenPhotoModal,
  styles,
  t,
}: RidePreviewNegotiationProps) {
  const status = (negotiationStatus || '').toLowerCase();
  const driverSuggested =
    typeof driverOfferedPrice === 'number' && !Number.isNaN(driverOfferedPrice);
  const clientSuggested =
    typeof clientSuggestedPrice === 'number' && !Number.isNaN(clientSuggestedPrice);

  const renderNegotiationBanner = () => {
    const statusText = t(`driver.ridePreview.negotiation.status.${status}`, {
      defaultValue:
        status === 'driver_offered'
          ? t('driver.ridePreview.negotiation.status.defaultDriver')
          : t('driver.ridePreview.negotiation.status.defaultClient'),
    });

    if (status === 'driver_offered' && driverSuggested) {
      const accent = isDark ? '#90CAF9' : '#1565C0';
      return (
        <View
          style={[
            styles.clientOfferBanner,
            {
              backgroundColor: isDark ? 'rgba(33, 150, 243, 0.18)' : 'rgba(33, 150, 243, 0.10)',
              borderColor: isDark ? 'rgba(144, 202, 249, 0.5)' : 'rgba(33, 150, 243, 0.28)',
            },
          ]}
        >
          <View
            style={[
              styles.bannerIconWrap,
              { backgroundColor: isDark ? 'rgba(144, 202, 249, 0.22)' : 'rgba(33, 150, 243, 0.16)' },
            ]}
          >
            <MaterialIcons name="hourglass-empty" size={18} color={accent} />
          </View>
          <View style={styles.bannerTextWrap}>
            <Text style={[styles.clientOfferTitle, { color: accent }]}>
              {t('driver.ridePreview.negotiation.driverOfferTitle', {
                amount: formatCurrency(driverOfferedPrice),
              })}
            </Text>
            <Text style={[styles.clientOfferSubtitle, { color: colors.textSecondary }]}>
              {statusText}
            </Text>
          </View>
        </View>
      );
    }

    if (clientSuggested) {
      const accent = isDark ? '#A5D6A7' : '#2E7D32';
      return (
        <View
          style={[
            styles.clientOfferBanner,
            {
              backgroundColor: isDark ? 'rgba(76, 175, 80, 0.18)' : 'rgba(76, 175, 80, 0.10)',
              borderColor: isDark ? 'rgba(129, 199, 132, 0.5)' : 'rgba(76, 175, 80, 0.28)',
            },
          ]}
        >
          <View
            style={[
              styles.bannerIconWrap,
              { backgroundColor: isDark ? 'rgba(129, 199, 132, 0.22)' : 'rgba(76, 175, 80, 0.16)' },
            ]}
          >
            <MaterialIcons name="local-offer" size={18} color={accent} />
          </View>
          <View style={styles.bannerTextWrap}>
            <Text style={[styles.clientOfferTitle, { color: accent }]}>
              {t('driver.ridePreview.negotiation.clientOfferTitle', {
                amount: formatCurrency(clientSuggestedPrice),
              })}
            </Text>
            <Text style={[styles.clientOfferSubtitle, { color: colors.textSecondary }]}>
              {statusText}
            </Text>
          </View>
        </View>
      );
    }

    return null;
  };

  const offerToggleLabel = lastSuggestedPrice
    ? t('driver.ridePreview.negotiation.yourOffer')
    : t('driver.ridePreview.negotiation.customOfferButton');

  return (
    <View style={styles.negotiationWrapper}>
      {renderNegotiationBanner()}

      <View
        style={[
          styles.priceCard,
          {
            backgroundColor: isDark ? 'rgba(33,33,33,0.9)' : '#FFF6E6',
            borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#E3C592',
          },
        ]}
      >
        <View style={styles.priceHeaderRow}>
          <View style={styles.priceHeaderText}>
            <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>
              {clientSuggested
                ? t('driver.ridePreview.negotiation.clientOfferLabel')
                : t('driver.ridePreview.negotiation.estimatedLabel')}
            </Text>
            <Text style={[styles.priceValue, { color: colors.text }]}>
              {formatCurrency(clientSuggestedPrice || estimatedPrice)}
            </Text>
          </View>
          {isDesignatedRide && clientVehiclePhoto ? (
            <TouchableOpacity
              style={[
                styles.iconButton,
                { backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(179,135,55,0.12)' },
              ]}
              onPress={() => onOpenPhotoModal(clientVehiclePhoto || '')}
              accessibilityRole="button"
              accessibilityLabel={t('driver.ridePreview.accessibility.vehiclePhoto')}
            >
              <MaterialIcons name="directions-car" size={22} color={colors.primary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {isProgrammedRide && (
          <View
            style={[
              styles.offerToggle,
              {
                backgroundColor: isDark ? 'rgba(179,135,55,0.16)' : 'rgba(179,135,55,0.10)',
                borderColor: isDark ? 'rgba(179,135,55,0.45)' : 'rgba(179,135,55,0.30)',
              },
            ]}
          >
            <MaterialIcons name="schedule" size={18} color={colors.primary} />
            <Text style={[styles.offerToggleLabel, { color: colors.primary }]}>
              {t('driver.available.rideCard.scheduledWaiting')}
            </Text>
          </View>
        )}

        {!isProgrammedRide && quickSuggestions.length > 0 && (
          <View style={styles.suggestionsSection}>
            <Text style={[styles.suggestionsLabel, { color: colors.textSecondary }]}>
              {t('driver.ridePreview.negotiation.suggestionsLabel')}
            </Text>
            <View style={styles.chipsRow}>
              {quickSuggestions.map((value) => {
                const selected = lastSuggestedPrice === value;
                return (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.chip,
                      selected
                        ? { backgroundColor: colors.primary }
                        : {
                            backgroundColor: isDark
                              ? 'rgba(125,230,173,0.16)'
                              : 'rgba(125,230,173,0.25)',
                            borderWidth: 1,
                            borderColor: isDark
                              ? 'rgba(125,230,173,0.32)'
                              : 'rgba(38,140,92,0.25)',
                          },
                      sendingOffer && { opacity: 0.6 },
                    ]}
                    onPress={() => onApplySuggestion(value)}
                    disabled={sendingOffer}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={formatCurrency(value)}
                  >
                    <Text
                      style={[
                        styles.chipLabel,
                        { color: selected ? '#FFFFFF' : isDark ? '#7DE6AD' : '#268C5C' },
                      ]}
                    >
                      {formatCurrency(value)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {!isProgrammedRide && (
        <TouchableOpacity
          style={[
            styles.offerToggle,
            {
              backgroundColor: isDark ? 'rgba(179,135,55,0.16)' : 'rgba(179,135,55,0.10)',
              borderColor: isDark ? 'rgba(179,135,55,0.45)' : 'rgba(179,135,55,0.30)',
            },
            sendingOffer && { opacity: 0.6 },
          ]}
          onPress={onCustomOfferPress}
          disabled={sendingOffer}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityState={{ expanded: customOfferVisible }}
          accessibilityLabel={offerToggleLabel}
        >
          <MaterialIcons name="edit" size={18} color={colors.primary} />
          <Text style={[styles.offerToggleLabel, { color: colors.primary }]}>
            {offerToggleLabel}
          </Text>
          {lastSuggestedPrice ? (
            <Text style={[styles.offerToggleValue, { color: colors.primary }]}>
              {formatCurrency(lastSuggestedPrice)}
            </Text>
          ) : null}
          <MaterialIcons
            name={customOfferVisible ? 'expand-less' : 'expand-more'}
            size={20}
            color={colors.primary}
          />
        </TouchableOpacity>
        )}

        {!isProgrammedRide && customOfferVisible && (
          <View
            style={[
              styles.customOfferCard,
              {
                backgroundColor: isDark ? 'rgba(23,30,38,0.92)' : '#FFFFFF',
                borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(21, 37, 58, 0.12)',
              },
            ]}
          >
            <Text style={[styles.customOfferLabel, { color: colors.textSecondary }]}>
              {t('driver.ridePreview.negotiation.customLabel')}
            </Text>
            <View
              style={[
                styles.offerInputRow,
                {
                  borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.1)',
                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F7F7F7',
                },
              ]}
            >
              <Text style={[styles.offerInputPrefix, { color: colors.textSecondary }]}>C$</Text>
              <TextInput
                ref={customOfferInputRef}
                style={[styles.offerInput, { color: colors.text }]}
                value={counterOffer}
                onChangeText={onCustomOfferChange}
                keyboardType="numeric"
                inputMode="numeric"
                placeholder={t('driver.ridePreview.negotiation.placeholderExample')}
                placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)'}
                returnKeyType="done"
                onSubmitEditing={onSendCustomOffer}
                editable={!sendingOffer}
                accessibilityLabel={t('driver.ridePreview.negotiation.customLabel')}
              />
            </View>
            <TouchableOpacity
              style={[
                styles.customOfferSendButton,
                { backgroundColor: colors.primary, opacity: sendingOffer ? 0.7 : 1 },
              ]}
              onPress={onSendCustomOffer}
              activeOpacity={0.9}
              disabled={sendingOffer}
              accessibilityRole="button"
              accessibilityLabel={t('driver.ridePreview.negotiation.send')}
            >
              {sendingOffer ? (
                <LoadingIcon size={20} color="#FFFFFF" />
              ) : (
                <Text style={styles.customOfferSendButtonText}>
                  {t('driver.ridePreview.negotiation.send')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View
          style={[
            styles.finalRow,
            {
              borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5D5B8',
            },
          ]}
        >
          <Text style={[styles.finalLabel, { color: colors.textSecondary }]}>
            {t('driver.ridePreview.negotiation.finalLabel')}
          </Text>
          <Text style={[styles.finalValue, { color: colors.primary }]}>{finalPricePreview}</Text>
        </View>
      </View>
    </View>
  );
}
