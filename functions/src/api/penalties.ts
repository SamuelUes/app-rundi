/**
 * Penalties API - Gestión de penalizaciones para conductores
 */

import * as functions from 'firebase-functions';
import pool from '../config/database';

/**
 * Obtener penalizaciones del conductor
 */
export const getDriverPenalties = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const {
    status = 'all', // 'all', 'pending', 'deducted', 'forgiven'
    startDate,
    endDate,
  } = data;

  const driverId = context.auth.uid;

  const client = await pool.connect();
  try {
    let statusFilter = '';
    if (status !== 'all') {
      statusFilter = `AND status = '${status}'`;
    }

    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = `AND created_at BETWEEN '${startDate}' AND '${endDate}'`;
    }

    // Obtener penalizaciones
    const penaltiesResult = await client.query(
      `SELECT 
        p.id,
        p.ride_id,
        p.penalty_type,
        p.amount,
        p.reason,
        p.progress_percentage,
        p.status,
        p.deducted_at,
        p.created_at,
        r.final_fare,
        -- ✅ NUEVO: Obtener ubicaciones desde ride_locations
        (SELECT address FROM ride_locations WHERE ride_id = r.id AND location_type = 'origin' LIMIT 1) as origin_address,
        (SELECT address FROM ride_locations WHERE ride_id = r.id AND location_type = 'destination' LIMIT 1) as destination_address
       FROM driver_penalties p
       LEFT JOIN rides r ON p.ride_id = r.id
       WHERE p.driver_id = $1
       ${statusFilter}
       ${dateFilter}
       ORDER BY p.created_at DESC`,
      [driverId]
    );

    const penalties = penaltiesResult.rows.map((row) => ({
      id: row.id,
      rideId: row.ride_id,
      penaltyType: row.penalty_type,
      amount: parseFloat(row.amount),
      reason: row.reason,
      progressPercentage: row.progress_percentage ? parseFloat(row.progress_percentage) : null,
      status: row.status,
      deductedAt: row.deducted_at,
      createdAt: row.created_at,
      ride: row.ride_id ? {
        origin: row.origin_address,
        destination: row.destination_address,
        fare: parseFloat(row.final_fare || '0'),
      } : null,
    }));

    // Calcular resumen
    const totalPending = penalties
      .filter((p) => p.status === 'pending')
      .reduce((sum, p) => sum + p.amount, 0);

    const totalDeducted = penalties
      .filter((p) => p.status === 'deducted')
      .reduce((sum, p) => sum + p.amount, 0);

    const totalForgiven = penalties
      .filter((p) => p.status === 'forgiven')
      .reduce((sum, p) => sum + p.amount, 0);

    console.log(`📊 Penalizaciones obtenidas para conductor ${driverId}:`, {
      total: penalties.length,
      pending: totalPending,
      deducted: totalDeducted,
      forgiven: totalForgiven,
    });

    return {
      success: true,
      penalties,
      summary: {
        totalPenalties: penalties.length,
        totalPending,
        totalDeducted,
        totalForgiven,
        totalAmount: totalPending + totalDeducted + totalForgiven,
      },
    };
  } catch (error: any) {
    console.error('❌ Error obteniendo penalizaciones:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

/**
 * Marcar penalizaciones como descontadas (para uso administrativo)
 */
export const markPenaltiesAsDeducted = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { penaltyIds } = data; // Array de IDs de penalizaciones

  if (!Array.isArray(penaltyIds) || penaltyIds.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'penaltyIds debe ser un array no vacío');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Actualizar penalizaciones a 'deducted'
    const result = await client.query(
      `UPDATE driver_penalties 
       SET status = $1, deducted_at = NOW(), updated_at = NOW()
       WHERE id = ANY($2::uuid[])
       AND status = 'pending'
       RETURNING *`,
      ['deducted', penaltyIds]
    );

    await client.query('COMMIT');

    console.log(`✅ ${result.rows.length} penalizaciones marcadas como descontadas`);

    return {
      success: true,
      deductedCount: result.rows.length,
      penalties: result.rows,
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('❌ Error marcando penalizaciones:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

/**
 * Perdonar penalización (para uso administrativo)
 */
export const forgivePenalty = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { penaltyId, reason } = data;

  if (!penaltyId) {
    throw new functions.https.HttpsError('invalid-argument', 'penaltyId es requerido');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Actualizar penalización a 'forgiven'
    const result = await client.query(
      `UPDATE driver_penalties 
       SET status = $1, 
           reason = CONCAT(reason, ' | PERDONADA: ', $2),
           updated_at = NOW()
       WHERE id = $3
       AND status = 'pending'
       RETURNING *`,
      ['forgiven', reason || 'Sin razón especificada', penaltyId]
    );

    if (result.rows.length === 0) {
      throw new Error('Penalización no encontrada o ya fue procesada');
    }

    await client.query('COMMIT');

    console.log(`✅ Penalización ${penaltyId} perdonada`);

    return {
      success: true,
      penalty: result.rows[0],
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('❌ Error perdonando penalización:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

/**
 * Obtener resumen de penalizaciones por período (para reportes)
 */
export const getPenaltiesSummary = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const {
    driverId, // Opcional, si no se proporciona, obtiene de todos los conductores
    period = 'month', // 'week', 'month', 'year'
  } = data;

  const client = await pool.connect();
  try {
    let dateFilter = '';
    if (period === 'week') {
      dateFilter = `AND created_at >= CURRENT_DATE - INTERVAL '7 days'`;
    } else if (period === 'month') {
      dateFilter = `AND created_at >= DATE_TRUNC('month', CURRENT_DATE)`;
    } else if (period === 'year') {
      dateFilter = `AND created_at >= DATE_TRUNC('year', CURRENT_DATE)`;
    }

    let driverFilter = '';
    const params: any[] = [];
    if (driverId) {
      driverFilter = `AND driver_id = $1`;
      params.push(driverId);
    }

    const result = await client.query(
      `SELECT 
        COUNT(*) as total_penalties,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'deducted' THEN 1 ELSE 0 END) as deducted_count,
        SUM(CASE WHEN status = 'forgiven' THEN 1 ELSE 0 END) as forgiven_count,
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount,
        SUM(CASE WHEN status = 'deducted' THEN amount ELSE 0 END) as deducted_amount,
        SUM(CASE WHEN status = 'forgiven' THEN amount ELSE 0 END) as forgiven_amount,
        SUM(amount) as total_amount
       FROM driver_penalties
       WHERE 1=1
       ${driverFilter}
       ${dateFilter}`,
      params
    );

    const summary = result.rows[0];

    return {
      success: true,
      period,
      summary: {
        totalPenalties: parseInt(summary.total_penalties || '0'),
        pendingCount: parseInt(summary.pending_count || '0'),
        deductedCount: parseInt(summary.deducted_count || '0'),
        forgivenCount: parseInt(summary.forgiven_count || '0'),
        pendingAmount: parseFloat(summary.pending_amount || '0'),
        deductedAmount: parseFloat(summary.deducted_amount || '0'),
        forgivenAmount: parseFloat(summary.forgiven_amount || '0'),
        totalAmount: parseFloat(summary.total_amount || '0'),
      },
    };
  } catch (error: any) {
    console.error('❌ Error obteniendo resumen de penalizaciones:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});
