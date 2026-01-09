/**
 * Supabase Configuration
 * Conexión a PostgreSQL para datos históricos
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY as string;
  
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ SUPABASE_URL o SUPABASE_ANON_KEY no configuradas. Algunas funciones no funcionarán correctamente.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
