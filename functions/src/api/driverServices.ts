/**
 * Driver Services API - Funciones completas para gestión de servicios de conductores
 * Firebase Functions implementation
 */

import * as functions from 'firebase-functions';
import pool from '../config/database';
import { validateData } from '../utils/validation';
import {
  AssignServiceToDriverInputSchema,
  ApproveDriverServiceInputSchema,
  GetCommissionForRideInputSchema,
} from '../schemas/service.schema';

// ============================================
// GET DRIVER SERVICES - Obtener servicios de un conductor
// ============================================
export const getDriverServices = functions.https.onCall(async (data, context) => {
  const { driverId, includeInactive = false } = data;

  if (!driverId) {
    throw new functions.https.HttpsError('invalid-argument', 'driverId es requerido');
  }

  console.log(`📋 [getDriverServices] Obteniendo servicios del conductor: ${driverId}`);

  const client = await pool.connect();
  try {
    // Validar que el conductor existe
    const driverCheck = await client.query(
      `SELECT id FROM drivers WHERE id = $1`,
      [driverId]
    );

    if (driverCheck.rows.length === 0) {
      throw new functions.https.HttpsError('not-found', 'Conductor no encontrado');
    }

    // Obtener servicios del conductor
    const query = `
      SELECT 
        ds.id,
        ds.driver_id,
        ds.service_id,
        ds.custom_commission_rate,
        ds.is_active,
        ds.is_approved,
        ds.approved_at,
        ds.assigned_at,
        ds.expires_at,
        ds.notes,
        s.name as service_name,
        s.code as service_code,
        s.commission_rate as base_commission_rate,
        s.base_price,
        s.price_per_km,
        s.price_per_minute,
        s.minimum_fare,
        s.vehicle_types,
        s.requires_special_license
      FROM driver_services ds
      JOIN services s ON ds.service_id = s.id
      WHERE ds.driver_id = $1
        ${!includeInactive ? 'AND ds.is_active = true' : ''}
        AND (ds.expires_at IS NULL OR ds.expires_at > NOW())
      ORDER BY ds.assigned_at DESC
    `;

    const result = await client.query(query, [driverId]);

    console.log(`✅ [getDriverServices] ${result.rows.length} servicios encontrados`);

    return {
      success: true,
      services: result.rows,
      count: result.rows.length,
    };
  } catch (error: any) {
    console.error('❌ [getDriverServices] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

// ============================================
// GET COMMISSION FOR RIDE - Calcular comisión para un viaje
// ============================================
export const getCommissionForRide = functions.https.onCall(async (data, context) => {
  // Validar datos
  const validatedData = validateData(GetCommissionForRideInputSchema, data);
  const { driverId, serviceId, amount } = validatedData;

  console.log(`💰 [getCommissionForRide] Calculando comisión para viaje:`, {
    driverId,
    serviceId,
    amount,
  });

  const client = await pool.connect();
  try {
    // 1. Validar que el conductor existe
    const driverCheck = await client.query(
      `SELECT id FROM drivers WHERE id = $1`,
      [driverId]
    );

    if (driverCheck.rows.length === 0) {
      throw new functions.https.HttpsError('not-found', 'Conductor no encontrado');
    }

    // 2. Validar que el servicio existe
    const serviceCheck = await client.query(
      `SELECT id, commission_rate FROM services WHERE id = $1`,
      [serviceId]
    );

    if (serviceCheck.rows.length === 0) {
      throw new functions.https.HttpsError('not-found', 'Servicio no encontrado');
    }

    const baseCommissionRate = serviceCheck.rows[0].commission_rate;

    // 3. Obtener comisión personalizada del conductor (si existe)
    const driverServiceResult = await client.query(
      `SELECT custom_commission_rate, is_active, expires_at
       FROM driver_services
       WHERE driver_id = $1 AND service_id = $2`,
      [driverId, serviceId]
    );

    let commissionRate = baseCommissionRate;

    if (driverServiceResult.rows.length > 0) {
      const driverService = driverServiceResult.rows[0];

      // Validar que el servicio está activo
      if (!driverService.is_active) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'El servicio no está activo para este conductor'
        );
      }

      // Validar que no ha expirado
      if (driverService.expires_at && new Date(driverService.expires_at) < new Date()) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'El servicio ha expirado para este conductor'
        );
      }

      // Usar comisión personalizada si existe
      if (driverService.custom_commission_rate !== null) {
        commissionRate = driverService.custom_commission_rate;
      }
    }

    // 4. Calcular comisión
    const commission = Math.round(amount * commissionRate * 100) / 100;

    console.log(`✅ [getCommissionForRide] Comisión calculada:`, {
      baseCommissionRate,
      customCommissionRate: driverServiceResult.rows[0]?.custom_commission_rate || null,
      finalCommissionRate: commissionRate,
      amount,
      commission,
    });

    return {
      success: true,
      commission,
      commissionRate,
      baseCommissionRate,
      customCommissionRate: driverServiceResult.rows[0]?.custom_commission_rate || null,
      amount,
    };
  } catch (error: any) {
    console.error('❌ [getCommissionForRide] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

// ============================================
// ASSIGN SERVICE TO DRIVER - Asignar servicio a conductor
// ============================================
export const assignServiceToDriver = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  // Validar datos
  const validatedData = validateData(AssignServiceToDriverInputSchema, data);
  const { driverId, serviceId, customCommissionRate, expiresAt, notes } = validatedData;

  console.log(`➕ [assignServiceToDriver] Asignando servicio a conductor:`, {
    driverId,
    serviceId,
  });

  const client = await pool.connect();
  try {
    // 1. Validar que el conductor existe
    const driverCheck = await client.query(
      `SELECT id FROM drivers WHERE id = $1`,
      [driverId]
    );

    if (driverCheck.rows.length === 0) {
      throw new functions.https.HttpsError('not-found', 'Conductor no encontrado');
    }

    // 2. Validar que el servicio existe
    const serviceCheck = await client.query(
      `SELECT id, commission_rate FROM services WHERE id = $1`,
      [serviceId]
    );

    if (serviceCheck.rows.length === 0) {
      throw new functions.https.HttpsError('not-found', 'Servicio no encontrado');
    }

    const baseCommissionRate = serviceCheck.rows[0].commission_rate;

    // 3. Validar comisión personalizada si se proporciona
    if (customCommissionRate !== null && customCommissionRate !== undefined) {
      if (customCommissionRate < 0 || customCommissionRate > 1) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Comisión debe estar entre 0 y 1'
        );
      }

      if (customCommissionRate < baseCommissionRate) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          `Comisión personalizada no puede ser menor que la comisión base (${baseCommissionRate})`
        );
      }
    }

    // 4. Verificar si ya existe
    const existingResult = await client.query(
      `SELECT id FROM driver_services 
       WHERE driver_id = $1 AND service_id = $2`,
      [driverId, serviceId]
    );

    let result;

    if (existingResult.rows.length > 0) {
      // Actualizar si ya existe
      result = await client.query(
        `UPDATE driver_services SET
          custom_commission_rate = $1,
          expires_at = $2,
          notes = $3,
          is_active = true,
          updated_at = NOW()
        WHERE driver_id = $4 AND service_id = $5
        RETURNING *`,
        [customCommissionRate || null, expiresAt || null, notes || null, driverId, serviceId]
      );

      console.log(`✅ [assignServiceToDriver] Servicio actualizado`);
    } else {
      // Insertar si no existe
      result = await client.query(
        `INSERT INTO driver_services (
          driver_id, service_id, custom_commission_rate,
          expires_at, notes, is_active, is_approved, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, true, false, NOW(), NOW())
        RETURNING *`,
        [customCommissionRate || null, expiresAt || null, notes || null, driverId, serviceId]
      );

      console.log(`✅ [assignServiceToDriver] Servicio asignado`);
    }

    return {
      success: true,
      driverService: result.rows[0],
      isUpdate: existingResult.rows.length > 0,
    };
  } catch (error: any) {
    console.error('❌ [assignServiceToDriver] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

// ============================================
// APPROVE DRIVER SERVICE - Aprobar servicio de conductor (Admin)
// ============================================
export const approveDriverService = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  // TODO: Verificar que el usuario es admin
  // const isAdmin = await checkIfUserIsAdmin(context.auth.uid);
  // if (!isAdmin) {
  //   throw new functions.https.HttpsError('permission-denied', 'Solo admins pueden aprobar servicios');
  // }

  // Validar datos
  const validatedData = validateData(ApproveDriverServiceInputSchema, data);
  const { driverServiceId, approved = true } = validatedData;

  console.log(`✅ [approveDriverService] ${approved ? 'Aprobando' : 'Rechazando'} servicio:`, {
    driverServiceId,
  });

  const client = await pool.connect();
  try {
    // Obtener el servicio del conductor
    const driverServiceResult = await client.query(
      `SELECT * FROM driver_services WHERE id = $1`,
      [driverServiceId]
    );

    if (driverServiceResult.rows.length === 0) {
      throw new functions.https.HttpsError('not-found', 'Servicio del conductor no encontrado');
    }

    // Actualizar estado de aprobación
    const result = await client.query(
      `UPDATE driver_services SET
        is_approved = $1,
        approved_by = $2,
        approved_at = NOW(),
        updated_at = NOW()
      WHERE id = $3
      RETURNING *`,
      [approved, context.auth.uid, driverServiceId]
    );

    console.log(`✅ [approveDriverService] Servicio ${approved ? 'aprobado' : 'rechazado'}`);

    return {
      success: true,
      driverService: result.rows[0],
    };
  } catch (error: any) {
    console.error('❌ [approveDriverService] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

// ============================================
// DEACTIVATE DRIVER SERVICE - Desactivar servicio de conductor
// ============================================
export const deactivateDriverService = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { driverServiceId } = data;

  if (!driverServiceId) {
    throw new functions.https.HttpsError('invalid-argument', 'driverServiceId es requerido');
  }

  console.log(`🔴 [deactivateDriverService] Desactivando servicio:`, {
    driverServiceId,
  });

  const client = await pool.connect();
  try {
    // Obtener el servicio del conductor
    const driverServiceResult = await client.query(
      `SELECT * FROM driver_services WHERE id = $1`,
      [driverServiceId]
    );

    if (driverServiceResult.rows.length === 0) {
      throw new functions.https.HttpsError('not-found', 'Servicio del conductor no encontrado');
    }

    // Desactivar
    const result = await client.query(
      `UPDATE driver_services SET
        is_active = false,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
      [driverServiceId]
    );

    console.log(`✅ [deactivateDriverService] Servicio desactivado`);

    return {
      success: true,
      driverService: result.rows[0],
    };
  } catch (error: any) {
    console.error('❌ [deactivateDriverService] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});
