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
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import Button from '../../components/ui/Button';
import ImagePicker from '../../components/shared/ImagePicker';
import { useTranslation } from 'react-i18next';
import SupportChatShortcut from '../../components/shared/SupportChatShortcut';
import { useVehicleInfo } from '../../hooks/shared/vehicle/useVehicleInfo';
import { VehicleInfoPersonalSection } from '../../components/shared/VehicleInfo/VehicleInfoPersonalSection';
import { VehicleInfoVehicleSection } from '../../components/shared/VehicleInfo/VehicleInfoVehicleSection';
import { VehicleInfoTechnicalSection } from '../../components/shared/VehicleInfo/VehicleInfoTechnicalSection';
import { VehicleInfoDocumentsSection } from '../../components/shared/VehicleInfo/VehicleInfoDocumentsSection';
import { VehicleInfoPhotosSection } from '../../components/shared/VehicleInfo/VehicleInfoPhotosSection';
import { VehicleInfoSaveButton } from '../../components/shared/VehicleInfo/VehicleInfoSaveButton';

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

      <VehicleInfoPersonalSection
        isComplete={isComplete.personalInfo}
        formState={formState}
        sections={sections}
        completionText={completionText}
        fieldLabel={fieldLabel}
        fieldPlaceholder={fieldPlaceholder}
        colors={colors}
        updateField={updateField}
        styles={styles}
      />

      <VehicleInfoVehicleSection
        isComplete={isComplete.vehicleInfo}
        formState={formState}
        sections={sections}
        completionText={completionText}
        messages={messages}
        fieldLabel={fieldLabel}
        fieldPlaceholder={fieldPlaceholder}
        colors={colors}
        updateField={updateField}
        styles={styles}
      />

      <VehicleInfoTechnicalSection
        sections={sections}
        completionText={completionText}
        fieldLabel={fieldLabel}
        fieldPlaceholder={fieldPlaceholder}
        colors={colors}
        formState={formState}
        updateField={updateField}
        styles={styles}
      />

      <VehicleInfoDocumentsSection
        isComplete={isComplete.documentsInfo}
        formState={formState}
        sections={sections}
        completionText={completionText}
        fieldLabel={fieldLabel}
        fieldPlaceholder={fieldPlaceholder}
        colors={colors}
        updateField={updateField}
        styles={styles}
      />

      <VehicleInfoPhotosSection
        isComplete={isComplete}
        photos={photos}
        driverData={driverData}
        vehicleData={vehicleData}
        sections={sections}
        completionText={completionText}
        photosText={photosText}
        setPhoto={setPhoto}
        styles={styles}
      />

      <VehicleInfoSaveButton
        allSectionsComplete={allSectionsComplete}
        saving={saving}
        completionText={completionText}
        buttons={buttons}
        onSave={handleSave}
        styles={styles}
      />
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
