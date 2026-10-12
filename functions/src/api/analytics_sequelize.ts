/**
 * Analytics API - Versión Sequelize
 * Gestión de eventos de analytics
 */

import * as functions from 'firebase-functions/v1';
import { AnalyticsEventRepository } from '../sequelize/repositories/AnalyticsEventRepository';

const analyticsRepo = new AnalyticsEventRepository();

/**
 * Registrar evento de analytics
 */
export const logAnalyticsEvent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { eventType, eventData } = data;
    const userId = context.auth.uid;

    if (!eventType) {
      throw new functions.https.HttpsError('invalid-argument', 'eventType es requerido');
    }

    console.log(`📊 [logAnalyticsEvent] Registrando evento: ${eventType}`);

    const event = await analyticsRepo.create({
      user_id: userId,
      event_type: eventType,
      event_data: eventData || null,
    });

    return {
      success: true,
      event: {
        id: event.id,
        eventType: event.event_type,
        timestamp: event.timestamp,
      },
    };
  } catch (error: any) {
    console.error('❌ [logAnalyticsEvent] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener eventos del usuario
 */
export const getUserAnalyticsEvents = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const userId = context.auth.uid;

    console.log(`📊 [getUserAnalyticsEvents] Obteniendo eventos del usuario: ${userId}`);

    const events = await analyticsRepo.findByUserId(userId);

    return {
      success: true,
      count: events.length,
      events: events.map((e: any) => ({
        id: e.id,
        eventType: e.event_type,
        eventData: e.event_data,
        timestamp: e.timestamp,
      })),
    };
  } catch (error: any) {
    console.error('❌ [getUserAnalyticsEvents] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener eventos por tipo
 */
export const getEventsByType = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { eventType } = data;

    if (!eventType) {
      throw new functions.https.HttpsError('invalid-argument', 'eventType es requerido');
    }

    console.log(`📊 [getEventsByType] Obteniendo eventos de tipo: ${eventType}`);

    const events = await analyticsRepo.findByEventType(eventType);

    return {
      success: true,
      count: events.length,
      events: events.map((e: any) => ({
        id: e.id,
        userId: e.user_id,
        eventType: e.event_type,
        timestamp: e.timestamp,
      })),
    };
  } catch (error: any) {
    console.error('❌ [getEventsByType] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
