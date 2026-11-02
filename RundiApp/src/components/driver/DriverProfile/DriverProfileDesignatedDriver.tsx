import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { LoadingIcon } from '../../ui/LoadingIcon';
import type { TFunction } from 'i18next';

interface DriverProfileDesignatedDriverProps {
  isDesignatedRequestPending: boolean;
  isDesignatedDriverApproved: boolean;
  isDesignatedRequestRejected: boolean;
  designatedButtonLabel: string;
  designatedButtonDisabled: boolean;
  loadingRequestStatus: boolean;
  onRequestDesignatedDriver: () => void;
  t: TFunction;
  styles: any;
}

export function DriverProfileDesignatedDriver({
  isDesignatedRequestPending,
  isDesignatedDriverApproved,
  isDesignatedRequestRejected,
  designatedButtonLabel,
  designatedButtonDisabled,
  loadingRequestStatus,
  onRequestDesignatedDriver,
  t,
  styles,
}: DriverProfileDesignatedDriverProps) {
  return (
    <View style={styles.profileSection}>
      <Text style={styles.profileSectionTitle}>{t('driver.profile.designated.title')}</Text>

      <View style={styles.profileDesignatedCard}>
        <View style={styles.designatedDriverContent}>
          <Text style={styles.profileDesignatedTitle}>{t('driver.profile.designated.heroTitle')}</Text>
          <Text style={styles.designatedDriverDescription}>
            {t('driver.profile.designated.heroDescription')}
          </Text>

          <View style={styles.profileDesignatedBenefits}>
            <Text style={styles.benefitItem}>{t('driver.profile.designated.benefits.rides')}</Text>
            <Text style={styles.benefitItem}>{t('driver.profile.designated.benefits.higherFare')}</Text>
            <Text style={styles.benefitItem}>{t('driver.profile.designated.benefits.premiumClients')}</Text>
            <Text style={styles.benefitItem}>{t('driver.profile.designated.benefits.keepRegular')}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.profileDesignatedButton,
            designatedButtonDisabled && styles.designatedDriverButtonDisabled
          ]}
          onPress={() => {
            if (isDesignatedRequestPending) {
              Alert.alert(
                t('driver.profile.designated.alerts.pendingTitle'),
                t('driver.profile.designated.alerts.pendingBody'),
              );
              return;
            }

            if (isDesignatedDriverApproved) {
              Alert.alert(
                t('driver.profile.designated.alerts.approvedTitle'),
                t('driver.profile.designated.alerts.approvedBody'),
              );
              return;
            }

            if (isDesignatedRequestRejected) {
              Alert.alert(
                t('driver.profile.designated.alerts.rejectedTitle'),
                t('driver.profile.designated.alerts.rejectedBody'),
              );
              return;
            }

            Alert.alert(
              t('driver.profile.designated.alerts.confirmTitle'),
              t('driver.profile.designated.alerts.confirmBody'),
              [
                { text: t('driver.profile.designated.alerts.confirmCancel'), style: 'cancel' },
                {
                  text: t('driver.profile.designated.alerts.confirmSubmit'),
                  onPress: onRequestDesignatedDriver
                }
              ]
            );
          }}
          disabled={designatedButtonDisabled}
        >
          {loadingRequestStatus ? (
            <LoadingIcon size={20} color="#fff" />
          ) : (
            <Text style={styles.designatedDriverButtonText}>
              {designatedButtonLabel}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
