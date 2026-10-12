/**
 * Services API - Versión Sequelize
 * Gestión de servicios disponibles
 */

import * as functions from 'firebase-functions/v1';
import { ServiceRepository } from '../sequelize/repositories/ServiceRepository';
import { requireAdmin } from '../utils/sessionUtils';

const serviceRepo = new ServiceRepository();

/**
 * Crear servicio
 */
export const createService = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);

  try {
    const { name, description, commissionRate, basePrice, code, isActive = true, isFeatured = false, status } = data;

    if (!name || commissionRate === undefined) {
      throw new functions.https.HttpsError('invalid-argument', 'name y commissionRate son requeridos');
    }

    console.log(`🎯 [createService] Creando servicio: ${name}`);

    const service = await serviceRepo.create({
      name,
      code: code || null,
      description: description || null,
      commission_rate: commissionRate,
      base_price: basePrice ?? null,
      is_active: status ? String(status).toLowerCase() === 'active' : Boolean(isActive),
      is_featured: Boolean(isFeatured),
    });

    return {
      success: true,
      service: {
        id: service.id,
        name: service.name,
        description: service.description,
        commissionRate: service.commission_rate,
        basePrice: service.base_price,
        code: service.code,
        isActive: !!service.is_active,
        isFeatured: !!service.is_featured,
        // Back-compat
        status: service.is_active ? 'active' : 'inactive',
        createdAt: service.created_at,
      },
    };
  } catch (error: any) {
    console.error('❌ [createService] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener todos los servicios
 */
export const getServices = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    console.log(`🎯 [getServices] Obteniendo servicios`);

    const services = await serviceRepo.findActive();

    return {
      success: true,
      count: services.length,
      services: services.map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        commissionRate: parseFloat(s.commission_rate.toString()),
        basePrice: s.base_price !== null && s.base_price !== undefined
          ? parseFloat(s.base_price.toString())
          : null,
        code: s.code,
        isActive: !!s.is_active,
        isFeatured: !!s.is_featured,
        status: s.is_active ? 'active' : 'inactive',
      })),
    };
  } catch (error: any) {
    console.error('❌ [getServices] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener servicio por ID
 */
export const getServiceById = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { serviceId } = data;

    if (!serviceId) {
      throw new functions.https.HttpsError('invalid-argument', 'serviceId es requerido');
    }

    console.log(`🎯 [getServiceById] Obteniendo servicio: ${serviceId}`);

    const service = await serviceRepo.findById(serviceId);

    if (!service) {
      throw new functions.https.HttpsError('not-found', 'Servicio no encontrado');
    }

    return {
      success: true,
      service: {
        id: service.id,
        name: service.name,
        description: service.description,
        commissionRate: parseFloat(service.commission_rate.toString()),
        basePrice: service.base_price !== null && service.base_price !== undefined
          ? parseFloat(service.base_price.toString())
          : null,
        code: service.code,
        isActive: !!service.is_active,
        isFeatured: !!service.is_featured,
        status: service.is_active ? 'active' : 'inactive',
      },
    };
  } catch (error: any) {
    console.error('❌ [getServiceById] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Actualizar servicio
 */
export const updateService = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);

  try {
    const { serviceId, name, description, commissionRate, status, basePrice, code, isActive, isFeatured } = data;

    if (!serviceId) {
      throw new functions.https.HttpsError('invalid-argument', 'serviceId es requerido');
    }

    console.log(`✏️ [updateService] Actualizando servicio: ${serviceId}`);

    const updateData: any = {};
    if (name) updateData.name = name;
    if (description) updateData.description = description;
    if (commissionRate !== undefined) updateData.commission_rate = commissionRate;
    if (basePrice !== undefined) updateData.base_price = basePrice;
    if (code !== undefined) updateData.code = code;
    if (status !== undefined) updateData.is_active = String(status).toLowerCase() === 'active';
    if (isActive !== undefined) updateData.is_active = Boolean(isActive);
    if (isFeatured !== undefined) updateData.is_featured = Boolean(isFeatured);

    const service = await serviceRepo.update(serviceId, updateData);

    return {
      success: true,
      service: {
        id: service.id,
        name: service.name,
        commissionRate: parseFloat(service.commission_rate.toString()),
        basePrice: service.base_price !== null && service.base_price !== undefined
          ? parseFloat(service.base_price.toString())
          : null,
        code: service.code,
        isActive: !!service.is_active,
        isFeatured: !!service.is_featured,
        status: service.is_active ? 'active' : 'inactive',
      },
    };
  } catch (error: any) {
    console.error('❌ [updateService] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
