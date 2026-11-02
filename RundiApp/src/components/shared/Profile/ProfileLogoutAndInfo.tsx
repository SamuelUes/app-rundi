import React from 'react';
import { View, Text } from 'react-native';
import Button from '../../ui/Button';
import type { TFunction } from 'i18next';

interface ProfileLogoutAndInfoProps {
  onLogout: () => void;
  styles: any;
  t: TFunction;
}

export function ProfileLogoutAndInfo({ onLogout, styles, t }: ProfileLogoutAndInfoProps) {
  return (
    <>
      <View style={styles.logoutContainer}>
        <Button
          title={t('shared.profile.buttons.logout')}
          onPress={onLogout}
          style={styles.logoutButton}
        />
      </View>

      <View style={styles.appInfo}>
        <Text style={styles.appVersion}>{t('shared.profile.appInfo.version')}</Text>
        <Text style={styles.appCopyright}>{t('shared.profile.appInfo.copyright')}</Text>
      </View>
    </>
  );
}
