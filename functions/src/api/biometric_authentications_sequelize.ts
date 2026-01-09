/**
 * Biometric Authentications API - Versión Sequelize
 * Gestión de autenticación biométrica
 */

import * as functions from 'firebase-functions';
import { BiometricAuthenticationRepository } from '../sequelize/repositories/BiometricAuthenticationRepository';

const bioAuthRepo = new BiometricAuthenticationRepository();

/**
 * Crear autenticación biométrica
 */
export const createBiometricAuth = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { rideId, biometricType, context: ctx, userType } = data;
    const userId = context.auth.uid;

    if (!biometricType) {
      throw new functions.https.HttpsError('invalid-argument', 'biometricType es requerido');
    }

    const contextValue = typeof ctx === 'string' && ctx.trim() ? ctx.trim() : 'generic';
    const userTypeValue = typeof userType === 'string' && userType.trim() ? userType.trim() : 'client';

    console.log(`🔐 [createBiometricAuth] Creando autenticación biométrica: ${biometricType} · context=${contextValue} · userType=${userTypeValue}`);

    const auth = await bioAuthRepo.create({
      ride_id: rideId || null,
      user_id: userId,
      user_type: userTypeValue,
      biometric_type: biometricType,
      context: contextValue,
      success: true,
      attempt_number: 1,
      attempted_at: new Date(),
      status: 'completed',
    });

    return {
      success: true,
      auth: {
        id: auth.id,
        userId: auth.user_id,
        rideId: auth.ride_id,
        biometricType: auth.biometric_type,
        status: auth.status,
        createdAt: auth.created_at,
      },
    };
  } catch (error: any) {
    console.error('❌ [createBiometricAuth] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener autenticaciones biométricas del usuario
 */
export const getUserBiometricAuths = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const userId = context.auth.uid;

    console.log(`🔐 [getUserBiometricAuths] Obteniendo autenticaciones del usuario: ${userId}`);

    const auths = await bioAuthRepo.findByUserId(userId);

    return {
      success: true,
      count: auths.length,
      auths: auths.map((a: any) => ({
        id: a.id,
        biometricType: a.biometric_type,
        status: a.status,
        createdAt: a.created_at,
      })),
    };
  } catch (error: any) {
    console.error('❌ [getUserBiometricAuths] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Actualizar estado de autenticación biométrica
 */
export const updateBiometricAuthStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { authId, status } = data;

    if (!authId || !status) {
      throw new functions.https.HttpsError('invalid-argument', 'authId y status son requeridos');
    }

    console.log(`✏️ [updateBiometricAuthStatus] Actualizando estado: ${authId} -> ${status}`);

    const auth = await bioAuthRepo.update(authId, { status });

    return {
      success: true,
      auth: {
        id: auth.id,
        status: auth.status,
      },
    };
  } catch (error: any) {
    console.error('❌ [updateBiometricAuthStatus] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
