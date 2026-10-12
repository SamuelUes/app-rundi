import React from 'react';
import { View, Text, TouchableOpacity, TextInput, Platform } from 'react-native';
import { LoadingIcon } from '../../ui/LoadingIcon';
type TrFunction = (path: string, options?: Record<string, any>) => string;

type PaymentMethod = 'cash' | 'card';

interface SearchRideSummaryProps {
  calculatingRoute: boolean;
  estimatedDistance: number;
  estimatedDuration: number;
  estimatedPrice: number;
  paymentMethod: PaymentMethod;
  priceSuggestion: string;
  rideComment: string;
  checkingDrivers: boolean;
  driversAvailable: boolean | null;
  colors: any;
  onSetPaymentMethod: (method: PaymentMethod) => void;
  onSetPriceSuggestion: (value: string) => void;
  onSetRideComment: (value: string) => void;
  styles: any;
  tr: TrFunction;
}

export function SearchRideSummary({
  calculatingRoute,
  estimatedDistance,
  estimatedDuration,
  estimatedPrice,
  paymentMethod,
  priceSuggestion,
  rideComment,
  checkingDrivers,
  driversAvailable,
  colors,
  onSetPaymentMethod,
  onSetPriceSuggestion,
  onSetRideComment,
  styles,
  tr,
}: SearchRideSummaryProps) {
  return (
    <View style={[styles.section, styles.sectionCompact, styles.summarySection]}>
      <Text style={styles.sectionTitle}>{tr('summary.title')}</Text>

      <View style={[styles.estimateCard, styles.estimateCardElevated]}>
        {calculatingRoute ? (
          <View style={styles.centeredRow}>
            <LoadingIcon size={20} color={colors.primary} />
            <Text style={styles.estimateText}>{` ${tr('summary.calculatingRoute')}`}</Text>
          </View>
        ) : (
          <>
            <View style={styles.estimateRow}>
              <Text style={styles.estimateLabel}>{tr('summary.distance')}</Text>
              <Text style={styles.estimateValue}>{estimatedDistance.toFixed(2)} km</Text>
            </View>
            <View style={styles.estimateRow}>
              <Text style={styles.estimateLabel}>{tr('summary.duration')}</Text>
              <Text style={styles.estimateValue}>{estimatedDuration} min</Text>
            </View>
            <View style={styles.estimateHeroRow}>
              <Text style={styles.estimateHeroLabel}>{tr('summary.estimate')}</Text>
              <Text style={styles.estimateHeroValue}>C${estimatedPrice.toFixed(2)}</Text>
            </View>
          </>
        )}
      </View>

      <View style={styles.paymentRow}>
        <TouchableOpacity
          style={[styles.paymentChip, paymentMethod === 'cash' && styles.paymentChipSelected]}
          onPress={() => onSetPaymentMethod('cash')}
          accessibilityLabel={tr('accessibility.payCash')}
        >
          <Text style={[styles.paymentChipText, paymentMethod === 'cash' && styles.paymentChipTextSelected]}>
            {tr('payment.cash')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.paymentChip, paymentMethod === 'card' && styles.paymentChipSelected]}
          onPress={() => onSetPaymentMethod('card')}
          accessibilityLabel={tr('accessibility.payCard')}
        >
          <Text style={[styles.paymentChipText, paymentMethod === 'card' && styles.paymentChipTextSelected]}>
            {tr('payment.card')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.priceCommentRow}>
        <View style={styles.priceCommentColumn}>
          <Text style={styles.priceCommentLabel}>{tr('labels.priceSuggestion')}</Text>
          <TextInput
            keyboardType={Platform.select({
              ios: 'numbers-and-punctuation',
              android: 'numeric',
              default: 'numeric',
            })}
            placeholder={tr('labels.pricePlaceholder')}
            placeholderTextColor={colors.textSecondary || '#999'}
            value={priceSuggestion}
            onChangeText={onSetPriceSuggestion}
            style={styles.priceCommentInput}
          />
        </View>
        <View style={styles.priceCommentColumn}>
          <Text style={styles.priceCommentLabel}>{tr('labels.comment')}</Text>
          <TextInput
            placeholder={tr('labels.commentPlaceholder')}
            placeholderTextColor={colors.textSecondary || '#999'}
            value={rideComment}
            onChangeText={onSetRideComment}
            style={styles.priceCommentInput}
            maxLength={100}
          />
        </View>
      </View>

      <View style={styles.availabilityRow}>
        {checkingDrivers ? (
          <Text style={styles.availabilityText}>{tr('availability.checking')}</Text>
        ) : driversAvailable === false ? (
          <Text style={styles.availabilityWarn}>{tr('availability.low')}</Text>
        ) : driversAvailable === true ? (
          <Text style={styles.availabilityOk}>{tr('availability.ok')}</Text>
        ) : (
          <Text style={styles.availabilityText}>{tr('availability.unknown')}</Text>
        )}
      </View>
    </View>
  );
}
