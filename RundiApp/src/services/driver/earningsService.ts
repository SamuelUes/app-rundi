import {
  getDriverEarnings as getDriverEarningsV2,
  getMyRides,
  type EarningsSummary as V2EarningsSummary,
} from '../../api/rides';
import { getDriverStats as getDriverStatsV2, getRechargeSummary } from '../../api/drivers';
import i18n from '../../i18n';

export interface EarningsSummary {
  totalEarnings: number;
  totalRides: number;
  averagePerRide: number;
  commission: number;
  netEarnings: number;
  penalties?: Array<{
    id: string;
    amount: number;
    type: string;
    reason: string;
    createdAt: string;
  }>;
  penaltyCount?: number;
  cashRidesCount?: number;
  cashCommissionTotal?: number;
  cashCommissionPending?: number;
  retentionAmount?: number;
  hasRetention?: boolean;
  netEarningsAfterPenalties?: number;
  normalEarnings?: { rides: number; gross: number; commission: number; tips: number; net: number };
  designatedEarnings?: {
    rides: number; gross: number; commission: number; tips: number; net: number;
    captainRides: number; followerRides: number; isApproximate: boolean;
  };
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
  crewRole?: 'captain' | 'follower' | 'solo';
  isDesignated?: boolean;
  followerStatus?: string | null;
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

const tr = (path: string) => i18n.t(`services.earningsService.${path}`) as string;

const mapSummary = (d: V2EarningsSummary): EarningsSummary => ({
  totalEarnings: d.total,
  totalRides: d.totalRides,
  averagePerRide: d.totalRides > 0 ? d.total / d.totalRides : 0,
  commission: d.commission,
  netEarnings: d.net,
});

type EarningsPeriod = 'today' | 'week' | 'month' | 'year' | 'all' | string;

const PERIOD_DAYS: Record<string, number> = {
  today: 1,
  week: 7,
  month: 30,
  year: 365,
  all: 365,
};

class EarningsService {
  /** Firma v1: getDriverEarnings(period) → { summary, rides }. */
  async getDriverEarnings(period?: EarningsPeriod): Promise<{ summary: EarningsSummary; rides: RideEarning[] }> {
    const days = PERIOD_DAYS[period ?? 'month'] ?? 30;
    const [data, rides] = await Promise.all([
      getDriverEarningsV2(days),
      getMyRides({ role: 'driver', status: 'completed', limit: 100 }).catch(() => []),
    ]);
    const mappedRides: RideEarning[] = rides.map((r: any) => ({
      id: r.id,
      clientName: r.clientName ?? 'Cliente',
      origin: r.originAddress ?? r.origin?.address ?? '',
      destination: r.destinationAddress ?? r.destination?.address ?? '',
      distance: r.estimatedDistance ?? 0,
      duration: r.estimatedDuration ?? 0,
      fare: r.finalFare ?? r.estimatedPrice ?? 0,
      commission: 0,
      netEarning: r.finalFare ?? r.estimatedPrice ?? 0,
      completedAt: r.completedAt ?? r.requestedAt ?? '',
      paymentStatus: 'confirmed',
      isDesignated: r.rideType === 'designated_driver',
    }));
    return { summary: mapSummary(data), rides: mappedRides };
  }

  async getDriverStats(): Promise<DriverStats> {
    // v2: /drivers/me/stats (agregados) + /rides/earnings para cortes temporales
    const [stats, today, week, month] = await Promise.all([
      getDriverStatsV2(),
      getDriverEarningsV2(1).catch(() => null),
      getDriverEarningsV2(7).catch(() => null),
      getDriverEarningsV2(30).catch(() => null),
    ]);
    return {
      totalRides: stats.totalRides,
      totalEarnings: stats.totalEarnings,
      totalCommission: 0,
      totalNetEarnings: stats.totalEarnings,
      averageFare: stats.totalRides > 0 ? stats.totalEarnings / stats.totalRides : 0,
      totalDistance: 0,
      totalDuration: 0,
      ridesToday: today?.totalRides ?? 0,
      earningsToday: today?.total ?? 0,
      ridesWeek: week?.totalRides ?? 0,
      earningsWeek: week?.total ?? 0,
      netEarningsWeek: week?.net ?? 0,
      ridesMonth: month?.totalRides ?? 0,
      earningsMonth: month?.total ?? 0,
      netEarningsMonth: month?.net ?? 0,
    };
  }

  async getEarningsByDay(days: number = 7): Promise<EarningByDay[]> {
    const data = await getDriverEarningsV2(days);
    return (data.byDay || []).map((d) => ({
      date: d.date,
      rides: d.rides,
      earnings: d.amount,
      commission: 0,
      netEarnings: d.amount,
    }));
  }

  /** Sin equivalente v2 (deuda por cash vive en /payments/pending). */
  async getPendingCashRides(): Promise<PendingCashRides> {
    const { getPendingPayments } = await import('../../api/payments');
    const { payments, totalDebt } = await getPendingPayments();
    return {
      rides: payments.map((p) => ({
        id: p.rideId,
        fare: p.total,
        commission: 0,
        completedAt: p.createdAt,
        clientName: '',
      })),
      totalPendingCommission: totalDebt,
      totalRides: payments.length,
    };
  }

  /** Recargas manuales son admin-only en v2 (POST /admin/drivers/{id}/recharges). */
  async createCashRecharge(_data: {
    amount: number;
    paymentMethod?: 'cash' | 'transfer' | 'other';
    referenceNumber?: string;
    notes?: string;
  }): Promise<CashRecharge> {
    throw new Error(tr('errors.rechargeNotAvailable') || 'Las recargas se gestionan por operación');
  }

  async getDriverRecharges(): Promise<CashRecharge[]> {
    const { recharges } = await getRechargeSummary(50);
    return recharges.map((r) => ({
      id: r.id,
      driverId: '',
      amount: r.amount,
      status: (r.status === 'confirmed' ? 'completed' : r.status) as CashRecharge['status'],
      paymentMethod: r.source === 'transfer' ? 'transfer' : 'cash',
      referenceNumber: r.externalReference,
      createdAt: r.createdAt,
    }));
  }
}

export default new EarningsService();
