/**
 * Hook personalizado para interactuar con Firebase Realtime Database
 * con optimizaciones de rendimiento y manejo automático de limpieza
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getDatabase, ref, onValue, off, get, query, orderByChild, limitToLast, DatabaseReference, DataSnapshot } from 'firebase/database';

// Tipos para el hook
interface FirebaseOptions {
  once?: boolean;         // Si true, solo obtiene datos una vez
  limit?: number;         // Límite de elementos a obtener
  orderBy?: string;       // Campo por el cual ordenar
  maxCacheAge?: number;   // Tiempo máximo de caché en ms
}

interface CachedData {
  data: any;
  timestamp: number;
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
  
  // Referencia a los datos en caché
  const cachedData = useRef<CachedData | null>(null);
  
  // Referencia para limpiar el listener
  const dbRef = useRef<DatabaseReference | null>(null);
  
  // Función para obtener datos
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const db = getDatabase();
      
      // Verificar caché primero
      const now = Date.now();
      if (cachedData.current && options.maxCacheAge) {
        const cacheAge = now - cachedData.current.timestamp;
        if (cacheAge < options.maxCacheAge) {
          console.log(`📦 Usando datos en caché para ${path}, edad: ${cacheAge}ms`);
          setData(cachedData.current.data);
          setLoading(false);
          return;
        }
      }
      
      // Crear referencia y aplicar opciones
      let dataRef = ref(db, path);
      
      // Si es consulta única
      if (options.once) {
        let snapshot: DataSnapshot;
        
        // Aplicar restricciones si es necesario
        if (options.orderBy || options.limit) {
          const queryRef = query(
            dataRef,
            ...(options.orderBy ? [orderByChild(options.orderBy)] : []),
            ...(options.limit ? [limitToLast(options.limit)] : [])
          );
          snapshot = await get(queryRef);
        } else {
          snapshot = await get(dataRef);
        }
        
        const fetchedData = snapshot.val();
        setData(fetchedData);
        
        // Guardar en caché
        cachedData.current = {
          data: fetchedData,
          timestamp: now
        };
        
        setLoading(false);
      } 
      // Si es consulta en tiempo real
      else {
        // Aplicar restricciones si es necesario
        if (options.orderBy || options.limit) {
          const queryRef = query(
            dataRef,
            ...(options.orderBy ? [orderByChild(options.orderBy)] : []),
            ...(options.limit ? [limitToLast(options.limit)] : [])
          );
          
          // Para consultas, no podemos asignar directamente a dbRef porque queryRef no es DatabaseReference
          // En lugar de eso, guardamos la referencia original para poder cancelar la suscripción
          dbRef.current = dataRef;
          
          onValue(queryRef, (snapshot) => {
            const fetchedData = snapshot.val();
            setData(fetchedData);
            
            // Guardar en caché
            cachedData.current = {
              data: fetchedData,
              timestamp: now
            };
            
            setLoading(false);
          }, (err) => {
            console.error(`❌ Error obteniendo datos de ${path}:`, err);
            setError(err as Error);
            setLoading(false);
          });
        } else {
          dbRef.current = dataRef;
          
          onValue(dataRef, (snapshot) => {
            const fetchedData = snapshot.val();
            setData(fetchedData);
            
            // Guardar en caché
            cachedData.current = {
              data: fetchedData,
              timestamp: now
            };
            
            setLoading(false);
          }, (err) => {
            console.error(`❌ Error obteniendo datos de ${path}:`, err);
            setError(err as Error);
            setLoading(false);
          });
        }
      }
    } catch (err) {
      console.error(`❌ Error en consulta Firebase para ${path}:`, err);
      setError(err as Error);
      setLoading(false);
    }
  }, [path, options.once, options.limit, options.orderBy, options.maxCacheAge]);
  
  // Función para actualizar datos manualmente
  const refresh = useCallback(() => {
    fetchData();
  }, [fetchData]);
  
  // Efecto para cargar datos y limpiar al desmontar
  useEffect(() => {
    fetchData();
    
    // Cleanup: desuscribirse al desmontar
    return () => {
      if (dbRef.current) {
        off(dbRef.current);
      }
    };
  }, [fetchData]);
  
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
    
    return () => off(dataRef);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
};

export default {
  useFirebaseData,
  useFirebaseDataOnce,
  useFirebaseItem,
  useFirebaseListener
};