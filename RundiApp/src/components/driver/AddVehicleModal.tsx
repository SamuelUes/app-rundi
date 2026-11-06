import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LoadingIcon } from '../ui/LoadingIcon';
import { DatePickerField } from '../ui/DatePickerField';
import ImagePickerComponent from '../shared/ImagePicker';
import {
  extractFieldsFromDocument,
  isOcrAvailable,
  type DocumentOcrType,
  type ExtractedDocumentFields,
} from '../../services/media/ocr/documentOcrService';
import type { TFunction } from 'i18next';
import type { VehicleFormData } from '../../hooks/driver/DriverProfileScreen/useVehicleForm';

interface AddVehicleModalProps {
  visible: boolean;
  onClose: () => void;
  vehicleFormData: VehicleFormData;
  setVehicleFormData: React.Dispatch<React.SetStateAction<VehicleFormData>>;
  addingVehicle: boolean;
  onSubmit: () => void;
  currentYear: number;
  colors: any;
  styles: any;
  t: TFunction;
}

// Campos con default que cuentan como "vacíos" para el OCR: si el usuario
// no los tocó, el valor inicial no debe bloquear el autollenado.
type OcrFieldMap = Array<
  [
    keyof ExtractedDocumentFields,
    keyof VehicleFormData,
    ((v: string) => string | number | undefined)?,
  ]
>;

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

  const [ocrReading, setOcrReading] = useState(false);
  const [ocrMessage, setOcrMessage] = useState<string | null>(null);
  const [fieldsExpanded, setFieldsExpanded] = useState(false);
  // Campos que el usuario editó a mano: el OCR nunca los pisa (los defaults
  // del form como year/type/fuel_type no cuentan — no fueron elección del
  // usuario). Retomar la foto sí actualiza campos que el propio OCR llenó.
  const manualFieldsRef = useRef<Set<keyof ExtractedDocumentFields>>(new Set());
  const backOcrVersion = useRef(0);
  const pendingOcr = useRef(0);

  /**
   * Corre OCR sobre la foto recién tomada y llena todos los campos que
   * detecte, salvo los que el usuario ya corrigió a mano.
   */
  const runDocumentOcr = async (imageUri: string, docType: DocumentOcrType, backVersion?: number) => {
    if (!isOcrAvailable()) return;
    pendingOcr.current += 1;
    setOcrReading(true);
    setOcrMessage(null);
    try {
      const { fields } = await extractFieldsFromDocument(imageUri, docType);
      if (backVersion !== undefined && backVersion === backOcrVersion.current) {
        const detectedYear = Number(fields.year);
        setVehicleFormData((prev) => ({
          ...prev,
          registration_ocr_year: Number.isInteger(detectedYear) && detectedYear >= 1900 && detectedYear <= 2100
            ? detectedYear : null,
        }));
      }
      const applied: string[] = [];
      const patch: Partial<VehicleFormData> = {};
      const map: OcrFieldMap =
        docType === 'registration'
          ? [
              ['plate', 'plate'],
              ['brand', 'brand'],
              ['model', 'model'],
              ['year', 'year', (v) => parseInt(v, 10) || undefined],
              ['color', 'color'],
              ['type', 'type'],
              ['passengers', 'passengers'],
              ['vin', 'vin'],
              ['motor', 'motor'],
              ['chasis', 'chasis'],
              ['registrationNumber', 'registration_number'],
              ['emissionDate', 'emission_date'],
              ['registrationExpiry', 'registration_expiry'],
            ]
          : [
              ['insuranceNumber', 'insurance_number'],
              ['insuranceCompany', 'insurance_company'],
              ['insuranceExpiry', 'insurance_expiry'],
              // La póliza repite datos del vehículo: sirven de respaldo si
              // la circulación no los llenó.
              ['plate', 'plate'],
              ['brand', 'brand'],
              ['type', 'type'],
              ['vin', 'vin'],
              ['motor', 'motor'],
              ['chasis', 'chasis'],
            ];

      const manual = manualFieldsRef.current;
      for (const [ocrKey, formKey, transform] of map) {
        const detected = fields[ocrKey];
        if (!detected || manual.has(ocrKey)) continue;
        const value = transform ? transform(detected) : detected;
        if (value === undefined) continue;
        (patch as Record<string, unknown>)[formKey] = value;
        applied.push(t(`authScreens.driverData.ocr.fields.${ocrKey}`));
      }

      if (applied.length > 0) {
        setVehicleFormData((prev) => ({ ...prev, ...patch }));
      }

      setOcrMessage(
        applied.length > 0
          ? t('authScreens.driverData.ocr.detected', { fields: applied.join(', ') })
          : t('authScreens.driverData.ocr.notDetected'),
      );
      if (applied.length === 0) {
        setFieldsExpanded(true);
      }
    } catch (err) {
      console.warn('⚠️ OCR de documento falló:', err);
      setOcrMessage(t('authScreens.driverData.ocr.notDetected'));
      setFieldsExpanded(true);
    } finally {
      pendingOcr.current -= 1;
      setOcrReading(pendingOcr.current > 0);
    }
  };

  /** Edición manual: marca el campo como escrito por el usuario para que
   * retomar la foto no sobreescriba la corrección. */
  const updateField = <K extends keyof VehicleFormData>(
    key: K,
    value: VehicleFormData[K],
    ocrKey?: keyof ExtractedDocumentFields,
  ) => {
    if (ocrKey) manualFieldsRef.current.add(ocrKey);
    setVehicleFormData((prev) => ({ ...prev, [key]: value }));
  };

  const updateText = (key: keyof VehicleFormData, ocrKey?: keyof ExtractedDocumentFields) => {
    return (text: string) => updateField(key, text as VehicleFormData[typeof key], ocrKey);
  };

  const onDocPhoto = (
    formKey: 'registration_photo_front' | 'registration_photo_back' | 'insurance_photo' | 'vehicle_photo',
    docType?: DocumentOcrType,
  ) => {
    return (uri: string) => {
      const backVersion = formKey === 'registration_photo_back' ? ++backOcrVersion.current : undefined;
      setVehicleFormData((prev) => ({
        ...prev, [formKey]: uri,
        ...(backVersion !== undefined ? { registration_ocr_year: null } : {}),
      }));
      if (docType) void runDocumentOcr(uri, docType, backVersion);
    };
  };

  // Al abrir el modal con formulario fresco se reinicia el tracking OCR;
  // si el usuario cierra a medio llenado y reabre, se conserva.
  useEffect(() => {
    if (!visible) return;
    const isFresh =
      !vehicleFormData.plate &&
      !vehicleFormData.brand &&
      !vehicleFormData.registration_photo_front;
    if (isFresh) {
      manualFieldsRef.current.clear();
      setOcrMessage(null);
      setFieldsExpanded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

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
            {/* Fotos primero: el OCR intenta llenar los campos */}
            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>
                {`📸 ${t('driver.profile.modal.labels.scanDocs')}`}
              </Text>

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

              <ImagePickerComponent
                compact
                label={t('driver.profile.modal.labels.registrationFront')}
                imageUri={vehicleFormData.registration_photo_front}
                onImageSelected={onDocPhoto('registration_photo_front', 'registration')}
                loading={addingVehicle}
              />

              <ImagePickerComponent
                compact
                label={t('driver.profile.modal.labels.registrationBack')}
                imageUri={vehicleFormData.registration_photo_back}
                onImageSelected={onDocPhoto('registration_photo_back', 'registration')}
                loading={addingVehicle}
              />

              <ImagePickerComponent
                compact
                label={t('driver.profile.modal.labels.insurancePhoto')}
                imageUri={vehicleFormData.insurance_photo}
                onImageSelected={onDocPhoto('insurance_photo', 'insurance')}
                loading={addingVehicle}
              />

              <ImagePickerComponent
                compact
                label={t('driver.profile.modal.labels.vehiclePhoto')}
                imageUri={vehicleFormData.vehicle_photo}
                onImageSelected={onDocPhoto('vehicle_photo')}
                loading={addingVehicle}
              />
            </View>

            {/* Campos: colapsados; se expanden para verificar o llenar a mano */}
            <TouchableOpacity
              style={styles.expandFieldsRow}
              onPress={() => setFieldsExpanded((v) => !v)}
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
                <View style={styles.formSection}>
                  <Text style={styles.formSectionTitle}>{t('driver.profile.modal.labels.basicInfo')}</Text>

                  <Text style={styles.formLabel}>{t('driver.profile.modal.labels.plate')}</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder={t('driver.profile.modal.placeholders.plate')}
                    value={vehicleFormData.plate}
                    onChangeText={updateText('plate', 'plate')}
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={styles.formLabel}>{t('driver.profile.modal.labels.brand')}</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder={t('driver.profile.modal.placeholders.brand')}
                    value={vehicleFormData.brand}
                    onChangeText={updateText('brand', 'brand')}
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={styles.formLabel}>{t('driver.profile.modal.labels.model')}</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder={t('driver.profile.modal.placeholders.model')}
                    value={vehicleFormData.model}
                    onChangeText={updateText('model', 'model')}
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={styles.formLabel}>{t('driver.profile.modal.labels.year')}</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder={t('driver.profile.modal.placeholders.year', { year: currentYear })}
                    value={vehicleFormData.year.toString()}
                    onChangeText={(text) =>
                      updateField('year', parseInt(text, 10) || currentYear, 'year')
                    }
                    keyboardType="numeric"
                    placeholderTextColor={colors.textSecondary}
                  />
                  <Text style={{ color: colors.textSecondary, marginTop: 6 }}>
                    {t('authScreens.driverData.ocr.yearWarning')}
                  </Text>

                  <Text style={styles.formLabel}>{t('driver.profile.modal.labels.color')}</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder={t('driver.profile.modal.placeholders.color')}
                    value={vehicleFormData.color}
                    onChangeText={updateText('color', 'color')}
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={styles.formLabel}>{t('driver.profile.modal.labels.type')}</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder={t('driver.profile.modal.placeholders.type')}
                    value={vehicleFormData.type}
                    onChangeText={updateText('type', 'type')}
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
                    onChangeText={updateText('motor', 'motor')}
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={styles.formLabel}>{t('driver.profile.modal.labels.chassis')}</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder={t('driver.profile.modal.placeholders.chassis')}
                    value={vehicleFormData.chasis}
                    onChangeText={updateText('chasis', 'chasis')}
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={styles.formLabel}>{t('driver.profile.modal.labels.vin')}</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder={t('driver.profile.modal.placeholders.vin')}
                    value={vehicleFormData.vin}
                    onChangeText={updateText('vin', 'vin')}
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={styles.formLabel}>{t('driver.profile.modal.labels.cylinders')}</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder={t('driver.profile.modal.placeholders.cylinders')}
                    value={vehicleFormData.cylinders}
                    onChangeText={updateText('cylinders')}
                    keyboardType="numeric"
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={styles.formLabel}>{t('driver.profile.modal.labels.passengers')}</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder={t('driver.profile.modal.placeholders.passengers')}
                    value={vehicleFormData.passengers}
                    onChangeText={updateText('passengers', 'passengers')}
                    keyboardType="numeric"
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={styles.formLabel}>{t('driver.profile.modal.labels.fuelType')}</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder={t('driver.profile.modal.placeholders.fuelType')}
                    value={vehicleFormData.fuel_type}
                    onChangeText={updateText('fuel_type')}
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={styles.formLabel}>{t('driver.profile.modal.labels.tonnage')}</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder={t('driver.profile.modal.placeholders.tonnage')}
                    value={vehicleFormData.tonnage}
                    onChangeText={updateText('tonnage')}
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
                    onChangeText={updateText('vehicle_class')}
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={styles.formLabel}>{t('driver.profile.modal.labels.serviceType')}</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder={t('driver.profile.modal.placeholders.serviceType')}
                    value={vehicleFormData.service_type}
                    onChangeText={updateText('service_type')}
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={styles.formLabel}>{t('driver.profile.modal.labels.lien')}</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder={t('driver.profile.modal.placeholders.lien')}
                    value={vehicleFormData.lien}
                    onChangeText={updateText('lien')}
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
                    onChangeText={updateText('emission_date', 'emissionDate')}
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={styles.formLabel}>{t('driver.profile.modal.labels.registrationNumber')}</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder={t('driver.profile.modal.placeholders.registrationNumber')}
                    value={vehicleFormData.registration_number}
                    onChangeText={updateText('registration_number', 'registrationNumber')}
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={styles.formLabel}>{t('driver.profile.modal.labels.registrationExpiry')}</Text>
                  <DatePickerField
                    style={styles.formInput}
                    placeholder={t('driver.profile.modal.placeholders.registrationExpiry')}
                    value={vehicleFormData.registration_expiry}
                    onChangeText={updateText('registration_expiry', 'registrationExpiry')}
                    placeholderTextColor={colors.textSecondary}
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
                    onChangeText={updateText('insurance_number', 'insuranceNumber')}
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={styles.formLabel}>{t('driver.profile.modal.labels.insuranceCompany')}</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder={t('driver.profile.modal.placeholders.insuranceCompany')}
                    value={vehicleFormData.insurance_company}
                    onChangeText={updateText('insurance_company', 'insuranceCompany')}
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={styles.formLabel}>{t('driver.profile.modal.labels.insuranceStart')}</Text>
                  <DatePickerField
                    style={styles.formInput}
                    placeholder={t('driver.profile.modal.placeholders.insuranceStart')}
                    value={vehicleFormData.insurance_start_date}
                    onChangeText={updateText('insurance_start_date')}
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={styles.formLabel}>{t('driver.profile.modal.labels.insuranceExpiry')}</Text>
                  <DatePickerField
                    style={styles.formInput}
                    placeholder={t('driver.profile.modal.placeholders.insuranceExpiry')}
                    value={vehicleFormData.insurance_expiry}
                    onChangeText={updateText('insurance_expiry', 'insuranceExpiry')}
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </View>
            ) : null}

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
              disabled={addingVehicle || ocrReading}
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
