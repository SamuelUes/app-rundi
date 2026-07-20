import React from 'react';
import { View, Text, ScrollView, Image } from 'react-native';
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
  t: TFunction;
  styles: any;
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
  t,
  styles,
}: RegisterConfirmSummaryProps) {
  return (
    <View style={styles.summaryContainer}>
      {/* Datos Básicos */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {t('authScreens.registerConfirm.sections.basic')}
        </Text>

        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>
            {t('authScreens.registerConfirm.data.name')}:
          </Text>
          <Text style={styles.dataValue}>{name}</Text>
        </View>

        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>
            {t('authScreens.registerConfirm.data.email')}:
          </Text>
          <Text style={styles.dataValue}>{email}</Text>
        </View>

        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>
            {t('authScreens.registerConfirm.data.phone')}:
          </Text>
          <Text style={styles.dataValue}>{phone}</Text>
        </View>

        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>
            {t('authScreens.registerConfirm.data.role')}:
          </Text>
          <Text style={styles.dataValue}>
            {role === 'driver'
              ? t('authScreens.registerConfirm.data.roleLabel.driver')
              : t('authScreens.registerConfirm.data.roleLabel.client')}
          </Text>
        </View>

        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>
            {t('authScreens.registerConfirm.data.authMethod')}:
          </Text>
          <Text style={styles.dataValue}>
            {authProvider === 'google'
              ? t('authScreens.registerConfirm.data.authMethodLabel.google')
              : authProvider === 'phone'
                ? t('authScreens.registerConfirm.data.authMethodLabel.phone')
                : t('authScreens.registerConfirm.data.authMethodLabel.emailPassword')}
          </Text>
        </View>

        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>
            {t('authScreens.registerConfirm.data.phoneVerified')}:
          </Text>
          <Text style={[styles.dataValue, { color: phoneVerified ? colors.success : colors.error }]}>
            {phoneVerified
              ? t('authScreens.registerConfirm.data.phoneVerifiedYes')
              : t('authScreens.registerConfirm.data.phoneVerifiedNo')}
          </Text>
        </View>
      </View>

      {/* Datos del Conductor (si aplica) */}
      {role === 'driver' && driverData && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('authScreens.registerConfirm.sections.license')}
          </Text>

          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>
              {t('authScreens.registerConfirm.data.licenseNumber')}:
            </Text>
            <Text style={styles.dataValue}>{driverData.licenseNumber}</Text>
          </View>

          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>
              {t('authScreens.registerConfirm.data.expiration')}:
            </Text>
            <Text style={styles.dataValue}>{driverData.licenseExpiry}</Text>
          </View>

          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>
              {t('authScreens.registerConfirm.data.department')}:
            </Text>
            <Text style={styles.dataValue}>{driverData.department}</Text>
          </View>

          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>
              {t('authScreens.registerConfirm.data.municipality')}:
            </Text>
            <Text style={styles.dataValue}>{driverData.municipality}</Text>
          </View>

          {driverPhotoPreviews.length > 0 && (
            <View style={styles.photoPreviewGroup}>
              <Text style={styles.photoPreviewTitle}>
                {t('authScreens.registerConfirm.sections.photos')}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {driverPhotoPreviews.map((photo) => (
                  <View style={styles.photoPreviewCard} key={photo.key}>
                    <Image source={{ uri: photo.uri }} style={styles.photoPreviewImage} />
                    <Text style={styles.photoPreviewLabel} numberOfLines={2}>
                      {photo.label}
                    </Text>
                  </View>
                ))}
              </ScrollView>
              <Text style={styles.photoHint}>
                {t('authScreens.registerConfirm.photos.hint')}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Datos del Vehículo (si aplica) */}
      {role === 'driver' && vehicleData && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('authScreens.registerConfirm.sections.vehicle')}
          </Text>

          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>
              {t('authScreens.registerConfirm.data.plate')}:
            </Text>
            <Text style={styles.dataValue}>{vehicleData.plate}</Text>
          </View>

          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>
              {t('authScreens.registerConfirm.data.brand')}:
            </Text>
            <Text style={styles.dataValue}>{vehicleData.brand}</Text>
          </View>

          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>
              {t('authScreens.registerConfirm.data.model')}:
            </Text>
            <Text style={styles.dataValue}>{vehicleData.model}</Text>
          </View>

          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>
              {t('authScreens.registerConfirm.data.year')}:
            </Text>
            <Text style={styles.dataValue}>{vehicleData.year}</Text>
          </View>

          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>
              {t('authScreens.registerConfirm.data.color')}:
            </Text>
            <Text style={styles.dataValue}>{vehicleData.color}</Text>
          </View>

          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>
              {t('authScreens.registerConfirm.data.type')}:
            </Text>
            <Text style={styles.dataValue}>
              {vehicleData.type === 'sedan' && t('authScreens.registerConfirm.data.typeLabel.sedan')}
              {vehicleData.type === 'suv' && t('authScreens.registerConfirm.data.typeLabel.suv')}
              {vehicleData.type === 'van' && t('authScreens.registerConfirm.data.typeLabel.van')}
              {vehicleData.type === 'moto' && t('authScreens.registerConfirm.data.typeLabel.moto')}
            </Text>
          </View>

          {vehicleData.passengers && (
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>
                {t('authScreens.registerConfirm.data.passengers')}:
              </Text>
              <Text style={styles.dataValue}>{vehicleData.passengers}</Text>
            </View>
          )}

          {vehiclePhotoPreviews.length > 0 && (
            <View style={styles.photoPreviewGroup}>
              <Text style={styles.photoPreviewTitle}>
                {t('authScreens.registerConfirm.sections.vehiclePhotos')}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {vehiclePhotoPreviews.map((photo) => (
                  <View style={styles.photoPreviewCard} key={photo.key}>
                    <Image source={{ uri: photo.uri }} style={styles.photoPreviewImage} />
                    <Text style={styles.photoPreviewLabel} numberOfLines={2}>
                      {photo.label}
                    </Text>
                  </View>
                ))}
              </ScrollView>
              <Text style={styles.photoHint}>
                {t('authScreens.registerConfirm.photos.hint')}
              </Text>
            </View>
          )}
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
