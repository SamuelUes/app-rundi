/**
 * ComplianceService - Motor de compliance documental.
 *
 * API:
 *   canDriverOperate(driverId)
 *   canVehicleOperate(vehicleId)
 *   canDriverOperateVehicle(driverId, vehicleId, serviceCode?)
 *
 * - Reglas como datos (compliance_rules) con fallback a DEFAULT_RULES.
 * - Nada de lógica de fechas dispersa: todo pasa por dateUtils (America/Managua).
 * - Solo BLOCKING (con fuente legal o RUNDI_POLICY) impide operar.
 * - Cada evaluación se persiste en compliance_evaluations + evento.
 */

import ComplianceEvaluation from '../../models/ComplianceEvaluation';
import ComplianceEventModel from '../../models/ComplianceEvent';
import DriverModel from '../../models/Driver';
import VehicleModel from '../../models/Vehicle';
import { ComplianceRepository } from './ComplianceRepository';
import { todayNicaragua } from './dateUtils';
import {
  RULES_VERSION,
  buildContext,
  evaluateFacts,
  summarizeEvaluation,
} from './evaluator';
import type {
  ComplianceEvaluation as Evaluation,
  ComplianceFacts,
  RuleContext,
} from './types';

export { buildContext, evaluateFacts, summarizeEvaluation, RULES_VERSION };

export class ComplianceService {
  private repo = new ComplianceRepository();

  private async buildContextFor(today?: string) {
    const [rules, categoryRules] = await Promise.all([
      this.repo.loadRulesConfig(),
      this.repo.loadCategoryRules(),
    ]);
    return buildContext(rules, categoryRules, today ?? todayNicaragua());
  }

  /** Evalúa conductor+vehículo. driverId acepta Firebase UID o UUID interno. */
  async canDriverOperateVehicle(
    driverId: string,
    vehicleId: string,
    serviceCode?: string | null,
    options?: { persist?: boolean; evaluatedBy?: string; today?: string },
  ): Promise<Evaluation> {
    const ctx = await this.buildContextFor(options?.today);
    const { facts } = await this.repo.loadFacts(driverId, vehicleId, serviceCode, ctx.today);
    const reasons = evaluateFacts(facts, ctx);
    const summary = summarizeEvaluation(reasons, 'pair');

    const evaluation: Evaluation = {
      allowed: summary.allowed,
      status: summary.status as Evaluation['status'],
      reasons,
      evaluatedAt: new Date().toISOString(),
      rulesVersion: RULES_VERSION,
      driverId: facts.driver?.id ?? null,
      vehicleId: facts.vehicle?.id ?? null,
      serviceCode: serviceCode ?? null,
    };

    if (options?.persist !== false) {
      await this.persistEvaluation(evaluation, 'pair', options?.evaluatedBy ?? 'system');
      await this.refreshSnapshots(facts, ctx);
    }

    return evaluation;
  }

  async canDriverOperate(
    driverId: string,
    options?: { persist?: boolean; evaluatedBy?: string; today?: string },
  ): Promise<Evaluation> {
    const ctx = await this.buildContextFor(options?.today);
    const { facts } = await this.repo.loadFacts(driverId, null, null, ctx.today);
    const reasons = evaluateFacts(facts, ctx);
    const summary = summarizeEvaluation(reasons, 'driver');

    const evaluation: Evaluation = {
      allowed: summary.allowed,
      status: summary.status as Evaluation['status'],
      reasons,
      evaluatedAt: new Date().toISOString(),
      rulesVersion: RULES_VERSION,
      driverId: facts.driver?.id ?? null,
      vehicleId: null,
    };

    if (options?.persist !== false) {
      await this.persistEvaluation(evaluation, 'driver', options?.evaluatedBy ?? 'system');
      await this.refreshSnapshots(facts, ctx);
    }

    return evaluation;
  }

  async canVehicleOperate(
    vehicleId: string,
    options?: { persist?: boolean; evaluatedBy?: string; today?: string },
  ): Promise<Evaluation> {
    const ctx = await this.buildContextFor(options?.today);
    const vehicle = await this.repo.findVehicle(vehicleId);
    const { facts } = await this.repo.loadFacts(
      vehicle?.driver_id ?? vehicleId,
      vehicleId,
      null,
      ctx.today,
    );
    // Evaluación de vehículo: sin reglas de licencia/categoría
    const reasons = evaluateFacts({ ...facts, license: undefined }, ctx)
      .filter((r) => !r.code.startsWith('LICENSE_') && r.code !== 'DRIVER_ACCOUNT_SUSPENDED' && r.code !== 'DRIVER_ACCOUNT_NOT_ACTIVE' && r.code !== 'VEHICLE_DRIVER_MISMATCH');
    const summary = summarizeEvaluation(reasons, 'vehicle');

    const evaluation: Evaluation = {
      allowed: summary.allowed,
      status: summary.status as Evaluation['status'],
      reasons,
      evaluatedAt: new Date().toISOString(),
      rulesVersion: RULES_VERSION,
      driverId: facts.driver?.id ?? null,
      vehicleId: facts.vehicle?.id ?? null,
    };

    if (options?.persist !== false) {
      await this.persistEvaluation(evaluation, 'vehicle', options?.evaluatedBy ?? 'system');
      await this.refreshSnapshots(facts, ctx);
    }

    return evaluation;
  }

  private async persistEvaluation(
    evaluation: Evaluation,
    type: 'driver' | 'vehicle' | 'pair',
    evaluatedBy: string,
  ): Promise<void> {
    try {
      await ComplianceEvaluation.create({
        driver_id: evaluation.driverId,
        vehicle_id: evaluation.vehicleId,
        service_code: evaluation.serviceCode,
        evaluation_type: type,
        allowed: evaluation.allowed,
        status: evaluation.status,
        reasons: evaluation.reasons,
        rules_version: evaluation.rulesVersion,
        evaluated_by: evaluatedBy,
      } as any);

      await ComplianceEventModel.create({
        entity_table: 'compliance_evaluations',
        entity_id: evaluation.driverId ?? evaluation.vehicleId ?? '00000000-0000-0000-0000-000000000000',
        driver_id: evaluation.driverId,
        vehicle_id: evaluation.vehicleId,
        event: 'evaluated',
        actor_uid: evaluatedBy,
        actor_role: evaluatedBy === 'system' || evaluatedBy === 'scheduled' ? 'system' : 'admin',
        payload: {
          allowed: evaluation.allowed,
          status: evaluation.status,
          blockingCodes: evaluation.reasons.filter((r) => r.blocking).map((r) => r.code),
        },
      } as any);
    } catch (error: any) {
      // La persistencia es auditoría: no debe romper la decisión
      console.warn('⚠️ [ComplianceService] Error persistiendo evaluación:', error?.message || error);
    }
  }

  /** Recomputa los snapshots drivers.compliance_status / vehicles.compliance_status. */
  private async refreshSnapshots(facts: ComplianceFacts, ctx: RuleContext): Promise<void> {
    try {
      if (facts.driver) {
        const driverReasons = evaluateFacts(
          {
            driver: facts.driver,
            license: facts.license,
            duplicates: {
              licenseNumberDriverIds: facts.duplicates?.licenseNumberDriverIds,
            },
          },
          ctx,
        );
        const driverSummary = summarizeEvaluation(driverReasons, 'driver');
        await DriverModel.update(
          { compliance_status: driverSummary.status } as any,
          { where: { id: facts.driver.id } },
        );
      }
      if (facts.vehicle) {
        const vehicleReasons = evaluateFacts(facts, ctx)
          .filter((r) => !r.code.startsWith('LICENSE_') && !r.code.startsWith('DRIVER_'));
        const vehicleSummary = summarizeEvaluation(vehicleReasons, 'vehicle');
        await VehicleModel.update(
          { compliance_status: vehicleSummary.status } as any,
          { where: { id: facts.vehicle.id } },
        );
      }
    } catch (error: any) {
      console.warn('⚠️ [ComplianceService] Error actualizando snapshots:', error?.message || error);
    }
  }
}

export const complianceService = new ComplianceService();
