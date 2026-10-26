/**
 * DocumentsRepository - Operaciones sobre las tablas de documentos
 * de compliance (crear, supersedir/renovar, consultar historial, revisar).
 */

import { Op } from 'sequelize';
import DriverLicense from '../models/DriverLicense';
import VehicleCirculationCard from '../models/VehicleCirculationCard';
import VehicleInsurancePolicy from '../models/VehicleInsurancePolicy';
import VehicleInspection from '../models/VehicleInspection';
import VehicleEmissionCertificate from '../models/VehicleEmissionCertificate';
import VehicleRoadTax from '../models/VehicleRoadTax';
import VehicleRevisadoSticker from '../models/VehicleRevisadoSticker';
import DocumentAlert from '../models/DocumentAlert';
import ComplianceEvent from '../models/ComplianceEvent';
import ComplianceEvaluation from '../models/ComplianceEvaluation';

export const DOCUMENT_TABLES = [
  'driver_licenses',
  'vehicle_circulation_cards',
  'vehicle_insurance_policies',
  'vehicle_inspections',
  'vehicle_emission_certificates',
  'vehicle_road_taxes',
  'vehicle_revisado_stickers',
] as const;

export type DocumentTable = (typeof DOCUMENT_TABLES)[number];

const MODEL_BY_TABLE: Record<DocumentTable, any> = {
  driver_licenses: DriverLicense,
  vehicle_circulation_cards: VehicleCirculationCard,
  vehicle_insurance_policies: VehicleInsurancePolicy,
  vehicle_inspections: VehicleInspection,
  vehicle_emission_certificates: VehicleEmissionCertificate,
  vehicle_road_taxes: VehicleRoadTax,
  vehicle_revisado_stickers: VehicleRevisadoSticker,
};

/** Tablas de documentos de vehículo (driver_licenses es del conductor). */
export const VEHICLE_DOCUMENT_TABLES = DOCUMENT_TABLES.filter(
  (t) => t !== 'driver_licenses',
) as DocumentTable[];

export class DocumentsRepository {
  modelFor(table: DocumentTable): any {
    return MODEL_BY_TABLE[table];
  }

  /** Documento vigente actual de una tabla para un sujeto. */
  async findCurrent(
    table: DocumentTable,
    ownerField: 'driver_id' | 'vehicle_id',
    ownerId: string,
    extraWhere: Record<string, any> = {},
  ): Promise<any | null> {
    const model = MODEL_BY_TABLE[table];
    return await model.findOne({
      where: { [ownerField]: ownerId, is_current: true, ...extraWhere },
      order: [['created_at', 'DESC']],
    });
  }

  /**
   * Inserta un documento nuevo como vigente, marcando el anterior
   * como no vigente y enlazándolo con supersedes_id (historial de renovación).
   */
  async submitNewCurrent(
    table: DocumentTable,
    ownerField: 'driver_id' | 'vehicle_id',
    ownerId: string,
    data: Record<string, any>,
    extraCurrentWhere: Record<string, any> = {},
  ): Promise<any> {
    const model = MODEL_BY_TABLE[table];
    const previous = await this.findCurrent(table, ownerField, ownerId, extraCurrentWhere);

    const created = await model.create({
      ...data,
      [ownerField]: ownerId,
      status: 'pending',
      verification_method: 'self_declared',
      is_current: true,
      supersedes_id: previous?.id ?? null,
    });

    if (previous) {
      await previous.update({ is_current: false });
    }

    return created;
  }

  /** Historial completo (todas las versiones) de un documento por sujeto. */
  async findHistory(
    table: DocumentTable,
    ownerField: 'driver_id' | 'vehicle_id',
    ownerId: string,
    extraWhere: Record<string, any> = {},
  ): Promise<any[]> {
    const model = MODEL_BY_TABLE[table];
    return await model.findAll({
      where: { [ownerField]: ownerId, ...extraWhere },
      order: [['created_at', 'DESC']],
      paranoid: false,
    });
  }

  async findById(table: DocumentTable, id: string): Promise<any | null> {
    const model = MODEL_BY_TABLE[table];
    return await model.findByPk(id);
  }

  /** Documentos en estados revisables para el backoffice. */
  async findForReview(
    statuses: string[],
    limit: number,
    offset: number,
  ): Promise<{ table: DocumentTable; rows: any[] }[]> {
    const result: { table: DocumentTable; rows: any[] }[] = [];
    for (const table of DOCUMENT_TABLES) {
      const model = MODEL_BY_TABLE[table];
      const rows = await model.findAll({
        where: { status: { [Op.in]: statuses }, is_current: true },
        order: [['updated_at', 'ASC']],
        limit,
        offset,
        raw: true,
      });
      if (rows.length > 0) {
        result.push({ table, rows });
      }
    }
    return result;
  }

  /** Todos los documentos vigentes de un vehículo (por tabla). */
  async findCurrentVehicleDocuments(vehicleId: string): Promise<Record<string, any[]>> {
    const out: Record<string, any[]> = {};
    for (const table of VEHICLE_DOCUMENT_TABLES) {
      const model = MODEL_BY_TABLE[table];
      out[table] = await model.findAll({
        where: { vehicle_id: vehicleId, is_current: true },
        order: [['created_at', 'DESC']],
        raw: true,
      });
    }
    return out;
  }

  async findOpenAlertsByDriver(driverUuid: string): Promise<any[]> {
    return await DocumentAlert.findAll({
      where: { driver_id: driverUuid, status: 'open' },
      order: [['due_date', 'ASC'], ['created_at', 'DESC']],
      raw: true,
    });
  }

  async findAlertById(alertId: string): Promise<any | null> {
    return await DocumentAlert.findByPk(alertId);
  }

  async updateAlertStatus(alertId: string, status: string): Promise<void> {
    await DocumentAlert.update({ status } as any, { where: { id: alertId } });
  }

  async latestEvaluations(driverUuid: string, limit = 5): Promise<any[]> {
    return await ComplianceEvaluation.findAll({
      where: { driver_id: driverUuid },
      order: [['evaluated_at', 'DESC']],
      limit,
      raw: true,
    });
  }

  async logEvent(params: {
    entity_table: string;
    entity_id: string;
    driver_id?: string | null;
    vehicle_id?: string | null;
    event: string;
    actor_uid: string;
    actor_role?: string;
    payload?: Record<string, any>;
  }): Promise<void> {
    try {
      await ComplianceEvent.create({
        ...params,
        actor_role: params.actor_role ?? 'driver',
      } as any);
    } catch (error: any) {
      console.warn('⚠️ [DocumentsRepository] Error registrando evento:', error?.message || error);
    }
  }
}

export const documentsRepository = new DocumentsRepository();
