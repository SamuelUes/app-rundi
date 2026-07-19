import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Switch,
} from 'react-native';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import Button from '../../components/ui/Button';
import ImagePicker from '../../components/shared/ImagePicker';
import { useTranslation } from 'react-i18next';
import SupportChatShortcut from '../../components/shared/SupportChatShortcut';
import { useVehicleInfo } from '../../hooks/shared/vehicle/useVehicleInfo';

export default function CompleteVehicleInfoScreen({ navigation }: any) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { t } = useTranslation();

  const getFieldMeta = (key: string) =>
    t(`shared.completeVehicleInfo.fields.${key}`, {
      returnObjects: true,
    }) as { label: string; placeholder: string };
  const fieldLabel = (key: string) => getFieldMeta(key)?.label ?? '';
  const fieldPlaceholder = (key: string) => getFieldMeta(key)?.placeholder ?? '';
  const sections = (t('shared.completeVehicleInfo.sections', {
    returnObjects: true,
  }) ?? {}) as Record<string, string>;
  const completionText = (t('shared.completeVehicleInfo.completion', {
    returnObjects: true,
  }) ?? {}) as Record<string, string>;
  const photosText = (t('shared.completeVehicleInfo.photos', {
    returnObjects: true,
  }) ?? {}) as {
    frontLabel?: string;
    backLabel?: string;
    uploadFront?: string;
    uploadBack?: string;
    uploadPolicy?: string;
    uploadVehicle?: string;
  };
  const buttons = (t('shared.completeVehicleInfo.buttons', {
    returnObjects: true,
  }) ?? {}) as Record<string, string>;
  const messages = (t('shared.completeVehicleInfo.messages', {
    returnObjects: true,
  }) ?? {}) as Record<string, string>;
  const alertsText = (t('shared.completeVehicleInfo.alerts', {
    returnObjects: true,
  }) ?? {}) as Record<string, string>;
  const defaultLienValue = t('shared.completeVehicleInfo.defaults.noLien');
  const headerText = (t('shared.completeVehicleInfo.header', {
    returnObjects: true,
  }) ?? { title: '', subtitle: '' }) as { title?: string; subtitle?: string };
  const loadingText = t('shared.completeVehicleInfo.loading');

  const {
    loading,
    saving,
    vehicleData,
    driverData,
    formState,
    setFormState,
    photos,
    setPhoto,
    handleSave: saveVehicleInfo,
  } = useVehicleInfo(user?.id, defaultLienValue);

  const updateField = (field: keyof typeof formState, value: string | boolean) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const isComplete = useMemo(() => {
    const licensePhotosComplete = !!(photos.licenseFront.tempUri || photos.licenseFront.url);
    const registrationPhotosComplete = !!(photos.registrationFront.tempUri || photos.registrationFront.url) &&
                                       !!(photos.registrationBack.tempUri || photos.registrationBack.url);
    const insurancePhotosComplete = !!(photos.insurance.tempUri || photos.insurance.url);
    const vehiclePhotosComplete = !!(photos.vehicle.tempUri || photos.vehicle.url);

    return {
      personalInfo: !!formState.licenseNumber,
      vehicleInfo: !!formState.plate && !!formState.brand && !!formState.model &&
                   !!formState.year && !!formState.color && !!formState.vehicleType,
      documentsInfo: !!formState.registrationNumber && !!formState.insuranceNumber &&
                     !!formState.insuranceCompany && !!formState.registrationExpiry &&
                     !!formState.insuranceExpiry,
      licensePhotos: licensePhotosComplete,
      registrationPhotos: registrationPhotosComplete,
      insurancePhotos: insurancePhotosComplete,
      vehiclePhotos: vehiclePhotosComplete,
    };
  }, [formState, photos]);

  const completedSectionsCount = Object.values(isComplete).filter(Boolean).length;
  const totalSections = Object.values(isComplete).length;
  const allSectionsComplete = totalSections > 0 && completedSectionsCount === totalSections;
  const completionSummary =
    completedSectionsCount > 0
      ? t('shared.completeVehicleInfo.completion.summary', {
          completed: completedSectionsCount,
          total: totalSections,
        })
      : null;

  const handleSave = async () => {
    try {
      await saveVehicleInfo();
      Alert.alert(
        alertsText.saveSuccessTitle,
        alertsText.saveSuccessMessage,
        [{ text: alertsText.confirmButton, onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error('❌ Error en el proceso completo:', error);
      Alert.alert(alertsText.saveErrorTitle, alertsText.saveErrorMessage);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingIcon size={32} color={colors.primary} />
        <Text style={styles.loadingText}>{loadingText}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{headerText.title}</Text>
        <Text style={styles.subtitle}>{headerText.subtitle}</Text>
        
        {/* Resumen de completitud */}
        <View style={styles.completionSummary}>
          {completionSummary && (
            <Text style={styles.completionSummaryText}>{completionSummary}</Text>
          )}
        </View>
      </View>

      {/* Información Personal */}
      <View style={[styles.section, isComplete.personalInfo && styles.completedSection]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{sections.personal}</Text>
          {isComplete.personalInfo && (
            <View style={styles.completionBadge}>
              <View style={[styles.completionIcon, styles.iconComplete]} />
              <Text style={styles.completedText}>{completionText.badge}</Text>
            </View>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('licenseNumber')}</Text>
          <TextInput
            style={[styles.input, formState.licenseNumber ? styles.inputFilled : styles.inputRequired]}
            value={formState.licenseNumber}
            onChangeText={(text) => updateField('licenseNumber', text)}
            placeholder={fieldPlaceholder('licenseNumber')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('licenseExpiry')}</Text>
          <TextInput
            style={styles.input}
            value={formState.licenseExpiry}
            onChangeText={(text) => updateField('licenseExpiry', text)}
            placeholder={fieldPlaceholder('licenseExpiry')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('department')}</Text>
          <TextInput
            style={styles.input}
            value={formState.department}
            onChangeText={(text) => updateField('department', text)}
            placeholder={fieldPlaceholder('department')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('municipality')}</Text>
          <TextInput
            style={styles.input}
            value={formState.municipality}
            onChangeText={(text) => updateField('municipality', text)}
            placeholder={fieldPlaceholder('municipality')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>
      </View>

      {/* Vehicle Information */}
      <View style={[styles.section, isComplete.vehicleInfo && styles.completedSection]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{sections.vehicle}</Text>
          {isComplete.vehicleInfo && (
            <View style={styles.completionBadge}>
              <View style={[styles.completionIcon, styles.iconComplete]} />
              <Text style={styles.completedText}>{completionText.badge}</Text>
            </View>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('plate')}</Text>
          <TextInput
            style={[styles.input, formState.plate ? styles.inputFilled : styles.inputRequired]}
            value={formState.plate}
            onChangeText={(text) => updateField('plate', text)}
            placeholder={fieldPlaceholder('plate')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('brand')}</Text>
          <TextInput
            style={[styles.input, formState.brand ? styles.inputFilled : styles.inputRequired]}
            value={formState.brand}
            onChangeText={(text) => updateField('brand', text)}
            placeholder={fieldPlaceholder('brand')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('model')}</Text>
          <TextInput
            style={styles.input}
            value={formState.model}
            onChangeText={(text) => updateField('model', text)}
            placeholder={fieldPlaceholder('model')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('year')}</Text>
          <TextInput
            style={styles.input}
            value={formState.year}
            onChangeText={(text) => updateField('year', text)}
            placeholder={fieldPlaceholder('year')}
            keyboardType="numeric"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('color')}</Text>
          <TextInput
            style={styles.input}
            value={formState.color}
            onChangeText={(text) => updateField('color', text)}
            placeholder={fieldPlaceholder('color')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('vehicleType')}</Text>
          <TextInput
            style={styles.input}
            value={formState.vehicleType}
            onChangeText={(text) => updateField('vehicleType', text)}
            placeholder={fieldPlaceholder('vehicleType')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('fourByFour')}</Text>
          <View style={styles.switchContainer}>
            <Text style={styles.switchLabel}>{messages.switchNo}</Text>
            <Switch
              value={formState.is4x4}
              onValueChange={(val) => updateField('is4x4', val)}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={formState.is4x4 ? colors.primary : colors.textSecondary}
            />
            <Text style={styles.switchLabel}>{messages.switchYes}</Text>
          </View>
        </View>
      </View>

      {/* Technical Info */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{sections.technical}</Text>
          <View style={styles.completionBadge}>
            <View style={[styles.completionIcon, styles.iconNotRequired]} />
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{completionText.optional}</Text>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('motor')}</Text>
          <TextInput
            style={styles.input}
            value={formState.motor}
            onChangeText={(text) => updateField('motor', text)}
            placeholder={fieldPlaceholder('motor')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('chasis')}</Text>
          <TextInput
            style={styles.input}
            value={formState.chasis}
            onChangeText={(text) => updateField('chasis', text)}
            placeholder={fieldPlaceholder('chasis')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('vin')}</Text>
          <TextInput
            style={styles.input}
            value={formState.vin}
            onChangeText={(text) => updateField('vin', text)}
            placeholder={fieldPlaceholder('vin')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('cylinders')}</Text>
          <TextInput
            style={styles.input}
            value={formState.cylinders}
            onChangeText={(text) => updateField('cylinders', text)}
            placeholder={fieldPlaceholder('cylinders')}
            keyboardType="numeric"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('passengers')}</Text>
          <TextInput
            style={styles.input}
            value={formState.passengers}
            onChangeText={(text) => updateField('passengers', text)}
            placeholder={fieldPlaceholder('passengers')}
            keyboardType="numeric"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('fuelType')}</Text>
          <TextInput
            style={styles.input}
            value={formState.fuelType}
            onChangeText={(text) => updateField('fuelType', text)}
            placeholder={fieldPlaceholder('fuelType')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('tonnage')}</Text>
          <TextInput
            style={styles.input}
            value={formState.tonnage}
            onChangeText={(text) => updateField('tonnage', text)}
            placeholder={fieldPlaceholder('tonnage')}
            keyboardType="decimal-pad"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('vehicleClass')}</Text>
          <TextInput
            style={styles.input}
            value={formState.vehicleClass}
            onChangeText={(text) => updateField('vehicleClass', text)}
            placeholder={fieldPlaceholder('vehicleClass')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('serviceType')}</Text>
          <TextInput
            style={styles.input}
            value={formState.serviceType}
            onChangeText={(text) => updateField('serviceType', text)}
            placeholder={fieldPlaceholder('serviceType')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('lien')}</Text>
          <TextInput
            style={styles.input}
            value={formState.lien}
            onChangeText={(text) => updateField('lien', text)}
            placeholder={fieldPlaceholder('lien')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>
      </View>

      {/* Documents */}
      <View style={[styles.section, isComplete.documentsInfo && styles.completedSection]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{sections.documents}</Text>
          {isComplete.documentsInfo && (
            <View style={styles.completionBadge}>
              <View style={[styles.completionIcon, styles.iconComplete]} />
              <Text style={styles.completedText}>{completionText.badge}</Text>
            </View>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('registrationNumber')}</Text>
          <TextInput
            style={styles.input}
            value={formState.registrationNumber}
            onChangeText={(text) => updateField('registrationNumber', text)}
            placeholder={fieldPlaceholder('registrationNumber')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('registrationExpiry')}</Text>
          <TextInput
            style={styles.input}
            value={formState.registrationExpiry}
            onChangeText={(text) => updateField('registrationExpiry', text)}
            placeholder={fieldPlaceholder('registrationExpiry')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('insuranceNumber')}</Text>
          <TextInput
            style={styles.input}
            value={formState.insuranceNumber}
            onChangeText={(text) => updateField('insuranceNumber', text)}
            placeholder={fieldPlaceholder('insuranceNumber')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('insuranceCompany')}</Text>
          <TextInput
            style={styles.input}
            value={formState.insuranceCompany}
            onChangeText={(text) => updateField('insuranceCompany', text)}
            placeholder={fieldPlaceholder('insuranceCompany')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('insuranceExpiry')}</Text>
          <TextInput
            style={styles.input}
            value={formState.insuranceExpiry}
            onChangeText={(text) => updateField('insuranceExpiry', text)}
            placeholder={fieldPlaceholder('insuranceExpiry')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('insuranceStartDate')}</Text>
          <TextInput
            style={styles.input}
            value={formState.insuranceStartDate}
            onChangeText={(text) => updateField('insuranceStartDate', text)}
            placeholder={fieldPlaceholder('insuranceStartDate')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>
      </View>

      {/* License */}
      <View style={[styles.section, isComplete.licensePhotos && styles.completedSection]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{sections.license}</Text>
          {isComplete.licensePhotos && (
            <View style={styles.completionBadge}>
              <View style={[styles.completionIcon, styles.iconComplete]} />
              <Text style={styles.completedText}>{completionText.badge}</Text>
            </View>
          )}
        </View>

        <View style={styles.photoRow}>
          <View style={styles.photoContainer}>
            <Text style={styles.photoLabel}>{photosText.frontLabel ?? ''}</Text>
            <ImagePicker
              imageUri={photos.licenseFront.tempUri || photos.licenseFront.url || driverData?.license_photo_front || null}
              onImageSelected={(uri: string) => setPhoto('licenseFront', uri)}
              label={photosText.uploadFront ?? ''}
            />
          </View>

          <View style={styles.photoContainer}>
            <Text style={styles.photoLabel}>{photosText.backLabel ?? ''}</Text>
            <ImagePicker
              imageUri={photos.licenseBack.tempUri || photos.licenseBack.url || driverData?.license_photo_back || null}
              onImageSelected={(uri: string) => setPhoto('licenseBack', uri)}
              label={photosText.uploadBack ?? ''}
            />
          </View>
        </View>
      </View>

      {/* Registration */}
      <View style={[styles.section, isComplete.registrationPhotos && styles.completedSection]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{sections.registration}</Text>
          {isComplete.registrationPhotos && (
            <View style={styles.completionBadge}>
              <View style={[styles.completionIcon, styles.iconComplete]} />
              <Text style={styles.completedText}>{completionText.badge}</Text>
            </View>
          )}
        </View>

        <View style={styles.photoRow}>
          <View style={styles.photoContainer}>
            <Text style={styles.photoLabel}>{photosText.frontLabel ?? ''}</Text>
            <ImagePicker
              imageUri={photos.registrationFront.tempUri || photos.registrationFront.url || vehicleData?.registration_photo_front || null}
              onImageSelected={(uri: string) => setPhoto('registrationFront', uri)}
              label={photosText.uploadFront ?? ''}
            />
          </View>

          <View style={styles.photoContainer}>
            <Text style={styles.photoLabel}>{photosText.backLabel ?? ''}</Text>
            <ImagePicker
              imageUri={photos.registrationBack.tempUri || photos.registrationBack.url || vehicleData?.registration_photo_back || null}
              onImageSelected={(uri: string) => setPhoto('registrationBack', uri)}
              label={photosText.uploadBack ?? ''}
            />
          </View>
        </View>
      </View>

      {/* Insurance */}
      <View style={[styles.section, isComplete.insurancePhotos && styles.completedSection]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{sections.insurance}</Text>
          {isComplete.insurancePhotos && (
            <View style={styles.completionBadge}>
              <View style={[styles.completionIcon, styles.iconComplete]} />
              <Text style={styles.completedText}>{completionText.badge}</Text>
            </View>
          )}
        </View>

        <ImagePicker
          imageUri={photos.insurance.tempUri || photos.insurance.url || vehicleData?.insurance_photo || null}
          onImageSelected={(uri: string) => setPhoto('insurance', uri)}
          label={photosText.uploadPolicy ?? ''}
        />
      </View>

      {/* Vehicle Photo */}
      <View style={[styles.section, isComplete.vehiclePhotos && styles.completedSection]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{sections.vehiclePhotos}</Text>
          {isComplete.vehiclePhotos && (
            <View style={styles.completionBadge}>
              <View style={[styles.completionIcon, styles.iconComplete]} />
              <Text style={styles.completedText}>{completionText.badge}</Text>
            </View>
          )}
        </View>

        <ImagePicker
          imageUri={photos.vehicle.tempUri || photos.vehicle.url || vehicleData?.vehicle_photo || null}
          onImageSelected={(uri: string) => setPhoto('vehicle', uri)}
          label={photosText.uploadVehicle ?? ''}
        />
      </View>

      {/* Botón Guardar */}
      <View style={styles.buttonContainer}>
        {allSectionsComplete ? (
          <View style={styles.allCompletedBanner}>
            <Text style={styles.allCompletedText}>{completionText.allDone}</Text>
          </View>
        ) : (
          <Text style={styles.incompleteText}>{buttons.incompleteWarning ?? ''}</Text>
        )}
        <Button
          title={
            allSectionsComplete
              ? buttons.saveAllComplete ?? buttons.save ?? ''
              : buttons.save ?? buttons.saveAllComplete ?? ''
          }
          onPress={handleSave}
          disabled={saving}
          loading={saving}
          // El componente Button no acepta la propiedad color directamente
          // Se podría modificar el componente Button para aceptar un prop de color
        />
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
  header: {
    padding: 20,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  section: {
    padding: 20,
    backgroundColor: colors.card,
    marginTop: 12,
    borderRadius: 12,
    marginHorizontal: 16,
    borderLeftWidth: 3,
    borderLeftColor: colors.border,
  },
  completedSection: {
    borderLeftColor: '#4CAF50', // Verde para secciones completadas
    borderLeftWidth: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  completedText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },
  photoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  photoContainer: {
    flex: 1,
  },
  photoLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
  },
  buttonContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.card,
  },
  inputFilled: {
    borderColor: '#4CAF50',
    backgroundColor: 'rgba(76, 175, 80, 0.05)', // Verde muy claro
  },
  inputRequired: {
    borderColor: '#FF9800', // Naranja para campos obligatorios sin llenar
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  completionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  completionIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 4,
  },
  iconComplete: {
    backgroundColor: '#4CAF50',
  },
  iconIncomplete: {
    backgroundColor: '#FF9800',
  },
  iconNotRequired: {
    backgroundColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  completionSummary: {
    marginTop: 16,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 4,
  },
  completionSummaryText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
    textAlign: 'center',
  },
  allCompletedBanner: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allCompletedText: {
    color: '#388E3C',
    fontSize: 16,
    fontWeight: 'bold',
  },
  incompleteText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
  },
});
