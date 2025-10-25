/**
 * Supabase Payment Sync
 * Sincroniza pagos desde PostgreSQL a Supabase (tabla payments)
 * 
 * Flujo:
 * 1. Pago se crea en PostgreSQL (registerCashPayment, completeCashPayment, etc)
 * 2. Este servicio sincroniza a Supabase automáticamente
 * 3. Se marca como synced_to_supabase = true
 */

import * as functions from "firebase-functions";
import pool from "../config/database";
import { createClient } from "@supabase/supabase-js";

// 🆕 Lazy loading de Supabase (se inicializa cuando se necesita)
let supabase: any = null;

function getSupabaseClient() {
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL y SUPABASE_ANON_KEY no están configurados');
    }
    
    supabase = createClient(supabaseUrl, supabaseKey);
  }
  return supabase;
}

/**
 * Sincronizar pago a Supabase
 * Se ejecuta después de que un pago se completa o cancela
 */
export async function syncPaymentToSupabase(paymentId: string): Promise<void> {
  const client = await pool.connect();
  try {
    console.log(`🔄 [syncPaymentToSupabase] Sincronizando pago ${paymentId}...`);

    // Obtener pago desde PostgreSQL
    const result = await client.query(
      `SELECT 
        id, ride_id, amount, tip, commission, payment_method, 
        payment_provider, status, paid_at, created_at, updated_at,
        stripe_payment_intent_id, stripe_charge_id,
        local_transaction_id, local_authorization_code, local_bank,
        cancel_reason, notes
       FROM payments 
       WHERE id = $1`,
      [paymentId]
    );

    if (result.rows.length === 0) {
      console.log(`⚠️ [syncPaymentToSupabase] Pago ${paymentId} no encontrado`);
      return;
    }

    const payment = result.rows[0];

    // Preparar datos para Supabase
    const supabasePayment = {
      id: payment.id,
      ride_id: payment.ride_id,
      amount: payment.amount,
      tip: payment.tip || 0,
      commission: payment.commission,
      payment_method: payment.payment_method,
      payment_provider: payment.payment_provider,
      status: payment.status,
      paid_at: payment.paid_at,
      created_at: payment.created_at,
      updated_at: payment.updated_at,
      stripe_payment_intent_id: payment.stripe_payment_intent_id,
      stripe_charge_id: payment.stripe_charge_id,
      local_transaction_id: payment.local_transaction_id,
      local_authorization_code: payment.local_authorization_code,
      local_bank: payment.local_bank,
      cancel_reason: payment.cancel_reason,
      notes: payment.notes,
      synced_to_firebase: true,
      firebase_synced_at: new Date().toISOString(),
    };

    // Insertar o actualizar en Supabase
    const supabaseClient = getSupabaseClient();
    const { error } = await supabaseClient
      .from("payments")
      .upsert(supabasePayment);

    if (error) {
      console.error(`❌ [syncPaymentToSupabase] Error sincronizando a Supabase:`, error);
      throw error;
    }

    // ✅ Marcar como sincronizado en PostgreSQL
    // Nota: La columna se llama synced_to_firebase (no synced_to_supabase)
    await client.query(
      `UPDATE payments 
       SET synced_to_firebase = true, 
           firebase_synced_at = NOW()
       WHERE id = $1`,
      [paymentId]
    );

    console.log(`✅ [syncPaymentToSupabase] Pago ${paymentId} sincronizado a Supabase`);
  } catch (error: any) {
    console.error(`❌ [syncPaymentToSupabase] Error:`, error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Cloud Function: Sincronizar pagos pendientes a Supabase
 * Se ejecuta cada 2 minutos
 */
export const syncPaymentsToSupabase = functions.pubsub
  .schedule("every 2 minutes")
  .onRun(async (context) => {
    console.log("🔄 [syncPaymentsToSupabase] Iniciando sincronización de pagos a Supabase...");

    const client = await pool.connect();
    try {
      // ✅ Obtener pagos no sincronizados
      // Nota: La columna se llama synced_to_firebase (no synced_to_supabase)
      const result = await client.query(`
        SELECT id, status, updated_at
        FROM payments
        WHERE synced_to_firebase IS NULL OR synced_to_firebase = false
        AND updated_at >= NOW() - INTERVAL '10 minutes'
        ORDER BY updated_at DESC
        LIMIT 100
      `);

      console.log(`📊 [syncPaymentsToSupabase] Encontrados ${result.rows.length} pagos para sincronizar`);

      for (const payment of result.rows) {
        try {
          await syncPaymentToSupabase(payment.id);
        } catch (error) {
          console.error(`❌ Error sincronizando pago ${payment.id}:`, error);
          // Continuar con el siguiente pago
        }
      }

      console.log("✅ [syncPaymentsToSupabase] Sincronización completada");
    } catch (error) {
      console.error("❌ [syncPaymentsToSupabase] Error en sincronización:", error);
    } finally {
      client.release();
    }
  });

/**
 * Cloud Function: Sincronizar pago específico (manual)
 */
export const forceSyncPaymentToSupabase = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Usuario no autenticado"
      );
    }

    const { paymentId } = data;

    if (!paymentId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "paymentId es requerido"
      );
    }

    try {
      console.log(`🔄 [forceSyncPaymentToSupabase] Sincronización manual para ${paymentId}`);
      await syncPaymentToSupabase(paymentId);

      return {
        success: true,
        message: "Pago sincronizado a Supabase exitosamente",
        paymentId,
      };
    } catch (error: any) {
      console.error("❌ Error en sincronización manual:", error);
      throw new functions.https.HttpsError("internal", error.message);
    }
  }
);
