/**
 * Earnings Service - Servicio para ganancias del conductor
 */

import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../config/firebase';

export interface EarningsSummary {
  totalEarnings: number;
  totalRides: number;
  averagePerRide: number;
  commission: number;
  netEarnings: number;
  // Sistema de penalizaciones y retenciones
  penalties?: Array<{
    id: string;
    amount: number;
    type: string;
    reason: string;
    createdAt: string;
  }>;
  penaltyCount?: number;
  // Sistema de recarga de efectivo
  cashRidesCount?: number;
  cashCommissionTotal?: number;
  cashCommissionPending?: number;
  retentionAmount?: number;
  hasRetention?: boolean;
  netEarningsAfterPenalties?: number;
}

export interface RideEarning {
  id: string;
  clientName: string;
  origin: string;
  destination: string;
  distance: number;
  duration: number;
  fare: number;
  commission: number;
  netEarning: number;
  completedAt: string;
  paymentStatus: string;
}

export interface DriverStats {
  totalRides: number;
  totalEarnings: number;
  totalCommission: number;
  totalNetEarnings: number;
  averageFare: number;
  totalDistance: number;
  totalDuration: number;
  ridesToday: number;
  earningsToday: number;
  ridesWeek: number;
  earningsWeek: number;
  netEarningsWeek: number;
  ridesMonth: number;
  earningsMonth: number;
  netEarningsMonth: number;
}
export interface EarningByDay {
  date: string;
  rides: number;
  earnings: number;
  commission: number;
  netEarnings: number;
}

export interface CashRecharge {
  id: string;
  driverId: string;
  amount: number;
  status: 'pending' | 'completed' | 'cancelled';
  paymentMethod: 'cash' | 'transfer' | 'other';
  referenceNumber?: string;
  notes?: string;
  createdAt: string;
  completedAt?: string;
}

export interface PendingCashRides {
  rides: Array<{
    id: string;
    fare: number;
    commission: number;
    completedAt: string;
    clientName: string;
  }>;
  totalPendingCommission: number;
  totalRides: number;
}

class EarningsService {
  /**
   * Obtener ganancias del conductor
   */
  async getDriverEarnings(
    period: 'today' | 'week' | 'month' | 'custom' = 'today',
    startDate?: string,
    endDate?: string
  ): Promise<{
    summary: EarningsSummary;
    rides: RideEarning[];
    period: string;
  }> {
    try {
      const functions = await getFirebaseFunctions();
      const getDriverEarningsFn = httpsCallable(functions, 'getDriverEarnings');

      const response = await getDriverEarningsFn({
        period,
        startDate,
        endDate,
      });

      const result = response.data as any;

      return {
        summary: result.summary,
        rides: result.rides,
        period: result.period,
      };
    } catch (error: any) {
      console.error('❌ Error obteniendo ganancias:', error);
      throw new Error(error.message || 'No se pudieron obtener las ganancias');
    }
  }

  /**
   * Obtener estadísticas detalladas del conductor
   */
  async getDriverStats(): Promise<DriverStats> {
    try {
      const functions = await getFirebaseFunctions();
      const getDriverStatsFn = httpsCallable(functions, 'getDriverEarningsStats');

      const response = await getDriverStatsFn({});
      const result = response.data as any;

      return result.stats;
    } catch (error: any) {
      console.error('❌ Error obteniendo estadísticas:', error);
      throw new Error(error.message || 'No se pudieron obtener las estadísticas');
    }
  }

  /**
   * Obtener ganancias por día (para gráficas)
   */
  async getEarningsByDay(days: number = 7): Promise<EarningByDay[]> {
    try {
      const functions = await getFirebaseFunctions();
      const getEarningsByDayFn = httpsCallable(functions, 'getEarningsByDay');

      const response = await getEarningsByDayFn({ days });
      const result = response.data as any;

      return result.earningsByDay;
    } catch (error: any) {
      console.error('❌ Error obteniendo ganancias por día:', error);
      throw new Error(error.message || 'No se pudieron obtener las ganancias por día');
    }
  }

  /**
   * Obtener viajes en efectivo pendientes de recarga
   */
  async getPendingCashRides(): Promise<PendingCashRides> {
    try {
      const functions = await getFirebaseFunctions();
      const getPendingCashRidesFn = httpsCallable(functions, 'getPendingCashRides');

      const response = await getPendingCashRidesFn({});
      const result = response.data as any;

      return result.pendingCashRides;
    } catch (error: any) {
      console.error('❌ Error obteniendo viajes pendientes en efectivo:', error);
      throw new Error(error.message || 'No se pudieron obtener los viajes pendientes en efectivo');
    }
  }

  /**
   * Crear una nueva recarga
   */
  async createCashRecharge(data: {
    amount: number;
    paymentMethod: 'cash' | 'transfer' | 'other';
    referenceNumber?: string;
    notes?: string;
  }): Promise<CashRecharge> {
    try {
      const functions = await getFirebaseFunctions();
      const createCashRechargeFn = httpsCallable(functions, 'createCashRecharge');

      const response = await createCashRechargeFn(data);
      const result = response.data as any;

      return result.recharge;
    } catch (error: any) {
      console.error('❌ Error creando recarga:', error);
      throw new Error(error.message || 'No se pudo crear la recarga');
    }
  }

  /**
   * Obtener historial de recargas del conductor
   */
  async getDriverRecharges(): Promise<CashRecharge[]> {
    try {
      const functions = await getFirebaseFunctions();
      const getDriverRechargesFn = httpsCallable(functions, 'getDriverRecharges');

      const response = await getDriverRechargesFn({});
      const result = response.data as any;

      return result.recharges || [];
    } catch (error: any) {
      console.error('❌ Error obteniendo recargas:', error);
      throw new Error(error.message || 'No se pudieron obtener las recargas');
    }
  }
}

export default new EarningsService();
