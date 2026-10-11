import React from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';

interface HomeScreenLocationStatusProps {
  locationStatusHint: string;
  isSavingLocation: boolean;
  hasPendingManualSelection: boolean;
  isPinLocked: boolean;
  styles: any;
  t: TFunction;
}

export function HomeScreenLocationStatus({
  locationStatusHint,
  isSavingLocation,
  hasPendingManualSelection,
  isPinLocked,
  styles,
  t,
}: HomeScreenLocationStatusProps) {
  const icon = isPinLocked
    ? 'location-on'
    : hasPendingManualSelection
      ? 'edit-location'
      : 'location-searching';

  return (
    <View style={styles.statusCard} pointerEvents="none">
      <View style={styles.statusIconDisc}>
        <MaterialIcons name={icon} size={19} color="#B38737" />
      </View>
      <View style={styles.statusTextCol}>
        <Text style={styles.statusText}>{locationStatusHint}</Text>
        {isSavingLocation && (
          <Text style={styles.statusSavingText}>
            {t('client.home.locationStatus.savingLabel')}
          </Text>
        )}
      </View>
    </View>
  );
}
