/**
 * Price Negotiation API - Sequelize
 * Funciones para negociar precios entre cliente y conductor
 */

import * as functions from 'firebase-functions';
import admin from 'firebase-admin';

const db = admin.database();

/**
 * Negociar precio - Cliente o conductor sugiere un precio
 */
export const negotiatePrice = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { rideId, suggestedPrice, role, driverId } = data;

    if (!rideId || !suggestedPrice || !role) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId, suggestedPrice y role son requeridos');
    }

    console.log(`💰 [negotiatePrice] ${role} sugiriendo precio: ${suggestedPrice} para viaje: ${rideId}${driverId ? ` (conductor: ${driverId})` : ''}`);

    // Obtener datos del viaje
    const rideSnapshot = await db.ref(`activeRides/${rideId}`).once('value');
    const rideData = rideSnapshot.val();

    if (!rideData) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    // Validar que el viaje esté en estado "requested"
    if (rideData.status !== 'requested') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `No se puede negociar en estado: ${rideData.status}`
      );
    }

    // ✅ NUEVO: Crear estructura de negociación
    const negotiationData: any = {
      estimatedPrice: rideData.estimatedPrice || 0,
      status: role === 'client' ? 'client_suggested' : 'driver_offered',
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    };

    // Actualizar el viaje con la sugerencia de precio
    const updateData: any = {
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    };

    if (role === 'client') {
      updateData.clientSuggestedPrice = suggestedPrice;
      updateData.negotiationStatus = 'client_suggested';
      negotiationData.clientSuggestedPrice = suggestedPrice;
      console.log(`✅ [negotiatePrice] Cliente sugirió: C$${suggestedPrice}`);
    } else if (role === 'driver') {
      // ✅ NUEVO: Bloquear si el conductor está BUSY
      if (driverId) {
        try {
          const locSnap = await db.ref(`driverLocations/${driverId}`).once('value');
          const status = String(locSnap.val()?.status || '').toLowerCase();
          if (status === 'busy') {
            throw new functions.https.HttpsError('failed-precondition', 'DRIVER_BUSY');
          }
        } catch (locErr: any) {
          if (locErr instanceof functions.https.HttpsError) throw locErr;
          console.warn('⚠️ [negotiatePrice] Error verificando driverLocations:', locErr?.message || locErr);
        }
      }
      updateData.driverOfferedPrice = suggestedPrice;
      updateData.negotiationStatus = 'driver_offered';
      negotiationData.driverOfferedPrice = suggestedPrice;
      
      // ✅ NUEVO: Si es conductor, guardar también en offers/{driverId}
      if (driverId) {
        console.log(`✅ [negotiatePrice] Guardando contraoferta en offers/${driverId}`);
        
        // Obtener datos del conductor
        const driverSnapshot = await db.ref(`driversInfo/${driverId}`).once('value');
        const driverInfo = driverSnapshot.val();
        
        // Guardar en offers
        await db.ref(`activeRides/${rideId}/offers/${driverId}`).update({
          offeredPrice: suggestedPrice,
          status: 'pending',
          driver: {
            id: driverId,
            name: driverInfo?.name || 'Conductor',
            rating: driverInfo?.rating || 0,
            photoURL: driverInfo?.photoURL || null,
            lat: driverInfo?.lat || null,
            lng: driverInfo?.lng || null,
            vehicle: driverInfo?.vehicle || null,
          },
          createdAt: admin.database.ServerValue.TIMESTAMP,
          updatedAt: admin.database.ServerValue.TIMESTAMP,
        });
      }
      
      console.log(`✅ [negotiatePrice] Conductor ofreció: C$${suggestedPrice}`);
    }

    // Agregar estructura de negociación
    updateData.negotiation = negotiationData;

    await db.ref(`activeRides/${rideId}`).update(updateData);

    // ✅ NUEVO: Sincronizar a Supabase
    try {
      const { RideRepository } = await import('../sequelize/repositories/RideRepository');
      const rideRepo = new RideRepository();
      
      const supabaseUpdateData: any = {};
      
      if (role === 'client') {
        supabaseUpdateData.client_suggested_price = suggestedPrice;
      } else if (role === 'driver') {
        supabaseUpdateData.driver_offered_price = suggestedPrice;
      }
      
      if (Object.keys(supabaseUpdateData).length > 0) {
        await rideRepo.update(rideId, supabaseUpdateData);
        console.log(`✅ [negotiatePrice] Datos guardados en Supabase:`, supabaseUpdateData);
      }
    } catch (supabaseError: any) {
      console.warn(`⚠️ [negotiatePrice] Error sincronizando a Supabase:`, supabaseError.message);
      // No lanzar error - Firebase ya fue actualizado
    }

    return {
      success: true,
      message: `${role === 'client' ? 'Cliente' : 'Conductor'} sugirió C$${suggestedPrice}`,
      ride: {
        id: rideId,
        ...updateData,
      },
    };
  } catch (error: any) {
    console.error('❌ [negotiatePrice] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Aceptar precio del cliente - Conductor acepta la sugerencia del cliente
 */
export const acceptClientPrice = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { rideId } = data;
    const driverId = context.auth.uid; // ✅ Obtener driverId del contexto de autenticación

    if (!rideId) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
    }

    console.log(`✅ [acceptClientPrice] Conductor ${driverId} aceptando precio del cliente para: ${rideId}`);

    // ✅ NUEVO: Bloquear si el conductor está BUSY
    try {
      const locSnap = await db.ref(`driverLocations/${driverId}`).once('value');
      const status = String(locSnap.val()?.status || '').toLowerCase();
      if (status === 'busy') {
        throw new functions.https.HttpsError('failed-precondition', 'DRIVER_BUSY');
      }
    } catch (locErr: any) {
      if (locErr instanceof functions.https.HttpsError) throw locErr;
      console.warn('⚠️ [acceptClientPrice] Error verificando driverLocations:', locErr?.message || locErr);
    }

    // Obtener datos del viaje
    const rideSnapshot = await db.ref(`activeRides/${rideId}`).once('value');
    const rideData = rideSnapshot.val();

    if (!rideData) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    const clientPrice = rideData.clientSuggestedPrice;
    if (clientPrice == null || isNaN(clientPrice)) {
      throw new functions.https.HttpsError('invalid-argument', 'Precio del cliente inválido o no definido');
    }

    // Obtener datos del conductor para adjuntarlos al viaje
    let driverInfo: any = null;
    try {
      const driverInfoSnapshot = await db.ref(`driversInfo/${driverId}`).once('value');
      driverInfo = driverInfoSnapshot.val();
    } catch (driverError) {
      console.warn('⚠️ [acceptClientPrice] No se pudo obtener driversInfo:', driverError);
    }

    const driverPayload = driverInfo
      ? {
          id: driverId,
          name: driverInfo.name || null,
          rating: driverInfo.rating || null,
          photoURL: driverInfo.photoURL || driverInfo.profilePhoto || null,
          vehicle: driverInfo.vehicle || null,
        }
      : {
          id: driverId,
        };

    const rideUpdate: any = {
      finalFare: clientPrice,
      negotiationStatus: 'client_accepted',
      driverOfferedPrice: null,
      clientSuggestedPrice: 0, // Se limpia para evitar duplicados
      driverId,
      driver: driverPayload,
      status: rideData.status === 'requested' ? 'pending_confirm' : rideData.status,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    };

    // Actualizar viaje: aceptar precio del cliente y adjuntar conductor
    await db.ref(`activeRides/${rideId}`).update(rideUpdate);

    // ✅ Asegurar que exista una oferta aceptada para el conductor
    await db.ref(`activeRides/${rideId}/offers/${driverId}`).update({
      offeredPrice: clientPrice,
      status: 'accepted',
      driver: driverPayload,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      createdAt: admin.database.ServerValue.TIMESTAMP,
    });

    // ✅ Sincronizar información clave a Supabase
    try {
      const { RideRepository } = await import('../sequelize/repositories/RideRepository');
      const rideRepo = new RideRepository();
      await rideRepo.update(rideId, {
        final_fare: clientPrice,
        negotiation_status: 'client_accepted',
        status: 'pending_confirm',
        driver_id: driverId,
      });
    } catch (supabaseError: any) {
      console.warn('⚠️ [acceptClientPrice] Error sincronizando a Supabase:', supabaseError.message);
    }

    console.log(`✅ [acceptClientPrice] Precio aceptado: C$${clientPrice}`);

    return {
      success: true,
      message: `Precio aceptado: C$${clientPrice}`,
      ride: {
        id: rideId,
        finalFare: clientPrice,
        negotiationStatus: 'client_accepted',
      },
    };
  } catch (error: any) {
    console.error('❌ [acceptClientPrice] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});


/**
 * Hacer contraoferta - Conductor hace contraoferta al precio del cliente
 */
export const makeCounterOffer = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  try {
    const { rideId, counterPrice, driverId } = data;

    if (!rideId || !counterPrice) {
      throw new functions.https.HttpsError("invalid-argument", "rideId y counterPrice son requeridos");
    }

    console.log(`💰 [makeCounterOffer] Conductor haciendo contraoferta: C$${counterPrice} para: ${rideId}`);

    // Obtener datos del viaje
    const rideSnapshot = await db.ref(`activeRides/${rideId}`).once('value');
    const rideData = rideSnapshot.val();

    if (!rideData) {
      throw new functions.https.HttpsError("not-found", "Viaje no encontrado");
    }

    // Obtener datos del conductor si se proporciona driverId
    let driverInfo: any = null;
    if (driverId) {
      const driverSnapshot = await db.ref(`driversInfo/${driverId}`).once('value');
      driverInfo = driverSnapshot.val();
      console.log(`📍 Datos del conductor obtenidos:`, driverInfo ? 'OK' : 'NO ENCONTRADO');
    }

    // ✅ NUEVO: Bloquear si el conductor está BUSY
    if (driverId) {
      try {
        const locSnap = await db.ref(`driverLocations/${driverId}`).once('value');
        const status = String(locSnap.val()?.status || '').toLowerCase();
        if (status === 'busy') {
          throw new functions.https.HttpsError('failed-precondition', 'DRIVER_BUSY');
        }
      } catch (locErr: any) {
        if (locErr instanceof functions.https.HttpsError) throw locErr;
        console.warn('⚠️ [makeCounterOffer] Error verificando driverLocations:', locErr?.message || locErr);
      }
    }

    // ✅ NUEVO: Guardar contraoferta en offers con datos del conductor
    if (driverId) {
      await db.ref(`activeRides/${rideId}/offers/${driverId}`).update({
        offeredPrice: counterPrice,
        status: 'pending',
        driver: {
          id: driverId,
          name: driverInfo?.name || 'Conductor',
          rating: driverInfo?.rating || 0,
          photoURL: driverInfo?.photoURL || null,
          lat: driverInfo?.lat || null,
          lng: driverInfo?.lng || null,
          vehicle: driverInfo?.vehicle || null,
        },
        createdAt: admin.database.ServerValue.TIMESTAMP,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });
      console.log(`✅ [makeCounterOffer] Contraoferta guardada en offers/${driverId}`);
    }

    // Actualizar viaje con contraoferta
    await db.ref(`activeRides/${rideId}`).update({
      driverOfferedPrice: counterPrice,
      negotiationStatus: 'driver_offered',
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    });

    console.log(`✅ [makeCounterOffer] Contraoferta registrada: C$${counterPrice}`);

    return {
      success: true,
      message: `Contraoferta: C$${counterPrice}`,
      ride: {
        id: rideId,
        driverOfferedPrice: counterPrice,
        negotiationStatus: 'driver_offered',
      },
    };
  } catch (error: any) {
    console.error("❌ [makeCounterOffer] Error:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Aceptar contraoferta del conductor - Cliente acepta la contraoferta
 */
export const acceptCounterOffer = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { rideId, driverId } = data; // ✅ NUEVO: Aceptar driverId como parámetro

    if (!rideId) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
    }

    console.log(`✅ [acceptCounterOffer] Cliente aceptando contraoferta para: ${rideId}${driverId ? ` (conductor: ${driverId})` : ''}`);

    // Obtener datos del viaje
    const rideSnapshot = await db.ref(`activeRides/${rideId}`).once('value');
    const rideData = rideSnapshot.val();

    if (!rideData) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    if (!rideData.driverOfferedPrice) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'No hay contraoferta del conductor'
      );
    }

    let acceptedPrice = rideData.driverOfferedPrice;

    if (driverId && rideData.offers && rideData.offers[driverId] && rideData.offers[driverId].offeredPrice) {
      acceptedPrice = rideData.offers[driverId].offeredPrice;
      console.log(`✅ [acceptCounterOffer] Usando precio específico de la oferta: C$${acceptedPrice}`);
    } else if (driverId) {
      console.warn(`⚠️ [acceptCounterOffer] No se encontró offeredPrice en offers/${driverId}, usando driverOfferedPrice global`);
    }

    // ✅ Detalles del conductor seleccionado (desde offer actual)
    const selectedOffer = driverId && rideData.offers ? rideData.offers[driverId] : null;
    const selectedDriver = selectedOffer?.driver || null;

    const baseUpdate: any = {
      finalFare: acceptedPrice,
      driverOfferedPrice: acceptedPrice,
      negotiationStatus: 'accepted',
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    };

    // ✅ Guardar información del conductor aceptado si está disponible
    if (selectedDriver) {
      baseUpdate.driver = {
        id: driverId,
        name: selectedDriver.name || null,
        rating: selectedDriver.rating || null,
        photoURL: selectedDriver.photoURL || selectedDriver.profilePhoto || null,
        vehicle: selectedDriver.vehicle || null,
      };
    }

    // ✅ Actualizar negociación anidada (si existe nodo negotiation)
    baseUpdate['negotiation'] = {
      status: 'accepted',
      driverOfferedPrice: acceptedPrice,
      driverId: driverId || null,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    };

    await db.ref(`activeRides/${rideId}`).update(baseUpdate);

    // ✅ NUEVO: Actualizar el status de la oferta a "accepted" si se proporciona driverId
    if (driverId && rideData.offers && rideData.offers[driverId]) {
      console.log(`✅ [acceptCounterOffer] Actualizando status de oferta en offers/${driverId} a "accepted"`);
      await db.ref(`activeRides/${rideId}/offers/${driverId}`).update({
        status: 'accepted',
        offeredPrice: acceptedPrice,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });
    }

    // ✅ Cancelar otras ofertas para reflejar elección final
    if (rideData.offers) {
      await Promise.all(
        Object.entries(rideData.offers).map(async ([offerDriverId, offerData]: [string, any]) => {
          if (offerDriverId === driverId) return;
          await db.ref(`activeRides/${rideId}/offers/${offerDriverId}`).update({
            status: 'canceled',
            canceledAt: admin.database.ServerValue.TIMESTAMP,
          });
        })
      );
    }

    console.log(`✅ [acceptCounterOffer] Contraoferta aceptada: C$${acceptedPrice}`);

    return {
      success: true,
      message: `Contraoferta aceptada: C$${acceptedPrice}`,
      ride: {
        id: rideId,
        finalFare: acceptedPrice,
        negotiationStatus: 'accepted',
      },
    };
  } catch (error: any) {
    console.error('❌ [acceptCounterOffer] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Rechazar contraoferta - Cliente rechaza la contraoferta del conductor
 */
export const rejectCounterOffer = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { rideId } = data;

    if (!rideId) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
    }

    console.log(`❌ [rejectCounterOffer] Cliente rechazando contraoferta para: ${rideId}`);

    // Obtener datos del viaje
    const rideSnapshot = await db.ref(`activeRides/${rideId}`).once('value');
    const rideData = rideSnapshot.val();

    if (!rideData) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    // Actualizar viaje: volver a estado de sugerencia del cliente
    await db.ref(`activeRides/${rideId}`).update({
      driverOfferedPrice: null,
      negotiationStatus: 'client_suggested',
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    });

    console.log(`✅ [rejectCounterOffer] Contraoferta rechazada`);

    return {
      success: true,
      message: 'Contraoferta rechazada',
      ride: {
        id: rideId,
        negotiationStatus: 'client_suggested',
      },
    };
  } catch (error: any) {
    console.error('❌ [rejectCounterOffer] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
