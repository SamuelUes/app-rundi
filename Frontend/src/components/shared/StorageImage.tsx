import React, { useEffect, useState } from 'react';
import { Image, ImageProps } from 'react-native';
import supabaseStorage from '../../services/supabaseStorage';

interface StorageImageProps extends Omit<ImageProps, 'source'> {
  uri: string | null | undefined;
}

/**
 * <Image> que resuelve URLs de Supabase Storage a URLs firmadas temporales
 * cuando el bucket es privado (entorno local). URIs locales y URLs ajenas
 * a Storage se muestran tal cual.
 */
export default function StorageImage({ uri, ...props }: StorageImageProps) {
  const [resolvedUri, setResolvedUri] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    if (uri && /^https?:\/\//.test(uri)) {
      setResolvedUri(null);
      supabaseStorage.resolveDocumentPhotoUrl(uri).then((resolved) => {
        if (!cancelled) {
          setResolvedUri(resolved || uri);
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

  return <Image {...props} source={{ uri: resolvedUri }} />;
}
