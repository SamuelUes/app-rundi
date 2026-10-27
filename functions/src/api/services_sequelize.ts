/**
 * Services API - Versión Sequelize
 * Gestión de servicios disponibles
 */

import * as functions from 'firebase-functions/v1';
import { ServiceRepository } from '../sequelize/repositories/ServiceRepository';
import { requireAdmin } from '../utils/sessionUtils';
import sequelize, { isSequelizeAvailable } from '../sequelize/config/database';
import { supabaseGet } from '../supabase/rest';

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
    const featuresByService = new Map<string, any[]>();
    let featuresCatalogAvailable = true;

    try {
      const assignments = await supabaseGet(
        'service_feature_assignments',
        { enabled: true },
        'service_id,configuration,features!inner(code,name,description,enabled,starts_at,ends_at,start_time,end_time,timezone,pricing_type,pricing_value,priority,stackable,metadata)',
        { limit: 1000, requireServiceRole: true },
      ) as Array<Record<string, any>>;

      for (const assignment of assignments) {
        const feature = assignment.features;
        if (assignment.enabled !== true || feature?.enabled !== true || !feature.code) continue;

        const configuration = assignment.configuration ?? {};
        const options = featuresByService.get(String(assignment.service_id)) ?? [];
        options.push({
          code: String(feature.code),
          name: String(feature.name ?? feature.code),
          description: feature.description ?? null,
          pricingType: String(configuration.pricing_type ?? feature.pricing_type ?? 'none'),
          pricingValue: Number(configuration.pricing_value ?? feature.pricing_value ?? 0),
          priority: Number(configuration.priority ?? feature.priority ?? 100),
          stackable: configuration.stackable === undefined
            ? feature.stackable !== false
            : configuration.stackable === true,
          startTime: feature.start_time ?? null,
          endTime: feature.end_time ?? null,
          timezone: feature.timezone ?? 'America/Managua',
          startsAt: feature.starts_at ?? null,
          endsAt: feature.ends_at ?? null,
          metadata: feature.metadata ?? {},
        });
        featuresByService.set(String(assignment.service_id), options);
      }
    } catch (featureError) {
      featuresCatalogAvailable = false;
      console.error('❌ [getServices] No se pudo cargar el catálogo de features:', featureError);
    }

    return {
      success: true,
      count: services.length,
      featuresCatalogAvailable,
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
        features: featuresByService.get(String(s.id)) ?? [],
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
  const adminUid = await requireAdmin(context);

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

    // Al cambiar commission_rate, propagar el admin real a
    // service_commission_history (el trigger lee app.current_user_id).
    let service;
    if (isSequelizeAvailable && updateData.commission_rate !== undefined) {
      service = await sequelize.transaction(async (t) => {
        await sequelize.query('SET LOCAL app.current_user_id = :uid', {
          replacements: { uid: String(adminUid) },
          transaction: t,
        });
        return await serviceRepo.update(serviceId, updateData, t);
      });
    } else {
      service = await serviceRepo.update(serviceId, updateData);
    }

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
