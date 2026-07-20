import React from 'react';
import { View, Text, Image } from 'react-native';
import { safeFormatDate } from '../../../utils/safeFormatters';
import type { TFunction } from 'i18next';

interface DriverProfileInsuranceProps {
  vehicles: any[];
  t: TFunction;
  styles: any;
}

export function DriverProfileInsurance({
  vehicles,
  t,
  styles,
}: DriverProfileInsuranceProps) {
  if (!(vehicles.length > 0 && vehicles[0].insuranceNumber)) return null;

  const vehicle = vehicles[0];

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('driver.profile.insurance.title')}</Text>

      <View style={styles.insuranceCard}>
        <View style={styles.insuranceRow}>
          <Text style={styles.insuranceLabel}>{t('driver.profile.insurance.company')}</Text>
          <Text style={styles.insuranceValue}>{vehicle.insuranceCompany}</Text>
        </View>

        <View style={styles.insuranceRow}>
          <Text style={styles.insuranceLabel}>{t('driver.profile.insurance.number')}</Text>
          <Text style={styles.insuranceValue}>{vehicle.insuranceNumber}</Text>
        </View>

        {vehicle.insuranceExpiry && (
          <View style={styles.insuranceRow}>
            <Text style={styles.insuranceLabel}>{t('driver.profile.insurance.expiry')}</Text>
            <Text style={styles.insuranceValue}>
              {safeFormatDate(vehicle.insuranceExpiry)}
            </Text>
          </View>
        )}

        {vehicle.insurancePhoto && (
          <View style={styles.insurancePhotoContainer}>
            <Text style={styles.insuranceLabel}>{t('driver.profile.insurance.photo')}</Text>
            <Image source={{ uri: vehicle.insurancePhoto }} style={styles.insurancePhoto} />
          </View>
        )}
      </View>
    </View>
  );
}
