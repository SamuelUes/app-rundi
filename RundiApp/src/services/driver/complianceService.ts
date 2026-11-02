/**
 * Compliance Service — v2 REST /v1/compliance (documentos, evaluaciones, alertas).
 * Mantiene las firmas v1 con wrappers { success } para no tocar los call-sites.
 */

import {
  acknowledgeDocumentAlert as acknowledgeDocumentAlertV2,
  canOperateVehicle as canOperateVehicleV2,
  getComplianceStatus as getComplianceStatusV2,
  getMyDocuments as getMyDocumentsV2,
  submitDriverLicense as submitDriverLicenseV2,
  submitVehicleDocument as submitVehicleDocumentV2,
} from '../../api/compliance';
import type { ComplianceReason, Evaluation } from '../../api/compliance';

export type VehicleDocumentType =
  | 'circulation_card'
  | 'insurance'
  | 'inspection'
  | 'emissions'
  | 'road_tax'
  | 'revisado';

export interface SubmitLicensePayload {
  licenseNumber: string;
  licenseType?: 'ordinaria' | 'profesional' | 'menor_de_edad' | 'especial' | 'permiso';
  categories?: string[];
  issueDate?: string; // 'YYYY-MM-DD'
  expiryDate?: string;
  photoFront?: string;
  photoBack?: string;
}

export interface SubmitVehicleDocumentPayload {
  vehicleId: string;
  documentType: VehicleDocumentType;
  documentPath?: string;
  documentPathBack?: string;

  // circulation_card
  cardNumber?: string;
  issuedAt?: string;
  declaredValidUntil?: string;

  // insurance
  policyNumber?: string;
  insurerCode?: string;
  insurerName?: string;
  coverageType?: 'rc_obligatorio' | 'pasajeros' | 'danios_propios' | 'licencia_conductor' | 'otro';
  effectiveFrom?: string;
  effectiveUntil?: string;
  insuredPlate?: string;
  insuredVin?: string;
  insuredMotor?: string;
  insuredChasis?: string;
  policyholderName?: string;

  // inspection / emissions
  inspectedAt?: string;
  testedAt?: string;
  result?: 'approved' | 'rejected' | 'conditional';
  certificateNumber?: string;
  validUntil?: string;
  issuer?: string;

  // road_tax
  taxYear?: number;
  municipality?: string;
  paidAt?: string;
  receiptNumber?: string;
  exempt?: boolean;
  exemptReason?: string;

  // revisado
  stickerYear?: number;
}

export interface SubmitDocumentResult {
  success: boolean;
  documentId: string;
  status: string;
}

export type { ComplianceReason };
export type ComplianceEvaluation = Evaluation;

class ComplianceService {
  /** Registra/renueva la licencia del conductor autenticado (nueva versión vigente). */
  async submitDriverLicense(payload: SubmitLicensePayload): Promise<SubmitDocumentResult> {
    const data = await submitDriverLicenseV2({
      licenseNumber: payload.licenseNumber,
      licenseType: payload.licenseType ?? 'ordinaria',
      categories: payload.categories ?? [],
      issueDate: payload.issueDate ?? '',
      expiryDate: payload.expiryDate ?? '',
      photoFront: payload.photoFront,
      photoBack: payload.photoBack,
    });
    return { success: true, ...data };
  }

  /** Registra un documento del vehículo (circulación, seguro, ITM, emisiones, rodamiento, revisado). */
  async submitVehicleDocument(payload: SubmitVehicleDocumentPayload): Promise<SubmitDocumentResult> {
    const data = await submitVehicleDocumentV2(payload);
    return { success: true, ...data };
  }

  /** Evaluación completa del conductor (+ vehículo activo si tiene). */
  async getComplianceStatus(): Promise<{
    success: boolean;
    driver: { id: string; accountStatus: string; complianceStatus: string | null };
    evaluation: ComplianceEvaluation;
    activeVehicle: { id: string; plate: string; complianceStatus: string | null } | null;
    alerts: any[];
  }> {
    const data = await getComplianceStatusV2();
    return {
      success: true,
      driver: {
        id: data.driver.id,
        accountStatus: data.driver.accountStatus ?? '',
        complianceStatus: data.driver.complianceStatus ?? null,
      },
      evaluation: data.evaluation,
      activeVehicle: data.activeVehicle
        ? {
            id: data.activeVehicle.id,
            plate: data.activeVehicle.plate,
            complianceStatus: data.activeVehicle.complianceStatus ?? null,
          }
        : null,
      alerts: data.alerts,
    };
  }

  /** Evalúa si el conductor puede operar un vehículo específico. */
  async canOperateVehicle(vehicleId: string, serviceCode?: string): Promise<{
    success: boolean;
    evaluation: ComplianceEvaluation;
  }> {
    const data = await canOperateVehicleV2(vehicleId, serviceCode);
    return { success: true, evaluation: data.evaluation };
  }

  /** Documentos vigentes + historial + alertas del conductor autenticado. */
  async getMyDocuments(): Promise<{
    success: boolean;
    licenses: any[];
    vehicles: Array<{ id: string; plate: string; isActive: boolean; complianceStatus: string | null; documents: Record<string, any[]> }>;
    alerts: any[];
    recentEvaluations: any[];
    complianceStatus: string | null;
  }> {
    const data = await getMyDocumentsV2();
    return {
      success: true,
      licenses: data.licenses as any[],
      vehicles: (data.vehicles || []).map((v) => ({
        id: v.id,
        plate: v.plate,
        isActive: v.isActive,
        complianceStatus: v.complianceStatus ?? null,
        documents: v.documents as Record<string, any[]>,
      })),
      alerts: data.alerts as any[],
      recentEvaluations: data.recentEvaluations as any[],
      complianceStatus: data.complianceStatus ?? null,
    };
  }

  /** Marca una alerta de vencimiento como reconocida. */
  async acknowledgeDocumentAlert(alertId: string): Promise<{ success: boolean }> {
    await acknowledgeDocumentAlertV2(alertId);
    return { success: true };
  }
}

const complianceService = new ComplianceService();
export default complianceService;
