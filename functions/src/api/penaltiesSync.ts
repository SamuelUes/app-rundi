/**
 * Penalties Sync API - Sincronizar penalizaciones a Supabase
 */

import * as functions from 'firebase-functions';
import pool from '../config/database';

/**
 * Sincronizar penalización a PostgreSQL
 * Se llama desde el Frontend cuando se crea una penalización
 */
export const syncPenaltyToSupabase = functions.https.onCall(
  async (data, context) => {
    const {
      driverId,
      rideId,
      penaltyType,
      amount,
      reason,
      progressPercentage,
    } = data;

    // Validar datos requeridos
    if (!driverId || !penaltyType || amount === undefined) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Faltan datos requeridos: driverId, penaltyType, amount'
      );
    }

    const client = await pool.connect();
    try {
      console.log('💾 Sincronizando penalización a PostgreSQL:', {
        driverId,
        rideId,
        penaltyType,
        amount,
      });

      // Verificar si ya existe (deduplicación)
      const checkResult = await client.query(
        `SELECT id FROM driver_penalties 
         WHERE driver_id = $1 AND ride_id = $2 AND penalty_type = $3 AND amount = $4
         AND created_at > NOW() - INTERVAL '5 minutes'`,
        [driverId, rideId || null, penaltyType, amount]
      );

      if (checkResult.rows.length > 0) {
        console.log('⚠️ Penalización duplicada, ignorando');
        return {
          success: true,
          message: 'Penalización ya existe',
          isDuplicate: true,
        };
      }

      // Insertar penalización
      const insertResult = await client.query(
        `INSERT INTO driver_penalties (
          driver_id, ride_id, penalty_type, amount, reason, 
          progress_percentage, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW(), NOW())
        RETURNING *`,
        [
          driverId,
          rideId || null,
          penaltyType,
          parseFloat(amount),
          reason || null,
          progressPercentage || null,
        ]
      );

      const penalty = insertResult.rows[0];
      console.log('✅ Penalización sincronizada:', penalty.id);

      return {
        success: true,
        penalty,
        message: 'Penalización sincronizada correctamente',
      };
    } catch (error: any) {
      console.error('❌ Error sincronizando penalización:', error);
      throw new functions.https.HttpsError('internal', error.message);
    } finally {
      client.release();
    }
  }
);

/**
 * Sincronizar múltiples penalizaciones en lote
 */
export const syncPenaltiesBatch = functions.https.onCall(
  async (data, context) => {
    // Validar autenticación (solo admin o sistema interno)
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Usuario no autenticado'
      );
    }

    const { penalties } = data;

    if (!Array.isArray(penalties) || penalties.length === 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'penalties debe ser un array no vacío'
      );
    }

    const client = await pool.connect();
    try {
      console.log(`💾 Sincronizando ${penalties.length} penalizaciones`);

      await client.query('BEGIN');

      const insertedPenalties = [];

      for (const p of penalties) {
        const result = await client.query(
          `INSERT INTO driver_penalties (
            driver_id, ride_id, penalty_type, amount, reason, 
            progress_percentage, status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW(), NOW())
          RETURNING *`,
          [
            p.driverId,
            p.rideId || null,
            p.penaltyType,
            parseFloat(p.amount),
            p.reason || null,
            p.progressPercentage || null,
          ]
        );

        insertedPenalties.push(result.rows[0]);
      }

      await client.query('COMMIT');

      console.log(`✅ ${insertedPenalties.length} penalizaciones sincronizadas`);

      return {
        success: true,
        count: insertedPenalties.length,
        penalties: insertedPenalties,
      };
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('❌ Error sincronizando lote:', error);
      throw new functions.https.HttpsError('internal', error.message);
    } finally {
      client.release();
    }
  }
);
