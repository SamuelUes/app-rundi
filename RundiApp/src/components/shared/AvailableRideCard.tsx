/**
 * AvailableRideCard - Tarjeta para mostrar viajes disponibles
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';

interface AvailableRideCardProps {
  ride: any;
  onPress?: () => void;
  onAccept?: () => void;
  onViewRoute?: () => void;
  colors: any;
}

export default function AvailableRideCard({ ride, onPress, colors }: AvailableRideCardProps) {
  const styles = createStyles(colors);
  const { t } = useTranslation();
  const originLabel = ride.originAddress || t('common.components.availableRideCard.originFallback');
  const destinationLabel =
    ride.destinationAddress || t('common.components.availableRideCard.destinationFallback');
  const priceValue = ride.estimatedPrice ?? 0;
  const distanceValue =
    typeof ride.estimatedDistance === 'number'
      ? (ride.estimatedDistance / 1000).toFixed(1)
      : null;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} accessibilityRole="button">
      <View style={styles.route}>
        <View style={styles.rail}>
          <View style={[styles.originDot, { backgroundColor: colors.primary }]} />
          <View style={styles.connector} />
          <View style={styles.destinationDot} />
        </View>
        <View style={styles.addresses}>
          <Text style={styles.title} numberOfLines={2}>
            {originLabel}
          </Text>
          <Text style={styles.destinationText} numberOfLines={2}>
            {destinationLabel}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.priceContainer}>
          <Text style={styles.priceLabel}>
            {t('common.components.availableRideCard.priceLabel')}
          </Text>
          <Text style={styles.price}>
            {t('common.components.availableRideCard.priceValue', { amount: priceValue })}
          </Text>
        </View>

        <View style={styles.distanceContainer}>
          <MaterialIcons name="route" size={16} color={colors.textSecondary} />
          <Text style={styles.distance}>
            {distanceValue
              ? t('common.components.availableRideCard.distanceValue', { value: distanceValue })
              : t('common.components.availableRideCard.distanceUnknown')}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  route: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  rail: {
    width: 12,
    alignItems: 'center',
    paddingVertical: 5,
  },
  originDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connector: {
    width: 2,
    flex: 1,
    minHeight: 14,
    marginVertical: 4,
    backgroundColor: colors.border,
  },
  destinationDot: {
    width: 9,
    height: 9,
    borderRadius: 2,
    borderWidth: 2,
    borderColor: colors.textSecondary,
  },
  addresses: {
    flex: 1,
    gap: 10,
  },
  title: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: colors.text,
  },
  destinationText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginRight: 8,
  },
  price: {
    fontSize: 19,
    fontWeight: 'bold',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  distanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  distance: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 4,
  },
});
