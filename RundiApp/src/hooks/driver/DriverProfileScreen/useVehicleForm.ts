import { useCallback, useState } from 'react';
import vehiclesService from '../../../services/driver/vehiclesService';
import type { Vehicle } from './useDriverProfile';
import { isVehicleComplete, getIncompleteReason } from '../../../utils/driver/driverProfileHelpers';
import { Alert } from 'react-native';
import type { TFunction } from 'i18next';

export interface VehicleFormData {
  plate: string;
  brand: string;
  model: string;
  year: number;
  color: string;
  type: string;
  is_4x4: boolean;
  motor: string;
  chasis: string;
  vin: string;
  cylinders: string;
  passengers: string;
  fuel_type: string;
  tonnage: string;
  vehicle_class: string;
  service_type: string;
  lien: string;
  emission_date: string;
  registration_number: string;
  registration_expiry: string;
  registration_photo_front: string | null;
  registration_photo_back: string | null;
  insurance_number: string;
  insurance_company: string;
  insurance_start_date: string;
  insurance_expiry: string;
  insurance_photo: string | null;
  vehicle_photo: string | null;
}

const createEmptyForm = (): VehicleFormData => ({
  plate: '',
  brand: '',
  model: '',
  year: new Date().getFullYear(),
  color: '',
  type: 'sedan',
  is_4x4: false,
  motor: '',
  chasis: '',
  vin: '',
  cylinders: '',
  passengers: '',
  fuel_type: 'Gasolina',
  tonnage: '',
  vehicle_class: 'PARTICULAR',
  service_type: 'PRIVADO',
  lien: 'NINGUNO',
  emission_date: '',
  registration_number: '',
  registration_expiry: '',
  registration_photo_front: null,
  registration_photo_back: null,
  insurance_number: '',
  insurance_company: '',
  insurance_start_date: '',
  insurance_expiry: '',
  insurance_photo: null,
  vehicle_photo: null,
});

export function useVehicleForm(
  vehicles: Vehicle[],
  selectedVehicleId: string | null,
  setSelectedVehicleId: (id: string | null) => void,
  setVehicles: React.Dispatch<React.SetStateAction<Vehicle[]>>,
  loadDriverData: () => Promise<void>,
  navigation: any,
  t: TFunction,
) {
  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
  const [vehicleFormData, setVehicleFormData] = useState<VehicleFormData>(createEmptyForm);
  const [addingVehicle, setAddingVehicle] = useState(false);

  const handleAddVehicle = useCallback(async () => {
    if (!vehicleFormData.plate || !vehicleFormData.brand || !vehicleFormData.model || !vehicleFormData.color) {
      Alert.alert(
        t('driver.profile.alerts.vehicles.formErrorTitle'),
        t('driver.profile.alerts.vehicles.formErrorBody'),
      );
      return;
    }

    setAddingVehicle(true);
    try {
      const newVehicle = await vehiclesService.addVehicle({
        plate: vehicleFormData.plate.toUpperCase(),
        brand: vehicleFormData.brand,
        model: vehicleFormData.model,
        year: vehicleFormData.year,
        color: vehicleFormData.color,
        type: vehicleFormData.type,
        is_4x4: vehicleFormData.is_4x4,
        motor: vehicleFormData.motor || undefined,
        chasis: vehicleFormData.chasis || undefined,
        vin: vehicleFormData.vin || undefined,
        cylinders: vehicleFormData.cylinders ? parseInt(vehicleFormData.cylinders) : undefined,
        passengers: vehicleFormData.passengers ? parseInt(vehicleFormData.passengers) : undefined,
        fuel_type: vehicleFormData.fuel_type || undefined,
        tonnage: vehicleFormData.tonnage || undefined,
        vehicle_class: vehicleFormData.vehicle_class || undefined,
        service_type: vehicleFormData.service_type || undefined,
        lien: vehicleFormData.lien || 'NINGUNO',
        emission_date: vehicleFormData.emission_date || undefined,
        registration_number: vehicleFormData.registration_number || undefined,
        registration_expiry: vehicleFormData.registration_expiry || undefined,
        registration_photo_front: vehicleFormData.registration_photo_front || undefined,
        registration_photo_back: vehicleFormData.registration_photo_back || undefined,
        insurance_number: vehicleFormData.insurance_number || undefined,
        insurance_company: vehicleFormData.insurance_company || undefined,
        insurance_start_date: vehicleFormData.insurance_start_date || undefined,
        insurance_expiry: vehicleFormData.insurance_expiry || undefined,
        insurance_photo: vehicleFormData.insurance_photo || undefined,
        vehicle_photo: vehicleFormData.vehicle_photo || undefined,
      });

      await loadDriverData();
      setVehicleFormData(createEmptyForm());
      setShowAddVehicleModal(false);

      Alert.alert(
        t('driver.profile.alerts.vehicles.addSuccessTitle'),
        t('driver.profile.alerts.vehicles.addSuccessBody'),
      );
    } catch (error: any) {
      Alert.alert(
        t('driver.profile.alerts.vehicles.addErrorTitle'),
        error?.message || t('driver.profile.alerts.vehicles.genericFormError'),
      );
    } finally {
      setAddingVehicle(false);
    }
  }, [vehicleFormData, t, loadDriverData]);

  const handleSwitchVehicle = useCallback(
    async (vehicleId: string) => {
      try {
        const vehicleToSwitch = vehicles.find((v) => v.id === vehicleId);

        if (!vehicleToSwitch) {
          Alert.alert(
            t('driver.profile.alerts.vehicles.notFoundTitle'),
            t('driver.profile.alerts.vehicles.notFoundBody'),
          );
          return;
        }

        if (!vehicleToSwitch.is_active && !vehicleToSwitch.isActive) {
          Alert.alert(
            t('driver.profile.alerts.vehicles.notApprovedTitle'),
            t('driver.profile.alerts.vehicles.notApprovedBody'),
          );
          return;
        }

        if (!isVehicleComplete(vehicleToSwitch)) {
          const reason = getIncompleteReason(vehicleToSwitch, t);
          Alert.alert(
            t('driver.profile.alerts.vehicles.incompleteTitle'),
            t('driver.profile.alerts.vehicles.incompleteBody', { reason }),
            [
              { text: t('driver.profile.alerts.vehicles.cancel'), style: 'cancel' },
              {
                text: t('driver.profile.alerts.vehicles.viewDocuments'),
                onPress: () => navigation.navigate('VehicleVerification', { vehicleId: vehicleToSwitch.id }),
              },
            ],
          );
          return;
        }

        await vehiclesService.switchVehicle(vehicleId);

        setSelectedVehicleId(vehicleId);
        setVehicles((prev: Vehicle[]) =>
          prev.map((vehicle: Vehicle) =>
            vehicle.id === vehicleId
              ? {
                  ...vehicle,
                  is_active: vehicle.is_active ?? vehicle.isActive ?? true,
                  isActive: true,
                }
              : { ...vehicle },
          ),
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error desconocido al cambiar vehículo';
        Alert.alert(
          t('driver.profile.alerts.vehicles.switchErrorTitle'),
          message || t('driver.profile.alerts.vehicles.switchErrorBody'),
        );
      }
    },
    [vehicles, t, navigation, setSelectedVehicleId, setVehicles],
  );

  return {
    showAddVehicleModal,
    setShowAddVehicleModal,
    vehicleFormData,
    setVehicleFormData,
    addingVehicle,
    handleAddVehicle,
    handleSwitchVehicle,
  };
}
