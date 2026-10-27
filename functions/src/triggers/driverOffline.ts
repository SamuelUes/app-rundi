import * as functions from 'firebase-functions/v1';
import admin from 'firebase-admin';
import { notifyUserSafe } from '../services/notifyUserSafe';
import { markFollowerAbandoned } from '../helpers/designatedCrewStore';

const db = admin.database();

// Estados de oferta que ya no pueden reactivarse
const TERMINAL_OFFER_STATUSES = new Set(['rejected', 'canceled', 'completed', 'expired']);

/**
 * Cuando un conductor pasa a offline (toggle, app cerrada, presence cleanup),
 * sus ofertas pendientes/aceptadas dejan de ser válidas: se marcan 'rejected'
 * para que desaparezcan del listado del cliente en tiempo real.
 *
 * No aplica a rides donde el conductor ya fue asignado (driverId a nivel ride):
 * updateStatus fuerza 'busy' en ese caso, así que un conductor asignado nunca
 * llega a 'offline' por los caminos normales.
 */
export const rejectDriverOffersOnOffline = functions.database
  .ref('driverLocations/{driverId}/status')
  .onUpdate(async (change, context) => {
    const after = String(change.after.val() ?? '').toLowerCase();
    const before = String(change.before.val() ?? '').toLowerCase();
    if (after !== 'offline' || before === 'offline') {
      return null;
    }

    const driverId = context.params.driverId as string;

    let rides: Record<string, any> = {};
    try {
      const snap = await db.ref('activeRides').once('value');
      rides = snap.val() || {};
    } catch (error: any) {
      console.error('[driverOffline] No se pudo leer activeRides', {
        driverId,
        error: error?.message || error,
      });
      return null;
    }

    const now = admin.database.ServerValue.TIMESTAMP;
    const updates: Record<string, any> = {};
    const notifiedClients = new Set<string>();

    for (const [rideId, ride] of Object.entries<any>(rides)) {
      const offer = ride?.offers?.[driverId];
      if (!offer) {
        continue;
      }
      const offerStatus = String(offer.status || 'pending').toLowerCase();
      if (TERMINAL_OFFER_STATUSES.has(offerStatus)) {
        continue;
      }

      updates[`activeRides/${rideId}/offers/${driverId}/status`] = 'rejected';
      updates[`activeRides/${rideId}/offers/${driverId}/rejectedAt`] = now;
      updates[`activeRides/${rideId}/offers/${driverId}/rejectReason`] = 'driver_offline';
      updates[`activeRides/${rideId}/offers/${driverId}/updatedAt`] = now;

      // Solo avisar si el cliente ya había interactuado con esa oferta
      if (offerStatus === 'accepted' && typeof ride?.clientId === 'string') {
        notifiedClients.add(ride.clientId);
      }
    }

    if (Object.keys(updates).length === 0) {
      return null;
    }

    try {
      await db.ref().update(updates);
      console.log(
        `[driverOffline] Conductor ${driverId} offline: ofertas rechazadas en ${
          Object.keys(updates).length / 4
        } campos`,
      );
    } catch (error: any) {
      console.error('[driverOffline] Error rechazando ofertas', {
        driverId,
        error: error?.message || error,
      });
      return null;
    }

    for (const clientId of notifiedClients) {
      await notifyUserSafe(
        clientId,
        'Conductor no disponible',
        'El conductor que habías seleccionado se desconectó. Puedes elegir otra oferta.',
        { type: 'driver_offline' },
      ).catch(() => undefined);
    }

    return null;
  });

/**
 * Si un seguidor de equipo designado pasa a offline (app cerrada, sesión
 * perdida, presence cleanup) durante un viaje, queda 'abandoned' y el viaje
 * sigue con el capitán.
 */
export const markCrewFollowerAbandonedOnOffline = functions.database
  .ref('driverLocations/{driverId}/status')
  .onUpdate(async (change, context) => {
    const after = String(change.after.val() ?? '').toLowerCase();
    const before = String(change.before.val() ?? '').toLowerCase();
    if (after !== 'offline' || before === 'offline') return null;
    try {
      await markFollowerAbandoned(context.params.driverId as string);
    } catch (error: any) {
      console.error('[driverOffline] Error marcando abandono de seguidor', error?.message || error);
    }
    return null;
  });
