import React from 'react';
import { View, Text } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { TFunction } from 'i18next';

interface RideDetailsPersonProps {
  isDriver: boolean;
  ride: any;
  safeString: (value: any, fallback?: string) => string;
  colors: any;
  t: TFunction;
  styles: any;
}

const getInitials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

export function RideDetailsPerson({
  isDriver,
  ride,
  safeString,
  colors,
  t,
  styles,
}: RideDetailsPersonProps) {
  const person = isDriver ? ride.client : ride.driver;
  const hasPerson = person && typeof person === 'object';
  const name = hasPerson
    ? safeString(
        person.name,
        t(isDriver
          ? 'shared.rideDetail.sections.person.clientFallback'
          : 'shared.rideDetail.sections.person.driverFallback'),
      )
    : null;
  const rating =
    !isDriver && person?.rating && parseFloat(String(person.rating)) > 0
      ? parseFloat(String(person.rating))
      : null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {isDriver
          ? t('shared.rideDetail.sections.person.clientTitle')
          : t('shared.rideDetail.sections.person.driverTitle')}
      </Text>
      <View style={styles.card}>
        {hasPerson && name ? (
          <View style={styles.personRow}>
            <View style={styles.personAvatar}>
              <Text style={styles.personAvatarText}>{getInitials(name)}</Text>
            </View>
            <View style={styles.personBody}>
              <Text style={styles.personName}>{name}</Text>

              <View style={styles.personMetaRow}>
                <MaterialIcons name="mail-outline" size={13} color={colors.textSecondary} />
                <Text style={styles.personDetail}>{safeString(person.email)}</Text>
              </View>

              {person.phone && typeof person.phone !== 'object' ? (
                <View style={styles.personMetaRow}>
                  <MaterialIcons name="phone" size={13} color={colors.textSecondary} />
                  <Text style={styles.personDetail}>{safeString(person.phone)}</Text>
                </View>
              ) : null}

              {!isDriver && person.licenseNumber && typeof person.licenseNumber !== 'object' ? (
                <View style={styles.personMetaRow}>
                  <MaterialIcons name="badge" size={13} color={colors.textSecondary} />
                  <Text style={styles.personDetail}>
                    {t('shared.rideDetail.sections.person.license', {
                      value: safeString(person.licenseNumber),
                    })}
                  </Text>
                </View>
              ) : null}

              {rating ? (
                <View style={styles.ratingRow}>
                  <MaterialIcons name="star" size={15} color="#FFC107" />
                  <Text style={styles.ratingValue}>{rating.toFixed(1)}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : (
          <Text style={styles.personName}>
            {t(isDriver
              ? 'shared.rideDetail.sections.person.missingClient'
              : 'shared.rideDetail.sections.person.missingDriver')}
          </Text>
        )}
      </View>
    </View>
  );
}
