import React, { useEffect, useState } from 'react';
import { Image, ImageContentFit, ImageProps } from 'expo-image';
import supabaseStorage from '../../services/supabaseStorage';

// Subset de resizeMode que expo-image declara en sus props (RN 'none' no aplica).
type LegacyResizeMode = 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';

interface StorageImageProps extends Omit<ImageProps, 'source' | 'defaultSource'> {
  uri: string | null | undefined;
  // Compat con la API de react-native <Image> (resizeMode → contentFit).
  resizeMode?: LegacyResizeMode;
}

const RESIZE_MODE_TO_CONTENT_FIT: Record<LegacyResizeMode, ImageContentFit> = {
  cover: 'cover',
  contain: 'contain',
  stretch: 'fill',
  repeat: 'fill',
  center: 'scale-down',
};

// Las URLs firmadas ya las cachea supabaseStorage, pero resolverlas sigue
// siendo async — cachear el resultado aquí evita el pop-in de renderizar
// `null` en cada remount del componente dentro de la sesión.
const RESOLVED_URI_TTL_MS = 30 * 60 * 1000;
const resolvedUriCache = new Map<string, { uri: string; timestamp: number }>();

/**
 * <Image> que resuelve URLs de Supabase Storage a URLs firmadas temporales
 * cuando el bucket es privado (entorno local). URIs locales y URLs ajenas
 * a Storage se muestran tal cual.
 */
export default function StorageImage({ uri, resizeMode, ...props }: StorageImageProps) {
  const [resolvedUri, setResolvedUri] = useState<string | null | undefined>(() => {
    if (!uri || !/^https?:\/\//.test(uri)) return uri;
    const cached = resolvedUriCache.get(uri);
    return cached && Date.now() - cached.timestamp < RESOLVED_URI_TTL_MS ? cached.uri : null;
  });

  useEffect(() => {
    let cancelled = false;

    if (uri && /^https?:\/\//.test(uri)) {
      const cached = resolvedUriCache.get(uri);
      if (cached && Date.now() - cached.timestamp < RESOLVED_URI_TTL_MS) {
        setResolvedUri(cached.uri);
        return;
      }
      setResolvedUri(null);
      supabaseStorage.resolveDocumentPhotoUrl(uri).then((resolved) => {
        if (!cancelled) {
          const finalUri = resolved || uri;
          resolvedUriCache.set(uri, { uri: finalUri, timestamp: Date.now() });
          setResolvedUri(finalUri);
        }
      }).catch(() => {
        if (!cancelled) {
          setResolvedUri(uri);
        }
      });
    } else {
      setResolvedUri(uri);
    }

    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (!resolvedUri) return null;

  return (
    <Image
      {...props}
      source={{ uri: resolvedUri }}
      contentFit={resizeMode ? RESIZE_MODE_TO_CONTENT_FIT[resizeMode] : props.contentFit}
      transition={props.transition ?? 150}
    />
  );
}
