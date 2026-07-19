/**
 * SMS Verification Codes API - Versión Sequelize
 * Gestión de códigos de verificación SMS
 */

import * as functions from 'firebase-functions';
import { SmsVerificationCodeRepository } from '../sequelize/repositories/SmsVerificationCodeRepository';

const smsCodeRepo = new SmsVerificationCodeRepository();

/**
 * Crear código SMS
 */
export const createSmsCode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { rideId, code, expiresAt } = data;
    const userId = context.auth.uid;

    if (!code || !expiresAt) {
      throw new functions.https.HttpsError('invalid-argument', 'code y expiresAt son requeridos');
    }

    console.log(`📱 [createSmsCode] Creando código SMS para usuario: ${userId}`);

    const smsCode = await smsCodeRepo.create({
      ride_id: rideId || null,
      user_id: userId,
      code,
      code_hash: code,
      verified: false,
      expires_at: new Date(expiresAt),
    });

    return {
      success: true,
      smsCode: {
        id: smsCode.id,
        code: smsCode.code,
        verified: smsCode.verified,
        expiresAt: smsCode.expires_at,
      },
    };
  } catch (error: any) {
    console.error('❌ [createSmsCode] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Verificar código SMS
 */
export const verifySmsCode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { code } = data;

    if (!code) {
      throw new functions.https.HttpsError('invalid-argument', 'code es requerido');
    }

    console.log(`📱 [verifySmsCode] Verificando código SMS: ${code}`);

    const smsCode = await smsCodeRepo.findByCode(code);

    if (!smsCode) {
      throw new functions.https.HttpsError('not-found', 'Código no encontrado');
    }

    if (new Date() > smsCode.expires_at) {
      throw new functions.https.HttpsError('failed-precondition', 'Código expirado');
    }

    await smsCodeRepo.update(smsCode.id, { verified: true, verified_at: new Date() });

    return {
      success: true,
      message: 'Código verificado correctamente',
    };
  } catch (error: any) {
    console.error('❌ [verifySmsCode] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener códigos del usuario
 */
export const getUserSmsCodes = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const userId = context.auth.uid;

    console.log(`📱 [getUserSmsCodes] Obteniendo códigos del usuario: ${userId}`);

    const codes = await smsCodeRepo.findByUserId(userId);

    return {
      success: true,
      count: codes.length,
      codes: codes.map((c: any) => ({
        id: c.id,
        status: c.status,
        expiresAt: c.expires_at,
      })),
    };
  } catch (error: any) {
    console.error('❌ [getUserSmsCodes] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
