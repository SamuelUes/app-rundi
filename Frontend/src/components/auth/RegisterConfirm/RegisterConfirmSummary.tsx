import React from 'react';
import { View, Text, ScrollView, Image } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { TFunction } from 'i18next';

interface PhotoPreview {
  key: string;
  label: string;
  uri: string;
}

interface RegisterConfirmSummaryProps {
  name: string;
  email?: string;
  phone?: string;
  role: string;
  authProvider: string;
  phoneVerified?: boolean;
  driverData: any;
  vehicleData: any;
  driverPhotoPreviews: PhotoPreview[];
  vehiclePhotoPreviews: PhotoPreview[];
  colors: any;
  accentColor: string;
  t: TFunction;
  styles: any;
}

type SectionIcon = React.ComponentProps<typeof Ionicons>['name'];

function SectionHeader({
  icon,
  title,
  accentColor,
  styles,
}: {
  icon: SectionIcon;
  title: string;
  accentColor: string;
  styles: any;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIconWrap}>
        <Ionicons name={icon} size={16} color={accentColor} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function DataRow({
  label,
  value,
  styles,
}: {
  label: string;
  value?: string | number | null;
  styles: any;
}) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={styles.dataValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function PhotoStrip({
  title,
  photos,
  hint,
  styles,
}: {
  title: string;
  photos: PhotoPreview[];
  hint: string;
  styles: any;
}) {
  if (photos.length === 0) {
    return null;
  }
  return (
    <View style={styles.photoPreviewGroup}>
      <Text style={styles.photoPreviewTitle}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {photos.map((photo) => (
          <View style={styles.photoPreviewCard} key={photo.key}>
            <Image source={{ uri: photo.uri }} style={styles.photoPreviewImage} />
            <Text style={styles.photoPreviewLabel} numberOfLines={2}>
              {photo.label}
            </Text>
          </View>
        ))}
      </ScrollView>
      <Text style={styles.photoHint}>{hint}</Text>
    </View>
  );
}

export function RegisterConfirmSummary({
  name,
  email,
  phone,
  role,
  authProvider,
  phoneVerified,
  driverData,
  vehicleData,
  driverPhotoPreviews,
  vehiclePhotoPreviews,
  colors,
  accentColor,
  t,
  styles,
}: RegisterConfirmSummaryProps) {
  const verifiedColor = phoneVerified ? colors.success : colors.error;

  return (
    <View style={styles.summaryContainer}>
      {/* Datos Básicos */}
      <View style={styles.section}>
        <SectionHeader
          icon="person-outline"
          title={t('authScreens.registerConfirm.sections.basic')}
          accentColor={accentColor}
          styles={styles}
        />

        <DataRow label={t('authScreens.registerConfirm.data.name')} value={name} styles={styles} />
        <DataRow label={t('authScreens.registerConfirm.data.email')} value={email} styles={styles} />
        <DataRow label={t('authScreens.registerConfirm.data.phone')} value={phone} styles={styles} />
        <DataRow
          label={t('authScreens.registerConfirm.data.role')}
          value={
            role === 'driver'
              ? t('authScreens.registerConfirm.data.roleLabel.driver')
              : t('authScreens.registerConfirm.data.roleLabel.client')
          }
          styles={styles}
        />
        <DataRow
          label={t('authScreens.registerConfirm.data.authMethod')}
          value={
            authProvider === 'google'
              ? t('authScreens.registerConfirm.data.authMethodLabel.google')
              : authProvider === 'phone'
                ? t('authScreens.registerConfirm.data.authMethodLabel.phone')
                : t('authScreens.registerConfirm.data.authMethodLabel.emailPassword')
          }
          styles={styles}
        />

        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>
            {t('authScreens.registerConfirm.data.phoneVerified')}
          </Text>
          <View style={[styles.statusChip, { backgroundColor: verifiedColor + '1F' }]}>
            <Ionicons
              name={phoneVerified ? 'checkmark-circle' : 'close-circle'}
              size={13}
              color={verifiedColor}
            />
            <Text style={[styles.statusChipText, { color: verifiedColor }]}>
              {phoneVerified
                ? t('authScreens.registerConfirm.data.phoneVerifiedYes')
                : t('authScreens.registerConfirm.data.phoneVerifiedNo')}
            </Text>
          </View>
        </View>
      </View>

      {/* Datos del Conductor (si aplica) */}
      {role === 'driver' && driverData && (
        <View style={styles.section}>
          <SectionHeader
            icon="id-card-outline"
            title={t('authScreens.registerConfirm.sections.license')}
            accentColor={accentColor}
            styles={styles}
          />

          <DataRow
            label={t('authScreens.registerConfirm.data.licenseNumber')}
            value={driverData.licenseNumber}
            styles={styles}
          />
          <DataRow
            label={t('authScreens.registerConfirm.data.expiration')}
            value={driverData.licenseExpiry}
            styles={styles}
          />
          <DataRow
            label={t('authScreens.registerConfirm.data.department')}
            value={driverData.department}
            styles={styles}
          />
          <DataRow
            label={t('authScreens.registerConfirm.data.municipality')}
            value={driverData.municipality}
            styles={styles}
          />

          <PhotoStrip
            title={t('authScreens.registerConfirm.sections.photos')}
            photos={driverPhotoPreviews}
            hint={t('authScreens.registerConfirm.photos.hint')}
            styles={styles}
          />
        </View>
      )}

      {/* Datos del Vehículo (si aplica) */}
      {role === 'driver' && vehicleData && (
        <View style={styles.section}>
          <SectionHeader
            icon="car-sport-outline"
            title={t('authScreens.registerConfirm.sections.vehicle')}
            accentColor={accentColor}
            styles={styles}
          />

          <DataRow
            label={t('authScreens.registerConfirm.data.plate')}
            value={vehicleData.plate}
            styles={styles}
          />
          <DataRow
            label={t('authScreens.registerConfirm.data.brand')}
            value={vehicleData.brand}
            styles={styles}
          />
          <DataRow
            label={t('authScreens.registerConfirm.data.model')}
            value={vehicleData.model}
            styles={styles}
          />
          <DataRow
            label={t('authScreens.registerConfirm.data.year')}
            value={vehicleData.year}
            styles={styles}
          />
          <DataRow
            label={t('authScreens.registerConfirm.data.color')}
            value={vehicleData.color}
            styles={styles}
          />
          <DataRow
            label={t('authScreens.registerConfirm.data.type')}
            value={
              vehicleData.type === 'sedan'
                ? t('authScreens.registerConfirm.data.typeLabel.sedan')
                : vehicleData.type === 'suv'
                  ? t('authScreens.registerConfirm.data.typeLabel.suv')
                  : vehicleData.type === 'van'
                    ? t('authScreens.registerConfirm.data.typeLabel.van')
                    : vehicleData.type === 'moto'
                      ? t('authScreens.registerConfirm.data.typeLabel.moto')
                      : vehicleData.type
            }
            styles={styles}
          />
          <DataRow
            label={t('authScreens.registerConfirm.data.passengers')}
            value={vehicleData.passengers}
            styles={styles}
          />

          <PhotoStrip
            title={t('authScreens.registerConfirm.sections.vehiclePhotos')}
            photos={vehiclePhotoPreviews}
            hint={t('authScreens.registerConfirm.photos.hint')}
            styles={styles}
          />
        </View>
      )}

      {/* Información Importante */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>
          {t('authScreens.registerConfirm.sections.importantInfo')}
        </Text>
        <Text style={styles.infoText}>
          {t('authScreens.registerConfirm.infoBox.line1')}
        </Text>
        <Text style={styles.infoText}>
          {t('authScreens.registerConfirm.infoBox.line2')}
        </Text>
        <Text style={styles.infoText}>
          {t('authScreens.registerConfirm.infoBox.line3')}
        </Text>
      </View>
    </View>
  );
}
