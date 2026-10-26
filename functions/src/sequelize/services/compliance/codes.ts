/**
 * Códigos de compliance + reglas por defecto.
 * La fuente de verdad en runtime es la tabla `compliance_rules`
 * (seed en database/migration.sql §10); estos defaults aplican si una
 * fila no existe, de modo que un code nunca pasa silenciosamente.
 */

import type { ComplianceSeverity, RuleConfig } from './types';

export const CODES = {
  // Cuenta administrativa (RUNDI_POLICY: preserva el gate actual)
  DRIVER_NOT_FOUND: 'DRIVER_NOT_FOUND',
  DRIVER_ACCOUNT_NOT_ACTIVE: 'DRIVER_ACCOUNT_NOT_ACTIVE',
  DRIVER_ACCOUNT_SUSPENDED: 'DRIVER_ACCOUNT_SUSPENDED',
  VEHICLE_NOT_FOUND: 'VEHICLE_NOT_FOUND',
  VEHICLE_NOT_ACTIVE: 'VEHICLE_NOT_ACTIVE',
  VEHICLE_DRIVER_MISMATCH: 'VEHICLE_DRIVER_MISMATCH',

  // Licencia
  LICENSE_MISSING: 'LICENSE_MISSING',
  LICENSE_EXPIRED: 'LICENSE_EXPIRED',
  LICENSE_EXPIRING_SOON: 'LICENSE_EXPIRING_SOON',
  LICENSE_NOT_YET_VALID: 'LICENSE_NOT_YET_VALID',
  LICENSE_INVALID_DATE_RANGE: 'LICENSE_INVALID_DATE_RANGE',
  LICENSE_TYPE_ORDINARY_FOR_PAID_WORK: 'LICENSE_TYPE_ORDINARY_FOR_PAID_WORK',
  LICENSE_REPORTED_SUSPENDED: 'LICENSE_REPORTED_SUSPENDED',
  LICENSE_CATEGORY_MISMATCH: 'LICENSE_CATEGORY_MISMATCH',
  LICENSE_CATEGORY_UNVERIFIED: 'LICENSE_CATEGORY_UNVERIFIED',

  // Documentos genéricos
  DOCUMENT_PENDING_VERIFICATION: 'DOCUMENT_PENDING_VERIFICATION',
  DOCUMENT_REJECTED: 'DOCUMENT_REJECTED',
  DOCUMENT_DATA_INCOMPLETE: 'DOCUMENT_DATA_INCOMPLETE',
  INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',

  // Circulación
  CIRCULATION_CARD_MISSING: 'CIRCULATION_CARD_MISSING',
  CIRCULATION_DATA_MISMATCH: 'CIRCULATION_DATA_MISMATCH',
  SERVICE_TYPE_NOT_PUBLIC: 'SERVICE_TYPE_NOT_PUBLIC',

  // Seguro
  INSURANCE_MISSING: 'INSURANCE_MISSING',
  INSURANCE_EXPIRED: 'INSURANCE_EXPIRED',
  INSURANCE_EXPIRING_SOON: 'INSURANCE_EXPIRING_SOON',
  INSURANCE_NOT_YET_ACTIVE: 'INSURANCE_NOT_YET_ACTIVE',
  INSURANCE_INVALID_DATE_RANGE: 'INSURANCE_INVALID_DATE_RANGE',
  INSURANCE_VEHICLE_MISMATCH: 'INSURANCE_VEHICLE_MISMATCH',
  INSURANCE_PASSENGER_COVERAGE_MISSING: 'INSURANCE_PASSENGER_COVERAGE_MISSING',
  INSURANCE_POLICY_DUPLICATE: 'INSURANCE_POLICY_DUPLICATE',

  // ITM / emisiones
  INSPECTION_MISSING: 'INSPECTION_MISSING',
  INSPECTION_EXPIRED: 'INSPECTION_EXPIRED',
  INSPECTION_FAILED: 'INSPECTION_FAILED',
  INSPECTION_EXPIRING_SOON: 'INSPECTION_EXPIRING_SOON',
  EMISSIONS_MISSING: 'EMISSIONS_MISSING',
  EMISSIONS_EXPIRED: 'EMISSIONS_EXPIRED',
  EMISSIONS_FAILED: 'EMISSIONS_FAILED',
  EMISSIONS_EXPIRING_SOON: 'EMISSIONS_EXPIRING_SOON',

  // Rodamiento / revisado
  ROAD_TAX_MISSING: 'ROAD_TAX_MISSING',
  ROAD_TAX_GRACE_PERIOD: 'ROAD_TAX_GRACE_PERIOD',
  ROAD_TAX_EXEMPT_UNVERIFIED: 'ROAD_TAX_EXEMPT_UNVERIFIED',
  REVISADO_MISSING: 'REVISADO_MISSING',
  LEGACY_DOCUMENT_MISSING: 'LEGACY_DOCUMENT_MISSING',

  // Integridad / duplicados
  IDENTIFIER_MISMATCH: 'IDENTIFIER_MISMATCH',
  DUPLICATE_LICENSE: 'DUPLICATE_LICENSE',
  DUPLICATE_PLATE: 'DUPLICATE_PLATE',
  DUPLICATE_VIN: 'DUPLICATE_VIN',
  FOREIGN_PLATE_PUBLIC_SERVICE: 'FOREIGN_PLATE_PUBLIC_SERVICE',
  PUBLIC_TRANSPORT_CONCESSION_MISSING: 'PUBLIC_TRANSPORT_CONCESSION_MISSING',
  REQUIRES_MANUAL_REVIEW: 'REQUIRES_MANUAL_REVIEW',
} as const;

export type ComplianceCode = (typeof CODES)[keyof typeof CODES];

interface DefaultRule {
  severity: ComplianceSeverity;
  blocking: boolean;
  warningDays?: number;
  legalBasis: string;
}

/** Defaults idénticos al seed de compliance_rules (migration.sql §10). */
export const DEFAULT_RULES: Record<string, DefaultRule> = {
  DRIVER_NOT_FOUND: { severity: 'BLOCKING', blocking: true, legalBasis: 'RUNDI_POLICY' },
  DRIVER_ACCOUNT_NOT_ACTIVE: { severity: 'BLOCKING', blocking: true, legalBasis: 'RUNDI_POLICY' },
  DRIVER_ACCOUNT_SUSPENDED: { severity: 'BLOCKING', blocking: true, legalBasis: 'RUNDI_POLICY' },
  VEHICLE_NOT_FOUND: { severity: 'BLOCKING', blocking: true, legalBasis: 'RUNDI_POLICY' },
  VEHICLE_NOT_ACTIVE: { severity: 'BLOCKING', blocking: true, legalBasis: 'RUNDI_POLICY' },
  VEHICLE_DRIVER_MISMATCH: { severity: 'BLOCKING', blocking: true, legalBasis: 'RUNDI_POLICY' },

  LICENSE_MISSING: { severity: 'BLOCKING', blocking: true, legalBasis: 'Ley 431 Art. 133.5' },
  LICENSE_EXPIRED: { severity: 'BLOCKING', blocking: true, legalBasis: 'Ley 431 Art. 140' },
  LICENSE_EXPIRING_SOON: { severity: 'WARNING', blocking: false, warningDays: 30, legalBasis: 'RUNDI_POLICY' },
  LICENSE_NOT_YET_VALID: { severity: 'BLOCKING', blocking: true, legalBasis: 'Integridad de fechas' },
  LICENSE_INVALID_DATE_RANGE: { severity: 'BLOCKING', blocking: true, legalBasis: 'Integridad de fechas' },
  LICENSE_TYPE_ORDINARY_FOR_PAID_WORK: { severity: 'WARNING', blocking: false, legalBasis: 'REQUIRES_MANUAL_LEGAL_REVIEW' },
  LICENSE_REPORTED_SUSPENDED: { severity: 'BLOCKING', blocking: true, legalBasis: 'Ley 431 Art. 143' },
  LICENSE_CATEGORY_MISMATCH: { severity: 'BLOCKING', blocking: true, legalBasis: 'Ley 431 Art. 21/140' },
  LICENSE_CATEGORY_UNVERIFIED: { severity: 'REQUIRES_REVIEW', blocking: false, legalBasis: 'REQUIRES_MANUAL_LEGAL_REVIEW' },

  DOCUMENT_PENDING_VERIFICATION: { severity: 'REQUIRES_REVIEW', blocking: false, legalBasis: 'RUNDI_POLICY' },
  DOCUMENT_REJECTED: { severity: 'BLOCKING', blocking: true, legalBasis: 'RUNDI_POLICY' },
  DOCUMENT_DATA_INCOMPLETE: { severity: 'REQUIRES_REVIEW', blocking: false, legalBasis: 'REQUIRES_MANUAL_LEGAL_REVIEW' },
  INVALID_DATE_RANGE: { severity: 'BLOCKING', blocking: true, legalBasis: 'Integridad de fechas' },

  CIRCULATION_CARD_MISSING: { severity: 'BLOCKING', blocking: true, legalBasis: 'Ley 431 Arts. 3.25/133.5' },
  CIRCULATION_DATA_MISMATCH: { severity: 'REQUIRES_REVIEW', blocking: false, legalBasis: 'Ley 431 Arts. 63.5/164' },
  SERVICE_TYPE_NOT_PUBLIC: { severity: 'REQUIRES_REVIEW', blocking: false, legalBasis: 'REQUIRES_MANUAL_LEGAL_REVIEW' },

  INSURANCE_MISSING: { severity: 'BLOCKING', blocking: true, legalBasis: 'Ley 431 Arts. 63/133.4' },
  INSURANCE_EXPIRED: { severity: 'BLOCKING', blocking: true, legalBasis: 'Ley 431 Art. 68' },
  INSURANCE_EXPIRING_SOON: { severity: 'WARNING', blocking: false, warningDays: 30, legalBasis: 'RUNDI_POLICY' },
  INSURANCE_NOT_YET_ACTIVE: { severity: 'BLOCKING', blocking: true, legalBasis: 'Ley 431 Art. 68' },
  INSURANCE_INVALID_DATE_RANGE: { severity: 'BLOCKING', blocking: true, legalBasis: 'Integridad de fechas' },
  INSURANCE_VEHICLE_MISMATCH: { severity: 'REQUIRES_REVIEW', blocking: false, legalBasis: 'Ley 431 Art. 63.5' },
  INSURANCE_PASSENGER_COVERAGE_MISSING: { severity: 'REQUIRES_REVIEW', blocking: false, legalBasis: 'Ley 431 Art. 69.II.4' },
  INSURANCE_POLICY_DUPLICATE: { severity: 'REQUIRES_REVIEW', blocking: false, legalBasis: 'Integridad interna' },

  INSPECTION_MISSING: { severity: 'BLOCKING', blocking: true, legalBasis: 'PN trámite revisado; exención 2 años nuevos' },
  INSPECTION_EXPIRED: { severity: 'BLOCKING', blocking: true, legalBasis: 'PN trámite revisado' },
  INSPECTION_FAILED: { severity: 'BLOCKING', blocking: true, legalBasis: 'PN trámite revisado' },
  INSPECTION_EXPIRING_SOON: { severity: 'WARNING', blocking: false, warningDays: 30, legalBasis: 'RUNDI_POLICY' },
  EMISSIONS_MISSING: { severity: 'BLOCKING', blocking: true, legalBasis: 'Ley 431 Arts. 60-62; exención 2 años nuevos' },
  EMISSIONS_EXPIRED: { severity: 'BLOCKING', blocking: true, legalBasis: 'Ley 431 Art. 62' },
  EMISSIONS_FAILED: { severity: 'BLOCKING', blocking: true, legalBasis: 'Ley 431 Arts. 60-62' },
  EMISSIONS_EXPIRING_SOON: { severity: 'WARNING', blocking: false, warningDays: 30, legalBasis: 'RUNDI_POLICY' },

  ROAD_TAX_MISSING: { severity: 'BLOCKING', blocking: true, legalBasis: 'Ley 431 Arts. 11-12' },
  ROAD_TAX_GRACE_PERIOD: { severity: 'WARNING', blocking: false, legalBasis: 'Ley 431 Art. 11' },
  ROAD_TAX_EXEMPT_UNVERIFIED: { severity: 'REQUIRES_REVIEW', blocking: false, legalBasis: 'Ley 431 Art. 11' },
  REVISADO_MISSING: { severity: 'REQUIRES_REVIEW', blocking: false, legalBasis: 'PN trámite revisado; Ley 431 Art. 133.3' },
  LEGACY_DOCUMENT_MISSING: { severity: 'REQUIRES_REVIEW', blocking: false, legalBasis: 'RUNDI_POLICY (transición: vehículos/conductores preexistentes)' },

  IDENTIFIER_MISMATCH: { severity: 'REQUIRES_REVIEW', blocking: false, legalBasis: 'Ley 431 Arts. 63.5/164' },
  DUPLICATE_LICENSE: { severity: 'REQUIRES_REVIEW', blocking: false, legalBasis: 'Integridad interna' },
  DUPLICATE_PLATE: { severity: 'BLOCKING', blocking: true, legalBasis: 'Integridad interna' },
  DUPLICATE_VIN: { severity: 'REQUIRES_REVIEW', blocking: false, legalBasis: 'Integridad interna' },
  FOREIGN_PLATE_PUBLIC_SERVICE: { severity: 'BLOCKING', blocking: true, legalBasis: 'Ley 431 Art. 134' },
  PUBLIC_TRANSPORT_CONCESSION_MISSING: { severity: 'REQUIRES_REVIEW', blocking: false, legalBasis: 'REQUIRES_MANUAL_LEGAL_REVIEW' },
  REQUIRES_MANUAL_REVIEW: { severity: 'REQUIRES_REVIEW', blocking: false, legalBasis: 'REQUIRES_MANUAL_LEGAL_REVIEW' },
};

export const DEFAULT_WARNING_DAYS = 30;

/** Config final de un código: fila de DB si existe, si no DEFAULT_RULES, si no REQUIRES_REVIEW seguro. */
export function resolveRuleConfig(
  code: string,
  dbRules: Map<string, RuleConfig>,
): RuleConfig {
  const db = dbRules.get(code);
  if (db && db.enabled) return db;

  const def = DEFAULT_RULES[code];
  if (def) {
    return {
      code,
      severity: def.severity,
      blocking: def.blocking,
      enabled: true,
      warningDays: def.warningDays ?? null,
      legalBasis: def.legalBasis,
      params: {},
    };
  }

  // Código desconocido: nunca blocking (no inventar requisitos)
  return {
    code,
    severity: 'REQUIRES_REVIEW',
    blocking: false,
    enabled: true,
    warningDays: null,
    legalBasis: 'REQUIRES_MANUAL_LEGAL_REVIEW',
    params: {},
  };
}
