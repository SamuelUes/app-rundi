/**
 * Reglas de seguro obligatorio (Ley 431 Arts. 63-79).
 * RC vigencia 1 año; cobertura de pasajeros para transporte de pasajeros.
 */

import { resolveRuleConfig } from '../codes';
import {
  compareDates,
  isExpired,
  isExpiringSoon,
  isNotYetValid,
  daysUntilExpiration,
  toDateOnly,
} from '../dateUtils';
import type { ComplianceFacts, ComplianceReason, RuleContext } from '../types';
import { docStatusReason, passReason, reason } from './ruleUtils';

function eq(a: string | null | undefined, b: string | null | undefined): boolean | null {
  const na = (a ?? '').trim().toLowerCase();
  const nb = (b ?? '').trim().toLowerCase();
  if (!na || !nb) return null;
  return na === nb;
}

export function evaluateInsurance(
  facts: ComplianceFacts,
  ctx: RuleContext,
): ComplianceReason[] {
  const reasons: ComplianceReason[] = [];
  const policy = facts.rcInsurance;
  const vehicle = facts.vehicle;

  if (!policy) {
    reasons.push(
      reason(
        ctx,
        'INSURANCE_MISSING',
        'Sin póliza de responsabilidad civil obligatoria vigente',
      ),
    );
    return reasons;
  }

  const statusReason = docStatusReason(ctx, policy, 'Póliza de seguro RC');
  if (statusReason) reasons.push(statusReason);

  const from = toDateOnly(policy.effectiveFrom);
  const until = toDateOnly(policy.effectiveUntil);

  if (from && until && compareDates(from, until) > 0) {
    reasons.push(
      reason(
        ctx,
        'INSURANCE_INVALID_DATE_RANGE',
        `Inicio de vigencia (${from}) posterior a fin (${until})`,
        'fail',
        { effectiveFrom: from, effectiveUntil: until },
      ),
    );
  } else {
    if (isNotYetValid(from, ctx.today)) {
      reasons.push(
        reason(
          ctx,
          'INSURANCE_NOT_YET_ACTIVE',
          `Póliza inicia vigencia el ${from}`,
          'fail',
          { effectiveFrom: from },
        ),
      );
    }

    if (!until) {
      reasons.push(
        reason(
          ctx,
          'DOCUMENT_DATA_INCOMPLETE',
          'Póliza sin fecha de fin de vigencia legible',
          'review',
          { documentKind: 'insurance' },
        ),
      );
    } else if (isExpired(until, ctx.today)) {
      reasons.push(
        reason(ctx, 'INSURANCE_EXPIRED', `Póliza vencida el ${until}`, 'fail', {
          effectiveUntil: until,
        }),
      );
    } else {
      const cfg = resolveRuleConfig('INSURANCE_EXPIRING_SOON', ctx.rules);
      const warningDays = cfg.warningDays ?? 30;
      if (isExpiringSoon(until, ctx.today, warningDays)) {
        reasons.push(
          reason(
            ctx,
            'INSURANCE_EXPIRING_SOON',
            `Póliza vence el ${until} (en ${daysUntilExpiration(until, ctx.today)} días)`,
            'warning',
            { effectiveUntil: until, daysUntil: daysUntilExpiration(until, ctx.today) },
          ),
        );
      } else {
        reasons.push(
          passReason('INSURANCE_VALID', `Póliza RC vigente hasta ${until}`, {
            effectiveUntil: until,
          }),
        );
      }
    }
  }

  // Identificadores del vehículo asegurado vs vehículo real (Art. 63.5)
  if (vehicle) {
    const mismatches: string[] = [];
    const checks: Array<[string, string | null, string | null]> = [
      ['plate', policy.insuredPlate, vehicle.plate],
      ['vin', policy.insuredVin, vehicle.vin],
      ['motor', policy.insuredMotor, vehicle.motor],
      ['chasis', policy.insuredChasis, vehicle.chasis],
    ];
    for (const [field, insured, actual] of checks) {
      if (eq(insured, actual) === false) {
        mismatches.push(`${field}: póliza="${insured}" vs vehículo="${actual}"`);
      }
    }
    if (mismatches.length > 0) {
      reasons.push(
        reason(
          ctx,
          'INSURANCE_VEHICLE_MISMATCH',
          `La póliza describe un vehículo distinto: ${mismatches.join('; ')}`,
          'review',
          { mismatches },
        ),
      );
    }
  }

  if (facts.duplicates?.policyVehicleIds && facts.duplicates.policyVehicleIds.length > 0) {
    reasons.push(
      reason(
        ctx,
        'INSURANCE_POLICY_DUPLICATE',
        `Misma póliza registrada en otros vehículos: ${facts.duplicates.policyVehicleIds.join(', ')}`,
        'review',
        { otherVehicleIds: facts.duplicates.policyVehicleIds },
      ),
    );
  }

  // Cobertura de pasajeros (Art. 69.II.4) — no verificable sin OCR → REQUIRES_REVIEW
  if (!facts.hasPassengerCoverage) {
    reasons.push(
      reason(
        ctx,
        'INSURANCE_PASSENGER_COVERAGE_MISSING',
        'No se identificó cobertura de pasajeros para un vehículo de servicio de pasajeros',
        'review',
      ),
    );
  }

  return reasons;
}
