import React from 'react';
import { View, Text } from 'react-native';
import type { TFunction } from 'i18next';

interface HomeScreenLocationStatusProps {
  locationStatusHint: string;
  isSavingLocation: boolean;
  hasPendingManualSelection: boolean;
  styles: any;
  t: TFunction;
}

export function HomeScreenLocationStatus({
  locationStatusHint,
  isSavingLocation,
  hasPendingManualSelection,
  styles,
  t,
}: HomeScreenLocationStatusProps) {
  return (
    <View
      style={[
        styles.locationStatusContainer,
        hasPendingManualSelection ? styles.locationStatusPending : styles.locationStatusIdle,
      ]}
    >
      <Text style={styles.locationStatusHint}>{locationStatusHint}</Text>
      {isSavingLocation && (
        <Text style={styles.locationStatusSaving}>{t('client.home.locationStatus.savingLabel')}</Text>
      )}
    </View>
  );
}
