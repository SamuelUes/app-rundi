/**
 * API v2 — compliance documental (driver self-service).
 * Equivalencia v1: submitDriverLicense, submitVehicleDocument, getMyDocuments,
 * getComplianceStatus, canOperateVehicle, acknowledgeDocumentAlert,
 * getDocumentHistory. Revisión admin queda en el backoffice.
 */
import client from './client';

// ---------- tipos ----------

export type DocumentType =
  | 'circulation_card'
  | 'insurance'
  | 'inspection'
  | 'emissions'
  | 'road_tax'
  | 'revisado';

export type DocStatus =
  | 'pending'
  | 'in_review'
  | 'verified'
  | 'rejected'
  | 'requires_review'
  | 'expired';

export interface ComplianceReason {
  code: string;
  severity: 'BLOCKING' | 'WARNING' | 'REQUIRES_REVIEW' | 'INFO';
  blocking: boolean;
  status: 'pass' | 'fail' | 'warning' | 'review';
  message: string;
  source?: string | null;
  details?: Record<string, unknown>;
}

export interface Evaluation {
  allowed: boolean;
  status: string;
  reasons: ComplianceReason[];
  evaluatedAt: string;
  rulesVersion: string;
  driverId?: string;
  vehicleId?: string;
  serviceCode?: string;
}

export interface DocumentAlert {
  id: string;
  document_table: string;
  document_id: string;
  driver_id?: string;
  vehicle_id?: string;
  alert_type: 'expiring_soon' | 'expired' | 'rejected' | 'requires_review';
  due_date?: string;
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed';
  created_at: string;
}

export interface LicenseInput {
  licenseNumber: string;
  licenseType: 'ordinaria' | 'profesional' | 'menor_de_edad' | 'especial' | 'permiso';
  categories: string[];
  issueDate: string; // 'YYYY-MM-DD'
  expiryDate: string;
  photoFront?: string; // objectPath GCS
  photoBack?: string;
}

export interface VehicleDocInput {
  vehicleId: string;
  documentType: DocumentType;
  documentPath?: string;
  documentPathBack?: string;
  cardNumber?: string;
  issuedAt?: string;
  declaredValidUntil?: string;
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
  inspectedAt?: string;
  testedAt?: string;
  result?: 'approved' | 'rejected' | 'conditional';
  certificateNumber?: string;
  validUntil?: string;
  issuer?: string;
  taxYear?: number;
  municipality?: string;
  paidAt?: string;
  receiptNumber?: string;
  exempt?: boolean;
  exemptReason?: string;
  stickerYear?: number;
}

export interface MyDocuments {
  licenses: Record<string, unknown>[];
  vehicles: {
    id: string;
    plate: string;
    isActive: boolean;
    complianceStatus?: string;
    documents: Record<string, Record<string, unknown>[]>;
  }[];
  alerts: DocumentAlert[];
  recentEvaluations: Record<string, unknown>[];
  complianceStatus?: string;
}

export interface ComplianceStatus {
  driver: { id: string; accountStatus?: string; complianceStatus?: string };
  evaluation: Evaluation;
  activeVehicle: { id: string; plate: string; complianceStatus?: string } | null;
  alerts: DocumentAlert[];
}

// ---------- endpoints ----------

/** submitDriverLicense — sube nueva versión vigente de la licencia. */
export async function submitDriverLicense(input: LicenseInput) {
  const { data } = await client.post<{ documentId: string; status: string }>(
    '/compliance/license',
    input,
  );
  return data;
}

/** submitVehicleDocument — sube doc del vehículo (6 tipos). */
export async function submitVehicleDocument(input: VehicleDocInput) {
  const { data } = await client.post<{ documentId: string; status: string }>(
    '/compliance/vehicle-documents',
    input,
  );
  return data;
}

/** getMyDocuments — licencias + docs vigentes por vehículo + alertas. */
export async function getMyDocuments() {
  const { data } = await client.get<MyDocuments>('/compliance/documents');
  return data;
}

/** getComplianceStatus — evaluación driver + par (vehículo activo). */
export async function getComplianceStatus() {
  const { data } = await client.get<ComplianceStatus>('/compliance/status');
  return data;
}

/** canOperateVehicle — evalúa un par conductor↔vehículo concreto. */
export async function canOperateVehicle(vehicleId: string, serviceCode?: string) {
  const { data } = await client.post<{ evaluation: Evaluation }>(
    '/compliance/can-operate',
    { vehicleId, serviceCode },
  );
  return data;
}

/** acknowledgeDocumentAlert — marca una alerta como reconocida. */
export async function acknowledgeDocumentAlert(alertId: string) {
  const { data } = await client.post<{ status: string }>(
    `/compliance/alerts/${alertId}/acknowledge`,
  );
  return data;
}

/** getDocumentHistory — historial de versiones de un documento del conductor. */
export async function getDocumentHistory(
  documentTable: string,
  ownerId: string, // driverId (driver_licenses) o vehicleId
) {
  const { data } = await client.get<{ documents: Record<string, unknown>[] }>(
    `/compliance/documents/${documentTable}/${ownerId}/history`,
  );
  return data;
}
