/**
 * Driver Profile API
 * Obtener y actualizar perfil del conductor
 */

import * as functions from 'firebase-functions';
import admin from 'firebase-admin';
import { supabaseGet, supabaseGetDriverWithVehicles, supabaseUpdate } from '../supabase/client';
import { MIGRATION_FLAGS } from '../config/migration-flags';

/**
 * Obtener perfil del conductor (combinando Firebase Auth + Supabase)
 * Obtiene datos de Firebase Auth (email, nombre, etc.) y Supabase (licencia, vehículo, etc.)
 */
export const getDriverProfileWithFallback = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  try {
    const driverId = context.auth.uid;
    console.log(`👤 [getDriverProfile] Obteniendo perfil del conductor: ${driverId}`);

    // 1. Obtener datos de Firebase Auth
    let firebaseUser: any = null;
    try {
      firebaseUser = await admin.auth().getUser(driverId);
      console.log(`✅ [getDriverProfile] Usuario de Firebase Auth encontrado:`, {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        phoneNumber: firebaseUser.phoneNumber,
      });
    } catch (authError: any) {
      console.warn(`⚠️ [getDriverProfile] Error obteniendo usuario de Firebase Auth:`, authError.message);
    }

    // 2. Obtener datos de Supabase (usando REST API con vehículos)
    let supabaseDriver: any = null;
    let vehicles: any[] = [];
    try {
      console.log(`📊 [getDriverProfile] Buscando en Supabase con user_id: ${driverId}`);
      supabaseDriver = await supabaseGetDriverWithVehicles(driverId);
      
      if (supabaseDriver) {
        vehicles = supabaseDriver.vehicles || [];
        console.log(`✅ [getDriverProfile] Perfil de Supabase encontrado con ${vehicles.length} vehículos`);
      } else {
        console.warn(`⚠️ [getDriverProfile] No se encontró perfil en Supabase, creando registro...`);
        // Crear registro en Supabase si no existe
        try {
          const { supabasePost } = await import('../supabase/client');

          const driverSupabaseData = {
            user_id: driverId,
            profile_photo: null,
            license_number: null,
            license_expiry: null,
            license_photo_front: null,
            license_photo_back: null,
            department: null,
            municipality: null,
            account_status: 'pending',
            documents_status: 'pending',
            verified_at: null,
            total_rides: 0,
            average_rating: 5.0,
            total_earnings: 0,
          };

          await supabasePost('drivers', driverSupabaseData);
          console.log(`✅ [getDriverProfile] Conductor creado en Supabase: ${driverId}`);
          
          // Intentar obtener nuevamente
          supabaseDriver = await supabaseGetDriverWithVehicles(driverId);
        } catch (createError: any) {
          console.error(`❌ [getDriverProfile] Error creando conductor en Supabase:`, createError);
        }
      }
    } catch (supabaseError: any) {
      console.warn(`⚠️ [getDriverProfile] Error en Supabase REST API (${supabaseError.message}). Usando fallback a Realtime DB`);
      // Continuar sin datos de Supabase - usaremos fallback
    }

    // 3. Si tenemos datos de Firebase Auth, combinarlos con Supabase
    if (firebaseUser) {
      // supabaseDriver es un objeto directo de REST API (no Sequelize model)
      const driverJson = supabaseDriver || {};
      
      const driverProfile = {
        id: driverJson.id || driverId,
        userId: driverId,
        firstName: firebaseUser.displayName?.split(' ')[0] || null,
        lastName: firebaseUser.displayName?.split(' ').slice(1).join(' ') || null,
        email: firebaseUser.email || null,
        phone: firebaseUser.phoneNumber || null,
        licenseNumber: driverJson.license_number || null,
        licenseExpiry: driverJson.license_expiry || null,
        licensePhotoFront: driverJson.license_photo_front || null,
        licensePhotoBack: driverJson.license_photo_back || null,
        licensePhoto: driverJson.license_photo || null,
        profilePhoto: driverJson.profile_photo || null,
        department: driverJson.department || null,
        municipality: driverJson.municipality || null,
        accountStatus: driverJson.account_status || driverJson.status || 'pending',
        account_status: driverJson.account_status || driverJson.status || 'pending',
        documentsStatus: driverJson.documents_status || null,
        documents_status: driverJson.documents_status || null,
        verifiedAt: driverJson.verified_at || null,
        designatedRoleRequested: driverJson.designated_rol_requested || null,
        designated_rol_requested: driverJson.designated_rol_requested || null,
        totalRides: driverJson.total_rides || 0,
        rating: driverJson.average_rating || 5.0,
        earnings: driverJson.total_earnings || 0,
        createdAt: driverJson.created_at || null,
        // Vehículos del conductor
        vehicles: vehicles.map((v: any) => ({
          id: v.id,
          plate: v.plate,
          brand: v.brand,
          model: v.model,
          year: v.year,
          color: v.color,
          type: v.type,
          isActive: v.is_active,
          // Datos de registro
          registrationNumber: v.registration_number || null,
          registrationExpiry: v.registration_expiry || null,
          registrationPhotoFront: v.registration_photo_front || null,
          registrationPhotoBack: v.registration_photo_back || null,
          // Datos de seguro
          insuranceNumber: v.insurance_number || null,
          insuranceCompany: v.insurance_company || null,
          insuranceExpiry: v.insurance_expiry || null,
          insurancePhoto: v.insurance_photo || null,
          // Fotos
          vehiclePhoto: v.vehicle_photo || null,
        })),
      };
      
      console.log(`✅ [getDriverProfile] Retornando perfil combinado con ${vehicles.length} vehículos`);
      return {
        success: true,
        driver: driverProfile,
      };
    }

    // 4. Fallback: Obtener de Realtime DB si no hay Firebase Auth
    console.log(`🔄 [getDriverProfile] Intentando fallback a Realtime DB para: ${driverId}`);
    const db = admin.database();
    const snapshot = await db.ref(`drivers/${driverId}`).once('value');
    const driverData = snapshot.val();

    if (!driverData) {
      console.error(`❌ [getDriverProfile] No se encontró en Realtime DB tampoco`);
      throw new functions.https.HttpsError('not-found', 'Perfil del conductor no encontrado');
    }

    console.log(`✅ [getDriverProfile] Perfil encontrado en Realtime DB:`, {
      firstName: driverData.firstName,
      lastName: driverData.lastName,
      email: driverData.email,
      phone: driverData.phone,
    });

    return {
      success: true,
      driver: {
        id: driverId,
        userId: driverId,
        firstName: driverData.firstName,
        lastName: driverData.lastName,
        email: driverData.email,
        phone: driverData.phone,
        licenseNumber: driverData.licenseNumber,
        licenseExpiry: driverData.licenseExpiry,
        profilePhoto: driverData.profilePhoto,
        department: driverData.department,
        municipality: driverData.municipality,
        accountStatus: driverData.accountStatus || driverData.account_status || driverData.status || 'pending',
        account_status: driverData.account_status || driverData.accountStatus || driverData.status || 'pending',
        documentsStatus: driverData.documentsStatus || driverData.documents_status || null,
        documents_status: driverData.documents_status || driverData.documentsStatus || null,
        verifiedAt: driverData.verifiedAt,
        designatedRoleRequested: driverData.designatedRoleRequested || driverData.designated_rol_requested || null,
        designated_rol_requested: driverData.designated_rol_requested || null,
        totalRides: driverData.totalRides || 0,
        rating: driverData.rating || 5.0,
        earnings: driverData.earnings || 0,
        createdAt: driverData.createdAt,
      },
    };
  } catch (error: any) {
    console.error('❌ [getDriverProfile] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Actualizar perfil del conductor (con sincronización a Realtime DB)
 */
export const updateDriverProfileWithSync = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  try {
    const driverId = context.auth.uid;
    const {
      firstName,
      lastName,
      phone,
      licenseNumber,
      licenseExpiry,
      profilePhoto,
      department,
      municipality,
    } = data;

    console.log(`👤 [updateDriverProfile] Actualizando perfil del conductor: ${driverId}`);

    // 1. Actualizar en Firebase Auth (nombre y teléfono)
    try {
      const updateAuthData: any = {};
      if (firstName || lastName) {
        updateAuthData.displayName = `${firstName || ''} ${lastName || ''}`.trim();
      }
      if (phone) {
        updateAuthData.phoneNumber = phone;
      }
      
      if (Object.keys(updateAuthData).length > 0) {
        await admin.auth().updateUser(driverId, updateAuthData);
        console.log(`✅ [updateDriverProfile] Perfil actualizado en Firebase Auth`);
      }
    } catch (authError: any) {
      console.warn(`⚠️ [updateDriverProfile] Error actualizando Firebase Auth:`, authError.message);
    }

    // 2. Actualizar en Supabase (usando REST API)
    try {
      const updateData: any = {};
      if (licenseNumber) updateData.license_number = licenseNumber;
      if (licenseExpiry) updateData.license_expiry = licenseExpiry;
      if (profilePhoto) updateData.profile_photo = profilePhoto;
      if (department) updateData.department = department;
      if (municipality) updateData.municipality = municipality;

      if (Object.keys(updateData).length > 0) {
        // Obtener el ID del conductor en Supabase
        const drivers = await supabaseGet('drivers', { user_id: driverId }, '*', {
          requireServiceRole: true,
        });
        if (drivers && drivers.length > 0) {
          const driverId_supabase = drivers[0].id;
          await supabaseUpdate('drivers', driverId_supabase, updateData);
          console.log(`✅ [updateDriverProfile] Perfil actualizado en Supabase`);
        } else {
          console.warn(`⚠️ [updateDriverProfile] Conductor no encontrado en Supabase`);
        }
      }
    } catch (supabaseError: any) {
      console.warn(`⚠️ [updateDriverProfile] Error actualizando en Supabase REST API:`, supabaseError.message);
    }

    // 3. Actualizar en Realtime DB (para sincronización de compatibilidad)
    if (MIGRATION_FLAGS.SYNC_DRIVERS_STATIC_TO_RTDB) {
      const db = admin.database();
      const updateData: any = {};
      if (firstName) updateData.firstName = firstName;
      if (lastName) updateData.lastName = lastName;
      if (phone) updateData.phone = phone;
      if (licenseNumber) updateData.licenseNumber = licenseNumber;
      if (licenseExpiry) updateData.licenseExpiry = licenseExpiry;
      if (profilePhoto) updateData.profilePhoto = profilePhoto;
      if (department) updateData.department = department;
      if (municipality) updateData.municipality = municipality;

      if (Object.keys(updateData).length > 0) {
        await db.ref(`drivers/${driverId}`).update(updateData);
        console.log(`✅ [updateDriverProfile] Perfil actualizado en Realtime DB`);
      }
    } else {
      console.log('⏭️ [updateDriverProfile] SYNC_DRIVERS_STATIC_TO_RTDB=false, no se actualiza drivers/{id}');
    }

    return {
      success: true,
      message: 'Perfil actualizado correctamente',
    };
  } catch (error: any) {
    console.error('❌ [updateDriverProfile] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
