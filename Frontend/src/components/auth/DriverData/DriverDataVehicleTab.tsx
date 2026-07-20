import React from 'react';
import { View, Text, TextInput } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { DriverDataPhotoField } from './DriverDataPhotoField';
import type { TFunction } from 'i18next';

interface DriverDataVehicleTabProps {
  plate: string;
  brand: string;
  model: string;
  year: string;
  color: string;
  type: string;
  passengers: string;
  registrationNumber: string;
  registrationExpiry: string;
  insuranceNumber: string;
  insuranceCompany: string;
  insuranceExpiry: string;
  insurancePhoto: string | null;
  registrationPhotoFront: string | null;
  registrationPhotoBack: string | null;
  loading: boolean;
  colors: any;
  onSetPlate: (v: string) => void;
  onSetBrand: (v: string) => void;
  onSetModel: (v: string) => void;
  onSetYear: (v: string) => void;
  onSetColor: (v: string) => void;
  onSetType: (v: string) => void;
  onSetPassengers: (v: string) => void;
  onSetRegistrationNumber: (v: string) => void;
  onSetRegistrationExpiry: (v: string) => void;
  onSetInsuranceNumber: (v: string) => void;
  onSetInsuranceCompany: (v: string) => void;
  onSetInsuranceExpiry: (v: string) => void;
  onTakeInsurancePhoto: () => void;
  onTakeRegistrationPhotoFront: () => void;
  onTakeRegistrationPhotoBack: () => void;
  formatDate: (text: string, currentValue: string) => string;
  styles: any;
  t: TFunction;
}

export function DriverDataVehicleTab({
  plate,
  brand,
  model,
  year,
  color,
  type,
  passengers,
  registrationNumber,
  registrationExpiry,
  insuranceNumber,
  insuranceCompany,
  insuranceExpiry,
  insurancePhoto,
  registrationPhotoFront,
  registrationPhotoBack,
  loading,
  colors,
  onSetPlate,
  onSetBrand,
  onSetModel,
  onSetYear,
  onSetColor,
  onSetType,
  onSetPassengers,
  onSetRegistrationNumber,
  onSetRegistrationExpiry,
  onSetInsuranceNumber,
  onSetInsuranceCompany,
  onSetInsuranceExpiry,
  onTakeInsurancePhoto,
  onTakeRegistrationPhotoFront,
  onTakeRegistrationPhotoBack,
  formatDate,
  styles,
  t,
}: DriverDataVehicleTabProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {t('authScreens.driverData.vehicle.sectionTitle')}
      </Text>

      {/* Placa */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{t('authScreens.driverData.vehicle.plateLabel')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('authScreens.driverData.vehicle.platePlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={plate}
          onChangeText={onSetPlate}
          editable={!loading}
        />
      </View>

      {/* Marca */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{t('authScreens.driverData.vehicle.brandLabel')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('authScreens.driverData.vehicle.brandPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={brand}
          onChangeText={onSetBrand}
          editable={!loading}
        />
      </View>

      {/* Modelo */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{t('authScreens.driverData.vehicle.modelLabel')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('authScreens.driverData.vehicle.modelPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={model}
          onChangeText={onSetModel}
          editable={!loading}
        />
      </View>

      {/* Año */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{t('authScreens.driverData.vehicle.yearLabel')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('authScreens.driverData.vehicle.yearPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={year}
          onChangeText={onSetYear}
          keyboardType="numeric"
          editable={!loading}
        />
      </View>

      {/* Color */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{t('authScreens.driverData.vehicle.colorLabel')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('authScreens.driverData.vehicle.colorPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={color}
          onChangeText={onSetColor}
          editable={!loading}
        />
      </View>

      {/* Tipo */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{t('authScreens.driverData.vehicle.typeLabel')}</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={type}
            onValueChange={onSetType}
            enabled={!loading}
            style={styles.picker}
          >
            <Picker.Item label={t('authScreens.driverData.vehicle.typeOptions.sedan')} value="sedan" />
            <Picker.Item label={t('authScreens.driverData.vehicle.typeOptions.suv')} value="suv" />
            <Picker.Item label={t('authScreens.driverData.vehicle.typeOptions.van')} value="van" />
            <Picker.Item label={t('authScreens.driverData.vehicle.typeOptions.moto')} value="moto" />
          </Picker>
        </View>
      </View>

      {/* Pasajeros */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{t('authScreens.driverData.vehicle.passengersLabel')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('authScreens.driverData.vehicle.passengersPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={passengers}
          onChangeText={onSetPassengers}
          keyboardType="numeric"
          editable={!loading}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{t('authScreens.driverData.vehicle.registrationNumberLabel')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('authScreens.driverData.vehicle.registrationNumberPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={registrationNumber}
          onChangeText={onSetRegistrationNumber}
          editable={!loading}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{t('authScreens.driverData.vehicle.registrationExpiryLabel')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('authScreens.driverData.vehicle.registrationExpiryPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={registrationExpiry}
          onChangeText={(text) => onSetRegistrationExpiry(formatDate(text, registrationExpiry))}
          editable={!loading}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{t('authScreens.driverData.vehicle.insuranceNumberLabel')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('authScreens.driverData.vehicle.insuranceNumberPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={insuranceNumber}
          onChangeText={onSetInsuranceNumber}
          editable={!loading}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{t('authScreens.driverData.vehicle.insuranceCompanyLabel')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('authScreens.driverData.vehicle.insuranceCompanyPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={insuranceCompany}
          onChangeText={onSetInsuranceCompany}
          editable={!loading}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{t('authScreens.driverData.vehicle.insuranceExpiryLabel')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('authScreens.driverData.vehicle.insuranceExpiryPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={insuranceExpiry}
          onChangeText={(text) => onSetInsuranceExpiry(formatDate(text, insuranceExpiry))}
          editable={!loading}
        />
      </View>

      {/* Info */}
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          {t('authScreens.driverData.vehicle.info')}
        </Text>
      </View>

      <View style={styles.photoSection}>
        <Text style={styles.sectionTitle}>{t('authScreens.driverData.photos.sectionTitle')}</Text>

        <DriverDataPhotoField
          title={t('authScreens.driverData.photos.insuranceTitle')}
          photoUri={insurancePhoto}
          loading={loading}
          onTakePhoto={onTakeInsurancePhoto}
          styles={styles}
          t={t}
        />

        <DriverDataPhotoField
          title={t('authScreens.driverData.photos.registrationFrontTitle')}
          photoUri={registrationPhotoFront}
          loading={loading}
          onTakePhoto={onTakeRegistrationPhotoFront}
          styles={styles}
          t={t}
        />

        <DriverDataPhotoField
          title={t('authScreens.driverData.photos.registrationBackTitle')}
          photoUri={registrationPhotoBack}
          loading={loading}
          onTakePhoto={onTakeRegistrationPhotoBack}
          styles={styles}
          t={t}
        />
      </View>
    </View>
  );
}
