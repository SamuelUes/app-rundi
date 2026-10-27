import React from 'react';
import { View, Text, TouchableOpacity, TextInput, Platform } from 'react-native';
import { LoadingIcon } from '../../ui/LoadingIcon';
import { RideIcon, RideIconSet, RIDE_ICON_SET } from './SearchRideVehicleOptions';
type TrFunction = (path: string, options?: Record<string, any>) => string;

type PaymentMethod = 'cash' | 'card';

interface SearchRideSummaryProps {
  calculatingRoute: boolean;
  estimatedDistance: number;
  estimatedDuration: number;
  estimatedPrice: number;
  calculatingPrice: boolean;
  priceCalculationError: boolean;
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
  iconSet?: RideIconSet;
}

export function SearchRideSummary({
  calculatingRoute,
  estimatedDistance,
  estimatedDuration,
  estimatedPrice,
  calculatingPrice,
  priceCalculationError,
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
  iconSet = RIDE_ICON_SET,
}: SearchRideSummaryProps) {
  const metaColor = colors.textSecondary || '#999';
  const availability = checkingDrivers
    ? { text: tr('availability.checking'), color: metaColor }
    : driversAvailable === false
    ? { text: tr('availability.low'), color: colors.warning || '#ffa726' }
    : driversAvailable === true
    ? { text: tr('availability.ok'), color: colors.success || '#4caf50' }
    : { text: tr('availability.unknown'), color: metaColor };

  return (
    <View style={styles.summarySection}>
      <View style={styles.summaryRouteMetrics}>
        <View style={styles.summaryRouteMetric}>
          <Text style={styles.summaryRouteLabel}>{tr('summary.distance')}</Text>
          <Text style={styles.summaryRouteValue}>
            {estimatedDistance > 0 ? `${estimatedDistance.toFixed(1)} km` : '-- km'}
          </Text>
        </View>
        <View style={styles.summaryRouteDivider} />
        <View style={styles.summaryRouteMetric}>
          <Text style={styles.summaryRouteLabel}>{tr('summary.duration')}</Text>
          <Text style={styles.summaryRouteValue}>
            {estimatedDuration > 0 ? `${Math.round(estimatedDuration)} min` : '-- min'}
          </Text>
        </View>
      </View>

      <View style={styles.summaryAvailabilityRow}>
        <View style={[styles.summaryAvailabilityDot, { backgroundColor: availability.color }]} />
        <Text style={[styles.summaryAvailabilityText, { color: availability.color }]} numberOfLines={2}>
          {availability.text}
        </Text>
      </View>

      <View style={styles.summaryFareCard}>
        <View style={styles.summaryFareDetails}>
          <Text style={styles.summaryFareLabel}>{tr('summary.estimate')}</Text>
          <TouchableOpacity
            style={styles.summaryPayment}
            onPress={() => onSetPaymentMethod('cash')}
            accessibilityLabel={tr(`payment.${paymentMethod}`)}
            accessibilityRole="button"
          >
            <RideIcon iconSet={iconSet} name="payments" size={18} color={colors.success || '#4caf50'} />
            <Text style={styles.summaryPaymentText}>{tr(`payment.${paymentMethod}`)}</Text>
            <RideIcon iconSet={iconSet} name="expand-more" size={16} color={metaColor} />
          </TouchableOpacity>
        </View>
        {calculatingPrice ? (
          <View style={styles.summaryPricePending}>
            <LoadingIcon size={16} color={colors.primary} />
            <Text style={styles.summaryPricePendingText}>{tr('summary.updatingPrice')}</Text>
          </View>
        ) : priceCalculationError ? (
          <Text style={styles.summaryPriceError}>{tr('summary.priceUnavailable')}</Text>
        ) : calculatingRoute ? (
          <Text style={styles.summaryPriceValue}>{tr('labels.calculating')}</Text>
        ) : (
          <Text style={styles.summaryPriceValue}>C${Math.round(estimatedPrice)}</Text>
        )}
      </View>

      <View style={styles.summaryRow}>
        <RideIcon iconSet={iconSet} name="sell" size={20} color={metaColor} />
        <TextInput
          keyboardType={Platform.select({
            ios: 'numbers-and-punctuation',
            android: 'numeric',
            default: 'numeric',
          })}
          placeholder={`${tr('labels.priceSuggestion')} · ${tr('labels.pricePlaceholder')}`}
          placeholderTextColor={metaColor}
          value={priceSuggestion}
          onChangeText={onSetPriceSuggestion}
          style={styles.summaryRowInput}
          returnKeyType="done"
          accessibilityLabel={tr('labels.priceSuggestion')}
        />
      </View>

      <View style={[styles.summaryRow, styles.summaryRowLast]}>
        <RideIcon iconSet={iconSet} name="chat-bubble-outline" size={20} color={metaColor} />
        <TextInput
          placeholder={`${tr('labels.comment')} · ${tr('labels.commentPlaceholder')}`}
          placeholderTextColor={metaColor}
          value={rideComment}
          onChangeText={onSetRideComment}
          style={styles.summaryRowInput}
          maxLength={100}
          returnKeyType="done"
          accessibilityLabel={tr('labels.comment')}
        />
      </View>
    </View>
  );
}
