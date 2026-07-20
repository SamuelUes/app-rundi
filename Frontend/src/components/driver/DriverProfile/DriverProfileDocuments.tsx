import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { safeFormatDate } from '../../../utils/safeFormatters';
import type { TFunction } from 'i18next';

interface DriverProfileDocumentsProps {
  driverData: any;
  documentStatusColor: string;
  documentStatusIconName: any;
  documentStatusText: string;
  documentButtonLabel: string;
  driverLicenseExpiry: string | null;
  colors: any;
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
  colors,
  onUploadDocuments,
  t,
  styles,
}: DriverProfileDocumentsProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('driver.profile.documents.title')}</Text>

      {driverData && (
        <View style={styles.documentCard}>
          <View style={styles.documentLeft}>
            <View style={[styles.statusIndicator, { backgroundColor: documentStatusColor }]}>
              <MaterialIcons name={documentStatusIconName} size={20} color="#fff" />
            </View>
            <View style={styles.documentInfo}>
              <MaterialIcons name="badge" size={28} color={colors.textSecondary} />
              <View>
                <Text style={styles.documentName}>{t('driver.profile.documents.licenseName')}</Text>
                <Text style={[styles.documentStatus, { color: documentStatusColor }]}>{documentStatusText}</Text>
                {driverLicenseExpiry && (
                  <Text style={styles.documentExpiry}>
                    {t('driver.profile.documents.expires', { date: safeFormatDate(driverLicenseExpiry) })}
                  </Text>
                )}
              </View>
            </View>
          </View>
          <TouchableOpacity
            style={styles.uploadButton}
            onPress={onUploadDocuments}
          >
            <Text style={styles.uploadButtonText}>{documentButtonLabel}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
