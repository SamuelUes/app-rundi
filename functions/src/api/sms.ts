/**
 * SMS Functions
 * Funciones para enviar y validar códigos SMS via Twilio
 * 
 * Requisitos:
 * 1. Instalar: npm install twilio
 * 2. Configurar variables de entorno en Firebase:
 *    - TWILIO_ACCOUNT_SID
 *    - TWILIO_AUTH_TOKEN
 *    - TWILIO_PHONE_NUMBER
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Importar Twilio (se instala con: npm install twilio)
let twilio: any;
try {
  twilio = require('twilio');
} catch (error) {
  console.warn('⚠️ Twilio no está instalado. Instala con: npm install twilio');
}

// Configuración de Twilio desde Firebase Config
const getConfig = () => {
  try {
    const config = functions.config();
    return {
      accountSid: config.twilio?.account_sid || process.env.TWILIO_ACCOUNT_SID || '',
      authToken: config.twilio?.auth_token || process.env.TWILIO_AUTH_TOKEN || '',
      phoneNumber: config.twilio?.phone_number || process.env.TWILIO_PHONE_NUMBER || '+505XXXXXXXX',
    };
  } catch (error) {
    console.warn('⚠️ No se pudo obtener config de Firebase');
    return {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      phoneNumber: process.env.TWILIO_PHONE_NUMBER || '+505XXXXXXXX',
    };
  }
};

const config = getConfig();
const TWILIO_ACCOUNT_SID = config.accountSid;
const TWILIO_AUTH_TOKEN = config.authToken;
const TWILIO_PHONE_NUMBER = config.phoneNumber;

// Validar que las credenciales estén configuradas
if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
  console.warn('⚠️ ADVERTENCIA: Variables de Twilio no están configuradas');
  console.warn('   Configura: firebase functions:config:set twilio.account_sid="..." twilio.auth_token="..."');
}

// Crear cliente de Twilio
const twilioClient = twilio ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;

/**
 * Generar código aleatorio de 6 dígitos
 */
const generateCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Validar formato de teléfono Nicaragua (+505)
 */
const validatePhoneFormat = (phone: string): boolean => {
  const phoneRegex = /^\+505\d{8}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};

/**
 * Enviar código SMS
 * 
 * Parámetros:
 * - phone: Número telefónico en formato +505XXXXXXXX
 * 
 * Retorna:
 * - success: boolean
 * - message: string
 * - messageId: string (ID de Twilio)
 */
export const sendSmsCode = functions.https.onCall(async (data, context) => {
  const { phone } = data;

  console.log(`📱 Enviando código SMS a: ${phone}`);

  // ============================================
  // VALIDACIONES
  // ============================================

  // 1. Validar que el teléfono esté presente
  if (!phone) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Número telefónico requerido"
    );
  }

  // 2. Validar formato de teléfono
  if (!validatePhoneFormat(phone)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Formato de teléfono inválido. Usa +505 XXXX XXXX"
    );
  }

  // 3. Validar que Twilio esté configurado
  if (!twilioClient) {
    console.error('❌ Twilio no está configurado');
    throw new functions.https.HttpsError(
      "internal",
      "Servicio SMS no disponible. Por favor intenta más tarde."
    );
  }

  try {
    // ============================================
    // GENERAR Y GUARDAR CÓDIGO
    // ============================================

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

    // Guardar código en Firestore
    const smsRef = admin.firestore().collection('sms_codes').doc(phone);
    await smsRef.set({
      code,
      phone,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
      attempts: 0,
      verified: false,
    });

    // ============================================
    // ENVIAR SMS VIA TWILIO
    // ============================================

    const message = await twilioClient.messages.create({
      body: `Tu código de verificación es: ${code}\n\nEste código expira en 10 minutos.`,
      from: TWILIO_PHONE_NUMBER,
      to: phone,
    });

    console.log(`✅ SMS enviado: ${message.sid}`);

    return {
      success: true,
      message: "Código enviado correctamente",
      messageId: message.sid,
    };
  } catch (error: any) {
    console.error("❌ Error enviando SMS:", error);

    // Mapeo de errores de Twilio
    if (error.code === 21211) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Número telefónico inválido"
      );
    }

    if (error.code === 21614) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Número telefónico no permitido"
      );
    }

    throw new functions.https.HttpsError(
      "internal",
      `Error al enviar SMS: ${error.message}`
    );
  }
});

/**
 * Verificar código SMS
 * 
 * Parámetros:
 * - phone: Número telefónico
 * - code: Código de 6 dígitos
 * 
 * Retorna:
 * - success: boolean
 * - message: string
 */
export const verifySmsCode = functions.https.onCall(async (data, context) => {
  const { phone, code } = data;

  console.log(`🔐 Verificando código SMS para: ${phone}`);

  // ============================================
  // VALIDACIONES
  // ============================================

  // 1. Validar parámetros
  if (!phone || !code) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Teléfono y código requeridos"
    );
  }

  // 2. Validar formato de teléfono
  if (!validatePhoneFormat(phone)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Formato de teléfono inválido"
    );
  }

  // 3. Validar formato de código
  if (!code || code.length !== 6 || isNaN(Number(code))) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Código debe ser 6 dígitos"
    );
  }

  try {
    // ============================================
    // OBTENER CÓDIGO GUARDADO
    // ============================================

    const smsRef = admin.firestore().collection('sms_codes').doc(phone);
    const smsDoc = await smsRef.get();

    if (!smsDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "No hay código pendiente para este número"
      );
    }

    const smsData = smsDoc.data();

    // ============================================
    // VALIDAR CÓDIGO
    // ============================================

    // 1. Validar que no haya expirado
    const expiresAt = smsData?.expiresAt?.toDate?.() || new Date(smsData?.expiresAt);
    if (new Date() > expiresAt) {
      await smsRef.update({ verified: false });
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Código expirado. Por favor solicita uno nuevo."
      );
    }

    // 2. Validar número de intentos
    const attempts = smsData?.attempts || 0;
    if (attempts >= 3) {
      await smsRef.update({ verified: false });
      throw new functions.https.HttpsError(
        "permission-denied",
        "Demasiados intentos fallidos. Por favor solicita un nuevo código."
      );
    }

    // 3. Validar código
    if (smsData?.code !== code) {
      // Incrementar intentos
      await smsRef.update({
        attempts: attempts + 1,
      });

      throw new functions.https.HttpsError(
        "invalid-argument",
        "Código incorrecto"
      );
    }

    // ============================================
    // CÓDIGO VÁLIDO
    // ============================================

    // Marcar como verificado
    await smsRef.update({
      verified: true,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ Código verificado para: ${phone}`);

    return {
      success: true,
      message: "Código verificado correctamente",
    };
  } catch (error: any) {
    console.error("❌ Error verificando código:", error);

    // Si ya es un HttpsError, re-lanzarlo
    if (error.code && error.code.includes("/")) {
      throw error;
    }

    throw new functions.https.HttpsError(
      "internal",
      error.message || "Error al verificar código"
    );
  }
});

/**
 * Reenviar código SMS
 * 
 * Parámetros:
 * - phone: Número telefónico
 * 
 * Retorna:
 * - success: boolean
 * - message: string
 */
export const resendSmsCode = functions.https.onCall(async (data, context) => {
  const { phone } = data;

  console.log(`📱 Reenviando código SMS a: ${phone}`);

  // ============================================
  // VALIDACIONES
  // ============================================

  // 1. Validar teléfono
  if (!phone) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Número telefónico requerido"
    );
  }

  // 2. Validar formato
  if (!validatePhoneFormat(phone)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Formato de teléfono inválido"
    );
  }

  // 3. Validar Twilio
  if (!twilioClient) {
    throw new functions.https.HttpsError(
      "internal",
      "Servicio SMS no disponible"
    );
  }

  try {
    // ============================================
    // GENERAR NUEVO CÓDIGO
    // ============================================

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

    // Actualizar código en Firestore
    const smsRef = admin.firestore().collection('sms_codes').doc(phone);
    await smsRef.set({
      code,
      phone,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
      attempts: 0,
      verified: false,
    });

    // ============================================
    // ENVIAR SMS VIA TWILIO
    // ============================================

    const message = await twilioClient.messages.create({
      body: `Tu código de verificación es: ${code}\n\nEste código expira en 10 minutos.`,
      from: TWILIO_PHONE_NUMBER,
      to: phone,
    });

    console.log(`✅ SMS reenviado: ${message.sid}`);

    return {
      success: true,
      message: "Código reenviado correctamente",
      messageId: message.sid,
    };
  } catch (error: any) {
    console.error("❌ Error reenviando SMS:", error);

    throw new functions.https.HttpsError(
      "internal",
      error.message || "Error al reenviar código"
    );
  }
});

/**
 * Limpiar códigos SMS expirados
 * Se ejecuta cada hora
 */
export const cleanupExpiredSmsCode = functions.pubsub
  .schedule('every 1 hours')
  .timeZone('America/Managua')
  .onRun(async (context) => {
    console.log('🧹 Limpiando códigos SMS expirados...');

    try {
      const now = new Date();
      const smsRef = admin.firestore().collection('sms_codes');

      // Obtener todos los códigos expirados
      const expiredCodes = await smsRef
        .where('expiresAt', '<', now)
        .where('verified', '==', false)
        .get();

      console.log(`📊 Encontrados ${expiredCodes.size} códigos expirados`);

      // Eliminar códigos expirados
      const batch = admin.firestore().batch();
      expiredCodes.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      console.log(`✅ ${expiredCodes.size} códigos eliminados`);

      return { success: true, deletedCount: expiredCodes.size };
    } catch (error: any) {
      console.error('❌ Error limpiando códigos SMS:', error);
      return { success: false, error: error.message };
    }
  });
