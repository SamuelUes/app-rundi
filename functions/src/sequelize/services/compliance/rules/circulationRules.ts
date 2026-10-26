/**
 * Reglas de licencia de circulación del vehículo.
 * Documento permanente (Ley 431 Art. 9): sin vencimiento periódico.
 * Detecta inconsistencias entre datos declarados y datos del vehículo.
 */

import type { ComplianceFacts, ComplianceReason, RuleContext } from '../types';
import { docStatusReason, passReason, reason } from './ruleUtils';

function eq(a: string | null | undefined, b: string | null | undefined): boolean | null {
  const na = (a ?? '').trim().toLowerCase();
  const nb = (b ?? '').trim().toLowerCase();
  if (!na || !nb) return null; // no comparable
  return na === nb;
}

export function evaluateCirculation(
  facts: ComplianceFacts,
  ctx: RuleContext,
): ComplianceReason[] {
  const reasons: ComplianceReason[] = [];
  const card = facts.circulation;
  const vehicle = facts.vehicle;

  if (!card) {
    reasons.push(
      reason(ctx, 'CIRCULATION_CARD_MISSING', 'Sin licencia de circulación registrada'),
    );
    return reasons;
  }

  const statusReason = docStatusReason(ctx, card, 'Licencia de circulación');
  if (statusReason) reasons.push(statusReason);

  if (vehicle) {
    const mismatches: string[] = [];
    const checks: Array<[string, string | null, string | null]> = [
      ['plate', card.declaredPlate, vehicle.plate],
      ['vin', card.declaredVin, vehicle.vin],
      ['chasis', card.declaredChasis, vehicle.chasis],
      ['motor', card.declaredMotor, vehicle.motor],
    ];
    for (const [field, declared, actual] of checks) {
      if (eq(declared, actual) === false) {
        mismatches.push(`${field}: tarjeta="${declared}" vs vehículo="${actual}"`);
      }
    }
    if (mismatches.length > 0) {
      reasons.push(
        reason(
          ctx,
          'CIRCULATION_DATA_MISMATCH',
          `Datos de la tarjeta de circulación no coinciden con el vehículo: ${mismatches.join('; ')}`,
          'review',
          { mismatches },
        ),
      );
    } else {
      reasons.push(
        passReason('CIRCULATION_VALID', 'Datos de circulación consistentes con el vehículo'),
      );
    }
  }

  return reasons;
}
