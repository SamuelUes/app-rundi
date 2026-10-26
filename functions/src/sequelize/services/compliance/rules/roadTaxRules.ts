/**
 * Reglas del impuesto municipal de rodamiento (Ley 431 Arts. 11-12).
 * Pago durante el primer trimestre del año → warning en Q1, blocking después.
 */

import { isWithinTaxGracePeriod, yearOf } from '../dateUtils';
import type { ComplianceFacts, ComplianceReason, RuleContext } from '../types';
import { docStatusReason, isGrandfatheredForMissingDoc, passReason, reason } from './ruleUtils';

export function evaluateRoadTax(
  facts: ComplianceFacts,
  ctx: RuleContext,
): ComplianceReason[] {
  const reasons: ComplianceReason[] = [];
  const tax = facts.roadTax;
  const currentYear = yearOf(ctx.today);

  if (!tax) {
    if (isGrandfatheredForMissingDoc(ctx, 'ROAD_TAX_MISSING', facts.vehicle?.createdAt)) {
      reasons.push(
        reason(
          ctx,
          'LEGACY_DOCUMENT_MISSING',
          `Rodamiento ${currentYear} pendiente de carga (vehículo registrado antes del sistema de compliance)`,
          'review',
          { documentKind: 'road_tax', missingCode: 'ROAD_TAX_MISSING', taxYear: currentYear },
        ),
      );
    } else if (isWithinTaxGracePeriod(ctx.today)) {
      reasons.push(
        reason(
          ctx,
          'ROAD_TAX_GRACE_PERIOD',
          `Sin rodamiento ${currentYear} registrado (período de pago: primer trimestre)`,
          'warning',
          { taxYear: currentYear },
        ),
      );
    } else {
      reasons.push(
        reason(
          ctx,
          'ROAD_TAX_MISSING',
          `Sin impuesto de rodamiento ${currentYear} registrado`,
          'fail',
          { taxYear: currentYear },
        ),
      );
    }
    return reasons;
  }

  const statusReason = docStatusReason(ctx, tax, `Rodamiento ${tax.taxYear}`);
  if (statusReason) reasons.push(statusReason);

  if (tax.exempt) {
    if (tax.status === 'verified') {
      reasons.push(
        passReason('ROAD_TAX_VALID', `Exención de rodamiento ${tax.taxYear} verificada`),
      );
    } else {
      reasons.push(
        reason(
          ctx,
          'ROAD_TAX_EXEMPT_UNVERIFIED',
          `Exención de rodamiento ${tax.taxYear} declarada sin verificar`,
          'review',
          { taxYear: tax.taxYear, exemptReason: (tax as any).exemptReason },
        ),
      );
    }
    return reasons;
  }

  if (tax.status === 'verified') {
    reasons.push(
      passReason('ROAD_TAX_VALID', `Rodamiento ${tax.taxYear} pagado y verificado`, {
        taxYear: tax.taxYear,
      }),
    );
  }

  return reasons;
}
