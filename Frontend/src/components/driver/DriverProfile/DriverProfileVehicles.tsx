import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { ensureVehicleIconSource } from '../../../utils/vehicleIcons';
import { isVehicleComplete } from '../../../utils/driverProfileHelpers';
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
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('driver.profile.vehicles.title')}</Text>

      {vehicles && vehicles.length > 0 ? (
        <>
          {vehicles.map((vehicle) => {
            const isSelectedVehicle = selectedVehicleId === vehicle.id;
            const isApproved = Boolean(vehicle.is_active ?? vehicle.isActive);

            return (
              <View key={vehicle.id} style={[styles.vehicleCard, isSelectedVehicle && styles.vehicleCardActive]}>
                <View style={styles.vehicleMainInfo}>
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
                    {!isApproved && (
                      <Text style={styles.pendingVehicleLabel}>{t('driver.profile.vehicles.pendingLabel')}</Text>
                    )}
                  </View>
                </View>
                <View style={styles.vehicleButtonsContainer}>
                  <TouchableOpacity
                    style={[styles.verifyButton]}
                    onPress={() => onVerifyVehicle(vehicle.id)}
                  >
                    <Text style={styles.verifyButtonText}>
                      {isVehicleComplete(vehicle)
                        ? t('driver.profile.vehicles.view')
                        : t('driver.profile.vehicles.verify')}
                    </Text>
                  </TouchableOpacity>
                  {vehicles.length > 1 && (
                    <TouchableOpacity
                      style={[styles.changeButton, isSelectedVehicle && styles.changeButtonActive]}
                      onPress={() => onSwitchVehicle(vehicle.id)}
                      disabled={isSelectedVehicle || !isApproved}
                    >
                      <Text style={[styles.changeButtonText, isSelectedVehicle && styles.changeButtonTextActive, (!isApproved && !isSelectedVehicle) && styles.changeButtonTextDisabled]}>
                        {isSelectedVehicle
                          ? t('driver.profile.vehicles.selected')
                          : isApproved
                            ? t('driver.profile.vehicles.switch')
                            : t('driver.profile.vehicles.unavailable')}
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
