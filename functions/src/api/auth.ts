import admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import * as functions from 'firebase-functions';
import crypto from 'crypto';
import { supabasePost, supabaseGet, supabaseUpdate } from '../supabase/client';

interface DriverData {
  licenseNumber?: string;
  licenseExpiry?: string;
  department?: string;
  municipality?: string;
  [key: string]: any;
}

interface VehicleData {
  plate?: string;
  brand?: string;
  model?: string;
  year?: number;
  color?: string;
  type?: string;
  [key: string]: any;
}

interface RegisterPayload {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  role?: "client" | "driver" | string;
  method?: string;
  authProvider?: "email/password" | "phone" | "google" | string;
  phoneVerified?: boolean;
  googleIdToken?: string;
  driverData?: DriverData | null;
  vehicleData?: VehicleData | null;
}

interface RegisterResult {
  user: {
    userId: string;
    email: string | null;
    name: string;
    role: string;
    phone: string | null;
    authProvider: string;
    method: string;
    phoneVerified: boolean;
  };
  token?: string;
}

class RegisterError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const authAdmin = admin.auth();
const firestore = admin.firestore();

const allowedRoles = new Set(["client", "driver"]);
const allowedProviders = new Set(["email/password", "phone", "google"]);

async function upsertDriverAndVehicleInSupabase(
  userId: string,
  driverDataInput?: DriverData | null,
  vehicleDataInput?: VehicleData | null,
) {
  const driverDataPayload = driverDataInput || {};

  const existingDrivers: any[] = await supabaseGet(
    'drivers',
    { user_id: userId },
    '*',
    {
      requireServiceRole: true,
      limit: 1,
    },
  );

  const hasDriver = Array.isArray(existingDrivers) && existingDrivers.length > 0;
  const existingDriver = hasDriver ? existingDrivers[0] : null;

  const licenseNumberValue = normalizeString(driverDataPayload.licenseNumber);
  const licenseExpiryValue = normalizeString(driverDataPayload.licenseExpiry);
  const departmentValue = normalizeString(driverDataPayload.department);
  const municipalityValue = normalizeString(driverDataPayload.municipality);

  const baseDriverData: any = {
    user_id: userId,
    profile_photo: existingDriver ? existingDriver.profile_photo : null,
    license_number:
      licenseNumberValue !== undefined
        ? licenseNumberValue
        : existingDriver
        ? existingDriver.license_number
        : null,
    license_expiry:
      licenseExpiryValue !== undefined
        ? licenseExpiryValue
        : existingDriver
        ? existingDriver.license_expiry
        : null,
    license_photo_front: existingDriver ? existingDriver.license_photo_front : null,
    license_photo_back: existingDriver ? existingDriver.license_photo_back : null,
    department:
      departmentValue !== undefined
        ? departmentValue
        : existingDriver
        ? existingDriver.department
        : null,
    municipality:
      municipalityValue !== undefined
        ? municipalityValue
        : existingDriver
        ? existingDriver.municipality
        : null,
    account_status:
      existingDriver && (existingDriver.account_status || existingDriver.status)
        ? existingDriver.account_status || existingDriver.status
        : 'pending',
    documents_status:
      existingDriver && existingDriver.documents_status
        ? existingDriver.documents_status
        : 'pending',
    verified_at: existingDriver ? existingDriver.verified_at : null,
    total_rides: existingDriver ? existingDriver.total_rides : 0,
    average_rating: existingDriver ? existingDriver.average_rating : 5.0,
    total_earnings: existingDriver ? existingDriver.total_earnings : 0,
  };

  let driverRow: any = existingDriver;

  if (hasDriver) {
    const updatedDrivers = await supabaseUpdate('drivers', existingDriver.id, baseDriverData);
    driverRow =
      Array.isArray(updatedDrivers) && updatedDrivers.length > 0
        ? updatedDrivers[0]
        : existingDriver;
    functions.logger.info(`✅ Conductor actualizado en Supabase: ${userId}`);
  } else {
    const insertedDrivers = await supabasePost('drivers', baseDriverData);
    driverRow =
      Array.isArray(insertedDrivers) && insertedDrivers.length > 0
        ? insertedDrivers[0]
        : insertedDrivers;
    functions.logger.info(`✅ Conductor creado en Supabase: ${userId}`);
  }

  const driverIdForVehicle: string | undefined = driverRow?.id;

  if (driverIdForVehicle && vehicleDataInput) {
    const vehiclePayload: any = vehicleDataInput || {};

    const existingVehicles: any[] = await supabaseGet(
      'vehicles',
      { driver_id: driverIdForVehicle },
      'id,plate,is_active',
      {
        requireServiceRole: true,
        limit: 10,
      },
    );

    const hasVehicles = Array.isArray(existingVehicles) && existingVehicles.length > 0;

    if (!hasVehicles) {
      const yearValue =
        typeof vehiclePayload.year === 'number'
          ? vehiclePayload.year
          : vehiclePayload.year
          ? parseInt(String(vehiclePayload.year), 10)
          : null;
      const passengersValue =
        vehiclePayload.passengers !== undefined && vehiclePayload.passengers !== null
          ? parseInt(String(vehiclePayload.passengers), 10)
          : null;

      const vehicleSupabaseData: any = {
        driver_id: driverIdForVehicle,
        plate: vehiclePayload.plate
          ? String(vehiclePayload.plate).toUpperCase()
          : null,
        brand: vehiclePayload.brand || null,
        model: vehiclePayload.model || null,
        year: yearValue,
        color: vehiclePayload.color || null,
        type: vehiclePayload.type || null,
        passengers: passengersValue,
        is_active: false,
      };

      const insertedVehicles = await supabasePost('vehicles', vehicleSupabaseData);
      const vehicleRow =
        Array.isArray(insertedVehicles) && insertedVehicles.length > 0
          ? insertedVehicles[0]
          : insertedVehicles;

      functions.logger.info(
        `✅ Vehículo inicial creado en Supabase para conductor ${userId}: ${
          vehicleRow?.id || ''
        }`,
      );
    }
  }
}

async function getOrCreateUserByEmail(
  email: string,
  createRequest: admin.auth.CreateRequest
) {
  try {
    return await authAdmin.createUser(createRequest);
  } catch (error: any) {
    if (error.code === "auth/email-already-exists") {
      return await authAdmin.getUserByEmail(email);
    }

    if (error.code === "auth/phone-number-already-exists" && createRequest.phoneNumber) {
      return await authAdmin.getUserByPhoneNumber(createRequest.phoneNumber);
    }

    throw error;
  }
}

async function getOrCreateUserByPhone(
  phoneNumber: string,
  createRequest: admin.auth.CreateRequest
) {
  try {
    return await authAdmin.getUserByPhoneNumber(phoneNumber);
  } catch (error: any) {
    if (error.code !== "auth/user-not-found") {
      throw error;
    }
  }

  try {
    return await authAdmin.createUser(createRequest);
  } catch (error: any) {
    if (error.code === "auth/phone-number-already-exists") {
      return await authAdmin.getUserByPhoneNumber(phoneNumber);
    }
    throw error;
  }
}

function normalizeString(value?: string | null) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function mergePlusSeparated(previous?: string, current?: string, order: string[] = []): string | undefined {
  const parts = new Set<string>();

  const addParts = (value?: string) => {
    if (!value || typeof value !== "string") {
      return;
    }
    value
      .split("+")
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .forEach((p) => parts.add(p));
  };

  addParts(previous);
  addParts(current);

  if (parts.size === 0) {
    return undefined;
  }

  const ordered: string[] = [];

  for (const key of order) {
    if (parts.has(key)) {
      ordered.push(key);
      parts.delete(key);
    }
  }

  for (const rest of parts) {
    ordered.push(rest);
  }

  return ordered.join("+");
}

function mergeAuthProviders(previous?: string, current?: string): string | undefined {
  const order = ["google", "email/password", "phone"];
  return mergePlusSeparated(previous, current, order);
}

function mergeMethods(previous?: string, current?: string): string | undefined {
  const order = ["google", "email", "phone"];
  return mergePlusSeparated(previous, current, order);
}

async function handleRegister(payload: RegisterPayload): Promise<RegisterResult> {
  if (!payload || typeof payload !== "object") {
    throw new RegisterError(400, "Datos de registro inválidos");
  }

  const name = normalizeString(payload.name);
  if (!name) {
    throw new RegisterError(400, "Nombre completo es requerido");
  }

  const role = normalizeString(payload.role)?.toLowerCase() || "client";
  if (!allowedRoles.has(role)) {
    throw new RegisterError(400, "Rol de usuario inválido");
  }

  const authProvider = (normalizeString(payload.authProvider) as
    | "email/password"
    | "phone"
    | "google"
    | undefined) || "email/password";

  if (!allowedProviders.has(authProvider)) {
    throw new RegisterError(400, "Proveedor de autenticación inválido");
  }

  const method = normalizeString(payload.method) ||
    (authProvider === "google"
      ? "google"
      : authProvider === "phone"
      ? "phone"
      : "email");

  const email = normalizeString(payload.email);
  const phone = normalizeString(payload.phone);
  const password = normalizeString(payload.password);

  if (authProvider === "email/password") {
    if (!email || !password) {
      throw new RegisterError(400, "Correo y contraseña son requeridos");
    }
  }

  if (authProvider === "phone") {
    if (!phone || !payload.phoneVerified) {
      throw new RegisterError(400, "Teléfono verificado es requerido para este método");
    }
  }

  if (authProvider === "google" && !email) {
    throw new RegisterError(400, "El email es requerido para registros con Google");
  }

  let userRecord: admin.auth.UserRecord;

  try {
    if (authProvider === "email/password") {
      userRecord = await getOrCreateUserByEmail(email!, {
        email: email!,
        password: password!,
        displayName: name,
        phoneNumber: phone,
      });

      if (phone && userRecord.phoneNumber !== phone) {
        userRecord = await authAdmin.updateUser(userRecord.uid, {
          phoneNumber: phone,
        });
      }
    } else if (authProvider === "phone") {
      if (!phone) {
        throw new RegisterError(400, "Teléfono requerido");
      }

      userRecord = await getOrCreateUserByPhone(phone, {
        phoneNumber: phone,
        displayName: name,
        email: email,
      });

      if (email && userRecord.email !== email) {
        userRecord = await authAdmin.updateUser(userRecord.uid, {
          email,
        });
      }
    } else {
      // Google
      userRecord = await getOrCreateUserByEmail(email!, {
        email: email!,
        displayName: name,
        phoneNumber: phone,
        emailVerified: true,
      });

      if (phone && userRecord.phoneNumber !== phone) {
        userRecord = await authAdmin.updateUser(userRecord.uid, {
          phoneNumber: phone,
        });
      }
    }

    if (userRecord.displayName !== name) {
      userRecord = await authAdmin.updateUser(userRecord.uid, {
        displayName: name,
      });
    }
  } catch (error: any) {
    functions.logger.error("❌ Error creando usuario en Auth:", error);
    if (error instanceof RegisterError) {
      throw error;
    }
    throw new RegisterError(500, error.message || "Error creando usuario en Auth");
  }

  const userRef = firestore.collection("users").doc(userRecord.uid);
  const existingDoc = await userRef.get();

  let mergedAuthProvider: string | undefined = authProvider;
  let mergedMethod: string | undefined = method;

  if (existingDoc.exists) {
    const existingData = existingDoc.data() || {};
    const previousAuthProvider =
      typeof existingData.authProvider === "string" ? existingData.authProvider : undefined;
    const previousMethod =
      typeof existingData.method === "string" ? existingData.method : undefined;

    mergedAuthProvider =
      mergeAuthProviders(previousAuthProvider, authProvider) || authProvider;
    mergedMethod = mergeMethods(previousMethod, method) || method;
  }

  const dataToSave: FirebaseFirestore.DocumentData = {
    id: userRecord.uid,
    name,
    email: email || userRecord.email || null,
    phone: phone || userRecord.phoneNumber || null,
    role,
    authProvider: mergedAuthProvider,
    method: mergedMethod,
    phoneVerified: Boolean(payload.phoneVerified || authProvider === "phone"),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (role === "driver") {
    dataToSave.driverData = payload.driverData || null;
    dataToSave.vehicleData = payload.vehicleData || null;
    if (!existingDoc.exists) {
      dataToSave.driverStatus = "pending";
    }
  } else {
    dataToSave.driverData = FieldValue.delete();
    dataToSave.vehicleData = FieldValue.delete();
  }

  if (!existingDoc.exists) {
    dataToSave.createdAt = FieldValue.serverTimestamp();
  }

  await userRef.set(dataToSave, { merge: true });

  if (role === "driver") {
    try {
      await upsertDriverAndVehicleInSupabase(userRecord.uid, payload.driverData, payload.vehicleData);
    } catch (supabaseError: any) {
      functions.logger.error('❌ Error gestionando conductor en Supabase:', supabaseError);
    }
  }

  let customToken: string | undefined;
  try {
    customToken = await authAdmin.createCustomToken(userRecord.uid);
  } catch (error: any) {
    functions.logger.warn("⚠️ No se pudo generar custom token:", error);
  }

  return {
    user: {
      userId: userRecord.uid,
      email: userRecord.email || email || null,
      name,
      role,
      phone: userRecord.phoneNumber || phone || null,
      authProvider: mergedAuthProvider || authProvider,
      method: mergedMethod || method,
      phoneVerified: Boolean(payload.phoneVerified || authProvider === "phone"),
    },
    token: customToken,
  };
}

export const auth = functions.region("us-central1").https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST" || req.path !== "/register") {
    res.status(404).json({ success: false, error: "Ruta no encontrada" });
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const result = await handleRegister(payload || {});
    res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    const status = error instanceof RegisterError ? error.statusCode : 500;
    const message = error?.message || "Error inesperado";
    res.status(status).json({ success: false, error: message });
  }
});

export const registerCallable = functions
  .region("us-central1")
  .https.onCall(async (data) => {
    try {
      const result = await handleRegister(data || {});
      return { success: true, ...result };
    } catch (error: any) {
      if (error instanceof RegisterError) {
        throw new functions.https.HttpsError("invalid-argument", error.message);
      }
      functions.logger.error("❌ Error en registerCallable:", error);
      throw new functions.https.HttpsError(
        "internal",
        error?.message || "Error al registrar usuario"
      );
    }
  });

export const checkUserAvailability = functions
  .region("us-central1")
  .https.onCall(async (data) => {
    const email = normalizeString(data?.email);
    const phone = normalizeString(data?.phone);

    let emailExists = false;
    let phoneExists = false;

    try {
      if (email) {
        try {
          await authAdmin.getUserByEmail(email);
          emailExists = true;
        } catch (error: any) {
          if (error.code !== "auth/user-not-found") {
            throw error;
          }
        }
      }

      if (phone) {
        try {
          await authAdmin.getUserByPhoneNumber(phone);
          phoneExists = true;
        } catch (error: any) {
          if (error.code !== "auth/user-not-found") {
            throw error;
          }
        }
      }

      return { emailExists, phoneExists };
    } catch (error: any) {
      functions.logger.error("❌ Error en checkUserAvailability:", error);
      throw new functions.https.HttpsError(
        "internal",
        error?.message || "Error al verificar disponibilidad de usuario"
      );
    }
  });

export const logSmsVerificationCode = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    try {
      const rawUserId = (data?.userId as string | undefined) || (context.auth?.uid as string | undefined);
      const phoneNumber = (data?.phoneNumber as string | undefined) || undefined;
      const code = (data?.code as string | undefined) || undefined;
      const verificationContext = (data?.context as string | undefined) || 'register_phone';
      const attempts = typeof data?.attemptCount === 'number' ? data.attemptCount : 1;

      if (!rawUserId) {
        throw new functions.https.HttpsError('invalid-argument', 'userId es requerido para registrar la verificación SMS');
      }

      if (!phoneNumber) {
        throw new functions.https.HttpsError('invalid-argument', 'phoneNumber es requerido para registrar la verificación SMS');
      }

      const userId = rawUserId.trim();
      const normalizedPhone = phoneNumber.replace(/\s+/g, '');

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutos

      const safeCode = (code || '').trim();
      const codeHash = safeCode
        ? crypto.createHash('sha256').update(safeCode).digest('hex')
        : crypto.createHash('sha256').update(`${userId}:${normalizedPhone}:${now.toISOString()}`).digest('hex');

      const payload = {
        user_id: userId,
        phone_number: normalizedPhone,
        context: verificationContext,
        code: safeCode || null,
        code_hash: codeHash,
        verified: true,
        attempt_count: attempts,
        expires_at: expiresAt.toISOString(),
        verified_at: now.toISOString(),
      };

      functions.logger.info('📲 Registrando verificación SMS en Supabase:', {
        userId,
        phoneNumber: normalizedPhone,
        context: verificationContext,
      });

      const result = await supabasePost('sms_verification_codes', payload);

      return {
        success: true,
        record: Array.isArray(result) && result.length > 0 ? result[0] : result,
      };
    } catch (error: any) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      functions.logger.error('❌ Error en logSmsVerificationCode:', error);
      throw new functions.https.HttpsError(
        'internal',
        error?.message || 'Error al registrar la verificación SMS'
      );
    }
  });

export const exchangeIdTokenForCustomToken = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const idToken = (data?.idToken as string | undefined) || undefined;

    if (!idToken || typeof idToken !== 'string') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'idToken es requerido para generar un custom token'
      );
    }

    try {
      const decoded = await authAdmin.verifyIdToken(idToken);
      const uid = decoded.uid;

      const customToken = await authAdmin.createCustomToken(uid);

      return { customToken };
    } catch (error: any) {
      functions.logger.error('❌ Error en exchangeIdTokenForCustomToken:', error);
      throw new functions.https.HttpsError(
        'internal',
        error?.message || 'No se pudo generar custom token desde idToken'
      );
    }
  });

export const hasVerifiedRegisterPhoneLog = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    try {
      const rawPhone = (data?.phoneNumber as string | undefined) || undefined;
      const rawUserId = (data?.userId as string | undefined) || (context.auth?.uid as string | undefined);

      if (!rawPhone && !rawUserId) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Debe proporcionarse al menos phoneNumber o userId'
        );
      }

      const normalizedPhone = rawPhone ? rawPhone.replace(/\s+/g, '') : undefined;

      const filters: Record<string, any> = {
        context: 'register_phone',
        verified: true,
      };

      if (normalizedPhone) {
        filters.phone_number = normalizedPhone;
      }

      if (rawUserId) {
        filters.user_id = rawUserId.trim();
      }

      const results: any[] = await supabaseGet(
        'sms_verification_codes',
        filters,
        'id,user_id,phone_number,verified,verified_at,created_at',
        {
          requireServiceRole: true,
          limit: 1,
        },
      );

      const hasVerified = Array.isArray(results) && results.length > 0;

      return {
        success: true,
        hasVerified,
      };
    } catch (error: any) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      functions.logger.error('❌ Error en hasVerifiedRegisterPhoneLog:', error);
      throw new functions.https.HttpsError(
        'internal',
        error?.message || 'No se pudo verificar el estado de verificación del teléfono'
      );
    }
  });

export const upgradeClientToDriver = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const uid = context.auth.uid;

    const driverData = (data?.driverData as DriverData | undefined) || undefined;
    const vehicleData = (data?.vehicleData as VehicleData | undefined) || undefined;

    if (!driverData || !vehicleData) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'driverData y vehicleData son requeridos para actualizar el perfil de conductor',
      );
    }

    try {
      const logs: any[] = await supabaseGet(
        'sms_verification_codes',
        {
          user_id: uid,
          context: 'register_upgrade_driver',
          verified: true,
        },
        'id,user_id,phone_number,verified,verified_at,created_at',
        {
          requireServiceRole: true,
          limit: 1,
        },
      );

      const hasVerified = Array.isArray(logs) && logs.length > 0;

      if (!hasVerified) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'PHONE_VERIFICATION_REQUIRED',
        );
      }
    } catch (error: any) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      functions.logger.error('❌ Error verificando logs de SMS para upgradeClientToDriver:', error);
      throw new functions.https.HttpsError(
        'internal',
        error?.message || 'No se pudo verificar el estado de verificación del teléfono',
      );
    }

    const userRef = firestore.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'USER_DOCUMENT_NOT_FOUND',
      );
    }

    const userData = userSnap.data() || {};
    const previousRole = typeof userData.role === 'string' ? String(userData.role) : 'client';

    const newData: FirebaseFirestore.DocumentData = {
      role: 'driver',
      driverData,
      vehicleData,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (!userData.driverStatus) {
      newData.driverStatus = 'pending';
    }

    await userRef.set(newData, { merge: true });

    try {
      await upsertDriverAndVehicleInSupabase(uid, driverData, vehicleData);
    } catch (supabaseError: any) {
      functions.logger.error('❌ Error gestionando conductor en Supabase (upgradeClientToDriver):', supabaseError);
    }

    return {
      success: true,
      user: {
        id: uid,
        previousRole,
        role: 'driver',
      },
    };
  });
