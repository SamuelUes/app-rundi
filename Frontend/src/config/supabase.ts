/**
 * Supabase Configuration
 * Cliente de Supabase para la aplicación
 */

import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { resolveLocalSupabaseUrl } from './localEmulatorHost';
 

const expoExtra =
  Constants.expoConfig?.extra ??
  (Constants as unknown as { manifest?: { extra?: Record<string, any> } })?.manifest?.extra ??
  {};

function resolveSupabaseUrl(): string {
  const url =
    expoExtra.EXPO_PUBLIC_SUPABASE_URL ||
    expoExtra.supabaseUrl ||
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    '';
  return resolveLocalSupabaseUrl(url, Platform.OS);
}

function resolveSupabaseKey(): string {
  return (
    expoExtra.EXPO_PUBLIC_SUPABASE_KEY ||
    expoExtra.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    expoExtra.supabaseKey ||
    process.env.EXPO_PUBLIC_SUPABASE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  );
}

const SUPABASE_URL = resolveSupabaseUrl();
const SUPABASE_ANON_KEY = resolveSupabaseKey();

export { SUPABASE_URL, SUPABASE_ANON_KEY };

if (!SUPABASE_URL) {
  console.warn(
    '⚠️ `EXPO_PUBLIC_SUPABASE_URL`/`SUPABASE_URL` no está definido en `app.config` ni en variables de entorno. Debes configurarlo en tu .env o app.config.'
  );
}

if (!SUPABASE_ANON_KEY) {
  console.warn('⚠️ `EXPO_PUBLIC_SUPABASE_KEY`/`SUPABASE_ANON_KEY` no definido. Algunas llamadas a Supabase pueden fallar.');
}

// Crear cliente de Supabase
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export async function ensureSupabaseSession(_forceRefresh = false): Promise<void> {
  return;
}

export default supabase;

