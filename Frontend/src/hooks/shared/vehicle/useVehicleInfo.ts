import { useState, useEffect, useCallback } from 'react';
import driversService from '../../../services/driversService';
import {
  uploadLicensePhoto,
  uploadRegistrationPhoto,
  uploadInsurancePhoto,
} from '../../../services/supabaseStorage';
import { formatDateValue, safeString } from '../../../utils/vehicleFormatters';

export interface VehicleData {
  id: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  color: string;
  type: string;
  registration_number?: string;
  registration_expiry?: string;
  registration_photo?: string;
  registration_photo_front?: string;
  registration_photo_back?: string;
  insurance_photo?: string;
  vehicle_photo?: string;
  motor?: string;
  chasis?: string;
  vin?: string;
  cylinders?: number;
  passengers?: number;
  fuel_type?: string;
  tonnage?: number;
  vehicle_class?: string;
  service_type?: string;
  lien?: string;
  insurance_number?: string;
  insurance_company?: string;
  insurance_expiry?: string;
  insurance_start_date?: string;
  is_4x4?: boolean;
}

export interface DriverData {
  license_number: string;
  license_expiry?: string;
  license_photo_front?: string;
  license_photo_back?: string;
  department?: string;
  municipality?: string;
  profile_photo?: string;
}

export interface PhotoState {
  url: string | null;
  tempUri: string | null;
}

export interface VehicleFormState {
  department: string;
  municipality: string;
  licenseNumber: string;
  licenseExpiry: string;
  plate: string;
  brand: string;
  model: string;
  year: string;
  color: string;
  vehicleType: string;
  registrationNumber: string;
  registrationExpiry: string;
  insuranceNumber: string;
  insuranceCompany: string;
  insuranceExpiry: string;
  insuranceStartDate: string;
  motor: string;
  chasis: string;
  vin: string;
  cylinders: string;
  passengers: string;
  fuelType: string;
  tonnage: string;
  vehicleClass: string;
  serviceType: string;
  lien: string;
  is4x4: boolean;
}

const defaultFormState: VehicleFormState = {
  department: '',
  municipality: '',
  licenseNumber: '',
  licenseExpiry: '',
  plate: '',
  brand: '',
  model: '',
  year: '',
  color: '',
  vehicleType: '',
  registrationNumber: '',
  registrationExpiry: '',
  insuranceNumber: '',
  insuranceCompany: '',
  insuranceExpiry: '',
  insuranceStartDate: '',
  motor: '',
  chasis: '',
  vin: '',
  cylinders: '',
  passengers: '',
  fuelType: '',
  tonnage: '',
  vehicleClass: '',
  serviceType: '',
  lien: 'NINGUNO',
  is4x4: false,
};

export function useVehicleInfo(userId: string | undefined, defaultLienValue: string) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vehicleData, setVehicleData] = useState<VehicleData | null>(null);
  const [driverData, setDriverData] = useState<DriverData | null>(null);
  const [formState, setFormState] = useState<VehicleFormState>({
    ...defaultFormState,
    lien: defaultLienValue,
  });

  const [photos, setPhotos] = useState<Record<string, PhotoState>>({
    licenseFront: { url: null, tempUri: null },
    licenseBack: { url: null, tempUri: null },
    registrationFront: { url: null, tempUri: null },
    registrationBack: { url: null, tempUri: null },
    insurance: { url: null, tempUri: null },
    vehicle: { url: null, tempUri: null },
  });

  const setPhoto = useCallback((key: string, uri: string) => {
    setPhotos((prev) => ({
      ...prev,
      [key]: { url: null, tempUri: uri },
    }));
  }, []);

  const loadExistingData = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    try {
      const driver = await driversService.getMyDriverProfile();
      const vehicle = driver?.vehicle;

      if (driver) {

        setDriverData(driver);

        setPhotos((prev) => ({
          ...prev,
          licenseFront: { url: driver.license_photo_front || null, tempUri: null },
          licenseBack: { url: driver.license_photo_back || null, tempUri: null },
        }));

        setFormState((prev) => ({
          ...prev,
          department: safeString(driver.department),
          municipality: safeString(driver.municipality),
          licenseNumber: safeString(driver.license_number),
          licenseExpiry: formatDateValue(driver.license_expiry),
        }));

        if (vehicle) {
          setVehicleData(vehicle);

          setPhotos((prev) => ({
            ...prev,
            registrationFront: { url: vehicle.registration_photo_front || null, tempUri: null },
            registrationBack: { url: vehicle.registration_photo_back || null, tempUri: null },
            insurance: { url: vehicle.insurance_photo || null, tempUri: null },
            vehicle: { url: vehicle.vehicle_photo || null, tempUri: null },
          }));

          setFormState((prev) => ({
            ...prev,
            plate: safeString(vehicle.plate),
            brand: safeString(vehicle.brand),
            model: safeString(vehicle.model),
            year: vehicle.year ? vehicle.year.toString() : '',
            color: safeString(vehicle.color),
            vehicleType: safeString(vehicle.type),
            registrationNumber: safeString(vehicle.registration_number),
            registrationExpiry: formatDateValue(vehicle.registration_expiry),
            insuranceNumber: safeString(vehicle.insurance_number),
            insuranceCompany: safeString(vehicle.insurance_company),
            insuranceExpiry: formatDateValue(vehicle.insurance_expiry),
            insuranceStartDate: formatDateValue(vehicle.insurance_start_date),
            motor: safeString(vehicle.motor),
            chasis: safeString(vehicle.chasis),
            vin: safeString(vehicle.vin),
            cylinders: vehicle.cylinders ? vehicle.cylinders.toString() : '',
            passengers: vehicle.passengers ? vehicle.passengers.toString() : '',
            fuelType: safeString(vehicle.fuel_type),
            tonnage: vehicle.tonnage ? vehicle.tonnage.toString() : '',
            vehicleClass: safeString(vehicle.vehicle_class),
            serviceType: safeString(vehicle.service_type),
            lien: safeString(vehicle.lien) || defaultLienValue,
            is4x4: vehicle.is_4x4 || false,
          }));
        }
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [userId, defaultLienValue]);

  useEffect(() => {
    loadExistingData().catch(() => {});
  }, [loadExistingData]);

  const handleSave = useCallback(async () => {
    if (!userId) return;

    setSaving(true);
    try {
      const uploadResults: { [key: string]: string } = {};

      if (photos.licenseFront.tempUri) {
        uploadResults.license_photo_front = await uploadLicensePhoto(userId, photos.licenseFront.tempUri, 'front');
      }
      if (photos.licenseBack.tempUri) {
        uploadResults.license_photo_back = await uploadLicensePhoto(userId, photos.licenseBack.tempUri, 'back');
      }
      if (photos.registrationFront.tempUri) {
        uploadResults.registration_photo_front = await uploadRegistrationPhoto(userId, photos.registrationFront.tempUri, 'front');
      }
      if (photos.registrationBack.tempUri) {
        uploadResults.registration_photo_back = await uploadRegistrationPhoto(userId, photos.registrationBack.tempUri, 'back');
      }
      if (photos.insurance.tempUri) {
        uploadResults.insurance_photo = await uploadInsurancePhoto(userId, photos.insurance.tempUri);
      }
      if (photos.vehicle.tempUri) {
        uploadResults.vehicle_photo = await uploadInsurancePhoto(userId, photos.vehicle.tempUri);
      }

      const driverUpdates: any = {};
      const vehicleUpdates: any = {};

      if (formState.department !== (driverData?.department || '')) driverUpdates.department = formState.department;
      if (formState.municipality !== (driverData?.municipality || '')) driverUpdates.municipality = formState.municipality;
      if (formState.licenseNumber !== (driverData?.license_number || '')) driverUpdates.license_number = formState.licenseNumber;
      if (formState.licenseExpiry !== (driverData?.license_expiry || '')) driverUpdates.license_expiry = formState.licenseExpiry;

      if (uploadResults.license_photo_front) driverUpdates.license_photo_front = uploadResults.license_photo_front;
      if (uploadResults.license_photo_back) driverUpdates.license_photo_back = uploadResults.license_photo_back;

      if (formState.plate !== (vehicleData?.plate || '')) vehicleUpdates.plate = formState.plate;
      if (formState.brand !== (vehicleData?.brand || '')) vehicleUpdates.brand = formState.brand;
      if (formState.model !== (vehicleData?.model || '')) vehicleUpdates.model = formState.model;
      if (formState.year !== (vehicleData?.year?.toString() || '')) vehicleUpdates.year = parseInt(formState.year);
      if (formState.color !== (vehicleData?.color || '')) vehicleUpdates.color = formState.color;
      if (formState.vehicleType !== (vehicleData?.type || '')) vehicleUpdates.type = formState.vehicleType;
      if (formState.registrationNumber !== (vehicleData?.registration_number || '')) vehicleUpdates.registration_number = formState.registrationNumber;
      if (formState.registrationExpiry !== (vehicleData?.registration_expiry || '')) vehicleUpdates.registration_expiry = formState.registrationExpiry;
      if (formState.insuranceNumber !== (vehicleData?.insurance_number || '')) vehicleUpdates.insurance_number = formState.insuranceNumber;
      if (formState.insuranceCompany !== (vehicleData?.insurance_company || '')) vehicleUpdates.insurance_company = formState.insuranceCompany;
      if (formState.insuranceExpiry !== (vehicleData?.insurance_expiry || '')) vehicleUpdates.insurance_expiry = formState.insuranceExpiry;
      if (formState.insuranceStartDate !== (vehicleData?.insurance_start_date || '')) vehicleUpdates.insurance_start_date = formState.insuranceStartDate;
      if (formState.motor !== (vehicleData?.motor || '')) vehicleUpdates.motor = formState.motor;
      if (formState.chasis !== (vehicleData?.chasis || '')) vehicleUpdates.chasis = formState.chasis;
      if (formState.vin !== (vehicleData?.vin || '')) vehicleUpdates.vin = formState.vin;
      if (formState.cylinders !== (vehicleData?.cylinders?.toString() || '')) vehicleUpdates.cylinders = parseInt(formState.cylinders);
      if (formState.passengers !== (vehicleData?.passengers?.toString() || '')) vehicleUpdates.passengers = parseInt(formState.passengers);
      if (formState.fuelType !== (vehicleData?.fuel_type || '')) vehicleUpdates.fuel_type = formState.fuelType;
      if (formState.tonnage !== (vehicleData?.tonnage?.toString() || '')) vehicleUpdates.tonnage = parseFloat(formState.tonnage);
      if (formState.vehicleClass !== (vehicleData?.vehicle_class || '')) vehicleUpdates.vehicle_class = formState.vehicleClass;
      if (formState.serviceType !== (vehicleData?.service_type || '')) vehicleUpdates.service_type = formState.serviceType;
      if (formState.lien !== (vehicleData?.lien || defaultLienValue)) vehicleUpdates.lien = formState.lien;
      if (formState.is4x4 !== (vehicleData?.is_4x4 || false)) vehicleUpdates.is_4x4 = formState.is4x4;

      if (uploadResults.registration_photo_front) vehicleUpdates.registration_photo_front = uploadResults.registration_photo_front;
      if (uploadResults.registration_photo_back) vehicleUpdates.registration_photo_back = uploadResults.registration_photo_back;
      if (uploadResults.insurance_photo) vehicleUpdates.insurance_photo = uploadResults.insurance_photo;
      if (uploadResults.vehicle_photo) vehicleUpdates.vehicle_photo = uploadResults.vehicle_photo;

      if (Object.keys(driverUpdates).length > 0) {
        await driversService.updateDriver(driverUpdates);
      }

      if (vehicleData?.id && Object.keys(vehicleUpdates).length > 0) {
        await driversService.updateVehicle(vehicleData.id, vehicleUpdates);
      }

      setPhotos((prev) => ({
        licenseFront: { url: uploadResults.license_photo_front || prev.licenseFront.url, tempUri: null },
        licenseBack: { url: uploadResults.license_photo_back || prev.licenseBack.url, tempUri: null },
        registrationFront: { url: uploadResults.registration_photo_front || prev.registrationFront.url, tempUri: null },
        registrationBack: { url: uploadResults.registration_photo_back || prev.registrationBack.url, tempUri: null },
        insurance: { url: uploadResults.insurance_photo || prev.insurance.url, tempUri: null },
        vehicle: { url: uploadResults.vehicle_photo || prev.vehicle.url, tempUri: null },
      }));

      return true;
    } catch (error) {
      console.error('❌ Error en el proceso completo:', error);
      throw error;
    } finally {
      setSaving(false);
    }
  }, [userId, photos, formState, driverData, vehicleData, defaultLienValue]);

  return {
    loading,
    saving,
    vehicleData,
    driverData,
    formState,
    setFormState,
    photos,
    setPhoto,
    handleSave,
  };
}
