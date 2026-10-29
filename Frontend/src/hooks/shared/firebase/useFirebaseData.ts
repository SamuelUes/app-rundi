/**
 * Hook personalizado para interactuar con Firebase Realtime Database
 * con optimizaciones de rendimiento y manejo automático de limpieza
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getDatabase, ref, onValue, off, get, query, orderByChild, limitToLast, DatabaseReference, DataSnapshot, Query } from 'firebase/database';

// Tipos para el hook
interface FirebaseOptions {
  once?: boolean;         // Si true, solo obtiene datos una vez
  limit?: number;         // Límite de elementos a obtener
  orderBy?: string;       // Campo por el cual ordenar
  maxCacheAge?: number;   // Tiempo máximo de caché en ms
  enabled?: boolean;      // Si false, no inicia la consulta y desuscribe el listener activo
}

interface CachedData {
  data: any;
  timestamp: number;
}

// Caché compartida entre instancias: los datos sobreviven a remounts y
// múltiples pantallas suscritas al mismo path reusan el snapshot reciente.
const SHARED_CACHE_MAX_ENTRIES = 50;
const sharedCache = new Map<string, CachedData>();

function makeCacheKey(path: string, options: FirebaseOptions): string {
  return `${path}|${options.orderBy ?? ''}|${options.limit ?? ''}`;
}

function readSharedCache(cacheKey: string, maxCacheAge: number): CachedData | null {
  const entry = sharedCache.get(cacheKey);
  if (!entry) return null;
  return Date.now() - entry.timestamp < maxCacheAge ? entry : null;
}

function writeSharedCache(cacheKey: string, data: any) {
  if (sharedCache.size >= SHARED_CACHE_MAX_ENTRIES) {
    const oldestKey = sharedCache.keys().next().value;
    if (oldestKey !== undefined) sharedCache.delete(oldestKey);
  }
  sharedCache.set(cacheKey, { data, timestamp: Date.now() });
}

/**
 * Hook para obtener datos de Firebase Realtime Database
 * @param path Ruta en Firebase para obtener datos
 * @param options Opciones de consulta
 */
export const useFirebaseData = <T>(path: string, options: FirebaseOptions = {}) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Unsubscribe del listener activo (onValue retorna la función de limpieza —
  // usar off(ref) sin callback eliminaría los listeners de OTROS componentes
  // suscritos al mismo path).
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const detachListener = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  }, []);

  // Función para obtener datos
  const fetchData = useCallback(async () => {
    if (options.enabled === false) {
      detachListener();
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const db = getDatabase();
      const cacheKey = makeCacheKey(path, options);

      // Verificar caché primero (compartida entre instancias/remounts).
      // En consultas `once` el hit evita el fetch; en listeners pinta el dato
      // al instante pero igual se adjunta la suscripción para datos vivos.
      if (options.maxCacheAge) {
        const cached = readSharedCache(cacheKey, options.maxCacheAge);
        if (cached) {
          setData(cached.data);
          if (options.once) {
            setLoading(false);
            return;
          }
        }
      }

      // Crear referencia y aplicar opciones
      const dataRef = ref(db, path);
      const queryRef: Query | DatabaseReference =
        options.orderBy || options.limit
          ? query(
              dataRef,
              ...(options.orderBy ? [orderByChild(options.orderBy)] : []),
              ...(options.limit ? [limitToLast(options.limit)] : []),
            )
          : dataRef;

      // Si es consulta única
      if (options.once) {
        const snapshot: DataSnapshot = await get(queryRef);
        const fetchedData = snapshot.val();
        setData(fetchedData);
        writeSharedCache(cacheKey, fetchedData);
        setLoading(false);
        return;
      }

      // Consulta en tiempo real: desuscribir cualquier listener previo de esta
      // instancia (p.ej. refresh manual) antes de adjuntar uno nuevo.
      detachListener();
      unsubscribeRef.current = onValue(
        queryRef,
        (snapshot) => {
          const fetchedData = snapshot.val();
          setData(fetchedData);
          writeSharedCache(cacheKey, fetchedData);
          setLoading(false);
        },
        (err) => {
          console.error(`❌ Error obteniendo datos de ${path}:`, err);
          setError(err as Error);
          setLoading(false);
        },
      );
    } catch (err) {
      console.error(`❌ Error en consulta Firebase para ${path}:`, err);
      setError(err as Error);
      setLoading(false);
    }
  }, [path, options.once, options.limit, options.orderBy, options.maxCacheAge, options.enabled, detachListener]);

  // Función para actualizar datos manualmente
  const refresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  // Efecto para cargar datos y limpiar al desmontar
  useEffect(() => {
    fetchData();

    // Cleanup: desuscribir solo ESTE listener al desmontar
    return detachListener;
  }, [fetchData, detachListener]);

  return { data, loading, error, refresh };
};

/**
 * Hook para obtener datos una sola vez (sin suscripción)
 */
export const useFirebaseDataOnce = <T>(path: string, options: Omit<FirebaseOptions, 'once'> = {}) => {
  return useFirebaseData<T>(path, { ...options, once: true });
};

/**
 * Hook específico para obtener un elemento por ID
 */
export const useFirebaseItem = <T>(collectionPath: string, id: string | null | undefined, options: FirebaseOptions = {}) => {
  // Si no hay ID, retornar null
  if (!id) {
    return { data: null, loading: false, error: null, refresh: () => {} };
  }

  const path = `${collectionPath}/${id}`;
  return useFirebaseData<T>(path, options);
};

/**
 * Utilidad para suscribirse a un valor con limpieza automática
 */
export const useFirebaseListener = <T>(
  path: string,
  callback: (data: T | null) => void,
  deps: any[] = []
) => {
  useEffect(() => {
    const db = getDatabase();
    const dataRef = ref(db, path);

    const unsubscribe = onValue(dataRef, (snapshot) => {
      const data = snapshot.val();
      callback(data);
    });

    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
};

export default {
  useFirebaseData,
  useFirebaseDataOnce,
  useFirebaseItem,
  useFirebaseListener
};
