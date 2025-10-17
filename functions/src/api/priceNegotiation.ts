/**
 * Price Negotiation Functions
 * Sistema de negociación de precio entre cliente y conductor
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import pool from '../config/database';

/**
 * Sugerir o contraofertar precio
 * Cliente puede sugerir precio al solicitar viaje
 * Conductor puede contraofertar cuando ve la solicitud
 */
export const negotiatePrice = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { rideId, suggestedPrice, role } = data;
  const userId = context.auth.uid;

  if (!rideId || !suggestedPrice || !role) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Faltan parámetros requeridos: rideId, suggestedPrice, role'
    );
  }

  if (suggestedPrice <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'El precio debe ser mayor a 0');
  }

  try {
    // Obtener viaje desde Firebase Realtime Database
    const db = admin.database();
    const rideSnapshot = await db.ref(`activeRides/${rideId}`).once('value');
    
    if (!rideSnapshot.exists()) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    const ride = rideSnapshot.val();

    // Validar permisos
    if (role === 'client' && ride.clientId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'No tienes permiso para modificar este viaje');
    }

    // Para conductores: permitir contraoferta si el viaje está en 'requested' O si ya es su viaje
    if (role === 'driver') {
      const isRequestedRide = ride.status === 'requested' && !ride.driverId;
      const isAssignedDriver = ride.driverId === userId;
      
      if (!isRequestedRide && !isAssignedDriver) {
        throw new functions.https.HttpsError('permission-denied', 'No tienes permiso para modificar este viaje');
      }
    }

    // Actualizar en Firebase Realtime Database
    const rideRef = db.ref(`activeRides/${rideId}`);
    
    // Si es CLIENTE sugiriendo precio, actualizar el precio sugerido global
    if (role === 'client') {
      await rideRef.update({
        clientSuggestedPrice: suggestedPrice,
        negotiationStatus: 'pending',
        lastNegotiationBy: 'client',
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });
    }
    
    // Si es CONDUCTOR haciendo contraoferta, agregar a driverOffers
    if (role === 'driver') {
      try {
        const driverDoc = await admin.firestore().collection('users').doc(userId).get();
        const driverData = driverDoc.data();
        
        if (driverData) {
          const driverOffer = {
            driver: {
              id: userId,
              name: driverData.name || 'Conductor',
              rating: driverData.rating || 0,
              phone: driverData.phone || '',
              vehicle: driverData.vehicle || null,
            },
            offeredPrice: suggestedPrice,
            acceptedClientPrice: false,
            status: 'pending', // pending, accepted, rejected
            timestamp: admin.database.ServerValue.TIMESTAMP,
          };
          
          // Agregar o actualizar la oferta de este conductor
          await rideRef.child(`driverOffers/${userId}`).set(driverOffer);
          
          // Actualizar timestamp del viaje
          await rideRef.update({
            lastUpdate: admin.database.ServerValue.TIMESTAMP,
          });
        }
      } catch (error) {
        console.error('Error obteniendo info del conductor:', error);
        throw new functions.https.HttpsError('internal', 'Error al procesar oferta del conductor');
      }
    }

    // Enviar notificación a la otra parte
    const recipientId = role === 'client' ? ride.driver_id : ride.client_id;
    const recipientRole = role === 'client' ? 'driver' : 'client';

    if (recipientId) {
      try {
        // Obtener token FCM del destinatario
        const userDoc = await admin.firestore().collection('users').doc(recipientId).get();
        const fcmToken = userDoc.data()?.fcmToken;

        if (fcmToken) {
          const message = {
            notification: {
              title: role === 'client' ? '💰 Precio Sugerido' : '💰 Contraoferta Recibida',
              body: `${role === 'client' ? 'El cliente sugiere' : 'El conductor ofrece'} C$${suggestedPrice} para el viaje`,
            },
            data: {
              type: 'price_negotiation',
              rideId: rideId,
              suggestedPrice: suggestedPrice.toString(),
              role: role,
            },
            token: fcmToken,
          };

          await admin.messaging().send(message);
          console.log(`✅ Notificación enviada a ${recipientRole}`);
        }
      } catch (error) {
        console.error('❌ Error enviando notificación:', error);
        // No fallar la función si la notificación falla
      }
    }

    console.log(`✅ Precio negociado por ${role}: C$${suggestedPrice}`);

    return {
      success: true,
      message: `Precio ${role === 'client' ? 'sugerido' : 'ofrecido'} exitosamente`,
      ride: {
        id: rideId,
        estimatedPrice: ride.estimatedPrice,
        clientSuggestedPrice: role === 'client' ? suggestedPrice : ride.clientSuggestedPrice,
        driverOfferedPrice: role === 'driver' ? suggestedPrice : ride.driverOfferedPrice,
      },
    };
  } catch (error: any) {
    console.error('❌ Error negociando precio:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Conductor acepta el precio del cliente directamente
 * El conductor aparece en la lista de ofertas con acceptedClientPrice = true
 */
export const acceptClientPrice = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { rideId } = data;
  const driverId = context.auth.uid;

  if (!rideId) {
    throw new functions.https.HttpsError('invalid-argument', 'Falta parámetro: rideId');
  }

  try {
    console.log(`🔍 Buscando viaje ${rideId} en Firebase...`);
    
    // Obtener viaje desde Firebase
    const db = admin.database();
    const rideRef = db.ref(`activeRides/${rideId}`);
    const snapshot = await rideRef.once('value');
    
    if (!snapshot.exists()) {
      console.error(`❌ Viaje ${rideId} no encontrado en Firebase`);
      throw new functions.https.HttpsError('not-found', `Viaje ${rideId} no encontrado`);
    }
    
    const ride = snapshot.val();
    console.log(`✅ Viaje encontrado en Firebase: status=${ride.status}`);

    // Obtener info del conductor desde Firestore Y driversInfo
    const driverDoc = await admin.firestore().collection('users').doc(driverId).get();
    let driverData = driverDoc.data();

    if (!driverData) {
      throw new functions.https.HttpsError('not-found', 'Conductor no encontrado');
    }

    // Obtener datos adicionales desde driversInfo (Firebase Realtime DB)
    const driverInfoSnapshot = await db.ref(`driversInfo/${driverId}`).once('value');
    const driverInfo = driverInfoSnapshot.val();
    
    // Combinar datos de Firestore y driversInfo
    driverData = {
      ...driverData,
      name: driverData.name || driverData.displayName || driverInfo?.name || 'Conductor',
      phone: driverData.phone || driverData.phoneNumber || driverInfo?.phone || '',
      rating: driverData.rating || driverInfo?.rating || 0,
    };

    // Obtener datos del vehículo desde Supabase
    let vehicleData = null;
    const client = await pool.connect();
    try {
      const vehicleResult = await client.query(
        `SELECT v.* FROM vehicles v
         INNER JOIN drivers d ON v.driver_id = d.id
         WHERE d.user_id = $1
         ORDER BY v.created_at DESC
         LIMIT 1`,
        [driverId]
      );

      if (vehicleResult.rows.length > 0) {
        const vehicle = vehicleResult.rows[0];
        vehicleData = {
          plate: vehicle.plate,
          brand: vehicle.brand,
          make: vehicle.brand,
          model: vehicle.model,
          color: vehicle.color,
          year: vehicle.year,
          type: vehicle.type,
        };
        console.log(`🚗 Datos del vehículo obtenidos para conductor ${driverId}:`, vehicleData);
      }
    } catch (error) {
      console.error('❌ Error obteniendo datos del vehículo:', error);
    } finally {
      client.release();
    }

    const acceptedPrice = ride.clientSuggestedPrice || ride.estimatedPrice;

    // Crear oferta del conductor aceptando el precio del cliente
    const driverOffer = {
      driver: {
        id: driverId,
        name: driverData.name || 'Conductor',
        rating: driverData.rating || 0,
        phone: driverData.phone || '',
      },
      offeredPrice: acceptedPrice.toString(),
      acceptedClientPrice: true, // ✅ Aceptó el precio del cliente
      status: 'accepted',
      timestamp: admin.database.ServerValue.TIMESTAMP,
    };

    // Actualizar viaje en Firebase - asignar conductor y cambiar a driver_assigned
    console.log(`💾 Actualizando viaje en Firebase...`);
    await rideRef.update({
      estimatedPrice: acceptedPrice.toString(),
      finalFare: acceptedPrice.toString(),
      driverId: driverId,
      driver: driverOffer.driver,
      vehicle: vehicleData,
      status: 'driver_assigned',
      negotiationStatus: 'accepted',
      acceptedAt: admin.database.ServerValue.TIMESTAMP,
      lastUpdate: admin.database.ServerValue.TIMESTAMP,
    });

    // Agregar oferta a driverOffers
    await rideRef.child(`driverOffers/${driverId}`).set(driverOffer);
    console.log(`✅ Viaje actualizado en Firebase: status=driver_assigned`);

    // Notificar al cliente
    try {
      const clientDoc = await admin.firestore().collection('users').doc(ride.clientId).get();
      const fcmToken = clientDoc.data()?.fcmToken;

      if (fcmToken) {
        await admin.messaging().send({
          token: fcmToken,
          notification: {
            title: '✅ Conductor Asignado',
            body: `${driverData.name} aceptó tu precio de C$${acceptedPrice}. Confirma para iniciar el viaje.`,
          },
          data: {
            type: 'driver_accepted_price',
            rideId: rideId,
            driverId: driverId,
          },
        });
        console.log(`📬 Notificación enviada al cliente`);
      }
    } catch (error) {
      console.error('Error enviando notificación:', error);
    }

    console.log(`🎉 Conductor ${driverData.name} aceptó precio del cliente: C$${driverOffer.offeredPrice}`);

    return {
      success: true,
      message: 'Precio del cliente aceptado',
    };
  } catch (error: any) {
    console.error('❌ Error aceptando precio del cliente:', error);
    console.error('Stack trace:', error.stack);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Cliente acepta la oferta de un conductor específico
 * Esto asigna el viaje a ese conductor y rechaza las demás ofertas
 */
export const acceptDriverOffer = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { rideId, driverId, acceptedPrice } = data;
  const clientId = context.auth.uid;

  if (!rideId || !driverId || !acceptedPrice) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Faltan parámetros: rideId, driverId, acceptedPrice'
    );
  }

  const client = await pool.connect();
  try {
    // Verificar que el viaje existe y pertenece al cliente
    const rideResult = await client.query(
      'SELECT * FROM rides WHERE id = $1 AND client_id = $2',
      [rideId, clientId]
    );

    if (rideResult.rows.length === 0) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado o no tienes permiso');
    }

    // Actualizar viaje en PostgreSQL
    const result = await client.query(
      `UPDATE rides 
       SET final_fare = $1,
           estimated_price = $1,
           driver_id = $2,
           status = 'driver_assigned',
           updated_at = NOW() 
       WHERE id = $3 
       RETURNING *`,
      [acceptedPrice, driverId, rideId]
    );

    const updatedRide = result.rows[0];

    // Actualizar en Firebase
    const db = admin.database();
    const rideRef = db.ref(`activeRides/${rideId}`);
    
    // Obtener la oferta del conductor aceptado
    const driverOfferSnapshot = await rideRef.child(`driverOffers/${driverId}`).once('value');
    const driverOffer = driverOfferSnapshot.val();

    if (!driverOffer) {
      throw new functions.https.HttpsError('not-found', 'Oferta del conductor no encontrada');
    }

    // Obtener datos del vehículo desde Supabase
    let vehicleData = null;
    try {
      const vehicleResult = await client.query(
        `SELECT v.* FROM vehicles v
         INNER JOIN drivers d ON v.driver_id = d.id
         WHERE d.user_id = $1
         ORDER BY v.created_at DESC
         LIMIT 1`,
        [driverId]
      );

      if (vehicleResult.rows.length > 0) {
        const vehicle = vehicleResult.rows[0];
        vehicleData = {
          plate: vehicle.plate,
          brand: vehicle.brand,
          make: vehicle.brand, // Alias para compatibilidad
          model: vehicle.model,
          color: vehicle.color,
          year: vehicle.year,
          type: vehicle.type,
        };
        console.log(`🚗 Datos del vehículo obtenidos para conductor ${driverId}:`, vehicleData);
      }
    } catch (error) {
      console.error('❌ Error obteniendo datos del vehículo:', error);
    }

    // Actualizar el viaje como driver_assigned (esperando confirmación del cliente)
    await rideRef.update({
      estimatedPrice: acceptedPrice,
      finalFare: acceptedPrice,
      driverId: driverId,
      driver: driverOffer.driver, // Info completa del conductor
      vehicle: vehicleData, // Agregar datos del vehículo
      status: 'driver_assigned',
      negotiationStatus: 'accepted',
      acceptedAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    });

    // Marcar la oferta del conductor como aceptada
    await rideRef.child(`driverOffers/${driverId}`).update({
      status: 'accepted',
    });

    // Rechazar todas las demás ofertas
    const allOffersSnapshot = await rideRef.child('driverOffers').once('value');
    const allOffers = allOffersSnapshot.val() || {};
    
    const rejectPromises = Object.keys(allOffers)
      .filter(id => id !== driverId)
      .map(id => rideRef.child(`driverOffers/${id}`).update({ status: 'rejected' }));
    
    await Promise.all(rejectPromises);

    // Notificar al conductor aceptado
    try {
      const driverDoc = await admin.firestore().collection('users').doc(driverId).get();
      const fcmToken = driverDoc.data()?.fcmToken;

      if (fcmToken) {
        await admin.messaging().send({
          token: fcmToken,
          notification: {
            title: '🎉 ¡Oferta Aceptada!',
            body: `El cliente aceptó tu oferta de C$${acceptedPrice}. Esperando confirmación final...`,
          },
          data: {
            type: 'offer_accepted',
            rideId: rideId,
            acceptedPrice: acceptedPrice.toString(),
          },
        });
      }
    } catch (error) {
      console.error('❌ Error enviando notificación al conductor:', error);
    }

    // Notificar a los conductores rechazados
    for (const rejectedDriverId of Object.keys(allOffers).filter(id => id !== driverId)) {
      try {
        const rejectedDriverDoc = await admin.firestore().collection('users').doc(rejectedDriverId).get();
        const fcmToken = rejectedDriverDoc.data()?.fcmToken;

        if (fcmToken) {
          await admin.messaging().send({
            token: fcmToken,
            notification: {
              title: 'Viaje Tomado',
              body: 'El cliente aceptó otra oferta. Sigue buscando viajes disponibles.',
            },
            data: {
              type: 'offer_rejected',
              rideId: rideId,
            },
          });
        }
      } catch (error) {
        console.error(`❌ Error notificando a conductor ${rejectedDriverId}:`, error);
      }
    }

    console.log(`✅ Cliente aceptó oferta del conductor ${driverId} por C$${acceptedPrice}`);

    return {
      success: true,
      message: 'Oferta aceptada exitosamente',
      ride: {
        id: updatedRide.id,
        driverId: driverId,
        finalFare: acceptedPrice,
      },
    };
  } catch (error: any) {
    console.error('❌ Error aceptando oferta del conductor:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

// Mantener la función antigua para compatibilidad (deprecated)
export const acceptCounterOffer = acceptDriverOffer;

/**
 * Rechazar contraoferta
 * Cuando una parte rechaza el precio propuesto
 */
export const rejectCounterOffer = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { rideId, role } = data;
  const userId = context.auth.uid;

  if (!rideId || !role) {
    throw new functions.https.HttpsError('invalid-argument', 'Faltan parámetros requeridos');
  }

  const client = await pool.connect();
  try {
    const rideResult = await client.query('SELECT * FROM rides WHERE id = $1', [rideId]);

    if (rideResult.rows.length === 0) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    const ride = rideResult.rows[0];

    // Validar permisos
    if (role === 'client' && ride.client_id !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'No tienes permiso');
    }

    if (role === 'driver' && ride.driver_id !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'No tienes permiso');
    }

    // Limpiar precios sugeridos
    await client.query(
      `UPDATE rides 
       SET client_suggested_price = NULL, 
           driver_offered_price = NULL,
           updated_at = NOW() 
       WHERE id = $1`,
      [rideId]
    );

    // Actualizar en Firebase Realtime Database
    const db = admin.database();
    const rideRef = db.ref(`activeRides/${rideId}`);
    await rideRef.update({
      clientSuggestedPrice: null,
      driverOfferedPrice: null,
      negotiationStatus: 'rejected',
      rejectedBy: role,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    });

    // Notificar a la otra parte
    const recipientId = role === 'client' ? ride.driver_id : ride.client_id;

    if (recipientId) {
      try {
        const userDoc = await admin.firestore().collection('users').doc(recipientId).get();
        const fcmToken = userDoc.data()?.fcmToken;

        if (fcmToken) {
          const message = {
            notification: {
              title: '❌ Contraoferta Rechazada',
              body: `${role === 'client' ? 'El cliente' : 'El conductor'} rechazó la contraoferta`,
            },
            data: {
              type: 'price_rejected',
              rideId: rideId,
            },
            token: fcmToken,
          };

          await admin.messaging().send(message);
        }
      } catch (error) {
        console.error('❌ Error enviando notificación:', error);
      }
    }

    return {
      success: true,
      message: 'Contraoferta rechazada',
    };
  } catch (error: any) {
    console.error('❌ Error rechazando contraoferta:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});
