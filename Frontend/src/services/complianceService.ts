/**
 * Compliance Service - Documentos normalizados del sistema de compliance.
 *
 * Usa los endpoints nuevos (submitDriverLicense / submitVehicleDocument)
 * que alimentan el motor de compliance con historial y estados de
 * verificación. El backend sigue escribiendo las columnas legacy para
 * compatibilidad, así que nada de la UI actual se rompe.
 */

import { getFirebaseFunctions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import type { Functions } from 'firebase/functions';

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

export interface ComplianceReason {
  code: string;
  severity: 'BLOCKING' | 'WARNING' | 'REQUIRES_REVIEW' | 'INFO';
  blocking: boolean;
  status: 'pass' | 'fail' | 'warning' | 'review';
  message: string;
  source: string | null;
  details?: Record<string, any>;
}

export interface ComplianceEvaluation {
  allowed: boolean;
  status: string;
  reasons: ComplianceReason[];
  evaluatedAt: string;
  rulesVersion: string;
  driverId?: string | null;
  vehicleId?: string | null;
  serviceCode?: string | null;
}

class ComplianceService {
  private functions: Functions | null = null;

  private async getFunctions(): Promise<Functions> {
    if (!this.functions) {
      this.functions = await getFirebaseFunctions();
    }
    return this.functions;
  }

  private async call<T>(fnName: string, payload: unknown): Promise<T> {
    const functions = await this.getFunctions();
    const fn = httpsCallable(functions, fnName);
    const result: any = await fn(payload);
    return result.data as T;
  }

  /** Registra/renueva la licencia del conductor autenticado (nueva versión vigente). */
  async submitDriverLicense(payload: SubmitLicensePayload): Promise<SubmitDocumentResult> {
    return this.call<SubmitDocumentResult>('submitDriverLicense', payload);
  }

  /** Registra un documento del vehículo (circulación, seguro, ITM, emisiones, rodamiento, revisado). */
  async submitVehicleDocument(payload: SubmitVehicleDocumentPayload): Promise<SubmitDocumentResult> {
    return this.call<SubmitDocumentResult>('submitVehicleDocument', payload);
  }

  /** Evaluación completa del conductor (+ vehículo activo si tiene). */
  async getComplianceStatus(): Promise<{
    success: boolean;
    driver: { id: string; accountStatus: string; complianceStatus: string | null };
    evaluation: ComplianceEvaluation;
    activeVehicle: { id: string; plate: string; complianceStatus: string | null } | null;
    alerts: any[];
  }> {
    return this.call('getComplianceStatus', {});
  }

  /** Evalúa si el conductor puede operar un vehículo específico. */
  async canOperateVehicle(vehicleId: string, serviceCode?: string): Promise<{
    success: boolean;
    evaluation: ComplianceEvaluation;
  }> {
    return this.call('canOperateVehicle', { vehicleId, serviceCode });
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
    return this.call('getMyDocuments', {});
  }

  /** Marca una alerta de vencimiento como reconocida. */
  async acknowledgeDocumentAlert(alertId: string): Promise<{ success: boolean }> {
    return this.call('acknowledgeDocumentAlert', { alertId });
  }
}

const complianceService = new ComplianceService();
export default complianceService;
