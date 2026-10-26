/**
 * Reglas de integridad cruzada: duplicados de identificadores,
 * servicio registral y coherencia conductor↔vehículo.
 */

import type { ComplianceFacts, ComplianceReason, RuleContext } from '../types';
import { reason } from './ruleUtils';

export function evaluateIdentifiers(
  facts: ComplianceFacts,
  ctx: RuleContext,
): ComplianceReason[] {
  const reasons: ComplianceReason[] = [];
  const dup = facts.duplicates;
  const vehicle = facts.vehicle;

  if (dup?.licenseNumberDriverIds && dup.licenseNumberDriverIds.length > 0) {
    reasons.push(
      reason(
        ctx,
        'DUPLICATE_LICENSE',
        `Número de licencia también registrado por otros conductores (${dup.licenseNumberDriverIds.length})`,
        'review',
        { otherDriverIds: dup.licenseNumberDriverIds },
      ),
    );
  }

  if (dup?.plateVehicleIds && dup.plateVehicleIds.length > 0) {
    reasons.push(
      reason(
        ctx,
        'DUPLICATE_PLATE',
        `Placa registrada en otro(s) vehículo(s) vigente(s)`,
        'fail',
        { otherVehicleIds: dup.plateVehicleIds },
      ),
    );
  }

  if (dup?.vinVehicleIds && dup.vinVehicleIds.length > 0) {
    reasons.push(
      reason(
        ctx,
        'DUPLICATE_VIN',
        `VIN/chasis/motor duplicado en otro(s) vehículo(s)`,
        'review',
        { otherVehicleIds: dup.vinVehicleIds },
      ),
    );
  }

  // Servicio registral: PRIVADO operando viajes → revisión (no blocking; §8 legal review)
  const serviceType = (vehicle?.serviceType ?? '').trim().toUpperCase();
  if (vehicle && serviceType && serviceType !== 'PUBLICO' && serviceType !== 'PÚBLICO' && serviceType !== 'TAXI') {
    reasons.push(
      reason(
        ctx,
        'SERVICE_TYPE_NOT_PUBLIC',
        `Servicio registral del vehículo es "${vehicle.serviceType}" (operando servicio de pasajeros)`,
        'review',
        { serviceType: vehicle.serviceType },
      ),
    );
  }

  return reasons;
}
