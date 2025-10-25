/**
 * Driver Service Sync Service - Sincronizar servicios de conductores a Supabase
 */

import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../config/firebase';

interface DriverServiceData {
  driverId: string;
  serviceId: string;
  customCommissionRate?: number;
  expiresAt?: string;
  notes?: string;
}

interface SyncResult {
  success: boolean;
  driverService?: any;
  message?: string;
  isUpdate?: boolean;
  error?: string;
}

class DriverServiceSyncService {
  /**
   * Sincronizar servicio de conductor
   */
  async syncService(serviceData: DriverServiceData): Promise<SyncResult> {
    try {
      console.log('💾 Sincronizando servicio:', serviceData);

      const functions = await getFirebaseFunctions();
      const syncFn = httpsCallable(functions, 'syncDriverServiceToSupabase');

      const result = await syncFn(serviceData);

      console.log('✅ Servicio sincronizado:', result.data);
      return (result.data as unknown) as SyncResult;
    } catch (error: any) {
      console.error('❌ Error sincronizando servicio:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Sincronizar múltiples servicios en lote
   */
  async syncServicesBatch(
    driverId: string,
    services: Omit<DriverServiceData, 'driverId'>[]
  ): Promise<any> {
    try {
      console.log(
        `💾 Sincronizando ${services.length} servicios para ${driverId}`
      );

      const functions = await getFirebaseFunctions();
      const syncFn = httpsCallable(functions, 'syncDriverServicesBatch');

      const result = await syncFn({ driverId, services });

      const data = (result.data as unknown) as any;
      console.log(`✅ ${data.count} servicios sincronizados`);
      return data;
    } catch (error: any) {
      console.error('❌ Error sincronizando servicios:', error);
      throw error;
    }
  }
}

export default new DriverServiceSyncService();
