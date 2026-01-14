/**
 * Earnings Service - Servicio para ganancias del conductor
 */

import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../config/firebase';
import sessionService from './sessionService';
import i18n from '../i18n';

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
  private tr(path: string) {
    return i18n.t(`services.earningsService.${path}`) as string;
  }

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
      console.log(`💰 [earningsService] Obteniendo ganancias - período: ${period}`);
      const functions = await getFirebaseFunctions();
      const getDriverEarningsFn = httpsCallable(functions, 'getDriverEarnings');

      console.log(`📞 [earningsService] Llamando a getDriverEarnings...`);
      const deviceId = await sessionService.getDeviceId();

      const response = await getDriverEarningsFn({
        period,
        startDate,
        endDate,
        deviceId,
      });

      const result = response.data as any;
      console.log(`✅ [earningsService] Respuesta recibida:`, result);

      // ✅ Backend retorna 'earnings', convertir a formato esperado
      const earnings = result.earnings || {};
      const rides = Array.isArray(earnings.completedRides) ? earnings.completedRides : [];
      
      return {
        summary: {
          totalEarnings: earnings.totalEarnings || 0,
          totalRides: earnings.totalRides || 0,
          averagePerRide: earnings.averageEarning || 0,
          commission: earnings.totalCommission || 0,
          netEarnings: earnings.netEarnings ?? (earnings.totalEarnings || 0),
          penalties: [],
          penaltyCount: 0,
          cashRidesCount: 0,
          cashCommissionTotal: 0,
          cashCommissionPending: 0,
          retentionAmount: 0,
          hasRetention: false,
          netEarningsAfterPenalties: earnings.netEarnings ?? (earnings.totalEarnings || 0),
        },
        rides: rides.map((ride: any) => ({
          id: ride.id,
          clientName: ride.clientName || '',
          origin: ride.origin || ride.originAddress || '',
          destination: ride.destination || ride.destinationAddress || '',
          distance: ride.distance || 0,
          duration: ride.duration || 0,
          fare: ride.fare || 0,
          commission: ride.commission || 0,
          netEarning: ride.driverEarning || (ride.fare || 0) - (ride.commission || 0),
          completedAt: ride.completedAt || '',
          paymentStatus: ride.paymentStatus || 'pending',
        })),
        period: period,
      };
    } catch (error: any) {
      console.error('❌ Error obteniendo ganancias:', error.message);
      console.error('❌ Error stack:', error.code);
      // Retornar datos vacíos en lugar de lanzar error
      return {
        summary: {
          totalEarnings: 0,
          totalRides: 0,
          averagePerRide: 0,
          commission: 0,
          netEarnings: 0,
        },
        rides: [],
        period: period,
      };
    }
  }

  /**
   * Obtener estadísticas detalladas del conductor
   */
  async getDriverStats(): Promise<DriverStats> {
    try {
      const functions = await getFirebaseFunctions();
      const getDriverStatsFn = httpsCallable(functions, 'getDriverEarningsStats');

      const deviceId = await sessionService.getDeviceId();

      const response = await getDriverStatsFn({ deviceId });
      const result = response.data as any;

      return result.stats;
    } catch (error: any) {
      console.error('❌ Error obteniendo estadísticas:', error);
      throw new Error(error.message || this.tr('errors.statsFailed'));
    }
  }

  /**
   * Obtener ganancias por día (para gráficas)
   */
  async getEarningsByDay(days: number = 7): Promise<EarningByDay[]> {
    try {
      const functions = await getFirebaseFunctions();
      const getEarningsByDayFn = httpsCallable(functions, 'getEarningsByDay');

      const deviceId = await sessionService.getDeviceId();

      const response = await getEarningsByDayFn({ days, deviceId });
      const result = response.data as any;

      return result.earningsByDay;
    } catch (error: any) {
      console.error('❌ Error obteniendo ganancias por día:', error);
      throw new Error(error.message || this.tr('errors.earningsByDayFailed'));
    }
  }

  /**
   * Obtener viajes en efectivo pendientes de recarga
   */
  async getPendingCashRides(): Promise<PendingCashRides> {
    try {
      const functions = await getFirebaseFunctions();
      const getPendingCashRidesFn = httpsCallable(functions, 'getPendingCashRides');

      const deviceId = await sessionService.getDeviceId();

      const response = await getPendingCashRidesFn({ deviceId });
      const result = response.data as any;

      return result.pendingCashRides;
    } catch (error: any) {
      console.error('❌ Error obteniendo viajes pendientes en efectivo:', error);
      throw new Error(error.message || this.tr('errors.pendingCashFailed'));
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

      const deviceId = await sessionService.getDeviceId();

      const response = await createCashRechargeFn({ ...data, deviceId });
      const result = response.data as any;

      return result.recharge;
    } catch (error: any) {
      console.error('❌ Error creando recarga:', error);
      throw new Error(error.message || this.tr('errors.createRechargeFailed'));
    }
  }

  /**
   * Obtener historial de recargas del conductor
   */
  async getDriverRecharges(): Promise<CashRecharge[]> {
    try {
      const functions = await getFirebaseFunctions();
      const getDriverRechargesFn = httpsCallable(functions, 'getDriverRecharges');

      const deviceId = await sessionService.getDeviceId();

      const response = await getDriverRechargesFn({ deviceId });
      const result = response.data as any;

      return result.recharges || [];
    } catch (error: any) {
      console.error('❌ Error obteniendo recargas:', error);
      throw new Error(error.message || this.tr('errors.rechargesFailed'));
    }
  }
}

export default new EarningsService();
