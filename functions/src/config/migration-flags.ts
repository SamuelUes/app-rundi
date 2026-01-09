/**
 * Migration feature flags to control Firebase Realtime DB mirrors while migrating to Supabase.
 * Toggle with environment variables. Defaults keep current behavior to avoid breaking the UI.
 *
 * - MIRROR_PENALTIES_TO_RTDB: update driverPenalties/{driverId}/summary in RTDB
 * - LOG_DRIVER_COMMISSION_PAYMENTS_TO_RTDB: push entries to driverCommissionPayments/{driverId}
 * - USE_RTDB_DESIGNATED_DRIVER_REQUESTS: store/read designatedDriverRequests in RTDB
 */
export const MIGRATION_FLAGS = {
  MIRROR_PENALTIES_TO_RTDB:
    (process.env.MIRROR_PENALTIES_TO_RTDB ?? 'true').toLowerCase() !== 'false',

  LOG_DRIVER_COMMISSION_PAYMENTS_TO_RTDB:
    (process.env.LOG_DRIVER_COMMISSION_PAYMENTS_TO_RTDB ?? 'true').toLowerCase() !== 'false',

  USE_RTDB_DESIGNATED_DRIVER_REQUESTS:
    (process.env.USE_RTDB_DESIGNATED_DRIVER_REQUESTS ?? 'true').toLowerCase() !== 'false',

  // Sync of static driver profile to RTDB `drivers/{id}`
  SYNC_DRIVERS_STATIC_TO_RTDB:
    (process.env.SYNC_DRIVERS_STATIC_TO_RTDB ?? 'true').toLowerCase() !== 'false',

  // Sync of driver rides snapshots to RTDB `drivers/{id}/rides`
  SYNC_DRIVER_RIDES_TO_RTDB:
    (process.env.SYNC_DRIVER_RIDES_TO_RTDB ?? 'true').toLowerCase() !== 'false',
} as const;

export type MigrationFlags = typeof MIGRATION_FLAGS;
