export const DEFAULT_SERVICE_AREA_ID = 'ni-managua';

/**
 * Flag global para habilitar/deshabilitar notificaciones push.
 * Se controla con la env var FUNCTIONS_PUSH_NOTIFICATIONS_ENABLED.
 * Centralizado aquí para evitar duplicación en múltiples archivos.
 */
export const PUSH_NOTIFICATIONS_ENABLED =
  process.env.FUNCTIONS_PUSH_NOTIFICATIONS_ENABLED !== 'false';
