/**
 * Tipos del motor de compliance documental.
 * Ver database/COMPLIANCE_ARCHITECTURE.md §C.
 */

export type ComplianceSeverity = 'BLOCKING' | 'WARNING' | 'REQUIRES_REVIEW' | 'INFO';

export type ReasonStatus = 'pass' | 'fail' | 'warning' | 'review';

export interface ComplianceReason {
  code: string;
  severity: ComplianceSeverity;
  blocking: boolean;
  status: ReasonStatus;
  message: string;
  source: string | null;
  details?: Record<string, any>;
}

export type DriverComplianceStatus =
  | 'pending_documents'
  | 'under_review'
  | 'verified'
  | 'expiring'
  | 'non_compliant'
  | 'suspended';

export type VehicleComplianceStatus =
  | 'pending_verification'
  | 'active'
  | 'non_compliant'
  | 'expired_documents'
  | 'suspended';

export type EvaluationStatus = DriverComplianceStatus | VehicleComplianceStatus;

export interface ComplianceEvaluation {
  allowed: boolean;
  status: EvaluationStatus;
  reasons: ComplianceReason[];
  evaluatedAt: string;
  rulesVersion: string;
  driverId?: string | null;
  vehicleId?: string | null;
  serviceCode?: string | null;
}

export interface RuleConfig {
  code: string;
  severity: ComplianceSeverity;
  blocking: boolean;
  enabled: boolean;
  warningDays: number | null;
  legalBasis: string | null;
  params: Record<string, any>;
}

export interface CategoryRuleRow {
  vehicleType: string;
  serviceCode: string;
  requiredCategories: string[];
  severity: string;
  confirmedBySource: boolean;
}

export interface RuleContext {
  today: string; // 'YYYY-MM-DD' en America/Managua
  rules: Map<string, RuleConfig>;
  categoryRules: CategoryRuleRow[];
}

// ---------------------------------------------------------------------------
// Facts (datos de entrada del motor; los carga ComplianceRepository)
// ---------------------------------------------------------------------------

export interface DocFactsBase {
  id: string;
  status: string; // document_status
}

export interface DriverFacts {
  id: string;        // UUID interno (drivers.id)
  userId: string;    // Firebase UID (drivers.user_id)
  accountStatus: string | null;
  documentsStatus: string | null;
}

export interface VehicleFacts {
  id: string;
  driverId: string;  // UUID interno del dueño
  plate: string;
  type: string | null;
  serviceType: string | null;
  vehicleClass: string | null;
  vin: string | null;
  chasis: string | null;
  motor: string | null;
  year: number | null;
  emissionDate: string | null;
  isActive: boolean;
  createdAt: string | null; // 'YYYY-MM-DD' — para grandfathering de docs nuevos
}

export interface LicenseFacts extends DocFactsBase {
  licenseNumber: string | null;
  licenseType: string;
  categories: string[];
  issueDate: string | null;
  expiryDate: string | null;
  reportedStatus: string | null;
}

export interface CirculationFacts extends DocFactsBase {
  cardNumber: string | null;
  issuedAt: string | null;
  declaredPlate: string | null;
  declaredVin: string | null;
  declaredChasis: string | null;
  declaredMotor: string | null;
  declaredServiceType: string | null;
}

export interface InsuranceFacts extends DocFactsBase {
  policyNumber: string | null;
  insurerCode: string | null;
  coverageType: string;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  insuredPlate: string | null;
  insuredVin: string | null;
  insuredMotor: string | null;
  insuredChasis: string | null;
}

export interface InspectionFacts extends DocFactsBase {
  inspectedAt: string | null;
  result: string | null;
  validUntil: string | null;
}

export interface EmissionsFacts extends DocFactsBase {
  testedAt: string | null;
  result: string | null;
  validUntil: string | null;
}

export interface RoadTaxFacts extends DocFactsBase {
  taxYear: number;
  paidAt: string | null;
  exempt: boolean;
}

export interface RevisadoFacts extends DocFactsBase {
  stickerYear: number | null;
  validUntil: string | null;
}

export interface DuplicateFacts {
  licenseNumberDriverIds?: string[];
  plateVehicleIds?: string[];
  vinVehicleIds?: string[];
  policyVehicleIds?: string[];
}

export interface ComplianceFacts {
  driver: DriverFacts | null;
  vehicle?: VehicleFacts | null;
  license?: LicenseFacts | null;
  circulation?: CirculationFacts | null;
  rcInsurance?: InsuranceFacts | null;
  hasPassengerCoverage?: boolean;
  inspection?: InspectionFacts | null;
  emissions?: EmissionsFacts | null;
  roadTax?: RoadTaxFacts | null;
  revisado?: RevisadoFacts | null;
  duplicates?: DuplicateFacts;
  serviceCode?: string | null;
}
