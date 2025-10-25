/**
 * Driver Services Sync API - Sincronizar servicios de conductores a Supabase
 */

import * as functions from 'firebase-functions';
import pool from '../config/database';

/**
 * Sincronizar servicio de conductor a PostgreSQL
 */
export const syncDriverServiceToSupabase = functions.https.onCall(
  async (data, context) => {
    const {
      driverId,
      serviceId,
      customCommissionRate,
      expiresAt,
      notes,
    } = data;

    if (!driverId || !serviceId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'driverId y serviceId son requeridos'
      );
    }

    const client = await pool.connect();
    try {
      console.log('💾 Sincronizando servicio de conductor:', {
        driverId,
        serviceId,
      });

      // Verificar si ya existe
      const existingResult = await client.query(
        `SELECT id FROM driver_services 
         WHERE driver_id = $1 AND service_id = $2`,
        [driverId, serviceId]
      );

      if (existingResult.rows.length > 0) {
        // Actualizar si ya existe
        const updateResult = await client.query(
          `UPDATE driver_services SET
            custom_commission_rate = $1,
            expires_at = $2,
            notes = $3,
            is_active = true,
            updated_at = NOW()
          WHERE driver_id = $4 AND service_id = $5
          RETURNING *`,
          [
            customCommissionRate || null,
            expiresAt || null,
            notes || null,
            driverId,
            serviceId,
          ]
        );

        const service = updateResult.rows[0];
        console.log('✅ Servicio actualizado:', service.id);

        return {
          success: true,
          driverService: service,
          message: 'Servicio actualizado correctamente',
          isUpdate: true,
        };
      } else {
        // Insertar si no existe
        const insertResult = await client.query(
          `INSERT INTO driver_services (
            driver_id, service_id, custom_commission_rate,
            expires_at, notes, is_active, is_approved, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, true, false, NOW(), NOW())
          RETURNING *`,
          [
            driverId,
            serviceId,
            customCommissionRate || null,
            expiresAt || null,
            notes || null,
          ]
        );

        const service = insertResult.rows[0];
        console.log('✅ Servicio sincronizado:', service.id);

        return {
          success: true,
          driverService: service,
          message: 'Servicio sincronizado correctamente',
          isUpdate: false,
        };
      }
    } catch (error: any) {
      console.error('❌ Error sincronizando servicio:', error);
      throw new functions.https.HttpsError('internal', error.message);
    } finally {
      client.release();
    }
  }
);

/**
 * Sincronizar múltiples servicios en lote
 */
export const syncDriverServicesBatch = functions.https.onCall(
  async (data, context) => {
    const { driverId, services } = data;

    if (!driverId || !Array.isArray(services) || services.length === 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'driverId y services (array) son requeridos'
      );
    }

    const client = await pool.connect();
    try {
      console.log(
        `💾 Sincronizando ${services.length} servicios para conductor ${driverId}`
      );

      await client.query('BEGIN');

      const insertedServices = [];

      for (const s of services) {
        const result = await client.query(
          `INSERT INTO driver_services (
            driver_id, service_id, custom_commission_rate,
            expires_at, notes, is_active, is_approved, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, true, false, NOW(), NOW())
          ON CONFLICT (driver_id, service_id) 
          DO UPDATE SET
            custom_commission_rate = EXCLUDED.custom_commission_rate,
            expires_at = EXCLUDED.expires_at,
            notes = EXCLUDED.notes,
            is_active = true,
            updated_at = NOW()
          RETURNING *`,
          [
            driverId,
            s.serviceId,
            s.customCommissionRate || null,
            s.expiresAt || null,
            s.notes || null,
          ]
        );

        insertedServices.push(result.rows[0]);
      }

      await client.query('COMMIT');

      console.log(`✅ ${insertedServices.length} servicios sincronizados`);

      return {
        success: true,
        count: insertedServices.length,
        services: insertedServices,
      };
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('❌ Error sincronizando servicios:', error);
      throw new functions.https.HttpsError('internal', error.message);
    } finally {
      client.release();
    }
  }
);
