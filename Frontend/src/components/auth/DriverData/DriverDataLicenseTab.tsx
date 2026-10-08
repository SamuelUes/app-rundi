import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { DatePickerField } from '../../ui/DatePickerField';
import { DriverDataPhotoField } from './DriverDataPhotoField';
import type { TFunction } from 'i18next';

interface DriverDataLicenseTabProps {
  licenseNumber: string;
  licenseExpiry: string;
  department: string;
  municipality: string;
  profilePhoto: string | null;
  licensePhotoFront: string | null;
  licensePhotoBack: string | null;
  loading: boolean;
  departmentsList: string[];
  municipalities: string[];
  colors: any;
  onSetLicenseNumber: (v: string) => void;
  onSetLicenseExpiry: (v: string) => void;
  onSetDepartment: (v: string) => void;
  onSetMunicipality: (v: string) => void;
  onTakeProfilePhoto: () => void;
  onTakeLicensePhotoFront: () => void;
  onTakeLicensePhotoBack: () => void;
  styles: any;
  t: TFunction;
}

export function DriverDataLicenseTab({
  licenseNumber,
  licenseExpiry,
  department,
  municipality,
  profilePhoto,
  licensePhotoFront,
  licensePhotoBack,
  loading,
  departmentsList,
  municipalities,
  colors,
  onSetLicenseNumber,
  onSetLicenseExpiry,
  onSetDepartment,
  onSetMunicipality,
  onTakeProfilePhoto,
  onTakeLicensePhotoFront,
  onTakeLicensePhotoBack,
  styles,
  t,
}: DriverDataLicenseTabProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {t('authScreens.driverData.license.sectionTitle')}
      </Text>

      {/* Número de Licencia */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>
          {t('authScreens.driverData.license.licenseNumberLabel')}
        </Text>
        <TextInput
          style={styles.input}
          placeholder={t('authScreens.driverData.license.licenseNumberPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={licenseNumber}
          onChangeText={onSetLicenseNumber}
          editable={!loading}
        />
      </View>

      {/* Fecha de Vencimiento */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>
          {t('authScreens.driverData.license.expiryLabel')}
        </Text>
        <DatePickerField
          style={styles.input}
          placeholder={t('authScreens.driverData.license.expiryPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={licenseExpiry}
          onChangeText={onSetLicenseExpiry}
          editable={!loading}
        />
      </View>

      {/* Departamento */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>
          {t('authScreens.driverData.license.departmentLabel')}
        </Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={department}
            onValueChange={onSetDepartment}
            enabled={!loading}
            style={styles.picker}
          >
            <Picker.Item
              label={t('authScreens.driverData.license.departmentPlaceholder')}
              value=""
            />
            {departmentsList.map((dept) => (
              <Picker.Item key={dept} label={dept} value={dept} />
            ))}
          </Picker>
        </View>
      </View>

      {/* Municipio */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>
          {t('authScreens.driverData.license.municipalityLabel')}
        </Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={municipality}
            onValueChange={onSetMunicipality}
            enabled={!loading && department !== ''}
            style={styles.picker}
          >
            <Picker.Item
              label={t('authScreens.driverData.license.municipalityPlaceholder')}
              value=""
            />
            {municipalities.map((mun) => (
              <Picker.Item key={mun} label={mun} value={mun} />
            ))}
          </Picker>
        </View>
      </View>

      <View style={styles.photoSection}>
        <Text style={styles.sectionTitle}>{t('authScreens.driverData.photos.sectionTitle')}</Text>

        <DriverDataPhotoField
          title={t('authScreens.driverData.photos.profileTitle')}
          photoUri={profilePhoto}
          loading={loading}
          onTakePhoto={onTakeProfilePhoto}
          styles={styles}
          t={t}
        />

        <DriverDataPhotoField
          title={t('authScreens.driverData.photos.licenseFrontTitle')}
          photoUri={licensePhotoFront}
          loading={loading}
          onTakePhoto={onTakeLicensePhotoFront}
          styles={styles}
          t={t}
        />

        <DriverDataPhotoField
          title={t('authScreens.driverData.photos.licenseBackTitle')}
          photoUri={licensePhotoBack}
          loading={loading}
          onTakePhoto={onTakeLicensePhotoBack}
          styles={styles}
          t={t}
        />
      </View>

      {/* Info */}
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          {t('authScreens.driverData.license.info')}
        </Text>
      </View>
    </View>
  );
}
