/**
 * Supabase REST API — Storage
 * Extraído de client.ts para modularidad.
 */

import { supabaseUrl, buildHeaders } from './config';

export async function supabaseUploadJsonToStorage(bucket: string, objectPath: string, data: any): Promise<string> {
  try {
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL no configurada');
    }

    const url = `${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(true, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [Supabase STORAGE UPLOAD] HTTP ${response.status}:`, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;
    return publicUrl;
  } catch (error: any) {
    console.error(`❌ [Supabase STORAGE UPLOAD] Error:`, error.message);
    throw error;
  }
}
