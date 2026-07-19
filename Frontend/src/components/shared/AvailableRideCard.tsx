/**
 * AvailableRideCard - Tarjeta para mostrar viajes disponibles
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
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
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <MaterialIcons name="place" size={20} color={colors.primary} />
        <Text style={styles.title} numberOfLines={1}>
          {originLabel}
        </Text>
      </View>

      <View style={styles.destination}>
        <MaterialIcons name="flag" size={20} color={colors.error} />
        <Text style={styles.destinationText} numberOfLines={1}>
          {destinationLabel}
        </Text>
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
          <MaterialIcons name="straighten" size={16} color={colors.textSecondary} />
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
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginLeft: 8,
  },
  destination: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  destinationText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 8,
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
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
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
