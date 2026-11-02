import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import StorageImage from '../../shared/StorageImage';

interface RideTrackingDriverInfoProps {
  driverName: string;
  driverPhoto: string | null;
  vehiclePlate: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleColor: string;
  colors: any;
  onOpenChat: () => void;
  tr: (path: string, options?: Record<string, any>) => string;
  styles: any;
}

export function RideTrackingDriverInfo({
  driverName,
  driverPhoto,
  vehiclePlate,
  vehicleBrand,
  vehicleModel,
  vehicleColor,
  colors,
  onOpenChat,
  tr,
  styles,
}: RideTrackingDriverInfoProps) {
  const vehicleDescription = [vehicleBrand, vehicleModel, vehicleColor]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.driverSection}>
      {driverPhoto ? (
        <StorageImage uri={driverPhoto} style={styles.driverAvatar} />
      ) : (
        <View style={[styles.driverAvatar, { backgroundColor: `${colors.primary}1F` }]}>
          <Text style={[styles.driverInitial, { color: colors.primary }]}>
            {driverName?.[0] || 'C'}
          </Text>
        </View>
      )}

      <View style={styles.driverInfo}>
        <Text numberOfLines={1} style={[styles.driverName, { color: colors.text }]}>
          {driverName}
        </Text>
        <View style={styles.driverMetaRow}>
          {!!vehiclePlate && (
            <View style={styles.plateChip}>
              <Text style={[styles.plateChipText, { color: colors.text }]}>
                {vehiclePlate}
              </Text>
            </View>
          )}
          {!!vehicleDescription && (
            <Text numberOfLines={1} style={[styles.vehicleInfo, { color: colors.textSecondary }]}>
              {vehicleDescription}
            </Text>
          )}
        </View>
      </View>

      <TouchableOpacity
        style={styles.messageButton}
        onPress={onOpenChat}
        hitSlop={4}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={tr('accessibility.openChat')}
      >
        <MaterialIcons name="chat-bubble-outline" size={20} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}
