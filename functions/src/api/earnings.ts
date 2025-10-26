/**
 * Earnings API - Ganancias del conductor
 */

import * as functions from 'firebase-functions';
import pool from '../config/database';

interface EarningsSummary {
  totalEarnings: number;
  totalRides: number;
  averagePerRide: number;
  commission: number;
  netEarnings: number;
  penalties?: number;
  penaltyCount?: number;
  cashRidesCount?: number;
  cashCommissionTotal?: number;
  cashCommissionPending?: number;
  retentionAmount?: number;
  hasRetention?: boolean;
  netEarningsAfterPenalties?: number;
}

interface RideEarning {
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

/**
 * Obtener ganancias del conductor
 */
export const getDriverEarnings = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const {
    period = 'today', // 'today', 'week', 'month', 'custom'
    startDate,
    endDate,
  } = data;

  const driverId = context.auth.uid;

  const client = await pool.connect();
  try {
    // Calcular fechas según el período
    let dateFilter = '';
    const now = new Date();
    
    if (period === 'today') {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      dateFilter = `AND r.completed_at >= '${today.toISOString()}'`;
    } else if (period === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      dateFilter = `AND r.completed_at >= '${weekAgo.toISOString()}'`;
    } else if (period === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      dateFilter = `AND r.completed_at >= '${monthStart.toISOString()}'`;
    } else if (period === 'custom' && startDate && endDate) {
      dateFilter = `AND r.completed_at BETWEEN '${startDate}' AND '${endDate}'`;
    }

    // Obtener viajes completados con información de pagos
    const ridesResult = await client.query(
      `SELECT 
        r.id,
        r.actual_distance,
        r.actual_duration,
        r.final_fare,
        r.completed_at,
        r.ride_type,
        p.commission,
        p.status as payment_status,
        -- ✅ NUEVO: Obtener ubicaciones desde ride_locations
        (SELECT address FROM ride_locations WHERE ride_id = r.id AND location_type = 'origin' LIMIT 1) as origin_address,
        (SELECT address FROM ride_locations WHERE ride_id = r.id AND location_type = 'destination' LIMIT 1) as destination_address
       FROM rides r
       LEFT JOIN payments p ON r.id = p.ride_id
       WHERE r.driver_id = $1 
       AND r.status = 'completed'
       ${dateFilter}
       ORDER BY r.completed_at DESC`,
      [driverId]
    );

    // Calcular comisión según tipo de viaje
    // 10% para viajes normales (moto o automóvil)
    // 15% para conductor designado (solo automóvil)
    const COMMISSION_RATE_NORMAL = 0.10;
    const COMMISSION_RATE_DESIGNATED = 0.15;

    const rides: RideEarning[] = ridesResult.rows.map((row) => {
      const fare = parseFloat(row.final_fare || '0');
      const rideType = row.ride_type || 'normal';
      
      // Si ya existe comisión en payments, usar ese valor
      // Si no, calcular según el tipo de viaje
      let commission: number;
      if (row.commission) {
        commission = parseFloat(row.commission);
      } else {
        const commissionRate = rideType === 'designated_driver' 
          ? COMMISSION_RATE_DESIGNATED 
          : COMMISSION_RATE_NORMAL;
        commission = fare * commissionRate;
      }
      
      const netEarning = fare - commission;

      return {
        id: row.id,
        clientName: 'Cliente', // Podríamos obtener el nombre del cliente si lo necesitamos
        origin: row.origin_address || 'N/A',
        destination: row.destination_address || 'N/A',
        distance: row.actual_distance || 0,
        duration: row.actual_duration || 0,
        fare,
        commission,
        netEarning,
        completedAt: row.completed_at,
        paymentStatus: row.payment_status || 'pending',
      };
    });

    // Calcular resumen
    const totalEarnings = rides.reduce((sum, ride) => sum + ride.fare, 0);
    const totalCommission = rides.reduce((sum, ride) => sum + ride.commission, 0);
    const netEarnings = totalEarnings - totalCommission;
    const totalRides = rides.length;
    const averagePerRide = totalRides > 0 ? netEarnings / totalRides : 0;

    // Obtener penalizaciones pendientes
    const penaltiesResult = await client.query(
      `SELECT 
        SUM(amount) as total_penalties,
        COUNT(*) as penalty_count
       FROM driver_penalties
       WHERE driver_id = $1 
       AND status = 'pending'`,
      [driverId]
    );

    const totalPenalties = parseFloat(penaltiesResult.rows[0]?.total_penalties || '0');
    const penaltyCount = parseInt(penaltiesResult.rows[0]?.penalty_count || '0');

    // Obtener viajes en efectivo y recargas
    const cashRidesResult = await client.query(
      `SELECT 
        COUNT(*) as cash_rides_count,
        SUM(p.commission) as cash_commission_total
       FROM rides r
       LEFT JOIN payments p ON r.id = p.ride_id
       WHERE r.driver_id = $1
       AND r.status = 'completed'
       AND r.payment_type = 'cash'
       AND r.completed_at BETWEEN $2 AND $3`,
      [driverId, startDate, endDate]
    );

    const cashRidesCount = parseInt(cashRidesResult.rows[0]?.cash_rides_count || '0');
    const cashCommissionTotal = parseFloat(cashRidesResult.rows[0]?.cash_commission_total || '0');

    // DESHABILITADO: Sistema de recargas eliminado
    // const rechargesResult = await client.query(
    //   `SELECT 
    //     SUM(commission_total) as total_recharged
    //    FROM cash_recharges
    //    WHERE driver_id = $1
    //    AND status = 'verified'
    //    AND created_at BETWEEN $2 AND $3`,
    //   [driverId, startDate, endDate]
    // );
    // const totalRecharged = parseFloat(rechargesResult.rows[0]?.total_recharged || '0');

    const totalRecharged = 0; // Sin sistema de recargas

    // Calcular comisiones pendientes de recargar
    const pendingCashCommission = cashCommissionTotal - totalRecharged;

    // DESHABILITADO: Sin retención por ahora
    let retentionAmount = 0;
    let hasRetention = false;

    // if (pendingCashCommission > 0) {
    //   hasRetention = true;
    //   retentionAmount = totalEarnings * 0.40;
    //   console.log(`⚠️ Conductor ${driverId} tiene comisiones en efectivo pendientes: C$${pendingCashCommission.toFixed(2)}`);
    //   console.log(`💸 Retención del 40%: C$${retentionAmount.toFixed(2)}`);
    // }

    // Ganancia neta después de penalizaciones y retenciones
    const netEarningsAfterPenalties = netEarnings - totalPenalties - retentionAmount;

    const summary: EarningsSummary = {
      totalEarnings,
      totalRides,
      averagePerRide,
      commission: totalCommission,
      netEarnings,
      penalties: totalPenalties,
      penaltyCount,
      cashRidesCount,
      cashCommissionTotal,
      cashCommissionPending: pendingCashCommission,
      retentionAmount,
      hasRetention,
      netEarningsAfterPenalties,
    };

    console.log(`📊 Ganancias calculadas para conductor ${driverId}:`, summary);

    return {
      success: true,
      summary,
      rides,
      period,
    };
  } catch (error: any) {
    console.error('❌ Error obteniendo ganancias:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

/**
 * Obtener estadísticas detalladas del conductor
 */
export const getDriverStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const driverId = context.auth.uid;

  const client = await pool.connect();
  try {
    // Estadísticas generales con cálculo dinámico de comisiones
    const statsResult = await client.query(
      `SELECT 
        COUNT(*) as total_rides,
        SUM(final_fare) as total_earnings,
        AVG(final_fare) as average_fare,
        SUM(actual_distance) as total_distance,
        SUM(actual_duration) as total_duration,
        SUM(
          CASE 
            WHEN COALESCE(p.commission, 0) > 0 THEN p.commission
            WHEN ride_type = 'designated_driver' THEN final_fare * 0.15
            ELSE final_fare * 0.10
          END
        ) as total_commission
       FROM rides r
       LEFT JOIN payments p ON r.id = p.ride_id
       WHERE r.driver_id = $1 
       AND r.status = 'completed'`,
      [driverId]
    );

    // Estadísticas por período con comisiones
    const todayResult = await client.query(
      `SELECT 
        COUNT(*) as rides_today,
        COALESCE(SUM(r.final_fare), 0) as earnings_today,
        COALESCE(SUM(
          CASE 
            WHEN COALESCE(p.commission, 0) > 0 THEN p.commission
            WHEN r.ride_type = 'designated_driver' THEN r.final_fare * 0.15
            ELSE r.final_fare * 0.10
          END
        ), 0) as commission_today
       FROM rides r
       LEFT JOIN payments p ON r.id = p.ride_id
       WHERE r.driver_id = $1 
       AND r.status = 'completed'
       AND r.completed_at >= CURRENT_DATE`,
      [driverId]
    );

    const weekResult = await client.query(
      `SELECT 
        COUNT(*) as rides_week,
        COALESCE(SUM(r.final_fare), 0) as earnings_week,
        COALESCE(SUM(
          CASE 
            WHEN COALESCE(p.commission, 0) > 0 THEN p.commission
            WHEN r.ride_type = 'designated_driver' THEN r.final_fare * 0.15
            ELSE r.final_fare * 0.10
          END
        ), 0) as commission_week
       FROM rides r
       LEFT JOIN payments p ON r.id = p.ride_id
       WHERE r.driver_id = $1 
       AND r.status = 'completed'
       AND r.completed_at >= CURRENT_DATE - INTERVAL '7 days'`,
      [driverId]
    );

    const monthResult = await client.query(
      `SELECT 
        COUNT(*) as rides_month,
        COALESCE(SUM(r.final_fare), 0) as earnings_month,
        COALESCE(SUM(
          CASE 
            WHEN COALESCE(p.commission, 0) > 0 THEN p.commission
            WHEN r.ride_type = 'designated_driver' THEN r.final_fare * 0.15
            ELSE r.final_fare * 0.10
          END
        ), 0) as commission_month
       FROM rides r
       LEFT JOIN payments p ON r.id = p.ride_id
       WHERE r.driver_id = $1 
       AND r.status = 'completed'
       AND r.completed_at >= DATE_TRUNC('month', CURRENT_DATE)`,
      [driverId]
    );

    const stats = statsResult.rows[0];
    const today = todayResult.rows[0];
    const week = weekResult.rows[0];
    const month = monthResult.rows[0];

    const totalEarnings = parseFloat(stats.total_earnings || '0');
    const totalCommission = parseFloat(stats.total_commission || '0');
    const earningsToday = parseFloat(today.earnings_today || '0');
    const commissionToday = parseFloat(today.commission_today || '0');
    const earningsWeek = parseFloat(week.earnings_week || '0');
    const commissionWeek = parseFloat(week.commission_week || '0');
    const earningsMonth = parseFloat(month.earnings_month || '0');
    const commissionMonth = parseFloat(month.commission_month || '0');

    return {
      success: true,
      stats: {
        // Totales históricos
        totalRides: parseInt(stats.total_rides || '0'),
        totalEarnings,
        totalCommission,
        totalNetEarnings: totalEarnings - totalCommission,
        averageFare: parseFloat(stats.average_fare || '0'),
        totalDistance: parseInt(stats.total_distance || '0'),
        totalDuration: parseInt(stats.total_duration || '0'),
        
        // Hoy
        ridesToday: parseInt(today.rides_today || '0'),
        earningsToday,
        netEarningsToday: earningsToday - commissionToday,
        
        // Esta semana
        ridesWeek: parseInt(week.rides_week || '0'),
        earningsWeek,
        netEarningsWeek: earningsWeek - commissionWeek,
        
        // Este mes
        ridesMonth: parseInt(month.rides_month || '0'),
        earningsMonth,
        netEarningsMonth: earningsMonth - commissionMonth,
      },
    };
  } catch (error: any) {
    console.error('❌ Error obteniendo estadísticas:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

/**
 * Obtener ganancias por día (para gráficas)
 */
export const getEarningsByDay = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { days = 7 } = data; // Últimos 7 días por defecto
  const driverId = context.auth.uid;

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT 
        DATE(r.completed_at) as date,
        COUNT(*) as rides,
        COALESCE(SUM(r.final_fare), 0) as earnings,
        COALESCE(SUM(
          CASE 
            WHEN COALESCE(p.commission, 0) > 0 THEN p.commission
            WHEN r.ride_type = 'designated_driver' THEN r.final_fare * 0.15
            ELSE r.final_fare * 0.10
          END
        ), 0) as commission
       FROM rides r
       LEFT JOIN payments p ON r.id = p.ride_id
       WHERE r.driver_id = $1 
       AND r.status = 'completed'
       AND r.completed_at >= CURRENT_DATE - INTERVAL '${days} days'
       GROUP BY DATE(r.completed_at)
       ORDER BY date ASC`,
      [driverId]
    );

    const earningsByDay = result.rows.map((row) => {
      const earnings = parseFloat(row.earnings);
      const commission = parseFloat(row.commission);
      return {
        date: row.date,
        rides: parseInt(row.rides),
        earnings,
        commission,
        netEarnings: earnings - commission,
      };
    });

    return {
      success: true,
      earningsByDay,
    };
  } catch (error: any) {
    console.error('❌ Error obteniendo ganancias por día:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});
