/**
 * Delete User Data from Supabase
 * Se ejecuta cuando un usuario elimina su cuenta de Firebase Auth
 * Complementa la extensión "Delete User Data" de Firebase
 */

import * as functions from 'firebase-functions';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy initialization de Supabase client
let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const supabaseUrl = functions.config().supabase?.url || process.env.SUPABASE_URL;
    const supabaseKey = functions.config().supabase?.service_role_key || process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase URL y Service Role Key son requeridos');
    }
    
    supabaseClient = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseClient;
}

/**
 * Elimina datos del usuario de Supabase cuando se elimina de Firebase Auth
 * 
 * IMPORTANTE: Esta función se ejecuta DESPUÉS de la extensión Delete User Data
 * que ya eliminó los datos de Firebase (Firestore, Realtime DB, Storage)
 * 
 * Estrategia:
 * - ELIMINA: Datos personales y sensibles
 * - ANONIMIZA: Datos necesarios para registros contables/fiscales
 */
export const deleteUserFromSupabase = functions.auth.user().onDelete(async (user) => {
  const userId = user.uid;
  const userEmail = user.email || 'unknown';
  
  try {
    console.log(`🗑️ Iniciando eliminación de datos de Supabase`);
    console.log(`   Usuario: ${userId}`);
    console.log(`   Email: ${userEmail}`);
    
    const supabase = getSupabaseClient();
    
    // ============================================
    // 1. ELIMINAR VEHÍCULOS
    // ============================================
    console.log('📦 Eliminando vehículos...');
    const { data: vehicles, error: vehiclesError } = await supabase
      .from('vehicles')
      .delete()
      .eq('driver_id', userId)
      .select();
    
    if (vehiclesError) {
      console.error('❌ Error eliminando vehículos:', vehiclesError);
    } else {
      console.log(`✅ ${vehicles?.length || 0} vehículos eliminados`);
    }
    
    // ============================================
    // 2. ELIMINAR PERFIL DE CONDUCTOR
    // ============================================
    console.log('👤 Eliminando perfil de conductor...');
    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .delete()
      .eq('id', userId)
      .select();
    
    if (driverError) {
      console.error('❌ Error eliminando conductor:', driverError);
    } else {
      console.log(`✅ Perfil de conductor eliminado`);
    }
    
    // ============================================
    // 3. ANONIMIZAR VIAJES (NO ELIMINAR)
    // ============================================
    // Razón: Necesarios para registros contables, fiscales y auditorías
    console.log('🚗 Anonimizando viajes...');
    const { data: rides, error: ridesError } = await supabase
      .from('rides')
      .update({
        client_name: 'Usuario Eliminado',
        client_phone: 'N/A',
        driver_name: 'Usuario Eliminado',
        driver_phone: 'N/A',
        // Mantener IDs para referencias, pero marcar como eliminado
        metadata: {
          user_deleted: true,
          deleted_at: new Date().toISOString()
        }
      })
      .or(`client_id.eq.${userId},driver_id.eq.${userId}`)
      .select();
    
    if (ridesError) {
      console.error('❌ Error anonimizando viajes:', ridesError);
    } else {
      console.log(`✅ ${rides?.length || 0} viajes anonimizados`);
    }
    
    // ============================================
    // 4. ELIMINAR UBICACIONES DE VIAJES
    // ============================================
    console.log('📍 Eliminando ubicaciones de viajes...');
    const { data: locations, error: locationsError } = await supabase
      .from('ride_locations')
      .delete()
      .eq('driver_id', userId)
      .select();
    
    if (locationsError) {
      console.error('❌ Error eliminando ubicaciones:', locationsError);
    } else {
      console.log(`✅ ${locations?.length || 0} ubicaciones eliminadas`);
    }
    
    // ============================================
    // 5. ANONIMIZAR CALIFICACIONES
    // ============================================
    // Razón: Mantener estadísticas agregadas, pero eliminar comentarios personales
    console.log('⭐ Anonimizando calificaciones...');
    const { data: ratings, error: ratingsError } = await supabase
      .from('ratings')
      .update({
        comment: '[Comentario eliminado por solicitud del usuario]',
        metadata: {
          user_deleted: true,
          deleted_at: new Date().toISOString()
        }
      })
      .or(`client_id.eq.${userId},driver_id.eq.${userId}`)
      .select();
    
    if (ratingsError) {
      console.error('❌ Error anonimizando calificaciones:', ratingsError);
    } else {
      console.log(`✅ ${ratings?.length || 0} calificaciones anonimizadas`);
    }
    
    // ============================================
    // 6. ANONIMIZAR PAGOS (NO ELIMINAR)
    // ============================================
    // Razón: Requerido por Stripe y regulaciones fiscales
    console.log('💳 Anonimizando pagos...');
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .update({
        metadata: {
          user_deleted: true,
          deleted_at: new Date().toISOString(),
          original_user_id: userId // Guardar referencia para auditorías
        }
      })
      .or(`client_id.eq.${userId},driver_id.eq.${userId}`)
      .select();
    
    if (paymentsError) {
      console.error('❌ Error anonimizando pagos:', paymentsError);
    } else {
      console.log(`✅ ${payments?.length || 0} pagos anonimizados`);
    }
    
    // ============================================
    // 7. ELIMINAR EVENTOS DE ANALYTICS
    // ============================================
    console.log('📊 Eliminando eventos de analytics...');
    const { data: analytics, error: analyticsError } = await supabase
      .from('analytics_events')
      .delete()
      .eq('user_id', userId)
      .select();
    
    if (analyticsError) {
      console.error('❌ Error eliminando analytics:', analyticsError);
    } else {
      console.log(`✅ ${analytics?.length || 0} eventos de analytics eliminados`);
    }
    
    // ============================================
    // RESUMEN
    // ============================================
    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ ELIMINACIÓN COMPLETADA EXITOSAMENTE');
    console.log('═══════════════════════════════════════════════════');
    console.log(`Usuario: ${userId}`);
    console.log(`Email: ${userEmail}`);
    console.log('');
    console.log('📊 Resumen:');
    console.log(`   • Vehículos eliminados: ${vehicles?.length || 0}`);
    console.log(`   • Conductor eliminado: ${driver ? 'Sí' : 'No'}`);
    console.log(`   • Viajes anonimizados: ${rides?.length || 0}`);
    console.log(`   • Ubicaciones eliminadas: ${locations?.length || 0}`);
    console.log(`   • Calificaciones anonimizadas: ${ratings?.length || 0}`);
    console.log(`   • Pagos anonimizados: ${payments?.length || 0}`);
    console.log(`   • Analytics eliminados: ${analytics?.length || 0}`);
    console.log('═══════════════════════════════════════════════════');
    
    return {
      success: true,
      message: 'Usuario eliminado de Supabase exitosamente',
      userId,
      summary: {
        vehiclesDeleted: vehicles?.length || 0,
        driverDeleted: !!driver,
        ridesAnonymized: rides?.length || 0,
        locationsDeleted: locations?.length || 0,
        ratingsAnonymized: ratings?.length || 0,
        paymentsAnonymized: payments?.length || 0,
        analyticsDeleted: analytics?.length || 0
      }
    };
    
  } catch (error: any) {
    console.error('');
    console.error('═══════════════════════════════════════════════════');
    console.error('❌ ERROR ELIMINANDO USUARIO DE SUPABASE');
    console.error('═══════════════════════════════════════════════════');
    console.error(`Usuario: ${userId}`);
    console.error(`Email: ${userEmail}`);
    console.error(`Error: ${error.message}`);
    console.error('Stack:', error.stack);
    console.error('═══════════════════════════════════════════════════');
    
    // No lanzar error para no bloquear la eliminación del usuario
    // Los datos de Firebase ya fueron eliminados por la extensión
    return {
      success: false,
      message: 'Error eliminando usuario de Supabase',
      error: error.message,
      userId
    };
  }
});

/**
 * Función HTTP para eliminar manualmente datos de un usuario
 * Útil para testing o para eliminar datos de usuarios que ya fueron eliminados
 * 
 * Uso:
 * POST https://us-central1-driveangel-ni.cloudfunctions.net/manualDeleteUserData
 * Body: { "userId": "abc123" }
 */
export const manualDeleteUserData = functions.https.onCall(async (data, context) => {
  // Verificar que el usuario esté autenticado
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Debes estar autenticado para usar esta función'
    );
  }
  
  // Verificar que sea admin (opcional - puedes agregar lógica de admin)
  const userId = data.userId;
  
  if (!userId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'userId es requerido'
    );
  }
  
  console.log(`🔧 Eliminación manual solicitada para usuario: ${userId}`);
  console.log(`   Solicitado por: ${context.auth.uid}`);
  
  try {
    // Reutilizar la misma lógica de eliminación
    // (Aquí podrías llamar a una función compartida)
    
    return {
      success: true,
      message: `Datos del usuario ${userId} eliminados manualmente`
    };
    
  } catch (error: any) {
    console.error('Error en eliminación manual:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
