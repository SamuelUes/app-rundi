/**
 * Users API - Migrado de Backend/src/users/users.service.ts
 * Firebase Functions implementation
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import pool from "../config/database";

/**
 * Obtener Perfil de usuario
 */
export const getUserProfile = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { userId } = data;
  const targetUserId = userId || context.auth.uid;

  try {
    // Obtener datos de Firestore
    const userDoc = await admin.firestore().collection("users").doc(targetUserId).get();
    
    if (!userDoc.exists) {
      throw new Error("Usuario no encontrado");
    }

    const userData = userDoc.data();

    // Si es conductor, obtener datos adicionales de PostgreSQL
    if (userData?.role === "driver") {
      const client = await pool.connect();
      try {
        const driverResult = await client.query(
          `SELECT d.*, v.plate, v.brand, v.model, v.year, v.color
           FROM drivers d
           LEFT JOIN vehicles v ON d.id = v.driver_id
           WHERE d.user_id = $1`,
          [targetUserId]
        );

        if (driverResult.rows.length > 0) {
          userData.driverData = driverResult.rows[0];
        }
      } finally {
        client.release();
      }
    }

    return {
      success: true,
      user: userData,
    };
  } catch (error: any) {
    console.error("❌ Error obteniendo Perfil:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Actualizar Perfil de usuario
 */
export const updateUserProfile = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { name, phone, profilePhoto, notificationsEnabled } = data;

  try {
    // Actualizar en Firestore
    const updateData: any = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (profilePhoto !== undefined) updateData.profilePhoto = profilePhoto;
    if (notificationsEnabled !== undefined) updateData.notificationsEnabled = notificationsEnabled;

    await admin.firestore().collection("users").doc(context.auth.uid).update(updateData);

    // También actualizar en Firebase Auth si hay cambios de nombre
    if (name) {
      await admin.auth().updateUser(context.auth.uid, {
        displayName: name,
      });
    }

    console.log(`✅ Perfil actualizado: ${context.auth.uid}`);

    return {
      success: true,
      message: "Perfil actualizado exitosamente",
    };
  } catch (error: any) {
    console.error("❌ Error actualizando Perfil:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});
