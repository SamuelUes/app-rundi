/**
 * Utilidades para sincronización entre bases de datos
 * Incluye retry logic y validaciones
 */

import admin from 'firebase-admin';

/**
 * Retry logic para operaciones de base de datos
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
  operationName: string = 'Operation'
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 ${operationName} - Intento ${attempt}/${maxRetries}`);
      const result = await operation();
      console.log(`✅ ${operationName} - Éxito en intento ${attempt}`);
      return result;
    } catch (error: any) {
      lastError = error;
      console.error(`❌ ${operationName} - Error en intento ${attempt}:`, error.message);
      
      if (attempt < maxRetries) {
        const delay = delayMs * attempt; // Exponential backoff
        console.log(`⏳ Esperando ${delay}ms antes de reintentar...`);
        await sleep(delay);
      }
    }
  }
  
  throw new Error(`${operationName} falló después de ${maxRetries} intentos: ${lastError?.message}`);
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Sincronizar datos entre Supabase y Realtime DB con validación
 */
export async function syncToRealtimeDB(
  path: string,
  data: any,
  operation: 'set' | 'update' | 'remove' = 'update'
): Promise<boolean> {
  try {
    const db = admin.database();
    const ref = db.ref(path);
    
    await retryOperation(
      async () => {
        if (operation === 'set') {
          await ref.set(data);
        } else if (operation === 'update') {
          await ref.update(data);
        } else if (operation === 'remove') {
          await ref.remove();
        }
      },
      3,
      1000,
      `Realtime DB ${operation} at ${path}`
    );
    
    console.log(`✅ Realtime DB sincronizado: ${path}`);
    return true;
  } catch (error: any) {
    console.error(`❌ Error sincronizando Realtime DB en ${path}:`, error);
    return false;
  }
}

/**
 * Validar que los datos se guardaron correctamente en Realtime DB
 */
export async function validateRealtimeDBSync(
  path: string,
  expectedData: any
): Promise<boolean> {
  try {
    const db = admin.database();
    const ref = db.ref(path);
    const snapshot = await ref.once('value');
    const actualData = snapshot.val();
    
    if (!actualData) {
      console.error(`❌ Validación fallida: No hay datos en ${path}`);
      return false;
    }
    
    // Validar campos críticos
    for (const key of Object.keys(expectedData)) {
      if (actualData[key] !== expectedData[key]) {
        console.error(`❌ Validación fallida: ${key} no coincide en ${path}`);
        console.error(`   Esperado: ${expectedData[key]}, Actual: ${actualData[key]}`);
        return false;
      }
    }
    
    console.log(`✅ Validación exitosa: ${path}`);
    return true;
  } catch (error: any) {
    console.error(`❌ Error validando Realtime DB en ${path}:`, error);
    return false;
  }
}

/**
 * Wrapper para operaciones de Supabase con retry
 */
export async function executeSupabaseQuery<T>(
  queryFn: () => Promise<T>,
  queryName: string
): Promise<T> {
  return retryOperation(
    queryFn,
    3,
    1000,
    `Supabase ${queryName}`
  );
}

/**
 * Sincronización completa: Supabase + Realtime DB con validación
 */
export async function syncRideData(
  rideId: string,
  supabaseUpdate: () => Promise<any>,
  realtimeData: any,
  validateCriticalFields: string[] = []
): Promise<{ supabaseSuccess: boolean; realtimeSuccess: boolean; validated: boolean }> {
  let supabaseSuccess = false;
  let realtimeSuccess = false;
  let validated = false;
  
  try {
    // 1. Actualizar Supabase
    console.log(`📊 Actualizando Supabase para ride ${rideId}...`);
    await executeSupabaseQuery(supabaseUpdate, `UPDATE rides/${rideId}`);
    supabaseSuccess = true;
    console.log(`✅ Supabase actualizado: rides/${rideId}`);
    
    // 2. Actualizar Realtime DB
    console.log(`🔥 Actualizando Realtime DB para ride ${rideId}...`);
    realtimeSuccess = await syncToRealtimeDB(`activeRides/${rideId}`, realtimeData, 'update');
    
    // 3. Validar campos críticos si se especificaron
    if (realtimeSuccess && validateCriticalFields.length > 0) {
      const fieldsToValidate: any = {};
      validateCriticalFields.forEach(field => {
        if (realtimeData[field] !== undefined) {
          fieldsToValidate[field] = realtimeData[field];
        }
      });
      
      validated = await validateRealtimeDBSync(`activeRides/${rideId}`, fieldsToValidate);
    } else {
      validated = realtimeSuccess;
    }
    
    return { supabaseSuccess, realtimeSuccess, validated };
  } catch (error: any) {
    console.error(`❌ Error en sincronización completa para ride ${rideId}:`, error);
    return { supabaseSuccess, realtimeSuccess, validated };
  }
}

/**
 * Log de sincronización para debugging
 */
export function logSync(
  operation: string,
  rideId: string,
  status: 'start' | 'success' | 'error',
  details?: any
) {
  const timestamp = new Date().toISOString();
  const emoji = status === 'start' ? '🔄' : status === 'success' ? '✅' : '❌';
  
  console.log(`${emoji} [${timestamp}] ${operation} - Ride: ${rideId} - Status: ${status}`);
  if (details) {
    console.log(`   Detalles:`, JSON.stringify(details, null, 2));
  }
}
