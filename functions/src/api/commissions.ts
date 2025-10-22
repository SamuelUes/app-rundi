/**
 * Commissions API - Desglose de comisiones por método de pago
 */

import * as functions from 'firebase-functions';
import pool from '../config/database';

/**
 * Obtener desglose de comisiones por método de pago
 * Muestra al conductor cuánto debe en comisiones de efectivo vs pagos bancarios
 */
export const getCommissionBreakdown = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { period = 'month' } = data; // 'today', 'week', 'month'
  const driverId = context.auth.uid;

  // Calcular fechas según período
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
  }

  const endDate = now;

  const client = await pool.connect();
  try {
    // Obtener comisiones agrupadas por método de pago y tipo de viaje
    const result = await client.query(
      `SELECT 
        p.payment_method,
        r.ride_type,
        COUNT(*) as total_rides,
        SUM(r.final_fare) as total_fare,
        SUM(p.commission) as total_commission
       FROM rides r
       INNER JOIN payments p ON r.id = p.ride_id
       WHERE r.driver_id = $1
       AND r.status = 'completed'
       AND r.completed_at BETWEEN $2 AND $3
       GROUP BY p.payment_method, r.ride_type`,
      [driverId, startDate.toISOString(), endDate.toISOString()]
    );

    // Organizar datos con nuevas tasas de comisión
    const breakdown: any = {
      cash: {
        normal_car: { rides: 0, fare: 0, commission: 0, rate: 11 },
        normal_motorcycle: { rides: 0, fare: 0, commission: 0, rate: 7.5 },
        designated: { rides: 0, fare: 0, commission: 0, rate: 25 },
        total: { rides: 0, fare: 0, commission: 0 },
      },
      card: {
        normal_car: { rides: 0, fare: 0, commission: 0, rate: 11 },
        normal_motorcycle: { rides: 0, fare: 0, commission: 0, rate: 7.5 },
        designated: { rides: 0, fare: 0, commission: 0, rate: 25 },
        total: { rides: 0, fare: 0, commission: 0 },
      },
      totals: {
        rides: 0,
        fare: 0,
        commission: 0,
      },
    };

    result.rows.forEach((row) => {
      // Agrupar stripe y card_local como 'card'
      const method = row.payment_method === 'cash' ? 'cash' : 'card';
      const rideType = row.ride_type === 'designated_driver' ? 'designated' : 'normal';
      
      const rides = parseInt(row.total_rides);
      const fare = parseFloat(row.total_fare || '0');
      const commission = parseFloat(row.total_commission || '0');

      // Agregar a tipo específico
      breakdown[method][rideType].rides += rides;
      breakdown[method][rideType].fare += fare;
      breakdown[method][rideType].commission += commission;

      // Agregar a total del método
      breakdown[method].total.rides += rides;
      breakdown[method].total.fare += fare;
      breakdown[method].total.commission += commission;

      // Agregar a totales generales
      breakdown.totals.rides += rides;
      breakdown.totals.fare += fare;
      breakdown.totals.commission += commission;
    });

    console.log(`📊 Desglose de comisiones para conductor ${driverId}:`, {
      period,
      cashCommission: breakdown.cash.total.commission,
      cardCommission: breakdown.card.total.commission,
      totalCommission: breakdown.totals.commission,
    });

    return {
      success: true,
      breakdown,
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    };
  } catch (error: any) {
    console.error('❌ Error obteniendo desglose de comisiones:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});
