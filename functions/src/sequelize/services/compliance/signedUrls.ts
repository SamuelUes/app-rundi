/**
 * Signed URLs para el bucket privado `drivers-documents`.
 *
 * El bucket se cerró a acceso público (migration.sql): los documentos
 * solo se descargan con URLs firmadas de corta duración generadas
 * server-side con la service role key.
 */

import { supabaseUrl, buildHeaders } from '../../../supabase/config';

export const DRIVER_DOCUMENTS_BUCKET = 'drivers-documents';

/**
 * Extrae el object path dentro del bucket desde un valor almacenado:
 * acepta path crudo ('folder/file.jpg'), URL pública o URL firmada.
 */
export function storagePathFromUrl(
  value: string | null | undefined,
  bucket: string = DRIVER_DOCUMENTS_BUCKET,
): string | null {
  if (!value || typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;

  const marker = '/object/';
  const idx = v.indexOf(marker);
  if (idx === -1) {
    return v.startsWith('/') ? v.slice(1) : v;
  }

  let after = v.slice(idx + marker.length);
  const q = after.indexOf('?');
  if (q !== -1) after = after.slice(0, q);
  const parts = after.split('/').filter(Boolean);
  if (['public', 'sign', 'authenticated', 'render'].includes(parts[0])) parts.shift();
  if (parts[0] === bucket) parts.shift();
  return parts.length > 0 ? parts.join('/') : null;
}

/**
 * Firma URLs de descarga para objetos del bucket privado (batch).
 * Devuelve mapa objectPath → URL firmada absoluta.
 * Objetos inexistentes o no firmables se omiten del mapa.
 */
export async function createSignedUrls(
  objectPaths: Array<string | null | undefined>,
  expiresInSeconds: number = 3600,
  bucket: string = DRIVER_DOCUMENTS_BUCKET,
): Promise<Record<string, string>> {
  const unique = [...new Set(objectPaths.filter((p): p is string => Boolean(p && p.trim())))];
  if (unique.length === 0 || !supabaseUrl) return {};

  try {
    const url = `${supabaseUrl}/storage/v1/object/sign/${bucket}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(true, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expiresIn: expiresInSeconds, paths: unique }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [signedUrls] HTTP ${response.status}:`, errorText);
      return {};
    }

    const rows = (await response.json()) as Array<{ path?: string; signedURL?: string; signedUrl?: string }>;
    const out: Record<string, string> = {};
    for (const row of rows) {
      const signed = row.signedURL ?? row.signedUrl;
      if (row.path && signed) {
        out[row.path] = signed.startsWith('http')
          ? signed
          : `${supabaseUrl}/storage/v1${signed.startsWith('/') ? signed : `/${signed}`}`;
      }
    }
    return out;
  } catch (error: any) {
    console.error('❌ [signedUrls] Error:', error?.message || error);
    return {};
  }
}

const DOC_PATH_FIELDS = ['document_path', 'document_path_back'] as const;

/**
 * Clona un documento agregando `document_url` / `document_url_back`
 * firmadas (válidas `expiresInSeconds`). No muta el original.
 */
export function attachSignedUrls<T extends Record<string, any>>(
  doc: T,
  signed: Record<string, string>,
): T & { document_url?: string | null; document_url_back?: string | null } {
  const front = storagePathFromUrl(doc.document_path);
  const back = storagePathFromUrl(doc.document_path_back);
  return {
    ...doc,
    document_url: front ? signed[front] ?? null : null,
    document_url_back: back ? signed[back] ?? null : null,
  };
}

/** Recolecta todos los document_path/document_path_back de una lista de docs. */
export function collectDocumentPaths(docs: Array<Record<string, any> | null | undefined>): string[] {
  const paths: string[] = [];
  for (const doc of docs) {
    if (!doc) continue;
    for (const field of DOC_PATH_FIELDS) {
      const path = storagePathFromUrl(doc[field]);
      if (path) paths.push(path);
    }
  }
  return paths;
}
