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
  const [resolvedUri, setResolvedUri] = useState(uri);

  useEffect(() => {
    let cancelled = false;
    setResolvedUri(uri);

    if (uri && /^https?:\/\//.test(uri)) {
      supabaseStorage.resolveDocumentPhotoUrl(uri).then((resolved) => {
        if (!cancelled && resolved) {
          setResolvedUri(resolved);
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (!resolvedUri) return null;

  return <Image {...props} source={{ uri: resolvedUri }} />;
}
