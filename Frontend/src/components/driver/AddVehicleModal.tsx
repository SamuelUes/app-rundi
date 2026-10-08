import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoadingIcon } from '../ui/LoadingIcon';
import { DatePickerField } from '../ui/DatePickerField';
import ImagePickerComponent from '../shared/ImagePicker';
import type { TFunction } from 'i18next';
import type { VehicleFormData } from '../../hooks/driver/DriverProfileScreen/useVehicleForm';

interface AddVehicleModalProps {
  visible: boolean;
  onClose: () => void;
  vehicleFormData: VehicleFormData;
  setVehicleFormData: (data: VehicleFormData) => void;
  addingVehicle: boolean;
  onSubmit: () => void;
  currentYear: number;
  colors: any;
  styles: any;
  t: TFunction;
}

export function AddVehicleModal({
  visible,
  onClose,
  vehicleFormData,
  setVehicleFormData,
  addingVehicle,
  onSubmit,
  currentYear,
  colors,
  styles,
  t,
}: AddVehicleModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={1}>{t('driver.profile.modal.title')}</Text>
            <TouchableOpacity style={styles.modalCloseTouch} onPress={onClose} hitSlop={4}>
              <Text style={styles.modalCloseButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalForm}
            contentContainerStyle={styles.modalFormContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>{t('driver.profile.modal.labels.basicInfo')}</Text>

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.plate')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.plate')}
                value={vehicleFormData.plate}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, plate: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.brand')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.brand')}
                value={vehicleFormData.brand}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, brand: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.model')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.model')}
                value={vehicleFormData.model}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, model: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.year')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.year', { year: currentYear })}
                value={vehicleFormData.year.toString()}
                onChangeText={(text) =>
                  setVehicleFormData({
                    ...vehicleFormData,
                    year: parseInt(text, 10) || currentYear,
                  })
                }
                keyboardType="numeric"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.color')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.color')}
                value={vehicleFormData.color}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, color: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.type')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.type')}
                value={vehicleFormData.type}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, type: text })}
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>
                {`⚙️ ${t('driver.profile.modal.labels.specs')}`}
              </Text>

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.engine')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.engine')}
                value={vehicleFormData.motor}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, motor: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.chassis')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.chassis')}
                value={vehicleFormData.chasis}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, chasis: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.vin')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.vin')}
                value={vehicleFormData.vin}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, vin: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.cylinders')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.cylinders')}
                value={vehicleFormData.cylinders}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, cylinders: text })}
                keyboardType="numeric"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.passengers')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.passengers')}
                value={vehicleFormData.passengers}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, passengers: text })}
                keyboardType="numeric"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.fuelType')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.fuelType')}
                value={vehicleFormData.fuel_type}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, fuel_type: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.tonnage')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.tonnage')}
                value={vehicleFormData.tonnage}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, tonnage: text })}
                keyboardType="decimal-pad"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>
                {`🏷️ ${t('driver.profile.modal.labels.classification')}`}
              </Text>

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.vehicleClass')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.vehicleClass')}
                value={vehicleFormData.vehicle_class}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, vehicle_class: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.serviceType')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.serviceType')}
                value={vehicleFormData.service_type}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, service_type: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.lien')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.lien')}
                value={vehicleFormData.lien}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, lien: text })}
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>
                {`📄 ${t('driver.profile.modal.labels.documents')}`}
              </Text>

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.emissionDate')}</Text>
              <DatePickerField
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.emissionDate')}
                value={vehicleFormData.emission_date}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, emission_date: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.registrationNumber')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.registrationNumber')}
                value={vehicleFormData.registration_number}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, registration_number: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.registrationExpiry')}</Text>
              <DatePickerField
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.registrationExpiry')}
                value={vehicleFormData.registration_expiry}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, registration_expiry: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <ImagePickerComponent
                compact
                label={t('driver.profile.modal.labels.registrationFront')}
                imageUri={vehicleFormData.registration_photo_front}
                onImageSelected={(uri: string) => setVehicleFormData({ ...vehicleFormData, registration_photo_front: uri })}
              />

              <ImagePickerComponent
                compact
                label={t('driver.profile.modal.labels.registrationBack')}
                imageUri={vehicleFormData.registration_photo_back}
                onImageSelected={(uri: string) => setVehicleFormData({ ...vehicleFormData, registration_photo_back: uri })}
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>
                {`🛡️ ${t('driver.profile.modal.labels.insurance')}`}
              </Text>

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.insuranceNumber')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.insuranceNumber')}
                value={vehicleFormData.insurance_number}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, insurance_number: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.insuranceCompany')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.insuranceCompany')}
                value={vehicleFormData.insurance_company}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, insurance_company: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.insuranceStart')}</Text>
              <DatePickerField
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.insuranceStart')}
                value={vehicleFormData.insurance_start_date}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, insurance_start_date: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.insuranceExpiry')}</Text>
              <DatePickerField
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.insuranceExpiry')}
                value={vehicleFormData.insurance_expiry}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, insurance_expiry: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <ImagePickerComponent
                compact
                label={t('driver.profile.modal.labels.insurancePhoto')}
                imageUri={vehicleFormData.insurance_photo}
                onImageSelected={(uri: string) => setVehicleFormData({ ...vehicleFormData, insurance_photo: uri })}
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>
                {`📸 ${t('driver.profile.modal.labels.photos')}`}
              </Text>

              <ImagePickerComponent
                compact
                label={t('driver.profile.modal.labels.vehiclePhoto')}
                imageUri={vehicleFormData.vehicle_photo}
                onImageSelected={(uri: string) => setVehicleFormData({ ...vehicleFormData, vehicle_photo: uri })}
              />
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>

          <View style={[styles.modalButtons, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={onClose}
            >
              <Text style={styles.modalCancelButtonText}>{t('driver.profile.modal.buttons.cancel')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalSubmitButton, addingVehicle && styles.modalSubmitButtonDisabled]}
              onPress={onSubmit}
              disabled={addingVehicle}
            >
              {addingVehicle ? (
                <LoadingIcon size={20} color="#fff" />
              ) : (
                <Text style={styles.modalSubmitButtonText}>{t('driver.profile.modal.buttons.submit')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
