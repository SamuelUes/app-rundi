import React from 'react';
import { View, Text } from 'react-native';
import type { TFunction } from 'i18next';

interface RideDetailsPersonProps {
  isDriver: boolean;
  ride: any;
  safeString: (value: any, fallback?: string) => string;
  t: TFunction;
  styles: any;
}

export function RideDetailsPerson({
  isDriver,
  ride,
  safeString,
  t,
  styles,
}: RideDetailsPersonProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {isDriver
          ? t('shared.rideDetail.sections.person.clientTitle')
          : t('shared.rideDetail.sections.person.driverTitle')}
      </Text>
      <View style={styles.card}>
        {isDriver ? (
          ride.client && typeof ride.client === 'object' ? (
            <View>
              <Text style={styles.personName}>
                {safeString(ride.client.name, t('shared.rideDetail.sections.person.clientFallback'))}
              </Text>
              <Text style={styles.personDetail}>{safeString(ride.client.email)}</Text>
              {ride.client.phone && typeof ride.client.phone !== 'object' ? (
                <Text style={styles.personDetail}>{safeString(ride.client.phone)}</Text>
              ) : null}
            </View>
          ) : (
            <Text style={styles.personName}>
              {t('shared.rideDetail.sections.person.missingClient')}
            </Text>
          )
        ) : (
          ride.driver && typeof ride.driver === 'object' ? (
            <View>
              <Text style={styles.personName}>
                {safeString(ride.driver.name, t('shared.rideDetail.sections.person.driverFallback'))}
              </Text>
              <Text style={styles.personDetail}>{safeString(ride.driver.email)}</Text>
              {ride.driver.phone && typeof ride.driver.phone !== 'object' ? (
                <Text style={styles.personDetail}>{safeString(ride.driver.phone)}</Text>
              ) : null}
              {ride.driver.licenseNumber && typeof ride.driver.licenseNumber !== 'object' ? (
                <Text style={styles.personDetail}>
                  {t('shared.rideDetail.sections.person.license', {
                    value: safeString(ride.driver.licenseNumber),
                  })}
                </Text>
              ) : null}
              {ride.driver.rating && parseFloat(String(ride.driver.rating)) > 0 ? (
                <View style={styles.ratingRow}>
                  <Text style={styles.ratingStars}>
                    {'⭐'.repeat(Math.round(parseFloat(String(ride.driver.rating))))}
                  </Text>
                  <Text style={styles.ratingValue}>
                    {parseFloat(String(ride.driver.rating)).toFixed(1)}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <Text style={styles.personName}>
              {t('shared.rideDetail.sections.person.missingDriver')}
            </Text>
          )
        )}
      </View>
    </View>
  );
}
