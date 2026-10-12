/**
 * Biometric Authentications API - Versión Sequelize
 * Gestión de autenticación biométrica
 */

import * as functions from 'firebase-functions/v1';
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
    const {
      rideId,
      biometricType,
      context: ctx,
      userType,
      success,
      attemptNumber,
      errorMessage,
    } = data;
    const userId = context.auth.uid;

    if (!biometricType) {
      throw new functions.https.HttpsError('invalid-argument', 'biometricType es requerido');
    }

    const contextValue = typeof ctx === 'string' && ctx.trim() ? ctx.trim() : 'generic';
    const rawUserType = typeof userType === 'string' ? userType.trim().toLowerCase() : 'client';
    const userTypeValue =
      rawUserType === 'driver' || rawUserType === 'designated_driver' || rawUserType === 'client'
        ? rawUserType
        : 'client';
    const successValue = success === false ? false : true;
    const parsedAttemptNumber = Number(attemptNumber);
    const attemptNumberValue =
      Number.isFinite(parsedAttemptNumber) && parsedAttemptNumber > 0
        ? Math.floor(parsedAttemptNumber)
        : 1;
    const errorMessageValue =
      typeof errorMessage === 'string' && errorMessage.trim().length > 0 ? errorMessage.trim() : null;

    console.log(`🔐 [createBiometricAuth] Creando autenticación biométrica: ${biometricType} · context=${contextValue} · userType=${userTypeValue} · success=${successValue} · attempt=${attemptNumberValue}`);

    const auth = await bioAuthRepo.create({
      ride_id: rideId || null,
      user_id: userId,
      user_type: userTypeValue,
      biometric_type: biometricType,
      context: contextValue,
      success: successValue,
      attempt_number: attemptNumberValue,
      error_message: errorMessageValue,
      attempted_at: new Date(),
    });

    return {
      success: true,
      auth: {
        id: auth.id,
        userId: auth.user_id,
        rideId: auth.ride_id,
        biometricType: auth.biometric_type,
        success: auth.success,
        attemptNumber: auth.attempt_number,
        errorMessage: auth.error_message,
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
        success: a.success,
        attemptNumber: a.attempt_number,
        errorMessage: a.error_message,
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
    const { authId, status, success } = data;

    if (!authId) {
      throw new functions.https.HttpsError('invalid-argument', 'authId es requerido');
    }

    const resolvedSuccess =
      typeof success === 'boolean'
        ? success
        : String(status || '').toLowerCase().trim() === 'completed';

    console.log(`✏️ [updateBiometricAuthStatus] Actualizando resultado: ${authId} -> success=${resolvedSuccess}`);

    const auth = await bioAuthRepo.update(authId, { success: resolvedSuccess });

    return {
      success: true,
      auth: {
        id: auth.id,
        success: auth.success,
      },
    };
  } catch (error: any) {
    console.error('❌ [updateBiometricAuthStatus] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
