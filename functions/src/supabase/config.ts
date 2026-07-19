/**
 * Supabase REST API — Configuración y credenciales
 * Extraído de client.ts para modularidad.
 */

import dotenv from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import * as functions from 'firebase-functions';

const nodeEnv = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const envFilePath = nodeEnv === 'production' ? '.env.production' : '.env.development';

dotenv.config({ path: envFilePath });

let supabaseUrl: string | undefined;
let supabaseAnonKey: string | undefined;
let supabaseServiceRoleKey: string | undefined;

type SupabaseRuntimeConfig = {
  url?: string;
  key?: string;
  service_role_key?: string;
  service_role?: string;
};

function loadRuntimeConfig(): SupabaseRuntimeConfig {
  try {
    const cfg = (functions as any).config ? (functions as any).config() : undefined;
    if (cfg?.supabase) {
      console.log('✅ [Supabase Client] Credenciales obtenidas de functions.config().supabase');
      return cfg.supabase as SupabaseRuntimeConfig;
    }
  } catch (error: any) {
    console.log('⚠️ [Supabase Client] No se pudo leer functions.config():', error.message);
  }

  const candidatePaths = [
    path.resolve(process.cwd(), '.runtimeconfig.json'),
    path.resolve(__dirname, '..', '..', '.runtimeconfig.json'),
  ];

  for (const candidate of candidatePaths) {
    try {
      if (!existsSync(candidate)) {
        continue;
      }
      const raw = readFileSync(candidate, 'utf8');
      const json = JSON.parse(raw);
      if (json?.supabase) {
        console.log(`✅ [Supabase Client] Credenciales obtenidas de ${candidate}`);
        return json.supabase as SupabaseRuntimeConfig;
      }
    } catch (error: any) {
      console.log(`⚠️ [Supabase Client] No se pudo leer ${candidate}:`, error.message);
    }
  }

  return {};
}

const runtimeSupabase = loadRuntimeConfig();

function normalizeEnv(value?: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

supabaseUrl = normalizeEnv(process.env.SUPABASE_URL) ?? runtimeSupabase.url;
supabaseAnonKey = normalizeEnv(process.env.SUPABASE_ANON_KEY) ?? runtimeSupabase.key;
supabaseServiceRoleKey =
  normalizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY) ??
  runtimeSupabase.service_role_key ??
  runtimeSupabase.service_role;

if (!supabaseUrl || (!supabaseAnonKey && !supabaseServiceRoleKey)) {
  console.error(`❌ [Supabase Client] ERROR: Credenciales de Supabase no configuradas`);
  console.error(`   SUPABASE_URL: ${supabaseUrl ? '✅' : '❌'}`);
  console.error(`   SUPABASE_ANON_KEY: ${supabaseAnonKey ? '✅' : '❌'}`);
  console.error(`   SUPABASE_SERVICE_ROLE_KEY: ${supabaseServiceRoleKey ? '✅' : '❌'}`);
  console.error(`   Configura en Firebase: firebase functions:config:set supabase.url="..." supabase.key="..."`);
  console.error(`   y opcionalmente supabase.service_role_key="..." para operaciones privilegiadas`);
}

if (process.env.FUNCTIONS_EMULATOR || process.env.NODE_ENV !== 'production') {
  console.log(`✅ [Supabase Client] Inicializado`);
  console.log(`   URL: ${supabaseUrl}`);
  console.log(`   Clave anónima disponible: ${supabaseAnonKey ? '✅' : '❌'}`);
  console.log(`   Clave service_role disponible: ${supabaseServiceRoleKey ? '✅' : '❌'}`);
}

export function getAuthKey(requireServiceRole: boolean): string {
  if (requireServiceRole) {
    if (supabaseServiceRoleKey) {
      return supabaseServiceRoleKey;
    }
    throw new Error('Supabase service role key no configurada. Define supabase.service_role_key o SUPABASE_SERVICE_ROLE_KEY.');
  }

  if (supabaseAnonKey) {
    return supabaseAnonKey;
  }

  if (supabaseServiceRoleKey) {
    return supabaseServiceRoleKey;
  }

  throw new Error('Supabase anon key no configurada. Define supabase.key o SUPABASE_ANON_KEY.');
}

export function buildHeaders(requireServiceRole: boolean, extra?: Record<string, string>) {
  const key = getAuthKey(requireServiceRole);
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  } as Record<string, string>;
}

export { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey };
