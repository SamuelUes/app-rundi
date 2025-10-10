/**
 * Supabase Configuration
 * Conexión a PostgreSQL para datos históricos
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://ceytngpresytjhafcadu.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNleXRuZ3ByZXN5dGpoYWZjYWR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5Nzg4NzIsImV4cCI6MjA3NTU1NDg3Mn0.3G9aCmJsjOIL-VG6E49sNnxvKBLITX-I1gFFlWKVslo';

if (!supabaseAnonKey) {
  console.warn('⚠️ SUPABASE_ANON_KEY no configurada. Algunas funciones no funcionarán correctamente.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
