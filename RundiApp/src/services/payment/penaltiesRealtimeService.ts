/**
 * @deprecated Supabase Realtime fue eliminado en la migración v2.
 * Las penalizaciones del conductor llegan vía proyecciones Firestore
 * (DATA-MAIN_drivers / listeners v2) — no hay canal Supabase.
 * Sin consumidores activos; se conserva la firma por compatibilidad.
 */

export type PenaltyRealtimeUnsubscribe = () => void;

export async function subscribeToDriverPenaltyChanges(
  _driverId: string,
  _callback: () => void,
): Promise<PenaltyRealtimeUnsubscribe> {
  console.warn('[penaltiesRealtimeService] deprecated: Supabase Realtime no existe en v2');
  return () => {};
}

export default {
  subscribeToDriverPenaltyChanges,
};
