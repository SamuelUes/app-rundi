import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import pool from "../config/database";

/**
 * Registrar usuario
 * Sincroniza: Firebase Auth + Firestore + PostgreSQL (si es conductor)
 * 
 * Soporta dos métodos de autenticación:
 * 1. Email/Password (tradicional)
 * 2. Google OAuth (authProvider: 'google')
 */
export const register = functions.https.onCall(async (data, context) => {
  const { email, password, name, phone, role, driverData, vehicleData, authProvider } = data;

  console.log(`📝 Registro iniciado: ${phone} (${role}) - Proveedor: ${authProvider || 'email/password'}`);

  // ============================================
  // VALIDACIONES BÁSICAS
  // ============================================
  
  // 1. Campos requeridos (email es opcional, teléfono es obligatorio)
  const isGoogleAuth = authProvider === 'google';
  
  if (!name || !phone || !role) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Faltan campos requeridos: nombre, teléfono y rol"
    );
  }

  // Para email/password, requerir contraseña
  if (!isGoogleAuth && !password) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Contraseña requerida para registro con email/password"
    );
  }

  // 2. Validar formato de email (solo si se proporciona)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (email && !emailRegex.test(email)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Formato de email inválido"
    );
  }

  // 2b. Validar formato de teléfono
  const phoneRegex = /^\+505\d{8}$/;
  if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Formato de teléfono inválido. Debe ser +505 XXXX XXXX"
    );
  }

  // 3. Validar longitud de password (solo si no es Google Auth)
  if (!isGoogleAuth && password && password.length < 6) {
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
  if (!["client", "driver", "designated_driver"].includes(role)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Rol inválido. Debe ser 'client', 'driver' o 'designated_driver'"
    );
  }
  
  // 6. Validar si rol es designated_driver (solo disponible para usuarios autorizados - fase beta)
  // El rol designated_driver es un "super-rol" que permite:
  // 1. Dar viajes normales (como cualquier conductor regular)
  // 2. Adicionalmente, dar servicio de conductor designado
  if (role === "designated_driver") {
    // Si no es una actualización autorizada, rechazar
    if (!context?.auth?.token?.admin) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "El rol 'designated_driver' solo está disponible para usuarios autorizados durante la fase beta."
      );
    }
  }

  // ============================================
  // VALIDACIONES DE CONDUCTOR
  // ============================================
  
  if (role === "driver" || role === "designated_driver") {
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
    if (role === "driver" || role === "designated_driver") {
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
    // Para crear usuario en Firebase Auth, necesitamos un email
    // Si no se proporciona, generar uno temporal basado en el teléfono
    const authEmail = email || `${phone.replace(/\D/g, '')}@driveangel.local`;

    const createUserData: any = {
      email: authEmail,
      displayName: name,
      phoneNumber: phone.replace(/\s/g, ''),
    };

    // Solo agregar contraseña si no es Google Auth
    if (!isGoogleAuth && password) {
      createUserData.password = password;
    }

    const userRecord = await admin.auth().createUser(createUserData);

    // 2. Guardar perfil en Firestore
    console.log(`💾 Guardando usuario en Firestore con rol: ${role}`);
    await admin.firestore().collection("users").doc(userRecord.uid).set({
      email: email || authEmail, // Guardar email original si existe, sino el generado
      name,
      phone: phone || '',
      role,
      authProvider: authProvider || 'email/password',
      emailVerified: !!email, // Si se proporcionó email, marcarlo como verificado
      profilePhoto: null,
      driverStatus: (role === "driver" || role === "designated_driver") ? "offline" : null,
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
    console.log(`✅ Usuario guardado en Firestore: ${userRecord.uid} (rol: ${role})`);

    // 3. Si es conductor, crear registro en PostgreSQL
    if (role === "driver" || role === "designated_driver") {
      console.log(`🗄️ Creando registro de conductor en PostgreSQL (rol: ${role})...`);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Insertar conductor
        const driverResult = await client.query(
          `INSERT INTO drivers (
            user_id, profile_photo, license_number, license_expiry, 
            license_photo, license_photo_front, license_photo_back,
            department, municipality,
            status, verified_at, total_rides, average_rating, total_earnings,
            designated_driver_request_status, designated_driver_role,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, 0, 0, NULL, NULL, NOW(), NOW()) 
          RETURNING id`,
          [
            userRecord.uid,
            driverData.profilePhoto || null,
            driverData.licenseNumber,
            driverData.licenseExpiry,
            driverData.licensePhoto || null,  // Foto legacy (opcional)
            driverData.licensePhotoFront || null,
            driverData.licensePhotoBack || null,
            driverData.department || null,
            driverData.municipality || null,
            "pending",
            null,  // verified_at (se actualiza cuando admin aprueba)
          ]
        );

        const driverId = driverResult.rows[0].id;

        // Insertar vehículo
        await client.query(
          `INSERT INTO vehicles (
            driver_id, plate, brand, model, year, color, type,
            motor, chasis, vin, cylinders, passengers, fuel_type,
            tonnage, vehicle_class, service_type, lien, emission_date,
            registration_number, 
            registration_photo_front, registration_photo_back,
            insurance_number, insurance_company, insurance_start_date, insurance_expiry, insurance_photo,
            is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, true)`,
          [
            driverId,
            vehicleData.plate,
            vehicleData.brand,
            vehicleData.model,
            vehicleData.year,
            vehicleData.color,
            vehicleData.type,
            vehicleData.motor,
            vehicleData.chasis,
            vehicleData.vin,
            vehicleData.cylinders,
            vehicleData.passengers,
            vehicleData.fuelType,
            vehicleData.tonnage,
            vehicleData.vehicleClass,
            vehicleData.serviceType,
            vehicleData.lien,
            vehicleData.emissionDate,
            vehicleData.registrationNumber,
            vehicleData.registrationPhotoFront || null,
            vehicleData.registrationPhotoBack || null,
            vehicleData.insuranceNumber,
            vehicleData.insuranceCompany,
            vehicleData.insuranceStartDate,
            vehicleData.insuranceExpiry,
            vehicleData.insurancePhoto || null,
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
      phone: phone.replace(/\s/g, ''),
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
        "Formato de teléfono inválido. Debe ser +505 XXXX XXXX"
      );
    }

    if (error.code === "auth/email-already-exists") {
      throw new functions.https.HttpsError(
        "already-exists",
        "Este email ya está registrado"
      );
    }

    if (error.code === "auth/phone-number-already-exists") {
      throw new functions.https.HttpsError(
        "already-exists",
        "Este número de teléfono ya está registrado"
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
    
    console.log(`✅ Login exitoso - Usuario: ${userId}`);
    console.log(`📋 Rol del usuario: ${userData?.role}`);
    console.log(`🔍 Datos del usuario:`, JSON.stringify(userData, null, 2));

    // Si es conductor, obtener datos adicionales de PostgreSQL
    if (userData?.role === "driver" || userData?.role === "designated_driver") {
      console.log(`🚗 Usuario es conductor (${userData?.role}), obteniendo datos de PostgreSQL...`);
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

    console.log(`✅ Login completado - Retornando usuario con rol: ${userData?.role}`);
    
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

    if (userDoc.exists && (userDoc.data()?.role === "driver" || userDoc.data()?.role === "designated_driver")) {
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

/**
 * Completar registro de conductor
 * Se llama después de que el conductor ingresa sus datos de licencia y vehículo
 */
export const completeDriverRegistration = functions.https.onCall(async (data, context) => {
  const { userId, driverData, vehicleData } = data;

  console.log(`📝 Completando registro de conductor: ${userId}`);

  // ============================================
  // VALIDACIONES
  // ============================================

  if (!userId || !driverData || !vehicleData) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "userId, driverData y vehicleData son requeridos"
    );
  }

  // Validar datos de licencia
  if (!driverData.licenseNumber || driverData.licenseNumber.trim().length < 5) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Número de licencia inválido"
    );
  }

  // Validar datos de vehículo
  if (!vehicleData.plate || vehicleData.plate.trim().length < 4) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Placa del vehículo inválida"
    );
  }

  try {
    // ============================================
    // GUARDAR DATOS EN POSTGRESQL
    // ============================================

    const client = await pool.connect();
    try {
      // Iniciar transacción
      await client.query("BEGIN");

      // 1. Insertar datos del conductor
      const driverResult = await client.query(
        `INSERT INTO drivers (
          user_id, license_number, license_expiry, 
          license_photo, license_photo_front, license_photo_back,
          department, municipality, profile_photo,
          status, verified_at, total_rides, average_rating, total_earnings,
          designated_driver_request_status, designated_driver_role,
          created_at, updated_at
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, 0, 0, NULL, NULL, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           license_number = $2,
           license_expiry = $3,
           license_photo = $4,
           license_photo_front = $5,
           license_photo_back = $6,
           department = $7,
           municipality = $8,
           profile_photo = $9,
           updated_at = NOW()
         RETURNING id`,
        [
          userId, 
          driverData.licenseNumber, 
          driverData.licenseExpiry,
          driverData.licensePhoto || null,
          driverData.licensePhotoFront || null,
          driverData.licensePhotoBack || null,
          driverData.department, 
          driverData.municipality,
          driverData.profilePhoto || null,
          'pending',  // status
          null,  // verified_at
        ]
      );

      const driverId = driverResult.rows[0].id;

      // 2. Insertar datos del vehículo
      await client.query(
        `INSERT INTO vehicles (driver_id, plate, brand, model, year, color, type, passengers, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         ON CONFLICT (plate) DO UPDATE SET
           brand = $3,
           model = $4,
           year = $5,
           color = $6,
           type = $7,
           passengers = $8,
           updated_at = NOW()`,
        [driverId, vehicleData.plate, vehicleData.brand, vehicleData.model, vehicleData.year, vehicleData.color, vehicleData.type, vehicleData.passengers || null]
      );

      // Confirmar transacción
      await client.query("COMMIT");

      console.log(`✅ Datos del conductor guardados: ${userId}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    // ============================================
    // ACTUALIZAR FIRESTORE
    // ============================================

    await admin.firestore()
      .collection("users")
      .doc(userId)
      .update({
        driverRegistrationComplete: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    return {
      success: true,
      message: "Registro de conductor completado exitosamente",
      userId,
    };
  } catch (error: any) {
    console.error("❌ Error completando registro de conductor:", error);

    // Si ya es un HttpsError, re-lanzarlo
    if (error.code && error.code.includes("/")) {
      throw error;
    }

    throw new functions.https.HttpsError(
      "internal",
      `Error al completar registro de conductor: ${error.message}`
    );
  }
});
