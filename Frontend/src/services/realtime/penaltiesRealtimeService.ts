/**
 * penaltiesRealtimeService
 * Suscribe a cambios en penalizaciones del conductor usando Supabase Realtime.
 */

import { RealtimeChannel } from '@supabase/supabase-js';
import supabase, { ensureSupabaseSession } from '../../config/supabase';

export type PenaltyRealtimeUnsubscribe = () => void;

/**
 * Suscribe a cambios en `driver_penalties` para un conductor específico.
 * Al suscribirse exitosamente se ejecuta `onChange` inmediatamente.
 */
export async function subscribeToDriverPenaltyChanges(
  driverId: string,
  onChange: () => void | Promise<void>,
): Promise<PenaltyRealtimeUnsubscribe> {
  await ensureSupabaseSession();

  const channelName = `driver-penalties-${driverId}`;
  const channel: RealtimeChannel = supabase.channel(channelName);

  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'driver_penalties', filter: `driver_id=eq.${driverId}` },
    () => {
      void onChange();
    },
  );

  await channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      void onChange();
    }
  });

  return () => {
    supabase.removeChannel(channel);
  };
}

export default {
  subscribeToDriverPenaltyChanges,
};
