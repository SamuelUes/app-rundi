/**
 * Services API - Gestión de servicios y comisiones
 * Firebase Functions implementation
 */

import * as functions from 'firebase-functions';
import pool from '../config/database';
import { validateData } from '../utils/validation';
import {
  CreateServiceInputSchema,
  UpdateServiceInputSchema,
  AssignServiceToDriverInputSchema,
  ApproveDriverServiceInputSchema,
} from '../schemas/service.schema';

// ============================================
// GET ALL SERVICES
// ============================================
export const getServices = functions.https.onCall(async (data, context) => {
  console.log('📋 [getServices] Obteniendo servicios');

  const client = await pool.connect();
  try {
    const { includeInactive = false } = data;

    const query = includeInactive
      ? 'SELECT * FROM services ORDER BY display_order ASC, name ASC'
      : 'SELECT * FROM services WHERE is_active = true ORDER BY display_order ASC, name ASC';

    const result = await client.query(query);

    console.log(`✅ [getServices] ${result.rows.length} servicios encontrados`);

    return {
      success: true,
      services: result.rows,
    };
  } catch (error: any) {
    console.error('❌ [getServices] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

// ============================================
// GET SERVICE BY ID
// ============================================
export const getServiceById = functions.https.onCall(async (data, context) => {
  const { serviceId } = data;

  if (!serviceId) {
    throw new functions.https.HttpsError('invalid-argument', 'serviceId es requerido');
  }

  console.log(`📋 [getServiceById] Obteniendo servicio: ${serviceId}`);

  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM services WHERE id = $1',
      [serviceId]
    );

    if (result.rows.length === 0) {
      throw new functions.https.HttpsError('not-found', 'Servicio no encontrado');
    }

    return {
      success: true,
      service: result.rows[0],
    };
  } catch (error: any) {
    console.error('❌ [getServiceById] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

// ============================================
// CREATE SERVICE (Admin only)
// ============================================
export const createService = functions.https.onCall(async (data, context) => {
  // Verificar autenticación
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  // TODO: Verificar que el usuario es admin
  // const isAdmin = await checkIfUserIsAdmin(context.auth.uid);
  // if (!isAdmin) {
  //   throw new functions.https.HttpsError('permission-denied', 'Solo admins pueden crear servicios');
  // }

  // Validar datos
  const validatedData = validateData(CreateServiceInputSchema, data);

  console.log('➕ [createService] Creando servicio:', validatedData.name);

  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO services (
        name, description, code, commission_rate,
        base_price, price_per_km, price_per_minute, minimum_fare,
        vehicle_types, requires_special_license, max_distance_km,
        available_hours, icon, color, display_order,
        is_active, is_featured
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        validatedData.name,
        validatedData.description || null,
        validatedData.code,
        validatedData.commissionRate,
        validatedData.basePrice,
        validatedData.pricePerKm,
        validatedData.pricePerMinute,
        validatedData.minimumFare,
        JSON.stringify(validatedData.vehicleTypes || []),
        validatedData.requiresSpecialLicense,
        validatedData.maxDistanceKm || null,
        validatedData.availableHours ? JSON.stringify(validatedData.availableHours) : null,
        validatedData.icon || null,
        validatedData.color || null,
        validatedData.displayOrder,
        validatedData.isActive,
        validatedData.isFeatured,
      ]
    );

    console.log(`✅ [createService] Servicio creado: ${result.rows[0].id}`);

    return {
      success: true,
      service: result.rows[0],
      message: 'Servicio creado exitosamente',
    };
  } catch (error: any) {
    console.error('❌ [createService] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

// ============================================
// UPDATE SERVICE (Admin only)
// ============================================
export const updateService = functions.https.onCall(async (data, context) => {
  // Verificar autenticación
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { serviceId, ...updateData } = data;

  if (!serviceId) {
    throw new functions.https.HttpsError('invalid-argument', 'serviceId es requerido');
  }

  // Validar datos
  const validatedData = validateData(UpdateServiceInputSchema, updateData);

  console.log(`🔄 [updateService] Actualizando servicio: ${serviceId}`);

  const client = await pool.connect();
  try {
    // Construir query dinámicamente
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(validatedData).forEach(([key, value]) => {
      if (value !== undefined) {
        // Convertir camelCase a snake_case
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        updates.push(`${snakeKey} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    if (updates.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'No hay datos para actualizar');
    }

    values.push(serviceId);
    const query = `UPDATE services SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`;

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      throw new functions.https.HttpsError('not-found', 'Servicio no encontrado');
    }

    console.log(`✅ [updateService] Servicio actualizado: ${serviceId}`);

    return {
      success: true,
      service: result.rows[0],
      message: 'Servicio actualizado exitosamente',
    };
  } catch (error: any) {
    console.error('❌ [updateService] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

// ============================================
// ASSIGN SERVICE TO DRIVER (Admin only)
// ============================================
export const assignServiceToDriver = functions.https.onCall(async (data, context) => {
  // Verificar autenticación
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  // Validar datos
  const validatedData = validateData(AssignServiceToDriverInputSchema, data);

  console.log(`➕ [assignServiceToDriver] Asignando servicio ${validatedData.serviceId} a conductor ${validatedData.driverId}`);

  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO driver_services (
        driver_id, service_id, custom_commission_rate,
        expires_at, notes, is_active, is_approved, approved_by, approved_at
      ) VALUES ($1, $2, $3, $4, $5, true, false, NULL, NULL)
      ON CONFLICT (driver_id, service_id) 
      DO UPDATE SET
        custom_commission_rate = EXCLUDED.custom_commission_rate,
        expires_at = EXCLUDED.expires_at,
        notes = EXCLUDED.notes,
        is_active = true,
        updated_at = NOW()
      RETURNING *`,
      [
        validatedData.driverId,
        validatedData.serviceId,
        validatedData.customCommissionRate || null,
        validatedData.expiresAt || null,
        validatedData.notes || null,
      ]
    );

    console.log(`✅ [assignServiceToDriver] Servicio asignado: ${result.rows[0].id}`);

    return {
      success: true,
      driverService: result.rows[0],
      message: 'Servicio asignado exitosamente. Requiere aprobación de admin.',
    };
  } catch (error: any) {
    console.error('❌ [assignServiceToDriver] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

// ============================================
// APPROVE DRIVER SERVICE (Admin only)
// ============================================
export const approveDriverService = functions.https.onCall(async (data, context) => {
  // Verificar autenticación
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  // Validar datos
  const validatedData = validateData(ApproveDriverServiceInputSchema, data);

  console.log(`✅ [approveDriverService] ${validatedData.approved ? 'Aprobando' : 'Rechazando'} servicio: ${validatedData.driverServiceId}`);

  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE driver_services SET
        is_approved = $1,
        approved_by = $2,
        approved_at = $3,
        notes = COALESCE($4, notes),
        updated_at = NOW()
      WHERE id = $5
      RETURNING *`,
      [
        validatedData.approved,
        context.auth.uid,
        validatedData.approved ? new Date() : null,
        validatedData.notes || null,
        validatedData.driverServiceId,
      ]
    );

    if (result.rows.length === 0) {
      throw new functions.https.HttpsError('not-found', 'Asignación de servicio no encontrada');
    }

    console.log(`✅ [approveDriverService] Servicio ${validatedData.approved ? 'aprobado' : 'rechazado'}`);

    return {
      success: true,
      driverService: result.rows[0],
      message: validatedData.approved
        ? 'Servicio aprobado exitosamente'
        : 'Servicio rechazado',
    };
  } catch (error: any) {
    console.error('❌ [approveDriverService] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

// ============================================
// GET DRIVER SERVICES
// Obtiene los servicios asignados a un conductor
// ============================================
export const getDriverServices = functions.https.onCall(async (data, context) => {
  const { driverId } = data;

  if (!driverId) {
    throw new functions.https.HttpsError('invalid-argument', 'driverId es requerido');
  }

  console.log(`📋 [getDriverServices] Obteniendo servicios del conductor: ${driverId}`);

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM driver_active_services WHERE driver_id = $1`,
      [driverId]
    );

    console.log(`✅ [getDriverServices] ${result.rows.length} servicios encontrados`);

    return {
      success: true,
      services: result.rows,
    };
  } catch (error: any) {
    console.error('❌ [getDriverServices] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});
