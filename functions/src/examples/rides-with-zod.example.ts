/**
 * EJEMPLO: Cómo usar Zod en Cloud Functions
 * Este archivo muestra cómo refactorizar funciones existentes para usar Zod
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { validateData, withValidation } from '../utils/validation';
import {
  CreateRideInputSchema,
  AcceptRideInputSchema,
  CompleteRideInputSchema,
  CancelRideInputSchema,
} from '../schemas/ride.schema';

// ============================================
// EJEMPLO 1: Validación manual
// ============================================
export const requestRideExample = functions.https.onCall(async (data, context) => {
  // Verificar autenticación
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  // ✅ VALIDAR con Zod
  const validatedData = validateData(CreateRideInputSchema, data);
  
  console.log('✅ Datos validados:', validatedData);
  
  // Ahora validatedData tiene tipos correctos
  // TypeScript sabe que validatedData.origin.lat es un number
  // TypeScript sabe que validatedData.paymentMethod es 'cash' | 'stripe' | ...
  
  try {
    // Crear viaje en Firebase
    const rideRef = admin.database().ref('activeRides').push();
    await rideRef.set({
      ...validatedData,
      id: rideRef.key,
      status: 'requested',
      createdAt: admin.database.ServerValue.TIMESTAMP,
    });
    
    return {
      success: true,
      rideId: rideRef.key,
      message: 'Viaje creado exitosamente',
    };
  } catch (error: any) {
    console.error('❌ Error creando viaje:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================
// EJEMPLO 2: Validación con middleware
// ============================================
export const acceptRideExample = functions.https.onCall(
  withValidation(AcceptRideInputSchema, async (data, context) => {
    // data ya está validado y tiene tipos correctos
    
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
    }
    
    console.log('✅ Conductor acepta viaje:', data.rideId);
    console.log('✅ Precio ofrecido:', data.offeredPrice);
    
    // Lógica de negocio...
    
    return {
      success: true,
      message: 'Oferta enviada exitosamente',
    };
  })
);

// ============================================
// EJEMPLO 3: Validación con try-catch
// ============================================
export const completeRideExample = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    // ✅ VALIDAR
    const validatedData = validateData(CompleteRideInputSchema, data);
    
    // Verificar que el conductor es el correcto
    if (validatedData.driverId !== context.auth.uid) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'No tienes permiso para completar este viaje'
      );
    }
    
    // Actualizar viaje
    await admin.database().ref(`activeRides/${validatedData.rideId}`).update({
      status: 'completed',
      actualDistance: validatedData.actualDistance,
      actualDuration: validatedData.actualDuration,
      finalFare: validatedData.finalFare,
      completedAt: admin.database.ServerValue.TIMESTAMP,
    });
    
    return {
      success: true,
      message: 'Viaje completado exitosamente',
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    console.error('❌ Error completando viaje:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================
// EJEMPLO 4: Validación parcial para updates
// ============================================
export const updateRideExample = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  // Para updates, validamos solo los campos que vienen
  const { rideId, ...updateData } = data;
  
  if (!rideId) {
    throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
  }
  
  // Validar que los campos que vienen son válidos
  // Usamos .partial() para hacer todos los campos opcionales
  const validatedData = validateData(
    CreateRideInputSchema.partial(),
    updateData
  );
  
  await admin.database().ref(`activeRides/${rideId}`).update({
    ...validatedData,
    updatedAt: admin.database.ServerValue.TIMESTAMP,
  });
  
  return {
    success: true,
    message: 'Viaje actualizado exitosamente',
  };
});

// ============================================
// EJEMPLO 5: Validación con transformaciones
// ============================================

// Nota: CancelRideInputSchema ya tiene un transform, así que no se puede hacer extend
// const CancelRideWithTransformSchema = CancelRideInputSchema.extend({
//   // Transformar cancelReason a minúsculas
//   cancelReason: z.string().min(1).max(500).transform(val => val.toLowerCase()),
// });

export const cancelRideExample = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  // Usar CancelRideInputSchema directamente (ya tiene transform)
  const validatedData = validateData(CancelRideInputSchema, data);
  
  // validatedData.cancelReason ya está normalizado
  console.log('Razón de cancelación:', validatedData.cancelReason);
  
  await admin.database().ref(`activeRides/${validatedData.rideId}`).update({
    status: 'canceled',
    canceledBy: validatedData.canceledBy,
    cancelReason: validatedData.cancelReason,
    canceledAt: admin.database.ServerValue.TIMESTAMP,
  });
  
  return {
    success: true,
    message: 'Viaje cancelado exitosamente',
  };
});

// ============================================
// EJEMPLO 6: Validación con custom refinements
// ============================================
const CreateRideWithCustomValidation = CreateRideInputSchema.refine(
  (data) => {
    // Validación custom: precio sugerido no puede ser menor que el estimado
    if (data.clientSuggestedPrice && data.clientSuggestedPrice < data.estimatedPrice * 0.8) {
      return false;
    }
    return true;
  },
  {
    message: 'El precio sugerido no puede ser menor al 80% del precio estimado',
    path: ['clientSuggestedPrice'],
  }
);

export const requestRideWithCustomValidation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const validatedData = validateData(CreateRideWithCustomValidation, data);
  
  // Crear viaje con datos validados
  console.log('Creando viaje con precio sugerido:', validatedData.clientSuggestedPrice);
  console.log('Precio estimado:', validatedData.estimatedPrice);
  
  return {
    success: true,
    message: 'Viaje creado con validación custom',
    rideId: 'example-ride-id',
  };
});
