import React from 'react';
import { View, Text } from 'react-native';
import ImagePicker from '../../shared/ImagePicker';

interface VehicleInfoPhotosSectionProps {
  isComplete: {
    licensePhotos: boolean;
    registrationPhotos: boolean;
    insurancePhotos: boolean;
    vehiclePhotos: boolean;
  };
  photos: any;
  driverData: any;
  vehicleData: any;
  sections: Record<string, string>;
  completionText: Record<string, string>;
  photosText: any;
  setPhoto: (key: string, uri: string) => void;
  styles: any;
}

export function VehicleInfoPhotosSection({
  isComplete,
  photos,
  driverData,
  vehicleData,
  sections,
  completionText,
  photosText,
  setPhoto,
  styles,
}: VehicleInfoPhotosSectionProps) {
  const renderCompletionBadge = (complete: boolean) =>
    complete ? (
      <View style={styles.completionBadge}>
        <View style={[styles.completionIcon, styles.iconComplete]} />
        <Text style={styles.completedText}>{completionText.badge}</Text>
      </View>
    ) : null;

  return (
    <>
      {/* License */}
      <View style={[styles.section, isComplete.licensePhotos && styles.completedSection]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{sections.license}</Text>
          {renderCompletionBadge(isComplete.licensePhotos)}
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
          {renderCompletionBadge(isComplete.registrationPhotos)}
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
          {renderCompletionBadge(isComplete.insurancePhotos)}
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
          {renderCompletionBadge(isComplete.vehiclePhotos)}
        </View>

        <ImagePicker
          imageUri={photos.vehicle.tempUri || photos.vehicle.url || vehicleData?.vehicle_photo || null}
          onImageSelected={(uri: string) => setPhoto('vehicle', uri)}
          label={photosText.uploadVehicle ?? ''}
        />
      </View>
    </>
  );
}
