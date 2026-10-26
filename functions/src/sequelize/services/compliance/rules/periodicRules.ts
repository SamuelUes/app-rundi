/**
 * Reglas de documentos periódicos del vehículo: ITM, emisiones y revisado.
 * Incluye la exención de vehículos nuevos (Ley 431: primeros 2 años).
 */

import { resolveRuleConfig } from '../codes';
import {
  isExpired,
  isExpiringSoon,
  daysUntilExpiration,
  toDateOnly,
  yearOf,
} from '../dateUtils';
import type {
  ComplianceFacts,
  ComplianceReason,
  EmissionsFacts,
  InspectionFacts,
  RuleContext,
} from '../types';
import { docStatusReason, isGrandfatheredForMissingDoc, passReason, reason } from './ruleUtils';

interface PeriodicDocSpec {
  kind: string;                 // 'inspection' | 'emissions' | 'revisado'
  displayName: string;          // 'Inspección técnico-mecánica'
  missingCode: string;
  expiredCode: string;
  failedCode?: string;
  expiringSoonCode: string;
  validCode: string;
}

const INSPECTION_SPEC: PeriodicDocSpec = {
  kind: 'inspection',
  displayName: 'Inspección técnico-mecánica',
  missingCode: 'INSPECTION_MISSING',
  expiredCode: 'INSPECTION_EXPIRED',
  failedCode: 'INSPECTION_FAILED',
  expiringSoonCode: 'INSPECTION_EXPIRING_SOON',
  validCode: 'INSPECTION_VALID',
};

const EMISSIONS_SPEC: PeriodicDocSpec = {
  kind: 'emissions',
  displayName: 'Certificado de emisiones de gases',
  missingCode: 'EMISSIONS_MISSING',
  expiredCode: 'EMISSIONS_EXPIRED',
  failedCode: 'EMISSIONS_FAILED',
  expiringSoonCode: 'EMISSIONS_EXPIRING_SOON',
  validCode: 'EMISSIONS_VALID',
};

const REVISADO_SPEC: PeriodicDocSpec = {
  kind: 'revisado',
  displayName: 'Calcomanía de revisado',
  missingCode: 'REVISADO_MISSING',
  expiredCode: 'INVALID_DATE_RANGE',
  expiringSoonCode: 'REQUIRES_MANUAL_REVIEW',
  validCode: 'REVISADO_VALID',
};

/**
 * Exención de vehículo nuevo (Ley 431: exentos de ITM y emisiones los
 * primeros 2 años). Aproximación: issued_at de circulación, emission_date
 * del vehículo, o año modelo. Marcada como WARNING por REQUIRES_MANUAL_LEGAL_REVIEW.
 */
function isVehicleExemptAsNew(facts: ComplianceFacts, ctx: RuleContext): boolean {
  const cfg = resolveRuleConfig('INSPECTION_MISSING', ctx.rules);
  const years = Number(cfg.params?.vehicle_age_exemption_years ?? 2);
  const currentYear = yearOf(ctx.today);

  const base = toDateOnly(facts.circulation?.issuedAt) ?? toDateOnly(facts.vehicle?.emissionDate);
  if (base) {
    return yearOf(base) + years >= currentYear;
  }
  if (facts.vehicle?.year) {
    return facts.vehicle.year + years >= currentYear;
  }
  return false;
}

function evaluatePeriodic(
  spec: PeriodicDocSpec,
  doc: { id: string; status: string; validUntil: string | null; result?: string | null } | null,
  facts: ComplianceFacts,
  ctx: RuleContext,
  exemptionApplies: boolean,
): ComplianceReason[] {
  const reasons: ComplianceReason[] = [];

  if (!doc) {
    if (isGrandfatheredForMissingDoc(ctx, spec.missingCode, facts.vehicle?.createdAt)) {
      reasons.push(
        reason(
          ctx,
          'LEGACY_DOCUMENT_MISSING',
          `${spec.displayName} pendiente de carga (vehículo registrado antes del sistema de compliance)`,
          'review',
          { documentKind: spec.kind, missingCode: spec.missingCode },
        ),
      );
    } else if (exemptionApplies) {
      reasons.push(
        reason(
          ctx,
          'REQUIRES_MANUAL_REVIEW',
          `${spec.displayName}: vehículo posiblemente exento por nuevo (<2 años); verificar`,
          'review',
          { documentKind: spec.kind, exemption: 'new_vehicle' },
        ),
      );
    } else {
      reasons.push(
        reason(ctx, spec.missingCode, `${spec.displayName} no registrada`),
      );
    }
    return reasons;
  }

  const statusReason = docStatusReason(ctx, doc as any, spec.displayName);
  if (statusReason) reasons.push(statusReason);

  if (spec.failedCode && doc.result && doc.result !== 'approved') {
    reasons.push(
      reason(
        ctx,
        spec.failedCode,
        `${spec.displayName} con resultado "${doc.result}"`,
        'fail',
        { result: doc.result },
      ),
    );
  }

  const until = toDateOnly(doc.validUntil);
  if (!until) {
    reasons.push(
      reason(
        ctx,
        'DOCUMENT_DATA_INCOMPLETE',
        `${spec.displayName} sin fecha de vencimiento legible`,
        'review',
        { documentKind: spec.kind },
      ),
    );
  } else if (isExpired(until, ctx.today)) {
    reasons.push(
      reason(ctx, spec.expiredCode, `${spec.displayName} vencida el ${until}`, 'fail', {
        validUntil: until,
      }),
    );
  } else {
    const cfg = resolveRuleConfig(spec.expiringSoonCode, ctx.rules);
    const warningDays = cfg.warningDays ?? 30;
    if (isExpiringSoon(until, ctx.today, warningDays)) {
      reasons.push(
        reason(
          ctx,
          spec.expiringSoonCode,
          `${spec.displayName} vence el ${until} (en ${daysUntilExpiration(until, ctx.today)} días)`,
          'warning',
          { validUntil: until, daysUntil: daysUntilExpiration(until, ctx.today) },
        ),
      );
    } else {
      reasons.push(
        passReason(spec.validCode, `${spec.displayName} vigente hasta ${until}`, {
          validUntil: until,
        }),
      );
    }
  }

  return reasons;
}

export function evaluateInspection(
  facts: ComplianceFacts,
  ctx: RuleContext,
): ComplianceReason[] {
  return evaluatePeriodic(
    INSPECTION_SPEC,
    facts.inspection as InspectionFacts | null | undefined ? {
      id: facts.inspection!.id,
      status: facts.inspection!.status,
      validUntil: facts.inspection!.validUntil,
      result: facts.inspection!.result,
    } : null,
    facts,
    ctx,
    isVehicleExemptAsNew(facts, ctx),
  );
}

export function evaluateEmissions(
  facts: ComplianceFacts,
  ctx: RuleContext,
): ComplianceReason[] {
  return evaluatePeriodic(
    EMISSIONS_SPEC,
    facts.emissions as EmissionsFacts | null | undefined ? {
      id: facts.emissions!.id,
      status: facts.emissions!.status,
      validUntil: facts.emissions!.validUntil,
      result: facts.emissions!.result,
    } : null,
    facts,
    ctx,
    isVehicleExemptAsNew(facts, ctx),
  );
}

export function evaluateRevisado(
  facts: ComplianceFacts,
  ctx: RuleContext,
): ComplianceReason[] {
  const doc = facts.revisado
    ? {
        id: facts.revisado.id,
        status: facts.revisado.status,
        validUntil: facts.revisado.validUntil,
      }
    : null;
  // El revisado deriva de sus componentes: si falta solo es REQUIRES_REVIEW
  return evaluatePeriodic(REVISADO_SPEC, doc, facts, ctx, false);
}
