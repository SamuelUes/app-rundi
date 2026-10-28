/**
 * Cliente de Supabase REST API — Barrel re-export
 *
 * Este archivo re-exporta todo desde los módulos separados para mantener
 * compatibilidad con imports existentes: `from '../supabase/client'`.
 *
 * Módulos:
 * - config.ts   → credenciales, buildHeaders, getAuthKey
 * - rest.ts     → supabaseGet, supabasePost, supabaseUpdate, supabaseDelete
 * - rides.ts    → consultas de viajes
 * - drivers.ts  → consultas de conductores
 * - storage.ts  → upload a Supabase Storage
 */

export type { SupabaseGetOptions } from './rest';
export { supabaseGet, supabaseGetIn, supabasePost, supabaseUpdate, supabaseDelete, supabaseRpc } from './rest';
export {
  supabaseGetSimpleRides,
  supabaseGetRidesWithLocationsAndPayments,
  supabaseGetRideLocations,
  supabaseGetRidePayments,
  supabaseGetRidesWithDetails,
} from './rides';
export { supabaseGetDriverWithVehicles, supabaseGetDriversWithVehiclesBatch } from './drivers';
export { supabaseUploadJsonToStorage } from './storage';
