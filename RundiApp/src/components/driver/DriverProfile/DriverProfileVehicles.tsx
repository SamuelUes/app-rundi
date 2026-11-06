import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { ensureVehicleIconSource } from '../../../utils/driver/vehicleIcons';
import { isVehicleComplete } from '../../../utils/driver/driverProfileHelpers';
import type { TFunction } from 'i18next';

interface DriverProfileVehiclesProps {
  vehicles: any[];
  selectedVehicleId: string | null;
  onSwitchVehicle: (id: string) => void;
  onVerifyVehicle: (vehicleId: string) => void;
  onAddVehicle: () => void;
  t: TFunction;
  styles: any;
}

export function DriverProfileVehicles({
  vehicles,
  selectedVehicleId,
  onSwitchVehicle,
  onVerifyVehicle,
  onAddVehicle,
  t,
  styles,
}: DriverProfileVehiclesProps) {
  return (
    <View style={styles.profileSection}>
      <Text style={styles.profileSectionTitle}>{t('driver.profile.vehicles.title')}</Text>

      {vehicles && vehicles.length > 0 ? (
        <>
          {vehicles.map((vehicle) => {
            const isSelectedVehicle = selectedVehicleId === vehicle.id;

            return (
              <View
                key={vehicle.id}
                style={[
                  styles.profileVehicleCard,
                  isSelectedVehicle && styles.profileVehicleCardActive,
                  { flexDirection: 'column', alignItems: 'stretch' },
                ]}
              >
                <View style={[styles.vehicleMainInfo, { width: '100%', flex: 0, marginRight: 0 }]}>
                  <View style={styles.vehicleIcon}>
                    <Image source={ensureVehicleIconSource(vehicle.type)} style={styles.vehicleIconImage} />
                  </View>
                  <View style={styles.vehicleInfo}>
                    <Text style={styles.vehicleName}>
                      {vehicle.brand} {vehicle.model}
                    </Text>
                    <Text style={styles.vehicleDetails}>
                      {vehicle.color} • {vehicle.year} • {vehicle.plate}
                    </Text>
                    {isSelectedVehicle && (
                      <Text style={styles.activeVehicleLabel}>{t('driver.profile.vehicles.selectedLabel')}</Text>
                    )}
                  </View>
                </View>
                <View style={[styles.vehicleButtonsContainer, { width: '100%', marginTop: 14, alignSelf: 'stretch' }]}>
                  <TouchableOpacity
                    style={[styles.verifyButton, { flex: 1, minHeight: 44, justifyContent: 'center' }]}
                    onPress={() => onVerifyVehicle(vehicle.id)}
                  >
                    <Text style={styles.verifyButtonText} numberOfLines={1}>
                      {isVehicleComplete(vehicle)
                        ? t('driver.profile.vehicles.view')
                        : t('driver.profile.vehicles.verify')}
                    </Text>
                  </TouchableOpacity>
                  {vehicles.length > 1 && (
                    <TouchableOpacity
                      style={[styles.changeButton, isSelectedVehicle && styles.changeButtonActive, { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center' }]}
                      onPress={() => onSwitchVehicle(vehicle.id)}
                      disabled={isSelectedVehicle}
                    >
                      <Text
                        style={[styles.changeButtonText, isSelectedVehicle && styles.changeButtonTextActive]}
                        numberOfLines={1}
                      >
                        {isSelectedVehicle
                          ? t('driver.profile.vehicles.selected')
                          : t('driver.profile.vehicles.switch')}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </>
      ) : (
        <View style={styles.emptyVehiclesContainer}>
          <Text style={styles.emptyVehiclesText}>{t('driver.profile.vehicles.empty')}</Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.addVehicleButton}
        onPress={onAddVehicle}
      >
        <Text style={styles.addVehicleButtonText}>{t('driver.profile.vehicles.addButton')}</Text>
      </TouchableOpacity>
    </View>
  );
}
