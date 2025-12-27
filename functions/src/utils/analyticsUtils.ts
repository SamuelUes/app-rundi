/**
 * Utilidades para registrar eventos de analytics
 */

import pool from '../config/database';

export interface AnalyticsEvent {
  userId?: string;
  eventType: string;
  eventData?: any;
  ipAddress?: string;
  userAgent?: string;
  platform?: string;
  appVersion?: string;
}

/**
 * Registrar evento de analytics en Supabase
 */
export async function logAnalyticsEvent(event: AnalyticsEvent): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO analytics_events (
        user_id, event_type, event_data, ip_address, user_agent, platform, app_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        event.userId || null,
        event.eventType,
        event.eventData ? JSON.stringify(event.eventData) : null,
        event.ipAddress || null,
        event.userAgent || null,
        event.platform || 'mobile',
        event.appVersion || '1.6.4',
      ]
    );
    
    console.log(`📊 Analytics event logged: ${event.eventType}`);
    return true;
  } catch (error: any) {
    console.error(`❌ Error logging analytics event:`, error);
    return false;
  } finally {
    client.release();
  }
}

/**
 * Eventos predefinidos para el sistema
 */
export const AnalyticsEvents = {
  // Rides
  RIDE_REQUESTED: 'ride_requested',
  RIDE_ACCEPTED: 'ride_accepted',
  RIDE_DRIVER_ON_ROUTE: 'ride_driver_on_route',
  RIDE_STARTED: 'ride_started',
  RIDE_COMPLETED: 'ride_completed',
  RIDE_CANCELED: 'ride_canceled',
  CLIENT_CONFIRMED_DRIVER: 'client_confirmed_driver',
  
  // Price Negotiation
  PRICE_SUGGESTED: 'price_suggested',
  PRICE_ACCEPTED: 'price_accepted',
  PRICE_REJECTED: 'price_rejected',
  DRIVER_OFFER_SENT: 'driver_offer_sent',
  DRIVER_OFFER_ACCEPTED: 'driver_offer_accepted',
  
  // Payments
  PAYMENT_INITIATED: 'payment_initiated',
  PAYMENT_COMPLETED: 'payment_completed',
  PAYMENT_FAILED: 'payment_failed',
  
  // Driver
  DRIVER_STATUS_CHANGED: 'driver_status_changed',
  DRIVER_LOCATION_UPDATED: 'driver_location_updated',
  
  // User
  USER_REGISTERED: 'user_registered',
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
  
  // Errors
  ERROR_OCCURRED: 'error_occurred',
  SYNC_FAILED: 'sync_failed',
};

/**
 * Helper para registrar eventos de viaje
 */
export async function logRideEvent(
  eventType: string,
  rideId: string,
  userId: string,
  additionalData?: any
): Promise<void> {
  await logAnalyticsEvent({
    userId,
    eventType,
    eventData: {
      rideId,
      ...additionalData,
    },
    platform: 'mobile',
  });
}

/**
 * Helper para registrar errores
 */
export async function logError(
  errorType: string,
  errorMessage: string,
  userId?: string,
  additionalData?: any
): Promise<void> {
  await logAnalyticsEvent({
    userId,
    eventType: AnalyticsEvents.ERROR_OCCURRED,
    eventData: {
      errorType,
      errorMessage,
      ...additionalData,
    },
    platform: 'backend',
  });
}

/**
 * Helper para registrar fallos de sincronización
 */
export async function logSyncFailure(
  operation: string,
  rideId: string,
  error: any
): Promise<void> {
  await logAnalyticsEvent({
    eventType: AnalyticsEvents.SYNC_FAILED,
    eventData: {
      operation,
      rideId,
      errorMessage: error.message,
      errorStack: error.stack,
    },
    platform: 'backend',
  });
}
