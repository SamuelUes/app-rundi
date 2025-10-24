/**
 * Penalty Sync Service - Sincronizar penalizaciones a Supabase
 */

import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../config/firebase';

interface PenaltyData {
  driverId: string;
  rideId?: string;
  penaltyType: 'cancellation' | 'late_arrival' | 'poor_service' | 'other';
  amount: number;
  reason?: string;
  progressPercentage?: number;
}

interface SyncResult {
  success: boolean;
  penalty?: any;
  message?: string;
  isDuplicate?: boolean;
  error?: string;
}

class PenaltySyncService {
  /**
   * Sincronizar penalización a Supabase
   */
  async syncPenalty(penaltyData: PenaltyData): Promise<SyncResult> {
    try {
      console.log('💾 Sincronizando penalización:', penaltyData);

      const functions = await getFirebaseFunctions();
      const syncFn = httpsCallable(functions, 'syncPenaltyToSupabase');

      const result = await syncFn(penaltyData);

      console.log('✅ Penalización sincronizada:', result.data);
      return (result.data as unknown) as SyncResult;
    } catch (error: any) {
      console.error('❌ Error sincronizando penalización:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Sincronizar múltiples penalizaciones en lote
   */
  async syncPenaltiesBatch(penalties: PenaltyData[]): Promise<any> {
    try {
      console.log(`💾 Sincronizando ${penalties.length} penalizaciones`);

      const functions = await getFirebaseFunctions();
      const syncFn = httpsCallable(functions, 'syncPenaltiesBatch');

      const result = await syncFn({ penalties });

      const data = (result.data as unknown) as any;
      console.log(`✅ ${data.count} penalizaciones sincronizadas`);
      return data;
    } catch (error: any) {
      console.error('❌ Error sincronizando lote:', error);
      throw error;
    }
  }
}

export default new PenaltySyncService();
