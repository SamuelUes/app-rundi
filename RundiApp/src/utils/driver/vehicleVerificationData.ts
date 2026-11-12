type DocumentRecord = Record<string, unknown>;
type VehicleDocuments = Record<string, DocumentRecord[]>;

const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const date = (value: unknown): string => text(value).slice(0, 10);

export function vehicleVerificationData(vehicle: Record<string, any>, documents: VehicleDocuments = {}) {
  const card = documents.vehicle_circulation_cards?.[0];
  const policies = documents.vehicle_insurance_policies ?? [];
  const insurance = policies.find((policy) => policy.coverage_type === 'rc_obligatorio');
  const inspection = documents.vehicle_inspections?.[0];
  const emissions = documents.vehicle_emission_certificates?.[0];
  const taxes = documents.vehicle_road_taxes ?? [];
  const currentYear = new Date().getFullYear();
  const roadTax = taxes.find((t) => t.tax_year === currentYear) ?? taxes[0];
  const revisado = documents.vehicle_revisado_stickers?.[0];
  return {
    registrationNumber: text(card?.card_number ?? vehicle.registrationNumber),
    registrationExpiry: date(card?.declared_valid_until ?? vehicle.registrationExpiry),
    registrationPhotoFront: text(card?.document_path ?? vehicle.registrationPhotoFront),
    registrationPhotoBack: text(card?.document_path_back ?? vehicle.registrationPhotoBack),
    insuranceNumber: text(insurance?.policy_number ?? vehicle.insuranceNumber),
    insuranceCompany: text(insurance?.insurer_name ?? vehicle.insuranceCompany),
    insuranceExpiry: date(insurance?.effective_until ?? vehicle.insuranceExpiry),
    insurancePhoto: text(insurance?.document_path ?? vehicle.insurancePhoto),
    vehiclePhoto: text(vehicle.vehiclePhoto),
    cardStatus: text(card?.status),
    insuranceStatus: text(insurance?.status),
    inspectionDate: date(inspection?.inspected_at),
    inspectionValidUntil: date(inspection?.valid_until),
    emissionsTestedAt: date(emissions?.tested_at),
    emissionsValidUntil: date(emissions?.valid_until),
    roadTaxPaidAt: date(roadTax?.paid_at),
    revisadoValidUntil: date(revisado?.valid_until),
    inspectionPhoto: text(inspection?.document_path),
    emissionsPhoto: text(emissions?.document_path),
    roadTaxPhoto: text(roadTax?.document_path),
    revisadoPhoto: text(revisado?.document_path),
  };
}
