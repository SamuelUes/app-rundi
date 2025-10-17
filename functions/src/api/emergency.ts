/**
 * Emergency API - Registro de llamadas de emergencia
 */

import * as functions from 'firebase-functions';
import pool from '../config/database';
import { logAnalyticsEvent, AnalyticsEvents } from '../utils/analyticsUtils';

/**
 * Registrar llamada de emergencia
 */
export const logEmergencyCall = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const {
    emergencyType, // 'police' o 'ambulance'
    emergencyNumber, // '118' o '102'
    latitude,
    longitude,
    address,
    rideId,
    notes,
  } = data;

  const userId = context.auth.uid;

  // Validar parámetros
  if (!emergencyType || !emergencyNumber) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Tipo y número de emergencia son requeridos'
    );
  }

  // Determinar rol del usuario (driver o client)
  // Por ahora asumimos que viene en el token o lo inferimos
  const userRole = data.userRole || 'client'; // Debería venir del token o contexto

  const client = await pool.connect();
  try {
    // Insertar en Supabase
    const result = await client.query(
      `INSERT INTO emergency_calls (
        user_id, user_role, emergency_type, emergency_number,
        lat, lng, address, ride_id, notes, call_status, called_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING *`,
      [
        userId,
        userRole,
        emergencyType,
        emergencyNumber,
        latitude || null,
        longitude || null,
        address || null,
        rideId || null,
        notes || null,
        'initiated',
      ]
    );

    const emergencyCall = result.rows[0];

    console.log(`🚨 Llamada de emergencia registrada: ${emergencyCall.id}`);
    console.log(`   Usuario: ${userId}, Tipo: ${emergencyType}, Número: ${emergencyNumber}`);

    // Log analytics event
    await logAnalyticsEvent({
      userId,
      eventType: AnalyticsEvents.ERROR_OCCURRED, // Usar como evento de emergencia
      eventData: {
        emergencyCallId: emergencyCall.id,
        emergencyType,
        emergencyNumber,
        rideId: rideId || null,
        hasLocation: !!(latitude && longitude),
      },
      platform: 'mobile',
    });

    return {
      success: true,
      emergencyCallId: emergencyCall.id,
      message: 'Llamada de emergencia registrada',
    };
  } catch (error: any) {
    console.error('❌ Error registrando llamada de emergencia:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

/**
 * Actualizar estado de llamada de emergencia
 */
export const updateEmergencyCallStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { emergencyCallId, status } = data;

  if (!emergencyCallId || !status) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'ID de llamada y status son requeridos'
    );
  }

  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE emergency_calls 
       SET call_status = $1, updated_at = NOW() 
       WHERE id = $2 AND user_id = $3`,
      [status, emergencyCallId, context.auth.uid]
    );

    console.log(`✅ Estado de llamada de emergencia actualizado: ${emergencyCallId} -> ${status}`);

    return {
      success: true,
      message: 'Estado actualizado',
    };
  } catch (error: any) {
    console.error('❌ Error actualizando estado de emergencia:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

/**
 * Obtener historial de llamadas de emergencia del usuario
 */
export const getEmergencyCalls = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { limit = 10 } = data;

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM emergency_calls 
       WHERE user_id = $1 
       ORDER BY called_at DESC 
       LIMIT $2`,
      [context.auth.uid, limit]
    );

    return {
      success: true,
      calls: result.rows,
    };
  } catch (error: any) {
    console.error('❌ Error obteniendo llamadas de emergencia:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});
