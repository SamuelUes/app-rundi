import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import pool from "../config/database";

/**
 * Registrar usuario
 * Sincroniza: Firebase Auth + Firestore + PostgreSQL (si es conductor)
 */
export const register = functions.https.onCall(async (data, context) => {
  const { email, password, name, phone, role, driverData, vehicleData } = data;

  console.log(`📝 Registro iniciado: ${email} (${role})`);

  // ============================================
  // VALIDACIONES BÁSICAS
  // ============================================
  
  // 1. Campos requeridos
  if (!email || !password || !name || !role) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Faltan campos requeridos: email, password, nombre y rol"
    );
  }

  // 2. Validar formato de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Formato de email inválido"
    );
  }

  // 3. Validar longitud de password
  if (password.length < 6) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "La contraseña debe tener al menos 6 caracteres"
    );
  }

  // 4. Validar nombre
  if (name.trim().length < 2) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "El nombre debe tener al menos 2 caracteres"
    );
  }

  // 5. Validar rol
  if (!["client", "driver"].includes(role)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Rol inválido. Debe ser 'client' o 'driver'"
    );
  }

  // ============================================
  // VALIDACIONES DE CONDUCTOR
  // ============================================
  
  if (role === "driver") {
    // Verificar que existan los datos
    if (!driverData || !vehicleData) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Los conductores requieren datos de licencia y vehículo"
      );
    }

    // Validar datos de licencia
    if (!driverData.licenseNumber || driverData.licenseNumber.trim().length < 5) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Número de licencia inválido (mínimo 5 caracteres)"
      );
    }

    // Validar datos de vehículo
    if (!vehicleData.plate || vehicleData.plate.trim().length < 4) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Placa del vehículo inválida (mínimo 4 caracteres)"
      );
    }

    if (!vehicleData.brand || vehicleData.brand.trim().length < 2) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Marca del vehículo requerida"
      );
    }

    if (!vehicleData.model || vehicleData.model.trim().length < 2) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Modelo del vehículo requerido"
      );
    }

    if (!vehicleData.year || isNaN(vehicleData.year)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Año del vehículo inválido"
      );
    }

    // Validar año del vehículo
    const currentYear = new Date().getFullYear();
    if (vehicleData.year < 1900 || vehicleData.year > currentYear + 1) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `Año del vehículo debe estar entre 1900 y ${currentYear + 1}`
      );
    }

    if (!vehicleData.color || vehicleData.color.trim().length < 2) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Color del vehículo requerido"
      );
    }

    if (!vehicleData.type || !["sedan", "suv", "van", "moto"].includes(vehicleData.type)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Tipo de vehículo inválido. Debe ser: sedan, suv, van o moto"
      );
    }
  }

  // ============================================
  // VERIFICAR DUPLICADOS
  // ============================================

  try {
    // Verificar email duplicado en Firestore
    const existingUser = await admin.firestore()
      .collection("users")
      .where("email", "==", email.toLowerCase().trim())
      .get();

    if (!existingUser.empty) {
      throw new functions.https.HttpsError(
        "already-exists",
        "Este email ya está registrado"
      );
    }

    // Si es conductor, verificar licencia y placa duplicadas
    if (role === "driver") {
      const client = await pool.connect();
      try {
        // Verificar licencia duplicada
        const licenseCheck = await client.query(
          "SELECT id FROM drivers WHERE license_number = $1",
          [driverData.licenseNumber.trim()]
        );

        if (licenseCheck.rows.length > 0) {
          throw new functions.https.HttpsError(
            "already-exists",
            "Este número de licencia ya está registrado"
          );
        }

        // Verificar placa duplicada
        const plateCheck = await client.query(
          "SELECT id FROM vehicles WHERE UPPER(plate) = UPPER($1)",
          [vehicleData.plate.trim()]
        );

        if (plateCheck.rows.length > 0) {
          throw new functions.https.HttpsError(
            "already-exists",
            "Esta placa de vehículo ya está registrada"
          );
        }
      } finally {
        client.release();
      }
    }

  } catch (error: any) {
    // Si es un error que ya lanzamos, re-lanzarlo
    if (error.code === "already-exists") {
      throw error;
    }
    // Otros errores de verificación
    console.error("❌ Error verificando duplicados:", error);
  }

  // ============================================
  // CREAR USUARIO
  // ============================================

  try {
    // 1. Crear usuario en Firebase Auth
    const createUserData: any = {
      email,
      password,
      displayName: name,
    };

    // Solo agregar teléfono si está en formato E.164 válido
    if (phone && phone.startsWith('+') && phone.length >= 10) {
      createUserData.phoneNumber = phone;
    }

    const userRecord = await admin.auth().createUser(createUserData);

    // 2. Guardar perfil en Firestore
    await admin.firestore().collection("users").doc(userRecord.uid).set({
      id: userRecord.uid,
      email,
      name,
      phone,
      role,
      profilePhoto: null,
      driverStatus: role === "driver" ? "offline" : null,
      currentRideId: null,
      currentLocation: null,
      fcmToken: null,
      notificationsEnabled: true,
      stats: {
        totalRides: 0,
        averageRating: 0,
        totalEarnings: 0,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 3. Si es conductor, crear registro en PostgreSQL
    if (role === "driver") {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Insertar conductor
        const driverResult = await client.query(
          `INSERT INTO drivers (
            user_id, license_number, license_expiry, license_photo, 
            department, municipality,
            status, total_rides, average_rating, total_earnings
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, 0) 
          RETURNING id`,
          [
            userRecord.uid,
            driverData.licenseNumber,
            driverData.licenseExpiry,
            driverData.licensePhoto,
            driverData.department || null,
            driverData.municipality || null,
            "pending",
          ]
        );

        const driverId = driverResult.rows[0].id;

        // Insertar vehículo
        await client.query(
          `INSERT INTO vehicles (
            driver_id, plate, brand, model, year, color, type,
            registration_number, registration_expiry, registration_photo,
            insurance_number, insurance_company, insurance_expiry, insurance_photo,
            is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true)`,
          [
            driverId,
            vehicleData.plate,
            vehicleData.brand,
            vehicleData.model,
            vehicleData.year,
            vehicleData.color,
            vehicleData.type,
            vehicleData.registrationNumber,
            vehicleData.registrationExpiry,
            vehicleData.registrationPhoto,
            vehicleData.insuranceNumber,
            vehicleData.insuranceCompany,
            vehicleData.insuranceExpiry,
            vehicleData.insurancePhoto,
          ]
        );

        await client.query("COMMIT");
        console.log(`✅ Conductor guardado en PostgreSQL: ${driverId}`);
        console.log(`✅ Vehículo guardado: ${vehicleData.plate}`);
      } catch (error: any) {
        await client.query("ROLLBACK");
        console.error("❌ Error guardando datos de conductor en PostgreSQL:", error);
        
        // Errores específicos de PostgreSQL
        if (error.message && error.message.includes("date/time field value out of range")) {
          throw new functions.https.HttpsError(
            "invalid-argument",
            "Formato de fecha inválido. Use formato YYYY-MM-DD (ejemplo: 2025-12-31)"
          );
        }
        
        if (error.message && error.message.includes("duplicate key")) {
          throw new functions.https.HttpsError(
            "already-exists",
            "Ya existe un registro con estos datos en la base de datos"
          );
        }
        
        // Error genérico de PostgreSQL
        throw new functions.https.HttpsError(
          "internal",
          `Error al guardar datos del conductor: ${error.message}`
        );
      } finally {
        client.release();
      }
    }

    console.log(`🎉 Registro completado exitosamente: ${userRecord.uid} (${role})`);

    return {
      success: true,
      userId: userRecord.uid,
      email,
      name,
      phone,
      role,
      message: "Usuario registrado exitosamente",
    };
  } catch (error: any) {
    console.error("❌ Error en registro:", error);
    
    // Manejo específico de errores de Firebase Auth
    if (error.code === "auth/email-already-exists") {
      throw new functions.https.HttpsError(
        "already-exists",
        "Este email ya está registrado en Firebase Auth"
      );
    }
    
    if (error.code === "auth/invalid-email") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Formato de email inválido"
      );
    }
    
    if (error.code === "auth/weak-password") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "La contraseña es muy débil"
      );
    }

    if (error.code === "auth/invalid-phone-number") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Formato de teléfono inválido. Use formato E.164 (ejemplo: +50512345678)"
      );
    }
    
    // Si ya es un HttpsError, re-lanzarlo
    if (error.code && error.code.includes("/")) {
      throw error;
    }
    
    // Error genérico
    throw new functions.https.HttpsError(
      "internal",
      `Error al registrar usuario: ${error.message}`
    );
  }
});

/**
 * Login (Firebase Auth maneja esto automáticamente en el cliente)
 * Esta función es solo para obtener datos adicionales después del login
 */
export const login = functions.https.onCall(async (data, context) => {
  // Verificar que el usuario está autenticado
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Usuario no autenticado"
    );
  }

  const userId = context.auth.uid;

  try {
    // Obtener perfil de Firestore
    const userDoc = await admin.firestore()
      .collection("users")
      .doc(userId)
      .get();

    if (!userDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Perfil de usuario no encontrado"
      );
    }

    const userData = userDoc.data();

    // Si es conductor, obtener datos adicionales de PostgreSQL
    if (userData?.role === "driver") {
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT d.*, v.plate, v.brand, v.model, v.color, v.type
           FROM drivers d
           LEFT JOIN vehicles v ON v.driver_id = d.id
           WHERE d.user_id = $1`,
          [userId]
        );

        if (result.rows.length > 0) {
          userData.driverData = result.rows[0];
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
    console.error("❌ Error en login:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Logout (Firebase Auth maneja esto en el cliente)
 */
export const logout = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Usuario no autenticado"
    );
  }

  const userId = context.auth.uid;

  try {
    // Actualizar estado del conductor si aplica
    const userDoc = await admin.firestore()
      .collection("users")
      .doc(userId)
      .get();

    if (userDoc.exists && userDoc.data()?.role === "driver") {
      await admin.firestore()
        .collection("users")
        .doc(userId)
        .update({
          driverStatus: "offline",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }

    return {
      success: true,
      message: "Sesión cerrada exitosamente",
    };
  } catch (error: any) {
    console.error("❌ Error en logout:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});
