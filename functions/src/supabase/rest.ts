/**
 * Supabase REST API — Operaciones CRUD genéricas
 * Extraído de client.ts para modularidad.
 */

import { supabaseUrl, buildHeaders } from './config';

export type SupabaseGetOptions = {
  limit?: number;
  requireServiceRole?: boolean;
  preferExactCount?: boolean;
  headers?: Record<string, string>;
};

export async function supabaseGet(
  table: string,
  filters?: Record<string, any>,
  select: string = '*',
  limitOrOptions: number | SupabaseGetOptions = 1000,
) {
  try {
    const options: SupabaseGetOptions =
      typeof limitOrOptions === 'number'
        ? { limit: limitOrOptions }
        : { limit: limitOrOptions.limit ?? 1000, ...limitOrOptions };

    const limit = Math.min(Math.max(options.limit ?? 1000, 1), 10000);

    let urlString = `${supabaseUrl}/rest/v1/${table}?select=${select}&limit=${limit}`;
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value === null || value === undefined) {
          // PostgREST: is.null para IS NULL, not.is.null para IS NOT NULL
          urlString += `&${key}=is.null`;
          console.log(`   Filtro: ${key}=is.null`);
        } else {
          const encodedValue = encodeURIComponent(value);
          urlString += `&${key}=eq.${encodedValue}`;
          console.log(`   Filtro: ${key}=eq.${encodedValue}`);
        }
      });
    }
    
    console.log(`🔍 [Supabase GET] Tabla: ${table}, Filtros: ${JSON.stringify(filters)}`);
    console.log(`🔗 [Supabase GET] URL: ${urlString.substring(0, 200)}${urlString.length > 200 ? '...' : ''}`);
    
    const response = await fetch(urlString, {
      method: 'GET',
      headers: buildHeaders(options.requireServiceRole ?? false, {
        ...(options.preferExactCount ? { Prefer: 'count=exact' } : {}),
        ...options.headers,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [Supabase GET] HTTP ${response.status}:`, errorText);
      console.error(`❌ [Supabase GET] Headers:`, {
        'content-type': response.headers.get('content-type'),
        'content-length': response.headers.get('content-length'),
      });
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log(`✅ [Supabase GET] Registros encontrados: ${data.length}`);
    console.log(`✅ [Supabase GET] Response headers:`, {
      'content-type': response.headers.get('content-type'),
      'content-range': response.headers.get('content-range'),
    });
    if (data.length > 0) {
      console.log(`📊 [Supabase GET] Primer registro:`, JSON.stringify(data[0], null, 2));
    }
    return data;
  } catch (error: any) {
    console.error(`❌ [Supabase GET] Error:`, error.message);
    throw error;
  }
}

export async function supabaseGetIn(
  table: string,
  column: string,
  values: readonly string[],
  select: string = '*',
  options: SupabaseGetOptions = {},
) {
  const normalizedValues = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (normalizedValues.length === 0) return [];

  const limit = Math.min(Math.max(options.limit ?? 1000, 1), 10000);
  const query = new URLSearchParams({
    select,
    limit: String(limit),
    [column]: `in.(${normalizedValues.map((value) => `"${value.replace(/"/g, '\\"')}"`).join(',')})`,
  });
  const url = `${supabaseUrl}/rest/v1/${table}?${query.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(options.requireServiceRole ?? false, {
      ...(options.preferExactCount ? { Prefer: 'count=exact' } : {}),
      ...options.headers,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase GET ${table} IN failed: HTTP ${response.status}: ${errorText}`);
  }

  return await response.json();
}

export async function supabasePost(table: string, data: Record<string, any>) {
  try {
    const url = `${supabaseUrl}/rest/v1/${table}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(true, { Prefer: 'return=representation' }),
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [Supabase POST] HTTP ${response.status}:`, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    return await response.json();
  } catch (error: any) {
    console.error(`❌ [Supabase POST] Error:`, error.message);
    throw error;
  }
}

export async function supabaseUpdate(table: string, id: string, data: Record<string, any>) {
  try {
    const url = `${supabaseUrl}/rest/v1/${table}?id=eq.${id}`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: buildHeaders(true, { Prefer: 'return=representation' }),
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error: any) {
    console.error(`❌ [Supabase UPDATE] Error:`, error.message);
    throw error;
  }
}

export async function supabaseDelete(table: string, id: string) {
  try {
    const url = `${supabaseUrl}/rest/v1/${table}?id=eq.${id}`;
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: buildHeaders(true),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return { success: true };
  } catch (error: any) {
    console.error(`❌ [Supabase DELETE] Error:`, error.message);
    throw error;
  }
}

export async function supabaseRpc(fn: string, params: Record<string, any>) {
  try {
    const url = `${supabaseUrl}/rest/v1/rpc/${fn}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(true, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(params),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [Supabase RPC] ${fn} HTTP ${response.status}:`, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    return await response.json();
  } catch (error: any) {
    console.error(`❌ [Supabase RPC] ${fn} Error:`, error.message);
    throw error;
  }
}
