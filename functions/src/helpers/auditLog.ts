/**
 * auditLog.ts
 * Helper para escribir eventos de auditoría a la tabla audit_log en Supabase.
 *
 * La tabla audit_log es append-only (nadie puede UPDATE/DELETE).
 * Solo el service_role (backend) puede INSERT.
 *
 * Uso:
 *   await logAuditEvent({
 *     actorUid: context.auth.uid,
 *     actorRole: 'admin',
 *     action: 'update',
 *     entityType: 'driver',
 *     entityId: driverId,
 *     changes: { before: { status: 'pending' }, after: { status: 'active' } },
 *   });
 */

import { supabasePost } from '../supabase/rest';

export type AuditAction = 'create' | 'update' | 'delete' | 'restore' | 'cancel' | 'complete';
export type AuditEntityType = 'ride' | 'driver' | 'payment' | 'rating' | 'vehicle' | 'complaint' | 'user' | 'card' | 'service';
export type AuditActorRole = 'client' | 'driver' | 'admin' | 'operator' | 'system';
export type AuditSource = 'api' | 'trigger' | 'scheduled' | 'manual';

interface AuditLogParams {
  actorUid: string;
  actorRole: AuditActorRole;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  changes?: { before?: Record<string, any>; after?: Record<string, any> } | null;
  source?: AuditSource;
}

/**
 * Registra un evento en audit_log.
 * No lanza errores — la auditoría no debe romper el flujo principal.
 */
export async function logAuditEvent(params: AuditLogParams): Promise<void> {
  try {
    await supabasePost('audit_log', {
      actor_uid: params.actorUid,
      actor_role: params.actorRole,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      changes: params.changes ?? null,
      source: params.source ?? 'api',
    });
  } catch (error) {
    console.error('⚠️ [auditLog] Error escribiendo a audit_log:', error);
  }
}
