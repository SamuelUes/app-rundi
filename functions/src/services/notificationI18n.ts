/**
 * notificationI18n.ts
 * Internacionalización de notificaciones push.
 *
 * Soporta 'es' (español, default) y 'en' (inglés).
 * El idioma se obtiene del perfil del usuario en Firestore (campo `language`).
 * Si no se especifica, se usa español como fallback.
 */

import admin from 'firebase-admin';

export type NotificationLanguage = 'es' | 'en';

/** Cache en memoria de idiomas por uid (TTL 5 min) */
const languageCache = new Map<string, { lang: NotificationLanguage; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Diccionario de traducciones por clave de notificación */
const translations: Record<string, Record<NotificationLanguage, { title: string; body: string }>> = {
  ride_scheduled: {
    es: { title: 'Viaje programado', body: 'Tu viaje fue programado correctamente.' },
    en: { title: 'Ride scheduled', body: 'Your ride was scheduled successfully.' },
  },
  driver_assigned: {
    es: { title: 'Conductor asignado', body: 'Un conductor se asignó a tu viaje programado.' },
    en: { title: 'Driver assigned', body: 'A driver was assigned to your scheduled ride.' },
  },
  driver_confirmed: {
    es: { title: 'Conductor confirmó', body: 'El conductor confirmó tu viaje programado.' },
    en: { title: 'Driver confirmed', body: 'The driver confirmed your scheduled ride.' },
  },
  scheduled_canceled_by_client: {
    es: { title: 'Viaje programado cancelado', body: 'El cliente canceló el viaje programado.' },
    en: { title: 'Scheduled ride canceled', body: 'The client canceled the scheduled ride.' },
  },
  scheduled_canceled_by_driver: {
    es: { title: 'Viaje programado cancelado', body: 'El conductor canceló el viaje programado.' },
    en: { title: 'Scheduled ride canceled', body: 'The driver canceled the scheduled ride.' },
  },
  driver_on_way: {
    es: { title: 'Conductor en camino', body: 'Tu conductor se dirige al punto de recogida.' },
    en: { title: 'Driver on the way', body: 'Your driver is heading to the pickup point.' },
  },
  ride_request_sent: {
    es: { title: 'Solicitud enviada', body: 'Estamos buscando un conductor para tu viaje' },
    en: { title: 'Request sent', body: 'We are looking for a driver for your ride' },
  },
  driver_available: {
    es: { title: 'Conductor disponible', body: 'Un conductor está listo para tu viaje. Revísalo ahora.' },
    en: { title: 'Driver available', body: 'A driver is ready for your ride. Check it now.' },
  },
  ride_assigned: {
    es: { title: 'Viaje asignado', body: 'El cliente confirmó el viaje. Dirígete al punto de encuentro.' },
    en: { title: 'Ride assigned', body: 'The client confirmed the ride. Head to the pickup point.' },
  },
  ride_completed: {
    es: { title: 'Viaje finalizado', body: 'Por favor confirma y realiza el pago.' },
    en: { title: 'Ride completed', body: 'Please confirm and make the payment.' },
  },
  ride_completed_rating: {
    es: { title: 'Viaje finalizado', body: 'Por favor confirma y realiza el pago.' },
    en: { title: 'Ride completed', body: 'Please confirm and make the payment.' },
  },
  ride_canceled_client: {
    es: { title: 'Viaje cancelado', body: 'Tu solicitud de viaje fue cancelada.' },
    en: { title: 'Ride canceled', body: 'Your ride request was canceled.' },
  },
  ride_canceled_driver: {
    es: { title: 'Viaje cancelado', body: 'El cliente canceló la solicitud antes de iniciar el viaje.' },
    en: { title: 'Ride canceled', body: 'The client canceled the request before starting the ride.' },
  },
  programmed_ride_reminder: {
    es: { title: 'Recordatorio de viaje', body: 'Tu viaje programado comienza pronto.' },
    en: { title: 'Ride reminder', body: 'Your scheduled ride starts soon.' },
  },
  programmed_ride_confirmation: {
    es: { title: 'Confirmación pendiente', body: 'Tu viaje programado necesita confirmación.' },
    en: { title: 'Confirmation needed', body: 'Your scheduled ride needs confirmation.' },
  },
  live_ride_driver_assigned: {
    es: { title: 'Conductor confirmado', body: 'Tu viaje fue asignado. Te avisaremos del progreso.' },
    en: { title: 'Driver confirmed', body: 'Your ride was assigned. We will keep you updated.' },
  },
  live_ride_driver_on_route: {
    es: { title: 'Conductor en camino', body: 'Tu conductor se dirige al punto de encuentro.' },
    en: { title: 'Driver on the way', body: 'Your driver is heading to the pickup point.' },
  },
  live_ride_arrived_pickup: {
    es: { title: 'Conductor llegó', body: 'Tu conductor está en el punto de recogida.' },
    en: { title: 'Driver arrived', body: 'Your driver is at the pickup point.' },
  },
  live_ride_trip_in_progress: {
    es: { title: 'Viaje en progreso', body: 'Estás en camino a tu destino.' },
    en: { title: 'Trip in progress', body: 'You are on your way to your destination.' },
  },
  live_ride_completed: {
    es: { title: 'Viaje finalizado', body: 'Tu viaje terminó, revisa el resumen.' },
    en: { title: 'Ride completed', body: 'Your ride is finished, check the summary.' },
  },
  live_ride_canceled: {
    es: { title: 'Viaje cancelado', body: 'El viaje fue cancelado.' },
    en: { title: 'Ride canceled', body: 'The ride was canceled.' },
  },
};

/**
 * Obtiene el idioma preferido del usuario desde Firestore.
 * Cachea el resultado por 5 minutos para evitar lecturas repetidas.
 */
export const getUserLanguage = async (userId: string): Promise<NotificationLanguage> => {
  const cached = languageCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.lang;
  }

  try {
    const db = admin.firestore();
    const doc = await db.collection('users').doc(userId).get();
    const lang = doc.exists && doc.get('language') === 'en' ? 'en' : 'es';
    languageCache.set(userId, { lang, expiresAt: Date.now() + CACHE_TTL_MS });
    return lang;
  } catch {
    return 'es';
  }
};

/**
 * Obtiene el título y cuerpo traducidos para una clave de notificación.
 * Si la clave no existe, retorna los strings originales pasados como fallback.
 */
export const getTranslatedNotification = (
  key: string,
  lang: NotificationLanguage,
  fallbackTitle: string,
  fallbackBody: string,
): { title: string; body: string } => {
  const entry = translations[key];
  if (!entry) {
    return { title: fallbackTitle, body: fallbackBody };
  }
  return entry[lang] ?? entry.es;
};

/**
 * Obtiene el idioma y las traducciones en una sola llamada.
 * Útil para usar dentro de notifyUserSafe.
 */
export const getNotificationForUser = async (
  userId: string,
  key: string,
  fallbackTitle: string,
  fallbackBody: string,
): Promise<{ title: string; body: string; lang: NotificationLanguage }> => {
  const lang = await getUserLanguage(userId);
  const { title, body } = getTranslatedNotification(key, lang, fallbackTitle, fallbackBody);
  return { title, body, lang };
};
