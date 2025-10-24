/**
 * Phone Login API
 * Cloud Functions para login con número telefónico y validación SMS
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import pool from "../config/database";
import { validateData } from "../utils/validation";
import { z } from "zod";

// Schema para validar solicitud de código
const RequestLoginCodeSchema = z.object({
  phone: z.string().regex(/^\+505\d{8}$/),
});

// Schema para validar verificación de código
const VerifyLoginCodeSchema = z.object({
  phone: z.string().regex(/^\+505\d{8}$/),
  code: z.string().length(6).regex(/^\d+$/),
});

/**
 * Solicitar código SMS para login
 * Verifica que el usuario existe y envía código SMS
 */
export const requestLoginCode = functions.https.onCall(async (data, context) => {
  try {
    // Validar datos
    const validatedData = validateData(RequestLoginCodeSchema, data);
    const { phone } = validatedData;

    console.log(`📱 Solicitando código SMS para login: ${phone}`);

    // Verificar que el usuario existe en PostgreSQL
    const client = await pool.connect();
    try {
      const userResult = await client.query(
        `SELECT id, user_id, phone FROM drivers WHERE phone = $1 LIMIT 1`,
        [phone]
      );

      if (userResult.rows.length === 0) {
        throw new functions.https.HttpsError(
          "not-found",
          "No existe usuario registrado con este número telefónico"
        );
      }

      console.log(`✅ Usuario encontrado: ${userResult.rows[0].user_id}`);

      // Generar código SMS (6 dígitos)
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

      // Guardar código en Redis o en tabla temporal
      // Por ahora, guardaremos en Firebase Realtime Database
      await admin.database().ref(`smsVerification/${phone}`).set({
        code,
        expiresAt: expiresAt.getTime(),
        attempts: 0,
        createdAt: Date.now(),
      });

      console.log(`✅ Código SMS generado y guardado: ${code}`);

      // Aquí iría la lógica para enviar SMS real
      // Por ahora, solo registramos el código
      console.log(`📨 SMS enviado a ${phone}: Tu código es ${code}`);

      return {
        success: true,
        message: `Código enviado a ${phone}`,
      };
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("❌ Error solicitando código:", error);
    
    if (error.code && error.code.includes("/")) {
      throw error;
    }

    throw new functions.https.HttpsError(
      "internal",
      error.message || "Error al solicitar código SMS"
    );
  }
});

/**
 * Verificar código SMS y hacer login
 * Valida el código y retorna datos del usuario
 */
export const verifyLoginCode = functions.https.onCall(async (data, context) => {
  try {
    // Validar datos
    const validatedData = validateData(VerifyLoginCodeSchema, data);
    const { phone, code } = validatedData;

    console.log(`🔐 Verificando código SMS para login: ${phone}`);

    // Obtener código guardado
    const smsSnapshot = await admin.database().ref(`smsVerification/${phone}`).once("value");
    const smsData = smsSnapshot.val();

    if (!smsData) {
      throw new functions.https.HttpsError(
        "not-found",
        "No se encontró solicitud de código. Por favor solicita un nuevo código."
      );
    }

    // Verificar que no haya expirado
    if (Date.now() > smsData.expiresAt) {
      await admin.database().ref(`smsVerification/${phone}`).remove();
      throw new functions.https.HttpsError(
        "failed-precondition",
        "El código ha expirado. Por favor solicita un nuevo código."
      );
    }

    // Verificar intentos
    if (smsData.attempts >= 3) {
      await admin.database().ref(`smsVerification/${phone}`).remove();
      throw new functions.https.HttpsError(
        "permission-denied",
        "Demasiados intentos fallidos. Por favor solicita un nuevo código."
      );
    }

    // Verificar código
    if (code !== smsData.code) {
      // Incrementar intentos
      await admin.database().ref(`smsVerification/${phone}`).update({
        attempts: smsData.attempts + 1,
      });

      throw new functions.https.HttpsError(
        "invalid-argument",
        "Código incorrecto. Por favor intenta de nuevo."
      );
    }

    console.log(`✅ Código verificado correctamente`);

    // Obtener datos del usuario desde PostgreSQL
    const client = await pool.connect();
    try {
      const userResult = await client.query(
        `SELECT id, user_id, phone FROM drivers WHERE phone = $1 LIMIT 1`,
        [phone]
      );

      if (userResult.rows.length === 0) {
        throw new Error("Usuario no encontrado");
      }

      const driverData = userResult.rows[0];
      const userId = driverData.user_id;

      // Obtener datos del usuario desde Firestore
      const userDoc = await admin.firestore().collection("users").doc(userId).get();
      const userData = userDoc.data();

      if (!userData) {
        throw new Error("Datos del usuario no encontrados");
      }

      // Generar token personalizado
      const customToken = await admin.auth().createCustomToken(userId);

      console.log(`✅ Login exitoso para usuario: ${userId}`);

      // Limpiar código SMS
      await admin.database().ref(`smsVerification/${phone}`).remove();

      return {
        success: true,
        user: {
          id: userId,
          email: userData.email,
          name: userData.name,
          phone: userData.phone,
          role: userData.role,
          profilePhoto: userData.profilePhoto,
        },
        token: customToken,
        message: "Login exitoso",
      };
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("❌ Error verificando código:", error);
    
    if (error.code && error.code.includes("/")) {
      throw error;
    }

    throw new functions.https.HttpsError(
      "internal",
      error.message || "Error al verificar código"
    );
  }
});
