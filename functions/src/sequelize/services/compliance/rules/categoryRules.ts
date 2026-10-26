/**
 * Reglas de compatibilidad categoría de licencia ↔ tipo de vehículo ↔ servicio.
 * Matriz data-driven desde license_category_rules. Solo reglas con
 * confirmed_by_source=true pueden producir BLOCKING.
 */

import type { CategoryRuleRow, ComplianceFacts, ComplianceReason, RuleContext } from '../types';
import { passReason, reason } from './ruleUtils';

function findRule(
  ctx: RuleContext,
  vehicleType: string,
  serviceCode: string,
): CategoryRuleRow | undefined {
  const normalizedType = vehicleType.toLowerCase();
  const normalizedService = serviceCode.toLowerCase();

  // 1) regla específica vehicle_type + service_code
  let rule = ctx.categoryRules.find(
    (r) =>
      r.vehicleType.toLowerCase() === normalizedType &&
      r.serviceCode.toLowerCase() === normalizedService,
  );
  // 2) regla del tipo de vehículo para cualquier servicio ('*')
  rule ??= ctx.categoryRules.find(
    (r) => r.vehicleType.toLowerCase() === normalizedType && r.serviceCode === '*',
  );
  // 3) catch-all '*'
  rule ??= ctx.categoryRules.find((r) => r.vehicleType === '*' && r.serviceCode === '*');
  return rule;
}

export function evaluateLicenseCategory(
  facts: ComplianceFacts,
  ctx: RuleContext,
): ComplianceReason[] {
  const reasons: ComplianceReason[] = [];
  const vehicle = facts.vehicle;
  const license = facts.license;

  if (!vehicle || !license) {
    return reasons; // el faltante ya lo reportan sus reglas propias
  }

  const vehicleType = (vehicle.type ?? 'auto').toLowerCase();
  const serviceCode = (facts.serviceCode ?? '*').toLowerCase();
  const rule = findRule(ctx, vehicleType, serviceCode);

  if (!rule) {
    reasons.push(
      reason(
        ctx,
        'LICENSE_CATEGORY_UNVERIFIED',
        `Sin regla de compatibilidad para tipo de vehículo "${vehicleType}"`,
        'review',
        { vehicleType, serviceCode },
      ),
    );
    return reasons;
  }

  const required = rule.requiredCategories ?? [];
  if (required.length === 0) {
    reasons.push(
      reason(
        ctx,
        'LICENSE_CATEGORY_UNVERIFIED',
        `Compatibilidad categoría↔vehículo "${vehicleType}" no confirmada por fuente oficial`,
        'review',
        { vehicleType, serviceCode },
      ),
    );
    return reasons;
  }

  const held = (license.categories ?? []).map((c) => c.toLowerCase());
  if (held.length === 0) {
    reasons.push(
      reason(
        ctx,
        'LICENSE_CATEGORY_UNVERIFIED',
        `Licencia sin categorías declaradas; no se puede confirmar compatibilidad con "${vehicleType}"`,
        'review',
        { vehicleType, requiredCategories: required },
      ),
    );
    return reasons;
  }

  const ok = required.some((req) => held.includes(req.toLowerCase()));

  if (ok) {
    reasons.push(
      passReason(
        'LICENSE_CATEGORY_COMPATIBLE',
        `Categoría de licencia compatible con "${vehicleType}"`,
        { requiredCategories: required, heldCategories: license.categories },
      ),
    );
    return reasons;
  }

  if (rule.confirmedBySource && rule.severity === 'BLOCKING') {
    reasons.push(
      reason(
        ctx,
        'LICENSE_CATEGORY_MISMATCH',
        `Categorías de licencia [${license.categories.join(', ') || 'ninguna'}] no habilitan "${vehicleType}" (requiere: ${required.join(', ')})`,
        'fail',
        { vehicleType, requiredCategories: required, heldCategories: license.categories },
      ),
    );
  } else {
    reasons.push(
      reason(
        ctx,
        'LICENSE_CATEGORY_UNVERIFIED',
        `Compatibilidad categoría↔"${vehicleType}" sin confirmar por fuente oficial (requerido: ${required.join(', ')})`,
        'review',
        { vehicleType, requiredCategories: required, heldCategories: license.categories },
      ),
    );
  }

  return reasons;
}
