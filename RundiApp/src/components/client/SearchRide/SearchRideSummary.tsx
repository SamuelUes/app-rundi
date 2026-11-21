import React from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { RideIcon } from './SearchRideVehicleOptions';
type TrFunction = (path: string, options?: Record<string, any>) => string;

type PaymentMethod = 'cash' | 'card';

interface SearchRideSummaryProps {
  estimatedDistance: number;
  estimatedDuration: number;
  paymentMethod: PaymentMethod;
  rideComment: string;
  checkingDrivers: boolean;
  driversAvailable: boolean | null;
  isPeakHour?: boolean;
  colors: any;
  onSetPaymentMethod: (method: PaymentMethod) => void;
  onSetRideComment: (value: string) => void;
  styles: any;
  tr: TrFunction;
}

export function SearchRideSummary({
  estimatedDistance,
  estimatedDuration,
  paymentMethod,
  rideComment,
  checkingDrivers,
  driversAvailable,
  isPeakHour = false,
  colors,
  onSetPaymentMethod,
  onSetRideComment,
  styles,
  tr,
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
        <View style={styles.summaryRouteTile}>
          <RideIcon name="navigate" size={16} color={metaColor} />
          <View style={styles.summaryRouteMetric}>
            <Text style={styles.summaryRouteLabel}>{tr('summary.distance')}</Text>
            <Text style={styles.summaryRouteValue} numberOfLines={1}>
              {estimatedDistance > 0 ? `${estimatedDistance.toFixed(1)} km` : '-- km'}
            </Text>
          </View>
        </View>
        <View style={styles.summaryRouteTile}>
          <RideIcon name="time-outline" size={16} color={metaColor} />
          <View style={styles.summaryRouteMetric}>
            <Text style={styles.summaryRouteLabel}>{tr('summary.duration')}</Text>
            <Text style={styles.summaryRouteValue} numberOfLines={1}>
              {estimatedDuration > 0 ? `${Math.round(estimatedDuration)} min` : '-- min'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.summaryRouteTile}
          onPress={() => onSetPaymentMethod(paymentMethod)}
          accessibilityRole="button"
          accessibilityLabel={tr('labels.paymentMethod')}
        >
          <RideIcon name="cash" size={16} color={colors.success || '#4caf50'} />
          <View style={styles.summaryRouteMetric}>
            <Text style={styles.summaryRouteLabel}>{tr('labels.paymentMethod')}</Text>
            <Text style={styles.summaryRouteValue} numberOfLines={1}>
              {tr(`payment.${paymentMethod}`)}
            </Text>
          </View>
        </TouchableOpacity>
      </View>


      {isPeakHour ? (
        <View style={styles.summaryAvailabilityRow}>
          <RideIcon name="time-outline" size={14} color={colors.warning || '#ffa726'} />
          <Text
            style={[styles.summaryAvailabilityText, { color: colors.warning || '#ffa726' }]}
            numberOfLines={2}
          >
            {tr('summary.peakHourNotice')}
          </Text>
        </View>
      ) : null}

      <View style={styles.summaryRow}>
        <RideIcon name="chatbubble-outline" size={20} color={metaColor} />
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

      <View style={styles.summaryAvailabilityRow}>
        <View style={[styles.summaryAvailabilityDot, { backgroundColor: availability.color }]} />
        <Text style={[styles.summaryAvailabilityText, { color: availability.color }]} numberOfLines={2}>
          {availability.text}
        </Text>
      </View>
    </View>
  );
}
