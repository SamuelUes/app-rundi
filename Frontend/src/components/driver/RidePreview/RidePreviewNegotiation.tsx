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
  const renderNegotiationBanner = () => {
    const status = (negotiationStatus || '').toLowerCase();
    const driverSuggested = typeof driverOfferedPrice === 'number' && !Number.isNaN(driverOfferedPrice);
    const clientSuggested = typeof clientSuggestedPrice === 'number' && !Number.isNaN(clientSuggestedPrice);

    const statusText = t(`driver.ridePreview.negotiation.status.${status}`, {
      defaultValue:
        status === 'driver_offered'
          ? t('driver.ridePreview.negotiation.status.defaultDriver')
          : t('driver.ridePreview.negotiation.status.defaultClient'),
    });

    if (status === 'driver_offered' && driverSuggested) {
      return (
        <View
          style={[
            styles.clientOfferBanner,
            {
              backgroundColor: isDark ? 'rgba(33, 150, 243, 0.18)' : 'rgba(33, 150, 243, 0.12)',
              borderColor: isDark ? 'rgba(144, 202, 249, 0.6)' : 'rgba(33, 150, 243, 0.35)',
            },
          ]}
        >
          <Text style={[styles.clientOfferTitle, { color: isDark ? '#90CAF9' : '#1565C0' }]}>
            {t('driver.ridePreview.negotiation.driverOfferTitle', {
              amount: formatCurrency(driverOfferedPrice),
            })}
          </Text>
          <Text style={[styles.clientOfferSubtitle, { color: colors.textSecondary }]}>{statusText}</Text>
        </View>
      );
    }

    if (clientSuggested) {
      return (
        <View
          style={[
            styles.clientOfferBanner,
            {
              backgroundColor: isDark ? 'rgba(76, 175, 80, 0.18)' : 'rgba(76, 175, 80, 0.12)',
              borderColor: isDark ? 'rgba(129, 199, 132, 0.6)' : 'rgba(76, 175, 80, 0.35)',
            },
          ]}
        >
          <Text style={[styles.clientOfferTitle, { color: isDark ? '#A5D6A7' : '#2E7D32' }]}>
            {t('driver.ridePreview.negotiation.clientOfferTitle', {
              amount: formatCurrency(clientSuggestedPrice),
            })}
          </Text>
          <Text style={[styles.clientOfferSubtitle, { color: colors.textSecondary }]}>{statusText}</Text>
        </View>
      );
    }

    return null;
  };

  const customOfferButtonLabel = lastSuggestedPrice
    ? formatCurrency(lastSuggestedPrice)
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
        <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>
          {t('driver.ridePreview.negotiation.estimatedLabel')}
        </Text>
        <Text style={[styles.priceValue, { color: colors.text }]}>
          {formatCurrency(clientSuggestedPrice || estimatedPrice)}
        </Text>

        <TouchableOpacity
          style={[
            styles.suggestButton,
            styles.inlineSuggestButton,
            { backgroundColor: colors.primary, opacity: sendingOffer ? 0.7 : 1 },
          ]}
          onPress={onCustomOfferPress}
          disabled={sendingOffer}
          activeOpacity={0.9}
        >
          <Text style={styles.suggestButtonText}>{customOfferButtonLabel}</Text>
        </TouchableOpacity>

        <View style={styles.suggestionsSection}>
          {quickSuggestions.length > 0 && (
            <>
              <Text style={[styles.suggestionsLabel, { color: colors.textSecondary }]}>
                {t('driver.ridePreview.negotiation.suggestionsLabel')}
              </Text>
              <View style={styles.suggestionsRow}>
                <View style={styles.chipsRow}>
                  {quickSuggestions.map((value) => (
                    <TouchableOpacity
                      key={value}
                      style={[styles.chip, { backgroundColor: isDark ? 'rgba(125,230,173,0.18)' : 'rgba(125,230,173,0.25)' }]}
                      onPress={() => onApplySuggestion(value)}
                    >
                      <Text style={[styles.chipLabel, { color: isDark ? '#7DE6AD' : '#268C5C' }]}>
                        {formatCurrency(value)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {isDesignatedRide && clientVehiclePhoto ? (
                  <TouchableOpacity
                    style={[styles.iconButton, styles.vehiclePhotoButton, { backgroundColor: 'rgba(115,230,173,0.25)' }]}
                    onPress={() => onOpenPhotoModal(clientVehiclePhoto || '')}
                  >
                    <MaterialIcons name="directions-car" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </>
          )}

          {quickSuggestions.length === 0 && (
            <TouchableOpacity
              style={[styles.suggestButton, { backgroundColor: colors.primary, opacity: sendingOffer ? 0.7 : 1 }]}
              onPress={onCustomOfferPress}
              disabled={sendingOffer}
              activeOpacity={0.9}
            >
              <Text style={styles.suggestButtonText}>{customOfferButtonLabel}</Text>
            </TouchableOpacity>
          )}

          {customOfferVisible && (
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
              <TextInput
                ref={customOfferInputRef}
                style={[
                  styles.offerInput,
                  {
                    borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.1)',
                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F7F7F7',
                    color: colors.text,
                  },
                ]}
                value={counterOffer}
                onChangeText={onCustomOfferChange}
                keyboardType="numeric"
                inputMode="numeric"
                placeholder={t('driver.ridePreview.negotiation.placeholderExample')}
                placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)'}
                returnKeyType="done"
                onSubmitEditing={onSendCustomOffer}
                editable={!sendingOffer}
              />
              <TouchableOpacity
                style={[styles.customOfferSendButton, { backgroundColor: colors.primary, opacity: sendingOffer ? 0.7 : 1 }]}
                onPress={onSendCustomOffer}
                activeOpacity={0.9}
                disabled={sendingOffer}
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
        </View>

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
          <Text style={[styles.finalValue, { color: colors.text }]}>{finalPricePreview}</Text>
        </View>
      </View>
    </View>
  );
}
