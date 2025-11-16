/**
 * Supabase Configuration
 * Cliente de Supabase para la aplicación
 */

import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { getFirebaseAuth } from './firebase';

const expoExtra =
  Constants.expoConfig?.extra ??
  (Constants as unknown as { manifest?: { extra?: Record<string, any> } })?.manifest?.extra ??
  {};

function resolveSupabaseUrl(): string {
  return (
    expoExtra.EXPO_PUBLIC_SUPABASE_URL ||
    expoExtra.supabaseUrl ||
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    'https://ceytngpresytjhafcadu.supabase.co'
  );
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

if (!expoExtra.EXPO_PUBLIC_SUPABASE_URL && !expoExtra.supabaseUrl && !process.env.EXPO_PUBLIC_SUPABASE_URL) {
  console.warn('⚠️ `EXPO_PUBLIC_SUPABASE_URL` no está definido en `app.config` ni en variables de entorno. Usando fallback por defecto.');
}

if (!SUPABASE_ANON_KEY) {
  console.warn('⚠️ `EXPO_PUBLIC_SUPABASE_KEY`/`SUPABASE_ANON_KEY` no definido. Algunas llamadas a Supabase pueden fallar.');
}

console.log('🔧 Supabase URL:', SUPABASE_URL);
console.log('🔧 Supabase Key:', SUPABASE_ANON_KEY ? '✅ Configurada' : '❌ No configurada');

// Crear cliente de Supabase
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

let lastToken: string | null = null;

export async function ensureSupabaseSession(forceRefresh = false): Promise<void> {
  const auth = await getFirebaseAuth();
  const user = auth.currentUser;

  if (!user) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session) {
      await supabase.auth.signOut();
    }
    lastToken = null;
    return;
  }

  const token = await user.getIdToken(forceRefresh);

  if (!forceRefresh && lastToken === token) {
    return;
  }

  const { data: currentSession } = await supabase.auth.getSession();
  const currentAccessToken = currentSession?.session?.access_token;

  if (currentAccessToken && !forceRefresh && lastToken === token) {
    return;
  }

  const { error: signInError } = await supabase.auth.signInWithIdToken({
    provider: 'firebase',
    token,
  });

  if (signInError) {
    console.warn(
      '⚠️ Supabase auth falló. Verifica que el proveedor Firebase esté habilitado:',
      signInError.message,
    );
    lastToken = null;
    return;
  }

  lastToken = token;
}

export default supabase;
