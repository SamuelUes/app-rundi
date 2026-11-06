import React from 'react';
import { ActivityIndicator, View, Text, TextInput, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Picker } from '@react-native-picker/picker';
import { DatePickerField } from '../../ui/DatePickerField';
import { InsuranceCompanySelectField } from '../../shared/InsuranceCompanySelectField';
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
  vin: string;
  motor: string;
  chasis: string;
  registrationNumber: string;
  emissionDate: string;
  insuranceNumber: string;
  insuranceCompany: string;
  insuranceExpiry: string;
  insurancePhoto: string | null;
  registrationPhotoFront: string | null;
  registrationPhotoBack: string | null;
  vehiclePhoto: string | null;
  inspectionDate: string;
  inspectionValidUntil: string;
  emissionsTestedAt: string;
  emissionsValidUntil: string;
  roadTaxPaidAt: string;
  revisadoValidUntil: string;
  loading: boolean;
  colors: any;
  onSetPlate: (v: string) => void;
  onSetBrand: (v: string) => void;
  onSetModel: (v: string) => void;
  onSetYear: (v: string) => void;
  onSetColor: (v: string) => void;
  onSetType: (v: string) => void;
  onSetPassengers: (v: string) => void;
  onSetVin: (v: string) => void;
  onSetMotor: (v: string) => void;
  onSetChasis: (v: string) => void;
  onSetRegistrationNumber: (v: string) => void;
  onSetEmissionDate: (v: string) => void;
  onSetInsuranceNumber: (v: string) => void;
  onSetInsuranceCompany: (v: string) => void;
  onSetInsuranceExpiry: (v: string) => void;
  onSetInspectionDate: (v: string) => void;
  onSetInspectionValidUntil: (v: string) => void;
  onSetEmissionsTestedAt: (v: string) => void;
  onSetEmissionsValidUntil: (v: string) => void;
  onSetRoadTaxPaidAt: (v: string) => void;
  onSetRevisadoValidUntil: (v: string) => void;
  onTakeInsurancePhoto: () => void;
  onTakeRegistrationPhotoFront: () => void;
  onTakeRegistrationPhotoBack: () => void;
  onTakeVehiclePhoto: () => void;
  ocrReading?: boolean;
  ocrMessage?: string | null;
  fieldsExpanded?: boolean;
  onToggleFieldsExpanded?: () => void;
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
  vin,
  motor,
  chasis,
  registrationNumber,
  emissionDate,
  insuranceNumber,
  insuranceCompany,
  insuranceExpiry,
  insurancePhoto,
  registrationPhotoFront,
  registrationPhotoBack,
  vehiclePhoto,
  inspectionDate,
  inspectionValidUntil,
  emissionsTestedAt,
  emissionsValidUntil,
  roadTaxPaidAt,
  revisadoValidUntil,
  loading,
  colors,
  onSetPlate,
  onSetBrand,
  onSetModel,
  onSetYear,
  onSetColor,
  onSetType,
  onSetPassengers,
  onSetVin,
  onSetMotor,
  onSetChasis,
  onSetRegistrationNumber,
  onSetEmissionDate,
  onSetInsuranceNumber,
  onSetInsuranceCompany,
  onSetInsuranceExpiry,
  onSetInspectionDate,
  onSetInspectionValidUntil,
  onSetEmissionsTestedAt,
  onSetEmissionsValidUntil,
  onSetRoadTaxPaidAt,
  onSetRevisadoValidUntil,
  onTakeInsurancePhoto,
  onTakeRegistrationPhotoFront,
  onTakeRegistrationPhotoBack,
  onTakeVehiclePhoto,
  ocrReading = false,
  ocrMessage = null,
  fieldsExpanded = false,
  onToggleFieldsExpanded,
  styles,
  t,
}: DriverDataVehicleTabProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {t('authScreens.driverData.vehicle.sectionTitle')}
      </Text>

      {/* Primera opción: la foto. El OCR intenta llenar los campos. */}
      <View style={styles.photoSection}>
        <Text style={styles.sectionTitle}>{t('authScreens.driverData.photos.sectionTitle')}</Text>

        <View style={styles.ocrStatusRow}>
          {ocrReading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons
              name={ocrMessage ? 'sparkles-outline' : 'scan-outline'}
              size={15}
              color={colors.primary}
            />
          )}
          <Text style={styles.infoText}>
            {ocrReading
              ? t('authScreens.driverData.ocr.reading')
              : (ocrMessage ?? t('authScreens.driverData.ocr.hint'))}
          </Text>
        </View>

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

        {/* Foto del vehículo: no es documento, no corre OCR */}
        <DriverDataPhotoField
          title={t('authScreens.driverData.photos.vehicleTitle')}
          photoUri={vehiclePhoto}
          loading={loading}
          onTakePhoto={onTakeVehiclePhoto}
          styles={styles}
          t={t}
        />
      </View>

      {/* Campos: colapsados por defecto; se expanden para verificar o llenar */}
      <TouchableOpacity
        style={styles.expandFieldsRow}
        onPress={onToggleFieldsExpanded}
        accessibilityRole="button"
        accessibilityState={{ expanded: fieldsExpanded }}
        activeOpacity={0.7}
      >
        <View style={styles.expandFieldsLeft}>
          <Ionicons name="create-outline" size={16} color={colors.primary} />
          <Text style={styles.expandFieldsText}>
            {fieldsExpanded
              ? t('authScreens.driverData.ocr.collapseFields')
              : t('authScreens.driverData.ocr.expandFields')}
          </Text>
        </View>
        <Ionicons
          name={fieldsExpanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.primary}
        />
      </TouchableOpacity>

      {fieldsExpanded ? (
        <View>
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
            <Text style={{ color: colors.textSecondary, marginTop: 6 }}>
              {t('authScreens.driverData.ocr.yearWarning')}
            </Text>
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

          {/* VIN */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t('authScreens.driverData.vehicle.vinLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('authScreens.driverData.vehicle.vinPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={vin}
              onChangeText={onSetVin}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          {/* Motor */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t('authScreens.driverData.vehicle.motorLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('authScreens.driverData.vehicle.motorPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={motor}
              onChangeText={onSetMotor}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          {/* Chasis */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t('authScreens.driverData.vehicle.chasisLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('authScreens.driverData.vehicle.chasisPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={chasis}
              onChangeText={onSetChasis}
              autoCapitalize="characters"
              autoCorrect={false}
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
            <Text style={styles.label}>{t('authScreens.driverData.vehicle.emissionDateLabel')}</Text>
            <DatePickerField
              style={styles.input}
              placeholder={t('authScreens.driverData.vehicle.emissionDatePlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={emissionDate}
              onChangeText={onSetEmissionDate}
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
            <InsuranceCompanySelectField
              style={styles.input}
              placeholder={t('authScreens.driverData.vehicle.insuranceCompanyPlaceholder')}
              value={insuranceCompany}
              onChange={onSetInsuranceCompany}
              disabled={loading}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t('authScreens.driverData.vehicle.insuranceExpiryLabel')}</Text>
            <DatePickerField
              style={styles.input}
              placeholder={t('authScreens.driverData.vehicle.insuranceExpiryPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={insuranceExpiry}
              onChangeText={onSetInsuranceExpiry}
              editable={!loading}
            />
          </View>

          {/* Documentos periódicos (opcional; requeridos para operar) */}
          <Text style={[styles.sectionTitle, { marginTop: 10 }]}>
            {t('authScreens.driverData.vehicle.periodicSectionTitle')}
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t('authScreens.driverData.vehicle.inspectionDateLabel')}</Text>
            <DatePickerField
              style={styles.input}
              placeholder={t('authScreens.driverData.vehicle.inspectionDatePlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={inspectionDate}
              onChangeText={onSetInspectionDate}
              editable={!loading}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t('authScreens.driverData.vehicle.inspectionValidUntilLabel')}</Text>
            <DatePickerField
              style={styles.input}
              placeholder={t('authScreens.driverData.vehicle.inspectionValidUntilPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={inspectionValidUntil}
              onChangeText={onSetInspectionValidUntil}
              editable={!loading}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t('authScreens.driverData.vehicle.emissionsTestedAtLabel')}</Text>
            <DatePickerField
              style={styles.input}
              placeholder={t('authScreens.driverData.vehicle.emissionsTestedAtPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={emissionsTestedAt}
              onChangeText={onSetEmissionsTestedAt}
              editable={!loading}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t('authScreens.driverData.vehicle.emissionsValidUntilLabel')}</Text>
            <DatePickerField
              style={styles.input}
              placeholder={t('authScreens.driverData.vehicle.emissionsValidUntilPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={emissionsValidUntil}
              onChangeText={onSetEmissionsValidUntil}
              editable={!loading}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t('authScreens.driverData.vehicle.roadTaxPaidAtLabel')}</Text>
            <DatePickerField
              style={styles.input}
              placeholder={t('authScreens.driverData.vehicle.roadTaxPaidAtPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={roadTaxPaidAt}
              onChangeText={onSetRoadTaxPaidAt}
              editable={!loading}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t('authScreens.driverData.vehicle.revisadoValidUntilLabel')}</Text>
            <DatePickerField
              style={styles.input}
              placeholder={t('authScreens.driverData.vehicle.revisadoValidUntilPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={revisadoValidUntil}
              onChangeText={onSetRevisadoValidUntil}
              editable={!loading}
            />
          </View>
        </View>
      ) : null}

      {/* Info */}
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          {t('authScreens.driverData.vehicle.info')}
        </Text>
      </View>
    </View>
  );
}
