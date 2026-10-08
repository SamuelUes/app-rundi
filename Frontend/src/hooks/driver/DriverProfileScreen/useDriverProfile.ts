import { useCallback, useState } from 'react';
import driversService from '../../../services/driversService';
import vehiclesService from '../../../services/vehiclesService';
import supabaseStorage from '../../../services/supabaseStorage';
import { initializeFirebase } from '../../../config/firebase';
import { getDatabase, ref, get } from 'firebase/database';

export interface DriverData {
  id: string;
  licenseNumber?: string;
  licenseExpiry?: string;
  licensePhoto?: string;
  licensePhotoFront?: string;
  licensePhotoBack?: string;
  documentsStatus?: string;
  accountStatus?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  license_number?: string;
  license_expiry?: string;
  license_photo?: string;
  license_photo_front?: string;
  license_photo_back?: string;
  documents_status?: string;
  account_status?: string;
  status?: string;
  totalRides?: number;
  total_rides?: number;
  averageRating?: number;
  average_rating?: number;
  totalEarnings?: number;
  total_earnings?: number;
  first_name?: string;
  last_name?: string;
  designatedRoleRequested?: string;
  designated_rol_requested?: string;
  designatedRolRequested?: string;
  profilePhoto?: string;
  profile_photo?: string;
  vehicles?: any[];
  rating?: number;
  earnings?: number;
}

export interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: number;
  color: string;
  plate: string;
  type: string;
  isActive?: boolean;
  is_active?: boolean;
  registrationNumber?: string;
  registrationExpiry?: string;
  registrationPhoto?: string;
  registrationPhotoFront?: string;
  registrationPhotoBack?: string;
  insuranceNumber?: string;
  insuranceCompany?: string;
  insuranceExpiry?: string;
  insurancePhoto?: string;
  vehiclePhoto?: string;
}

export interface DriverStats {
  totalRides: number;
  totalEarnings: number;
  averageRating: number;
  completionRate: number;
}

const extractDesignatedRequestStatus = (driver: DriverData | null | undefined) =>
  driver?.designated_rol_requested || driver?.designatedRoleRequested || driver?.designatedRolRequested || null;

export function useDriverProfile(userId: string | undefined) {
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [driverData, setDriverData] = useState<DriverData | null>(null);
  const [stats, setStats] = useState<DriverStats>({
    totalRides: 0,
    totalEarnings: 0,
    averageRating: 5.0,
    completionRate: 100,
  });
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [designatedDriverRequestStatus, setDesignatedDriverRequestStatus] = useState<string | null>(null);

  const loadDriverData = useCallback(async () => {
    setLoading(true);
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      const profile = await driversService.getMyDriverProfile();

      if (profile) {
        setDriverData(profile);
        setDesignatedDriverRequestStatus(extractDesignatedRequestStatus(profile) || 'pending');

        setStats({
          totalRides: profile.totalRides || profile.total_rides || 0,
          totalEarnings: profile.earnings || profile.total_earnings || 0,
          averageRating: profile.rating || profile.average_rating || 5.0,
          completionRate: 96,
        });

        try {
          if (profile.vehicles && Array.isArray(profile.vehicles) && profile.vehicles.length > 0) {
            setVehicles(profile.vehicles);
          } else {
            const allVehicles = await vehiclesService.getDriverVehicles();
            if (allVehicles && allVehicles.length > 0) {
              setVehicles(allVehicles);
            } else {
              setVehicles([]);
            }
          }
        } catch (vehicleError: any) {
          if (profile.vehicles && Array.isArray(profile.vehicles)) {
            setVehicles(profile.vehicles);
          }
        }

        const storedProfilePhoto = profile.profilePhoto || profile.profile_photo || null;
        setProfilePhoto(await supabaseStorage.resolveDocumentPhotoUrl(storedProfilePhoto));
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido al cargar datos del conductor';
      console.warn('⚠️ Error cargando datos del conductor:', message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const loadDesignatedDriverStatus = useCallback(async () => {
    try {
      if (!userId) return;
      const profile = await driversService.getMyDriverProfile();
      const status = extractDesignatedRequestStatus(profile) || 'pending';
      setDesignatedDriverRequestStatus(status);
    } catch (error) {
      setDesignatedDriverRequestStatus((prev) => prev || 'pending');
    }
  }, [userId]);

  const loadSelectedVehicle = useCallback(async (userUuid: string) => {
    try {
      const { app } = await initializeFirebase();
      if (!app) return;
      const db = getDatabase(app);
      const vehicleRef = ref(db, `driversInfo/${userUuid}/vehicle`);
      const snapshot = await get(vehicleRef);

      if (snapshot.exists()) {
        const data = snapshot.val();
        const vehicleId = typeof data === 'string' ? data : data?.id;
        setSelectedVehicleId(vehicleId ?? null);
      } else {
        setSelectedVehicleId(null);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido al cargar vehículo seleccionado';
      console.warn('⚠️ Error cargando vehículo seleccionado:', message);
    }
  }, []);

  return {
    loading,
    vehicles,
    setVehicles,
    driverData,
    stats,
    profilePhoto,
    setProfilePhoto,
    selectedVehicleId,
    setSelectedVehicleId,
    designatedDriverRequestStatus,
    setDesignatedDriverRequestStatus,
    loadDriverData,
    loadDesignatedDriverStatus,
    loadSelectedVehicle,
  };
}
