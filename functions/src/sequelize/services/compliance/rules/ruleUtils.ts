/**
 * Helpers compartidos por las reglas de compliance.
 */

import { resolveRuleConfig } from '../codes';
import { compareDates, toDateOnly } from '../dateUtils';
import type { ComplianceReason, DocFactsBase, ReasonStatus, RuleContext } from '../types';

export function reason(
  ctx: RuleContext,
  code: string,
  message: string,
  status: ReasonStatus = 'fail',
  details?: Record<string, any>,
): ComplianceReason {
  const cfg = resolveRuleConfig(code, ctx.rules);
  return {
    code,
    severity: cfg.severity,
    blocking: cfg.blocking,
    status,
    message,
    source: cfg.legalBasis,
    details,
  };
}

/** Confirmación positiva (severity INFO, nunca bloquea). */
export function passReason(
  code: string,
  message: string,
  details?: Record<string, any>,
): ComplianceReason {
  return {
    code,
    severity: 'INFO',
    blocking: false,
    status: 'pass',
    message,
    source: null,
    details,
  };
}

/**
 * Estado de revisión de un documento:
 * - rejected → DOCUMENT_REJECTED
 * - pending|in_review|requires_review → DOCUMENT_PENDING_VERIFICATION
 * Devuelve null si está verified/expired (la lógica de fechas decide aparte).
 */
/**
 * Grandfathering de documentos faltantes durante la transición.
 *
 * Una regla `*_MISSING` puede configurarse con params (compliance_rules.params):
 * - `enforce_from: 'YYYY-MM-DD'` → antes de esa fecha, el faltante no bloquea a nadie.
 * - `grandfathered_before: 'YYYY-MM-DD'` → vehículos creados antes de esa fecha
 *   no bloquean por ese faltante (flota preexistente sigue operando mientras carga).
 *
 * Sin params → comportamiento estricto por defecto (bloquea).
 */
export function isGrandfatheredForMissingDoc(
  ctx: RuleContext,
  missingCode: string,
  vehicleCreatedAt: string | null | undefined,
): boolean {
  const cfg = resolveRuleConfig(missingCode, ctx.rules);

  const enforceFrom = toDateOnly(cfg.params?.enforce_from);
  if (enforceFrom && compareDates(ctx.today, enforceFrom) < 0) return true;

  const grandfatheredBefore = toDateOnly(cfg.params?.grandfathered_before);
  const created = toDateOnly(vehicleCreatedAt);
  if (grandfatheredBefore && created && compareDates(created, grandfatheredBefore) < 0) return true;

  return false;
}

export function docStatusReason(
  ctx: RuleContext,
  doc: DocFactsBase,
  documentKind: string,
): ComplianceReason | null {
  if (doc.status === 'rejected') {
    return reason(ctx, 'DOCUMENT_REJECTED', `${documentKind} rechazado en revisión`, 'fail', {
      documentKind,
      documentId: doc.id,
    });
  }
  if (doc.status === 'pending' || doc.status === 'in_review' || doc.status === 'requires_review') {
    return reason(
      ctx,
      'DOCUMENT_PENDING_VERIFICATION',
      `${documentKind} pendiente de verificación manual`,
      'review',
      { documentKind, documentId: doc.id, documentStatus: doc.status },
    );
  }
  return null;
}
