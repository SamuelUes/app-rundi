/**
 * Constantes v2 — nombres canónicos de colecciones Firestore.
 * Espejo de functions-v2/internal/fs/client.go y database-v2/firestore/firestore.rules.
 * Una sola database; raíces lógicas prefijadas (convención aprobada).
 */

export const FS_COL = {
  // DATA-MAIN — modelos de lectura persistentes
  users: 'DATA-MAIN_users',
  drivers: 'DATA-MAIN_drivers',
  vehicles: 'DATA-MAIN_vehicles',
  payments: 'DATA-MAIN_payments',
  services: 'DATA-MAIN_services',
  features: 'DATA-MAIN_features',
  pricing: 'DATA-MAIN_pricing',
  appConfig: 'DATA-MAIN_app_config',
  serviceAreas: 'DATA-MAIN_service_areas',
  notifications: 'DATA-MAIN_notifications',

  // REALTIME — estado operativo vivo
  userSessions: 'REALTIME_user_sessions',
  presence: 'REALTIME_presence',
  driversLive: 'REALTIME_drivers_live',
  tripsLive: 'REALTIME_trips_live',
  driverOffers: 'REALTIME_driver_offers',
  driverPublic: 'REALTIME_driver_public_profiles',
  paymentsLive: 'REALTIME_payments_live',
  calls: 'REALTIME_calls',
  chats: 'REALTIME_chats',
  programmed: 'REALTIME_programmed_rides',
  driverCrews: 'REALTIME_driver_crews',
  crewMembership: 'REALTIME_driver_crew_membership',
  crewInvites: 'REALTIME_driver_crew_invites',
  arrivalPhotos: 'REALTIME_designated_arrival_photos',

  // SAAS / SYSTEM — backend-only (nunca leer desde cliente)
  // pendingEvents es la excepción del doc §5.2: create validado en reglas
  // para el batch atómico doc-operacional + pending_event.
  pendingEvents: 'SYSTEM_pending_events',
} as const;

export type FsCollection = (typeof FS_COL)[keyof typeof FS_COL];
