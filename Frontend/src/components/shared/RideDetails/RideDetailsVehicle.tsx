import React from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';

interface RideDetailsVehicleProps {
  ride: any;
  safeString: (value: any, fallback?: string) => string;
  colors: any;
  t: TFunction;
  styles: any;
}

export function RideDetailsVehicle({
  ride,
  safeString,
  colors,
  t,
  styles,
}: RideDetailsVehicleProps) {
  if (!ride.vehicle || typeof ride.vehicle !== 'object') return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('shared.rideDetail.sections.vehicle.title')}</Text>
      <View style={styles.card}>
        <View style={styles.vehicleRow}>
          <View style={styles.vehicleTile}>
            <MaterialIcons name="directions-car" size={22} color={colors.primary} />
          </View>
          <View style={styles.vehicleBody}>
            <Text style={styles.vehicleName}>
              {safeString(ride.vehicle.brand)} {safeString(ride.vehicle.model)} ({safeString(ride.vehicle.year)})
            </Text>
            <Text style={styles.vehicleDetail}>
              {safeString(ride.vehicle.color)} • {safeString(ride.vehicle.plate)}
            </Text>
            {ride.vehicle.registrationNumber && typeof ride.vehicle.registrationNumber !== 'object' ? (
              <Text style={styles.vehicleDetail}>
                {t('shared.rideDetail.sections.vehicle.registration', {
                  value: safeString(ride.vehicle.registrationNumber),
                })}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}
