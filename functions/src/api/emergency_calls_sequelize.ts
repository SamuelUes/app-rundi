/**
 * Emergency Calls API - Versión Sequelize
 * Gestión de llamadas de emergencia
 */

import * as functions from 'firebase-functions/v1';
import { EmergencyCallRepository } from '../sequelize/repositories/EmergencyCallRepository';

const emergencyRepo = new EmergencyCallRepository();

/**
 * Crear llamada de emergencia
 */
export const createEmergencyCall = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { rideId, emergencyType, locationLat, locationLng } = data;
    const userId = context.auth.uid;

    if (!emergencyType) {
      throw new functions.https.HttpsError('invalid-argument', 'emergencyType es requerido');
    }

    console.log(`🚨 [createEmergencyCall] Creando llamada de emergencia: ${emergencyType}`);

    const call = await emergencyRepo.create({
      user_id: userId,
      user_role: 'driver',
      ride_id: rideId || null,
      emergency_type: emergencyType,
      emergency_number: emergencyType === 'police' ? '118' : '102',
      lat: locationLat || null,
      lng: locationLng || null,
      call_status: 'initiated',
    });

    return {
      success: true,
      call: {
        id: call.id,
        userId: call.user_id,
        userRole: call.user_role,
        rideId: call.ride_id,
        emergencyType: call.emergency_type,
        emergencyNumber: call.emergency_number,
        lat: call.lat,
        lng: call.lng,
        address: call.address,
        callStatus: call.call_status,
        createdAt: call.created_at,
      },
    };
  } catch (error: any) {
    console.error('❌ [createEmergencyCall] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener llamadas de emergencia del usuario
 */
export const getUserEmergencyCalls = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const userId = context.auth.uid;

    console.log(`🚨 [getUserEmergencyCalls] Obteniendo llamadas del usuario: ${userId}`);

    const calls = await emergencyRepo.findByUserId(userId);

    return {
      success: true,
      count: calls.length,
      calls: calls.map((c: any) => ({
        id: c.id,
        emergencyType: c.emergency_type,
        emergencyNumber: c.emergency_number,
        callStatus: c.call_status,
        createdAt: c.created_at,
      })),
    };
  } catch (error: any) {
    console.error('❌ [getUserEmergencyCalls] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Actualizar estado de llamada de emergencia
 */
export const updateEmergencyCallStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { callId, status } = data;

    if (!callId || !status) {
      throw new functions.https.HttpsError('invalid-argument', 'callId y status son requeridos');
    }

    console.log(`✏️ [updateEmergencyCallStatus] Actualizando estado: ${callId} -> ${status}`);

    const call = await emergencyRepo.update(callId, { call_status: status });

    return {
      success: true,
      call: {
        id: call.id,
        callStatus: call.call_status,
      },
    };
  } catch (error: any) {
    console.error('❌ [updateEmergencyCallStatus] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
