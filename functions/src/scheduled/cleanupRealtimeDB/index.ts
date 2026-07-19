/**
 * cleanupRealtimeDB/index.ts
 * Barrel que agrupa todas las funciones scheduled de limpieza de Realtime Database.
 *
 * Reemplaza al antiguo archivo cleanupRealtimeDB.ts (monolítico).
 * Cada función está en su propio archivo para mejor mantenibilidad.
 */

export { cleanupDriverLocations } from './cleanupDriverLocations';
export { cleanupRideLocations } from './cleanupRideLocations';
export { cleanupChatMessages } from './cleanupChatMessages';
export { cleanupNotifications } from './cleanupNotifications';
export { cleanupPresenceHistory } from './cleanupPresenceHistory';
export { cleanupInactiveUsers } from './cleanupInactiveUsers';
