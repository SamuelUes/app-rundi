/**
 * Evaluador puro de compliance.
 *
 * Núcleo sin IO ni dependencias de base de datos:
 *   facts + context → reasons → {allowed, status}
 *
 * Testeable directamente sobre objetos plain (ver test/compliance.test.mjs).
 */

import type {
  CategoryRuleRow,
  ComplianceReason,
  ComplianceFacts,
  RuleConfig,
  RuleContext,
} from './types';
import { evaluateLicense } from './rules/licenseRules';
import { evaluateCirculation } from './rules/circulationRules';
import { evaluateInsurance } from './rules/insuranceRules';
import { evaluateEmissions, evaluateInspection, evaluateRevisado } from './rules/periodicRules';
import { evaluateRoadTax } from './rules/roadTaxRules';
import { evaluateIdentifiers } from './rules/identifierRules';
import { evaluateLicenseCategory } from './rules/categoryRules';
import { reason } from './rules/ruleUtils';

export const RULES_VERSION = '1.0.0';

export function buildContext(
  rules: Map<string, RuleConfig>,
  categoryRules: CategoryRuleRow[],
  today: string,
): RuleContext {
  return { today, rules, categoryRules };
}

/**
 * Núcleo puro: facts + context → razones. Sin IO. Testeable directamente.
 */
export function evaluateFacts(facts: ComplianceFacts, ctx: RuleContext): ComplianceReason[] {
  const reasons: ComplianceReason[] = [];

  // --- Vehículo solicitado pero inexistente (antes del early-return de driver) ---
  if (facts.vehicle === null) {
    reasons.push(
      reason(ctx, 'VEHICLE_NOT_FOUND', 'Vehículo no encontrado'),
    );
  }

  // --- Driver ---
  if (!facts.driver) {
    reasons.push(
      reason(ctx, 'DRIVER_NOT_FOUND', 'Conductor no encontrado'),
    );
    return reasons;
  }

  const accountStatus = (facts.driver.accountStatus ?? 'pending').toLowerCase();
  if (accountStatus === 'suspended') {
    reasons.push(
      reason(ctx, 'DRIVER_ACCOUNT_SUSPENDED', 'Cuenta del conductor suspendida'),
    );
  } else if (accountStatus !== 'active') {
    reasons.push(
      reason(ctx, 'DRIVER_ACCOUNT_NOT_ACTIVE', `Cuenta del conductor en estado "${accountStatus}"`),
    );
  }

  reasons.push(...evaluateLicense(facts, ctx));

  // --- Vehículo (si la evaluación lo incluye y existe) ---
  if (facts.vehicle) {
    if (!facts.vehicle.isActive) {
      reasons.push(
        reason(
          ctx,
          'VEHICLE_NOT_ACTIVE',
          'Vehículo no aprobado/activado por el equipo administrativo',
        ),
      );
    }

    if (facts.driver && facts.vehicle.driverId !== facts.driver.id) {
      reasons.push(
        reason(
          ctx,
          'VEHICLE_DRIVER_MISMATCH',
          'El vehículo no pertenece a este conductor',
          'fail',
          { vehicleDriverId: facts.vehicle.driverId, driverId: facts.driver.id },
        ),
      );
    }

    reasons.push(...evaluateCirculation(facts, ctx));
    reasons.push(...evaluateInsurance(facts, ctx));
    reasons.push(...evaluateInspection(facts, ctx));
    reasons.push(...evaluateEmissions(facts, ctx));
    reasons.push(...evaluateRoadTax(facts, ctx));
    reasons.push(...evaluateRevisado(facts, ctx));
  }

  // --- Par (conductor + vehículo) ---
  reasons.push(...evaluateIdentifiers(facts, ctx));
  reasons.push(...evaluateLicenseCategory(facts, ctx));

  return reasons;
}

export function summarizeEvaluation(
  reasons: ComplianceReason[],
  scope: 'driver' | 'vehicle' | 'pair',
): { allowed: boolean; status: string } {
  const blocking = reasons.some((r) => r.blocking && r.status !== 'pass');
  const suspended = reasons.some((r) => r.code === 'DRIVER_ACCOUNT_SUSPENDED');
  const hasReview = reasons.some((r) => r.severity === 'REQUIRES_REVIEW' && r.status !== 'pass');
  const hasWarning = reasons.some((r) => r.severity === 'WARNING' && r.status !== 'pass');
  const hasExpired = reasons.some((r) => r.code.endsWith('_EXPIRED'));

  if (suspended) {
    return { allowed: false, status: 'suspended' };
  }
  if (blocking) {
    return {
      allowed: false,
      status: scope === 'driver' ? 'non_compliant' : scope === 'vehicle' && hasExpired ? 'expired_documents' : 'non_compliant',
    };
  }
  if (hasReview) {
    return { allowed: true, status: scope === 'vehicle' ? 'pending_verification' : 'under_review' };
  }
  if (hasWarning) {
    return { allowed: true, status: 'expiring' };
  }
  return { allowed: true, status: scope === 'vehicle' ? 'active' : 'verified' };
}
