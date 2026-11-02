import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { safeFormatDate } from '../../../utils/format/safeFormatters';
import type { TFunction } from 'i18next';

interface DriverProfileDocumentsProps {
  driverData: any;
  documentStatusColor: string;
  documentStatusIconName: any;
  documentStatusText: string;
  documentButtonLabel: string;
  driverLicenseExpiry: string | null;
  onUploadDocuments: () => void;
  t: TFunction;
  styles: any;
}

export function DriverProfileDocuments({
  driverData,
  documentStatusColor,
  documentStatusIconName,
  documentStatusText,
  documentButtonLabel,
  driverLicenseExpiry,
  onUploadDocuments,
  t,
  styles,
}: DriverProfileDocumentsProps) {
  return (
    <View style={styles.profileSection}>
      <Text style={styles.profileSectionTitle}>{t('driver.profile.documents.title')}</Text>

      {driverData && (
        <View style={styles.profileDocumentCard}>
          <View style={styles.profileDocumentInfo}>
            <View style={[styles.profileDocumentStatusIndicator, { backgroundColor: documentStatusColor }]}>
              <MaterialIcons name={documentStatusIconName} size={20} color="#fff" />
            </View>
            <View style={styles.profileDocumentText}>
              <Text style={styles.documentName} numberOfLines={2}>{t('driver.profile.documents.licenseName')}</Text>
              <Text style={[styles.documentStatus, { color: documentStatusColor }]} numberOfLines={1}>
                {documentStatusText}
              </Text>
              {driverLicenseExpiry && (
                <Text style={styles.documentExpiry} numberOfLines={1}>
                  {t('driver.profile.documents.expires', { date: safeFormatDate(driverLicenseExpiry) })}
                </Text>
              )}
            </View>
          </View>
          <TouchableOpacity
            style={styles.profileDocumentButton}
            onPress={onUploadDocuments}
          >
            <Text style={styles.uploadButtonText}>{documentButtonLabel}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
