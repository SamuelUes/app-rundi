/**
 * Price Negotiation API - Sequelize
 * Funciones para negociar precios entre cliente y conductor
 */

import * as functions from 'firebase-functions/v1';
import admin from 'firebase-admin';
import { requireDriver } from '../utils/sessionUtils';
import { assertNotCrewFollower } from '../helpers/designatedCrewStore';

const db = admin.database();

// Tope razonable de tarifa (C$) para rechazar payloads absurdos o negativos.
const MAX_NEGOTIATED_PRICE = 100000;

const assertValidPrice = (raw: any): number => {
  const price = Number(raw);
  if (!Number.isFinite(price) || price <= 0 || price > MAX_NEGOTIATED_PRICE) {
    throw new functions.https.HttpsError('invalid-argument', 'Precio inválido');
  }
  return price;
};

// Límite relativo de negociación; no hay techo comercial absoluto.
const dynamicMinimumFare = (rideData: any): number | null => {
  const snapshot = rideData?.pricingSnapshot ?? rideData?.pricing_snapshot;
  const configuredMinimum = Number(snapshot?.dynamicMinimumFare ?? snapshot?.dynamic_minimum_fare);
  if (Number.isFinite(configuredMinimum) && configuredMinimum > 0) {
    return configuredMinimum;
  }
  const fareBeforeSurge = Number(snapshot?.fareBeforeSurge ?? snapshot?.fare_before_surge);
  const surgeMultiplier = Number(snapshot?.surgeMultiplier ?? snapshot?.surge_multiplier ?? 1);
  if (!Number.isFinite(fareBeforeSurge) || fareBeforeSurge <= 0 || surgeMultiplier <= 1) {
    return null;
  }
  return Number((fareBeforeSurge * (1 + (Math.min(surgeMultiplier, 1.6) - 1) * 0.5)).toFixed(2));
};

const assertPriceWithinEstimate = (price: number, estimatedPrice: any, rideData?: any) => {
  const estimated = Number(estimatedPrice);
  if (!Number.isFinite(estimated) || estimated <= 0) return; // sin referencia, solo sanity check
  const surgeFloor = dynamicMinimumFare(rideData) ?? 0;
  const minBound = Math.max(50, Math.round(estimated * 0.6667 * 100) / 100, surgeFloor);
  const maxBound = Math.max(minBound, Math.round(estimated * 1.3333 * 100) / 100);
  if (price < minBound || price > maxBound) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `El precio debe estar entre C$${minBound} y C$${maxBound}`,
    );
  }
};

// El SDK standalone de admin.database() evalúa transaction() contra el cache
// local del sync tree — sin un listener previo el path llega vacío, el update
// recibe null y aborta en el cliente sin llegar al servidor. Este helper
// mantiene un listener activo durante la transacción para poblar el cache
// (al desconectarlo antes, el sync tree descarta los datos y vuelve a null).
const transactionOnPath = async (path: string, update: (current: any) => any) => {
  const ref = db.ref(path);
  await new Promise<void>((resolve, reject) => {
    const onValue = () => resolve();
    const onError = (err: Error) => {
      ref.off('value', onValue);
      reject(err);
    };
    ref.on('value', onValue, onError);
  });
  try {
    return await ref.transaction(update);
  } finally {
    ref.off();
  }
};

/**
 * Lógica compartida de negociación — usada por negotiatePrice y por el alias
 * de compatibilidad sendDriverOffer (clientes antiguos).
 */
const handleNegotiatePrice = async (data: any, context: functions.https.CallableContext) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { rideId, suggestedPrice, role } = data;
    const callerUid = context.auth!.uid;

    if (!rideId || suggestedPrice == null || !role) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId, suggestedPrice y role son requeridos');
    }

    // ✅ Precio siempre validado server-side (el cliente valida solo por UX)
    const price = assertValidPrice(suggestedPrice);

    // Obtener datos del viaje
    const rideSnapshot = await db.ref(`activeRides/${rideId}`).once('value');
    const rideData = rideSnapshot.val();

    if (!rideData) {
      const programmedSnap = await db.ref(`programmedRides/${rideId}`).once('value');
      if (programmedSnap.val()) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'El viaje programado aún no está activo. No se puede negociar hasta su hora programada.',
        );
      }
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    // ✅ Seguridad: el rol y el driverId se derivan del auth.uid — nunca del payload.
    let driverId: string | null = null;
    if (role === 'client') {
      if (rideData.clientId !== callerUid) {
        throw new functions.https.HttpsError('permission-denied', 'Solo el cliente del viaje puede sugerir precio');
      }
    } else if (role === 'driver') {
      if (rideData.clientId === callerUid) {
        throw new functions.https.HttpsError('permission-denied', 'No puedes ofertar en tu propio viaje');
      }
      await requireDriver(context);
      driverId = callerUid;
      await assertNotCrewFollower(driverId);
    } else {
      throw new functions.https.HttpsError('invalid-argument', 'role debe ser client o driver');
    }

    console.log(`💰 [negotiatePrice] ${role} sugiriendo precio: ${price} para viaje: ${rideId}${driverId ? ` (conductor: ${driverId})` : ''}`);

    // Validar que el viaje esté en estado "requested"
    if (rideData.status !== 'requested') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `No se puede negociar en estado: ${rideData.status}`
      );
    }

    // ✅ Límites server-side respecto al precio estimado (el cliente solo valida por UX)
    assertPriceWithinEstimate(price, rideData.estimatedPrice, rideData);

    const now = admin.database.ServerValue.TIMESTAMP;
    let driverPayload: any = null;

    if (role === 'driver' && driverId) {
      // Bloquear si el conductor está BUSY (best-effort fuera de la transacción)
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

      const driverSnapshot = await db.ref(`driversInfo/${driverId}`).once('value');
      const driverInfo = driverSnapshot.val();
      driverPayload = {
        id: driverId,
        name: driverInfo?.fullName || driverInfo?.name || 'Conductor',
        rating: driverInfo?.averageRating || driverInfo?.rating || 0,
        photoURL: driverInfo?.photoURL || driverInfo?.profilePhoto || null,
        lat: driverInfo?.lat || null,
        lng: driverInfo?.lng || null,
        vehicle: driverInfo?.vehicle || null,
      };
    }

    // ✅ Transacción atómica: re-valida el estado y aplica sugerencia + oferta en una sola escritura
    const negotiationStatus = role === 'client' ? 'client_suggested' : 'driver_offered';
    let txError: 'not_found' | 'status' | null = null;
    const txResult = await transactionOnPath(`activeRides/${rideId}`, (current: any) => {
      txError = null;
      if (!current) {
        txError = 'not_found';
        return;
      }
      if (current.status !== 'requested') {
        txError = 'status';
        return;
      }

      if (role === 'client') {
        current.clientSuggestedPrice = price;
      } else {
        current.driverOfferedPrice = price;
        current.offers = current.offers || {};
        const prevOffer = current.offers[driverId!] || {};
        current.offers[driverId!] = {
          ...prevOffer,
          offeredPrice: price,
          status: 'pending',
          driver: driverPayload,
          createdAt: prevOffer.createdAt ?? now,
          updatedAt: now,
        };
      }
      current.negotiationStatus = negotiationStatus;
      current.negotiation = {
        ...(current.negotiation || {}),
        estimatedPrice: current.estimatedPrice || 0,
        status: negotiationStatus,
        ...(role === 'client' ? { clientSuggestedPrice: price } : { driverOfferedPrice: price }),
        updatedAt: now,
      };
      current.updatedAt = now;
      return current;
    });

    if (!txResult.committed) {
      if (txError === 'not_found') {
        throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
      }
      throw new functions.https.HttpsError('failed-precondition', 'El viaje ya no está disponible para negociar');
    }

    console.log(`✅ [negotiatePrice] ${role === 'client' ? 'Cliente sugirió' : 'Conductor ofreció'}: C$${price}`);

    // ✅ NUEVO: Sincronizar a Supabase
    try {
      const { RideRepository } = await import('../sequelize/repositories/RideRepository');
      const rideRepo = new RideRepository();
      
      const supabaseUpdateData: any = {};
      
      if (role === 'client') {
        supabaseUpdateData.client_suggested_price = price;
      } else if (role === 'driver') {
        supabaseUpdateData.driver_offered_price = price;
      }
      
      if (Object.keys(supabaseUpdateData).length > 0) {
        await rideRepo.update(rideId, supabaseUpdateData);
        console.log(`✅ [negotiatePrice] Datos guardados en Supabase:`, supabaseUpdateData);
      }
    } catch (supabaseError: any) {
      console.warn(`⚠️ [negotiatePrice] Error sincronizando a Supabase:`, supabaseError.message);
      // No lanzar error - Firebase ya fue actualizado
    }

    const committed = txResult.snapshot.val() || {};
    return {
      success: true,
      message: `${role === 'client' ? 'Cliente' : 'Conductor'} sugirió C$${price}`,
      ride: {
        id: rideId,
        clientSuggestedPrice: committed.clientSuggestedPrice ?? null,
        driverOfferedPrice: committed.driverOfferedPrice ?? null,
        negotiationStatus: committed.negotiationStatus ?? negotiationStatus,
      },
    };
  } catch (error: any) {
    console.error('❌ [negotiatePrice] Error:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message);
  }
};

/**
 * Negociar precio - Cliente o conductor sugiere un precio
 */
export const negotiatePrice = functions.https.onCall(handleNegotiatePrice);

/**
 * sendDriverOffer — alias de compatibilidad para clientes antiguos que llamaban
 * al endpoint 'sendDriverOffer' (nunca existió como export → devolvían not-found).
 * Normaliza el payload legado { rideId, driverId, offerPrice } y delega al mismo
 * flujo que negotiatePrice con role='driver'. driverId siempre del auth.uid.
 */
export const sendDriverOffer = functions.https.onCall(async (data, context) => {
  const rideId = data?.rideId;
  const suggestedPrice = data?.offerPrice ?? data?.suggestedPrice ?? data?.price;
  return handleNegotiatePrice({ rideId, suggestedPrice, role: 'driver' }, context);
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
    // ✅ Rol driver obligatorio + driverId siempre del auth.uid
    const driverId = await requireDriver(context);
    await assertNotCrewFollower(driverId);

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

    // ✅ Solo rides sin asignar (o ya vinculados a este conductor en pending_confirm)
    if (rideData.status !== 'requested' && !(rideData.status === 'pending_confirm' && rideData.driverId === driverId)) {
      throw new functions.https.HttpsError('failed-precondition', `El viaje no acepta conductor en estado: ${rideData.status}`);
    }
    if (rideData.driverId && rideData.driverId !== driverId) {
      throw new functions.https.HttpsError('failed-precondition', 'El viaje ya está asignado a otro conductor');
    }
    if (rideData.clientId === driverId) {
      throw new functions.https.HttpsError('permission-denied', 'No puedes aceptar tu propio viaje');
    }

    // Determinar precio del cliente: priorizar clientSuggestedPrice, con fallback a estimatedPrice
    let clientPriceRaw: any = rideData.clientSuggestedPrice;
    if (clientPriceRaw == null || isNaN(clientPriceRaw)) {
      const estimated = rideData.estimatedPrice ?? rideData.estimatedFare ?? rideData.estimated_price;
      const parsedEstimated = typeof estimated === 'string' ? Number(estimated) : estimated;
      if (parsedEstimated == null || !Number.isFinite(parsedEstimated)) {
        throw new functions.https.HttpsError('invalid-argument', 'Precio del cliente inválido o no definido');
      }
      clientPriceRaw = parsedEstimated;
    }

    const clientPrice = Number(clientPriceRaw);
    assertPriceWithinEstimate(clientPrice, rideData.estimatedPrice, rideData);

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
          name: driverInfo.fullName || driverInfo.name || null,
          rating: driverInfo.averageRating || driverInfo.rating || null,
          photoURL: driverInfo.photoURL || driverInfo.profilePhoto || null,
          vehicle: driverInfo.vehicle || null,
        }
      : {
          id: driverId,
        };

    // ✅ Transacción atómica: re-valida el claim y aplica precio + conductor + oferta en una sola escritura
    let txError: 'not_found' | 'status' | 'taken' | 'own' | 'price' | null = null;
    const now = admin.database.ServerValue.TIMESTAMP;
    const txResult = await transactionOnPath(`activeRides/${rideId}`, (current: any) => {
      txError = null;
      if (!current) { txError = 'not_found'; return; }
      const statusOk = current.status === 'requested'
        || (current.status === 'pending_confirm' && current.driverId === driverId);
      if (!statusOk) { txError = 'status'; return; }
      if (current.driverId && current.driverId !== driverId) { txError = 'taken'; return; }
      if (current.clientId === driverId) { txError = 'own'; return; }

      let priceRaw: any = current.clientSuggestedPrice;
      if (priceRaw == null || isNaN(priceRaw)) {
        const estimated = current.estimatedPrice ?? current.estimatedFare ?? current.estimated_price;
        const parsed = typeof estimated === 'string' ? Number(estimated) : estimated;
        if (parsed == null || !Number.isFinite(parsed)) { txError = 'price'; return; }
        priceRaw = parsed;
      }
      const acceptedPrice = Number(priceRaw);

      current.finalFare = acceptedPrice;
      current.negotiationStatus = 'driver_accepted';
      current.driverOfferedPrice = null;
      current.clientSuggestedPrice = acceptedPrice;
      current.acceptedClientPrice = true;
      current.driverId = driverId;
      current.driver = driverPayload;
      current.status = current.status === 'requested' ? 'pending_confirm' : current.status;
      current.negotiation = {
        ...(current.negotiation || {}),
        status: 'driver_accepted',
        clientSuggestedPrice: acceptedPrice,
        acceptedClientPrice: true,
        driverId,
        updatedAt: now,
      };
      current.offers = current.offers || {};
      const prevOffer = current.offers[driverId] || {};
      current.offers[driverId] = {
        ...prevOffer,
        offeredPrice: acceptedPrice,
        status: 'accepted',
        acceptedClientPrice: true,
        driver: driverPayload,
        createdAt: prevOffer.createdAt ?? now,
        updatedAt: now,
      };
      current.updatedAt = now;
      return current;
    });

    if (!txResult.committed) {
      const errMap: Record<string, [any, string]> = {
        not_found: ['not-found', 'Viaje no encontrado'],
        status: ['failed-precondition', 'El viaje no acepta conductor en su estado actual'],
        taken: ['failed-precondition', 'El viaje ya está asignado a otro conductor'],
        own: ['permission-denied', 'No puedes aceptar tu propio viaje'],
        price: ['invalid-argument', 'Precio del cliente inválido o no definido'],
      };
      const [code, message] = errMap[txError || 'status'];
      throw new functions.https.HttpsError(code, message);
    }

    const finalClientPrice = Number(txResult.snapshot.val()?.finalFare ?? clientPrice);

    // ✅ Sincronizar información clave a Supabase
    try {
      const { RideRepository } = await import('../sequelize/repositories/RideRepository');
      const rideRepo = new RideRepository();
      await rideRepo.update(rideId, {
        final_fare: finalClientPrice,
        negotiation_status: 'driver_accepted',
        status: 'pending_confirm',
        driver_id: driverId,
      });
    } catch (supabaseError: any) {
      console.warn('⚠️ [acceptClientPrice] Error sincronizando a Supabase:', supabaseError.message);
    }

    console.log(`✅ [acceptClientPrice] Precio aceptado: C$${finalClientPrice}`);

    return {
      success: true,
      message: `Precio aceptado: C$${finalClientPrice}`,
      ride: {
        id: rideId,
        finalFare: finalClientPrice,
        negotiationStatus: 'driver_accepted',
      },
    };
  } catch (error: any) {
    console.error('❌ [acceptClientPrice] Error:', error);
    if (error instanceof functions.https.HttpsError) throw error;
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
    const { rideId, counterPrice } = data;
    // ✅ driverId siempre del auth.uid — nunca del payload
    const driverId = await requireDriver(context);
    await assertNotCrewFollower(driverId);

    if (!rideId || counterPrice == null) {
      throw new functions.https.HttpsError("invalid-argument", "rideId y counterPrice son requeridos");
    }
    const price = assertValidPrice(counterPrice);

    console.log(`💰 [makeCounterOffer] Conductor ${driverId} haciendo contraoferta: C$${price} para: ${rideId}`);

    // Obtener datos del viaje
    const rideSnapshot = await db.ref(`activeRides/${rideId}`).once('value');
    const rideData = rideSnapshot.val();

    if (!rideData) {
      throw new functions.https.HttpsError("not-found", "Viaje no encontrado");
    }

    if (rideData.status !== 'requested') {
      throw new functions.https.HttpsError("failed-precondition", `No se puede contraofertar en estado: ${rideData.status}`);
    }
    if (rideData.clientId === driverId) {
      throw new functions.https.HttpsError('permission-denied', 'No puedes contraofertar tu propio viaje');
    }

    // ✅ Límites server-side respecto al precio estimado
    assertPriceWithinEstimate(price, rideData.estimatedPrice, rideData);

    // ✅ Bloquear si el conductor está BUSY
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

    // Obtener datos del conductor
    const driverSnapshot = await db.ref(`driversInfo/${driverId}`).once('value');
    const driverInfo = driverSnapshot.val();
    const driverPayload = {
      id: driverId,
      name: driverInfo?.fullName || driverInfo?.name || 'Conductor',
      rating: driverInfo?.averageRating || driverInfo?.rating || 0,
      photoURL: driverInfo?.photoURL || driverInfo?.profilePhoto || null,
      lat: driverInfo?.lat || null,
      lng: driverInfo?.lng || null,
      vehicle: driverInfo?.vehicle || null,
    };

    // ✅ Transacción atómica: re-valida el estado y guarda oferta + resumen en una sola escritura
    const now = admin.database.ServerValue.TIMESTAMP;
    let txError: 'not_found' | 'status' | null = null;
    const txResult = await transactionOnPath(`activeRides/${rideId}`, (current: any) => {
      txError = null;
      if (!current) { txError = 'not_found'; return; }
      if (current.status !== 'requested') { txError = 'status'; return; }

      current.driverOfferedPrice = price;
      current.negotiationStatus = 'driver_offered';
      current.offers = current.offers || {};
      const prevOffer = current.offers[driverId] || {};
      current.offers[driverId] = {
        ...prevOffer,
        offeredPrice: price,
        status: 'pending',
        driver: driverPayload,
        createdAt: prevOffer.createdAt ?? now,
        updatedAt: now,
      };
      current.updatedAt = now;
      return current;
    });

    if (!txResult.committed) {
      if (txError === 'not_found') {
        throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
      }
      throw new functions.https.HttpsError('failed-precondition', 'El viaje ya no está disponible para contraofertar');
    }

    console.log(`✅ [makeCounterOffer] Contraoferta guardada en offers/${driverId}`);

    console.log(`✅ [makeCounterOffer] Contraoferta registrada: C$${price}`);

    return {
      success: true,
      message: `Contraoferta: C$${price}`,
      ride: {
        id: rideId,
        driverOfferedPrice: price,
        negotiationStatus: 'driver_offered',
      },
    };
  } catch (error: any) {
    console.error("❌ [makeCounterOffer] Error:", error);
    if (error instanceof functions.https.HttpsError) throw error;
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

    // ✅ Solo el cliente dueño del viaje puede aceptar una contraoferta
    if (rideData.clientId !== context.auth.uid) {
      throw new functions.https.HttpsError('permission-denied', 'Solo el cliente del viaje puede aceptar la contraoferta');
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
    acceptedPrice = assertValidPrice(acceptedPrice);
    assertPriceWithinEstimate(acceptedPrice, rideData.estimatedPrice, rideData);

    // ✅ Transacción atómica: aceptar oferta + asignar conductor + cancelar el resto en una sola escritura.
    // Además fija driverId top-level para que el conductor pueda leer el viaje (RTDB rules).
    const OPEN_STATUSES = ['requested', 'driver_offered', 'pending_confirm'];
    const now = admin.database.ServerValue.TIMESTAMP;
    let txError: 'not_found' | 'unavailable' | 'no_offer' | null = null;
    const txResult = await transactionOnPath(`activeRides/${rideId}`, (current: any) => {
      txError = null;
      if (!current) { txError = 'not_found'; return; }
      if (current.clientId !== context.auth!.uid) { txError = 'unavailable'; return; }
      if (!OPEN_STATUSES.includes(current.status)) { txError = 'unavailable'; return; }
      if (current.driverId && driverId && current.driverId !== driverId) { txError = 'unavailable'; return; }

      const offer = driverId ? current.offers?.[driverId] : null;
      const rawPrice = offer?.offeredPrice ?? current.driverOfferedPrice;
      const parsedPrice = Number(rawPrice);
      if (rawPrice == null || !Number.isFinite(parsedPrice)) { txError = 'no_offer'; return; }

      current.finalFare = parsedPrice;
      current.driverOfferedPrice = parsedPrice;
      current.negotiationStatus = 'client_accepted';
      if (driverId) {
        current.driverId = driverId;
      }
      if (offer?.driver) {
        current.driver = {
          id: driverId,
          name: offer.driver.name || null,
          rating: offer.driver.rating || null,
          photoURL: offer.driver.photoURL || offer.driver.profilePhoto || null,
          vehicle: offer.driver.vehicle || null,
        };
      }
      current.negotiation = {
        ...(current.negotiation || {}),
        status: 'client_accepted',
        driverOfferedPrice: parsedPrice,
        driverId: driverId || current.driverId || null,
        updatedAt: now,
      };
      current.offers = current.offers || {};
      for (const [offerDriverId, offerData] of Object.entries<any>(current.offers)) {
        if (offerDriverId === driverId) {
          current.offers[offerDriverId] = {
            ...offerData,
            status: 'accepted',
            offeredPrice: parsedPrice,
            updatedAt: now,
          };
        } else if (String(offerData?.status || '').toLowerCase() === 'pending') {
          current.offers[offerDriverId] = {
            ...offerData,
            status: 'canceled',
            canceledAt: now,
            updatedAt: now,
          };
        }
      }
      current.updatedAt = now;
      return current;
    });

    if (!txResult.committed) {
      const errMap: Record<string, [any, string]> = {
        not_found: ['not-found', 'Viaje no encontrado'],
        unavailable: ['failed-precondition', 'El viaje ya no está disponible'],
        no_offer: ['failed-precondition', 'No hay contraoferta del conductor'],
      };
      const [code, message] = errMap[txError || 'unavailable'];
      throw new functions.https.HttpsError(code, message);
    }

    const finalAcceptedPrice = Number(txResult.snapshot.val()?.finalFare ?? acceptedPrice);

    console.log(`✅ [acceptCounterOffer] Contraoferta aceptada: C$${finalAcceptedPrice}`);

    return {
      success: true,
      message: `Contraoferta aceptada: C$${finalAcceptedPrice}`,
      ride: {
        id: rideId,
        finalFare: finalAcceptedPrice,
        negotiationStatus: 'client_accepted',
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

    // ✅ Solo el cliente dueño del viaje puede rechazar la contraoferta
    if (rideData.clientId !== context.auth.uid) {
      throw new functions.https.HttpsError('permission-denied', 'Solo el cliente del viaje puede rechazar la contraoferta');
    }

    // ✅ Transacción atómica: resetear negociación + marcar ofertas pendientes como rechazadas
    const CLOSED_STATUSES = ['accepted', 'driver_on_route', 'driver_arrived', 'in_progress', 'completed', 'canceled'];
    const now = admin.database.ServerValue.TIMESTAMP;
    const txResult = await transactionOnPath(`activeRides/${rideId}`, (current: any) => {
      if (!current) return;
      if (current.clientId !== context.auth!.uid) return;
      if (CLOSED_STATUSES.includes(String(current.status))) return;

      current.driverOfferedPrice = null;
      current.negotiationStatus = 'client_suggested';
      if (current.offers) {
        for (const [offerDriverId, offerData] of Object.entries<any>(current.offers)) {
          if (String(offerData?.status || '').toLowerCase() === 'pending') {
            current.offers[offerDriverId] = {
              ...offerData,
              status: 'rejected',
              rejectedAt: now,
              updatedAt: now,
            };
          }
        }
      }
      current.updatedAt = now;
      return current;
    });

    if (!txResult.committed) {
      throw new functions.https.HttpsError('failed-precondition', 'El viaje ya no es negociable');
    }

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
