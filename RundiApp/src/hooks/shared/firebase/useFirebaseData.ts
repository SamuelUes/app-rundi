/**
 * Hook para datos en vivo de Firestore (arquitectura v2).
 *
 * Migra la API del hook RTDB original: mismo `(path, options)`, misma caché
 * compartida y mismas reglas de unsubscribe. El path ahora es un path de
 * Firestore — segmentos pares = documento, impares = colección. Una colección
 * se expone como mapa `{ [docId]: data }` para conservar la forma de `.val()`
 * que esperan los consumidores migrados.
 *
 * Nuevo código: preferir los listeners tipados de `src/live/*`.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '../../../config/firebase';
import { FS_COL } from '../../../constants/firestore';
import { liveTripDocId } from '../../../live/tripIds';
import { useAuthStore } from '../../../stores/authStore';

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

function makeCacheKey(path: string, options: FirebaseOptions, uid: string): string {
  return JSON.stringify([uid, path, options.orderBy ?? null, options.limit ?? null]);
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

/** path con segmentos pares → documento; impares → colección. */
function isDocumentPath(path: string): boolean {
  return path.split('/').filter(Boolean).length % 2 === 0;
}

/** Snapshot de colección → mapa estilo RTDB `{ [docId]: data }`. */
function collectionToMap(snap: { docs: { id: string; data: () => DocumentData }[] }) {
  const out: Record<string, DocumentData> = {};
  for (const d of snap.docs) out[d.id] = d.data();
  return out;
}

async function readOnce(db: any, path: string, options: FirebaseOptions) {
  if (isDocumentPath(path)) {
    const snap = await getDoc(doc(db, path));
    return snap.exists() ? snap.data() : null;
  }
  const colRef = collection(db, path);
  const q: Query =
    options.orderBy || options.limit
      ? query(
          colRef,
          ...(options.orderBy ? [orderBy(options.orderBy, 'desc')] : []),
          ...(options.limit ? [limit(options.limit)] : []),
        )
      : colRef;
  const snap = await getDocs(q);
  // orderBy desc + limit emula limitToLast de RTDB; se re-invierte a ascendente.
  if (options.orderBy && options.limit) {
    const reversed = [...snap.docs].reverse();
    return collectionToMap({ docs: reversed });
  }
  return collectionToMap(snap);
}

function subscribe(
  db: any,
  path: string,
  options: FirebaseOptions,
  onData: (data: any) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  if (isDocumentPath(path)) {
    return onSnapshot(
      doc(db, path),
      (snap) => onData(snap.exists() ? snap.data() : null),
      (err) => onError(err as Error),
    );
  }
  const colRef = collection(db, path);
  const q: Query =
    options.orderBy || options.limit
      ? query(
          colRef,
          ...(options.orderBy ? [orderBy(options.orderBy, 'desc')] : []),
          ...(options.limit ? [limit(options.limit)] : []),
        )
      : colRef;
  return onSnapshot(
    q,
    (snap) => {
      const docs = options.orderBy && options.limit ? [...snap.docs].reverse() : snap.docs;
      onData(collectionToMap({ docs }));
    },
    (err) => onError(err as Error),
  );
}

/**
 * Hook para obtener datos de Firestore
 * @param path Ruta en Firestore (doc o colección) para obtener datos
 * @param options Opciones de consulta
 */
export const useFirebaseData = <T>(path: string, options: FirebaseOptions = {}) => {
  const uid = useAuthStore((state) => state.user?.id ?? null);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Unsubscribe del listener activo — siempre usar la función retornada por
  // onSnapshot (misma regla que AGENTS.md para onValue).
  const unsubscribeRef = useRef<Unsubscribe | null>(null);
  const generationRef = useRef(0);
  const currentKey = JSON.stringify([uid, path, options.orderBy ?? null, options.limit ?? null, options.enabled !== false]);
  const currentKeyRef = useRef(currentKey);
  currentKeyRef.current = currentKey;
  const dataKeyRef = useRef(currentKey);
  const detachListener = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  }, []);

  // Función para obtener datos
  const fetchData = useCallback(async () => {
    const generation = ++generationRef.current;
    const isCurrent = () => generationRef.current === generation && currentKeyRef.current === currentKey;
    detachListener();
    if (dataKeyRef.current !== currentKey) {
      dataKeyRef.current = currentKey;
      setData(null);
    }
    if (options.enabled === false) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const db = await getFirebaseFirestore();
      if (!isCurrent()) return;
      const cacheKey = uid ? makeCacheKey(path, options, uid) : null;

      // Verificar caché primero (compartida entre instancias/remounts).
      // En consultas `once` el hit evita el fetch; en listeners pinta el dato
      // al instante pero igual se adjunta la suscripción para datos vivos.
      if (cacheKey && options.maxCacheAge) {
        const cached = readSharedCache(cacheKey, options.maxCacheAge);
        if (cached) {
          setData(cached.data);
          if (options.once) {
            setLoading(false);
            return;
          }
        }
      }

      // Si es consulta única
      if (options.once) {
        const fetchedData = await readOnce(db, path, options);
        if (!isCurrent()) return;
        setData(fetchedData as T | null);
        if (cacheKey) writeSharedCache(cacheKey, fetchedData);
        setLoading(false);
        return;
      }

      // Consulta en tiempo real: desuscribir cualquier listener previo de esta
      // instancia (p.ej. refresh manual) antes de adjuntar uno nuevo.
      unsubscribeRef.current = subscribe(
        db,
        path,
        options,
        (fetchedData) => {
          if (!isCurrent()) return;
          setData(fetchedData);
          if (cacheKey) writeSharedCache(cacheKey, fetchedData);
          setLoading(false);
        },
        (err) => {
          if (!isCurrent()) return;
          console.error(`❌ Error obteniendo datos de ${path}:`, err);
          setError(err);
          setLoading(false);
        },
      );
    } catch (err) {
      if (!isCurrent()) return;
      console.error(`❌ Error en consulta Firestore para ${path}:`, err);
      setError(err as Error);
      setLoading(false);
    }
  }, [path, uid, currentKey, options.once, options.limit, options.orderBy, options.maxCacheAge, options.enabled, detachListener]);

  // Función para actualizar datos manualmente
  const refresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  // Efecto para cargar datos y limpiar al desmontar
  useEffect(() => {
    fetchData();

    // Cleanup: desuscribir solo ESTE listener al desmontar
    return () => {
      generationRef.current += 1;
      detachListener();
    };
  }, [fetchData, detachListener]);

  const matchesKey = dataKeyRef.current === currentKey;
  return {
    data: matchesKey ? data : null,
    loading: matchesKey ? loading : options.enabled !== false,
    error: matchesKey ? error : null,
    refresh,
  };
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
  // trips_live/payments_live se indexan por firebaseRideId; los callers suelen
  // tener el UUID SQL. Resolver una sola vez por id (hook-safe: el hook siempre
  // corre, solo se deshabilita la suscripción hasta tener el id real).
  const isTripKeyed = collectionPath === FS_COL.tripsLive || collectionPath === FS_COL.paymentsLive;
  const [resolved, setResolved] = useState<{ input: string; id: string } | null>(null);

  useEffect(() => {
    if (!id || !isTripKeyed) return;
    let cancelled = false;
    void liveTripDocId(id).then(
      (r) => { if (!cancelled) setResolved({ input: id, id: r }); },
      (err) => { if (!cancelled) console.error('Error resolviendo viaje:', err); },
    );
    return () => { cancelled = true; };
  }, [id, isTripKeyed]);

  const resolvedId = isTripKeyed ? (resolved && resolved.input === id ? resolved.id : null) : id;
  const path = resolvedId ? `${collectionPath}/${resolvedId}` : '';
  return useFirebaseData<T>(path, { ...options, enabled: (options.enabled ?? true) && !!resolvedId });
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
    let unsubscribe: Unsubscribe | undefined;
    let cancelled = false;

    void (async () => {
      const db = await getFirebaseFirestore();
      if (cancelled) return;
      unsubscribe = subscribe(db, path, {}, (data) => callback(data as T | null), (err) => {
        console.error(`❌ Error en listener de ${path}:`, err);
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
};

export default {
  useFirebaseData,
  useFirebaseDataOnce,
  useFirebaseItem,
  useFirebaseListener
};
