import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
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
  styles,
}: RideTrackingDriverInfoProps) {
  return (
    <View style={styles.driverSection}>
      {driverPhoto ? (
        <StorageImage uri={driverPhoto} style={styles.driverAvatar} />
      ) : (
        <View style={[styles.driverAvatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.driverInitial}>
            {driverName?.[0] || 'C'}
          </Text>
        </View>
      )}

      <View style={styles.driverInfo}>
        <Text style={[styles.driverName, { color: colors.text }]}>
          {driverName} - {vehiclePlate}
        </Text>
        <Text style={[styles.vehicleInfo, { color: colors.textSecondary }]}>
          {vehicleBrand} {vehicleModel} - {vehicleColor}
        </Text>
      </View>

      <TouchableOpacity style={styles.messageButton} onPress={onOpenChat}>
        <MaterialIcons name="chat" size={24} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}
