/**
 * Legacy Bridge — sincroniza escrituras de columnas legacy hacia las
 * tablas normalizadas de compliance.
 *
 * Mientras el frontend migre al flujo nuevo (submitDriverLicense /
 * submitVehicleDocument), los endpoints legacy (updateDriver,
 * updateVehicleSeq) llaman aquí para que las apps publicadas sigan
 * alimentando el motor de compliance.
 *
 * Reglas:
 * - Mismos identificadores (número + fechas) → actualizar solo fotos/paths,
 *   conservando el status de verificación existente.
 * - Identificadores distintos → nueva versión vigente (pending), la
 *   anterior queda en historial vía supersedes_id.
 * - Nunca lanza errores: el endpoint legacy no debe romperse por el bridge.
 */

import DriverLicense from '../../models/DriverLicense';
import VehicleCirculationCard from '../../models/VehicleCirculationCard';
import VehicleInsurancePolicy from '../../models/VehicleInsurancePolicy';
import Vehicle from '../../models/Vehicle';
import { documentsRepository } from '../../repositories/DocumentsRepository';
import { complianceService } from './index';
import { toDateOnly } from './dateUtils';

// ---------------------------------------------------------------------------
// Conductor: licencia
// ---------------------------------------------------------------------------

export interface LegacyLicenseInput {
  licenseNumber?: string | null;
  licenseExpiry?: string | null;
  photoFront?: string | null;
  photoBack?: string | null;
}

export async function syncLegacyDriverLicense(
  driverUuid: string,
  input: LegacyLicenseInput,
  actorUid: string,
): Promise<void> {
  const { licenseNumber, licenseExpiry, photoFront, photoBack } = input;
  if (!licenseNumber && !licenseExpiry && !photoFront && !photoBack) return;

  try {
    const current = (await documentsRepository.findCurrent(
      'driver_licenses',
      'driver_id',
      driverUuid,
    )) as DriverLicense | null;

    const newExpiry = toDateOnly(licenseExpiry);
    const sameIdentity =
      !!current &&
      (licenseNumber == null || current.license_number === licenseNumber) &&
      (newExpiry == null || toDateOnly(current.expiry_date) === newExpiry);

    if (current && sameIdentity) {
      // Misma licencia: solo refrescar fotos/paths si vienen
      const update: Record<string, any> = {};
      if (photoFront) update.document_path = photoFront;
      if (photoBack) update.document_path_back = photoBack;
      if (Object.keys(update).length > 0) {
        await current.update(update);
      }
      return;
    }

    // Licencia nueva o renovada → nueva versión vigente pendiente de revisión
    const created = await documentsRepository.submitNewCurrent(
      'driver_licenses',
      'driver_id',
      driverUuid,
      {
        license_number: licenseNumber ?? current?.license_number ?? null,
        license_type: current?.license_type ?? 'ordinaria',
        categories: current?.categories ?? [],
        issue_date: current?.issue_date ?? null,
        expiry_date: newExpiry ?? toDateOnly(current?.expiry_date),
        document_path: photoFront ?? current?.document_path ?? null,
        document_path_back: photoBack ?? current?.document_path_back ?? null,
      },
    );

    await documentsRepository.logEvent({
      entity_table: 'driver_licenses',
      entity_id: created.id,
      driver_id: driverUuid,
      event: 'submitted',
      actor_uid: actorUid,
      payload: { source: 'legacy_bridge', endpoint: 'updateDriver' },
    });

    await complianceService
      .canDriverOperate(driverUuid, { evaluatedBy: actorUid })
      .catch((e: any) => console.warn('⚠️ [legacyBridge] Error re-evaluando conductor:', e?.message || e));
  } catch (error: any) {
    console.warn('⚠️ [legacyBridge] Error sincronizando licencia:', error?.message || error);
  }
}

// ---------------------------------------------------------------------------
// Vehículo: circulación + seguro RC
// ---------------------------------------------------------------------------

export interface LegacyVehicleDocsInput {
  registrationNumber?: string | null;
  registrationExpiry?: string | null;
  emissionDate?: string | null;
  registrationPhotoFront?: string | null;
  registrationPhotoBack?: string | null;
  insuranceNumber?: string | null;
  insuranceCompany?: string | null;
  insuranceStartDate?: string | null;
  insuranceExpiry?: string | null;
  insurancePhoto?: string | null;
  // Documentos periódicos (opcionales en registro/legacy; formato nuevo)
  inspectionDate?: string | null;
  inspectionValidUntil?: string | null;
  inspectionPhoto?: string | null;
  emissionsTestedAt?: string | null;
  emissionsValidUntil?: string | null;
  emissionsPhoto?: string | null;
  roadTaxPaidAt?: string | null;
  roadTaxReceiptNumber?: string | null;
  roadTaxPhoto?: string | null;
  revisadoValidUntil?: string | null;
  revisadoPhoto?: string | null;
}

async function syncLegacyCirculation(
  vehicle: Vehicle,
  input: LegacyVehicleDocsInput,
  actorUid: string,
): Promise<void> {
  const { registrationNumber, registrationExpiry, emissionDate, registrationPhotoFront, registrationPhotoBack } = input;
  if (!registrationNumber && !registrationExpiry && !emissionDate && !registrationPhotoFront && !registrationPhotoBack) return;

  const current = (await documentsRepository.findCurrent(
    'vehicle_circulation_cards',
    'vehicle_id',
    vehicle.id,
  )) as VehicleCirculationCard | null;

  const newIssued = toDateOnly(emissionDate);
  const newValidUntil = toDateOnly(registrationExpiry);
  const sameIdentity =
    !!current &&
    (registrationNumber == null || (current as any).card_number === registrationNumber) &&
    (newIssued == null || toDateOnly((current as any).issued_at) === newIssued);

  if (current && sameIdentity) {
    const update: Record<string, any> = {};
    if (registrationPhotoFront) update.document_path = registrationPhotoFront;
    if (registrationPhotoBack) update.document_path_back = registrationPhotoBack;
    if (newValidUntil) update.declared_valid_until = newValidUntil;
    if (Object.keys(update).length > 0) {
      await current.update(update);
    }
    return;
  }

  const created = await documentsRepository.submitNewCurrent(
    'vehicle_circulation_cards',
    'vehicle_id',
    vehicle.id,
    {
      card_number: registrationNumber ?? (current as any)?.card_number ?? null,
      issued_at: newIssued ?? toDateOnly((current as any)?.issued_at),
      declared_valid_until: newValidUntil ?? (current as any)?.declared_valid_until ?? null,
      declared_plate: vehicle.plate,
      declared_vin: vehicle.vin,
      declared_chasis: vehicle.chasis,
      declared_motor: vehicle.motor,
      declared_service_type: vehicle.service_type,
      document_path: registrationPhotoFront ?? (current as any)?.document_path ?? null,
      document_path_back: registrationPhotoBack ?? (current as any)?.document_path_back ?? null,
    },
  );

  await documentsRepository.logEvent({
    entity_table: 'vehicle_circulation_cards',
    entity_id: created.id,
    driver_id: vehicle.driver_id,
    vehicle_id: vehicle.id,
    event: 'submitted',
    actor_uid: actorUid,
    payload: { source: 'legacy_bridge', endpoint: 'updateVehicle' },
  });
}

async function syncLegacyInsurance(
  vehicle: Vehicle,
  input: LegacyVehicleDocsInput,
  actorUid: string,
): Promise<void> {
  const { insuranceNumber, insuranceCompany, insuranceStartDate, insuranceExpiry, insurancePhoto } = input;
  if (!insuranceNumber && !insuranceCompany && !insuranceStartDate && !insuranceExpiry && !insurancePhoto) return;

  const current = (await documentsRepository.findCurrent(
    'vehicle_insurance_policies',
    'vehicle_id',
    vehicle.id,
    { coverage_type: 'rc_obligatorio' },
  )) as VehicleInsurancePolicy | null;

  const newFrom = toDateOnly(insuranceStartDate);
  const newUntil = toDateOnly(insuranceExpiry);
  const sameIdentity =
    !!current &&
    (insuranceNumber == null || (current as any).policy_number === insuranceNumber) &&
    (newUntil == null || toDateOnly((current as any).effective_until) === newUntil);

  if (current && sameIdentity) {
    const update: Record<string, any> = {};
    if (insurancePhoto) update.document_path = insurancePhoto;
    if (insuranceCompany) update.insurer_name = insuranceCompany;
    if (newFrom) update.effective_from = newFrom;
    if (Object.keys(update).length > 0) {
      await current.update(update);
    }
    return;
  }

  const created = await documentsRepository.submitNewCurrent(
    'vehicle_insurance_policies',
    'vehicle_id',
    vehicle.id,
    {
      policy_number: insuranceNumber ?? (current as any)?.policy_number ?? null,
      insurer_name: insuranceCompany ?? (current as any)?.insurer_name ?? null,
      coverage_type: 'rc_obligatorio',
      effective_from: newFrom ?? toDateOnly((current as any)?.effective_from),
      effective_until: newUntil ?? toDateOnly((current as any)?.effective_until),
      insured_plate: vehicle.plate,
      insured_vin: vehicle.vin,
      insured_motor: vehicle.motor,
      insured_chasis: vehicle.chasis,
      document_path: insurancePhoto ?? (current as any)?.document_path ?? null,
    },
    { coverage_type: 'rc_obligatorio' },
  );

  await documentsRepository.logEvent({
    entity_table: 'vehicle_insurance_policies',
    entity_id: created.id,
    driver_id: vehicle.driver_id,
    vehicle_id: vehicle.id,
    event: 'submitted',
    actor_uid: actorUid,
    payload: { source: 'legacy_bridge', endpoint: 'updateVehicle' },
  });
}

type PeriodicTable =
  | 'vehicle_inspections'
  | 'vehicle_emission_certificates'
  | 'vehicle_road_taxes'
  | 'vehicle_revisado_stickers';

/**
 * Sincroniza un documento periódico (ITM, emisiones, rodamiento, revisado).
 * Mismo patrón que circulación/seguro: misma identidad → solo refresca datos
 * secundarios conservando la verificación; identidad distinta → nueva versión
 * vigente pendiente de revisión.
 */
async function syncPeriodicDocument(
  table: PeriodicTable,
  vehicle: Vehicle,
  actorUid: string,
  hasData: boolean,
  sameIdentity: (current: any) => boolean,
  secondaryUpdate: () => Record<string, any>,
  buildNew: (current: any) => Record<string, any>,
): Promise<void> {
  if (!hasData) return;

  const current = await documentsRepository.findCurrent(table, 'vehicle_id', vehicle.id) as any;

  if (current && sameIdentity(current)) {
    const update = secondaryUpdate();
    if (Object.keys(update).length > 0) {
      await current.update(update);
    }
    return;
  }

  const created = await documentsRepository.submitNewCurrent(
    table,
    'vehicle_id',
    vehicle.id,
    buildNew(current),
  );

  await documentsRepository.logEvent({
    entity_table: table,
    entity_id: created.id,
    driver_id: vehicle.driver_id,
    vehicle_id: vehicle.id,
    event: 'submitted',
    actor_uid: actorUid,
    payload: { source: 'legacy_bridge', endpoint: 'upsertVehicle' },
  });
}

async function syncLegacyPeriodicDocs(
  vehicle: Vehicle,
  input: LegacyVehicleDocsInput,
  actorUid: string,
): Promise<void> {
  const {
    inspectionDate, inspectionValidUntil, inspectionPhoto,
    emissionsTestedAt, emissionsValidUntil, emissionsPhoto,
    roadTaxPaidAt, roadTaxReceiptNumber, roadTaxPhoto,
    revisadoValidUntil, revisadoPhoto,
  } = input;

  const newInspected = toDateOnly(inspectionDate);
  const newInspUntil = toDateOnly(inspectionValidUntil);
  await syncPeriodicDocument(
    'vehicle_inspections',
    vehicle,
    actorUid,
    !!inspectionDate || !!inspectionValidUntil || !!inspectionPhoto,
    (c) =>
      (newInspected == null || toDateOnly(c.inspected_at) === newInspected) &&
      (newInspUntil == null || toDateOnly(c.valid_until) === newInspUntil),
    () => ({ ...(inspectionPhoto ? { document_path: inspectionPhoto } : {}) }),
    (c) => ({
      inspected_at: newInspected ?? toDateOnly(c?.inspected_at),
      result: c?.result ?? 'approved',
      certificate_number: c?.certificate_number ?? null,
      valid_until: newInspUntil ?? toDateOnly(c?.valid_until),
      document_path: inspectionPhoto ?? c?.document_path ?? null,
    }),
  );

  const newTested = toDateOnly(emissionsTestedAt);
  const newEmisUntil = toDateOnly(emissionsValidUntil);
  await syncPeriodicDocument(
    'vehicle_emission_certificates',
    vehicle,
    actorUid,
    !!emissionsTestedAt || !!emissionsValidUntil || !!emissionsPhoto,
    (c) =>
      (newTested == null || toDateOnly(c.tested_at) === newTested) &&
      (newEmisUntil == null || toDateOnly(c.valid_until) === newEmisUntil),
    () => ({ ...(emissionsPhoto ? { document_path: emissionsPhoto } : {}) }),
    (c) => ({
      tested_at: newTested ?? toDateOnly(c?.tested_at),
      result: c?.result ?? 'approved',
      certificate_number: c?.certificate_number ?? null,
      valid_until: newEmisUntil ?? toDateOnly(c?.valid_until),
      document_path: emissionsPhoto ?? c?.document_path ?? null,
    }),
  );

  const newPaidAt = toDateOnly(roadTaxPaidAt);
  const newTaxYear = newPaidAt ? Number(newPaidAt.slice(0, 4)) : null;
  await syncPeriodicDocument(
    'vehicle_road_taxes',
    vehicle,
    actorUid,
    !!roadTaxPaidAt || !!roadTaxReceiptNumber || !!roadTaxPhoto,
    (c) =>
      (newTaxYear == null || c.tax_year === newTaxYear) &&
      (roadTaxReceiptNumber == null || c.receipt_number === roadTaxReceiptNumber),
    () => ({
      ...(roadTaxPhoto ? { document_path: roadTaxPhoto } : {}),
      ...(newPaidAt ? { paid_at: newPaidAt } : {}),
    }),
    (c) => ({
      tax_year: newTaxYear ?? c?.tax_year ?? new Date().getFullYear(),
      paid_at: newPaidAt ?? toDateOnly(c?.paid_at),
      receipt_number: roadTaxReceiptNumber ?? c?.receipt_number ?? null,
      exempt: c?.exempt ?? false,
      document_path: roadTaxPhoto ?? c?.document_path ?? null,
    }),
  );

  const newRevUntil = toDateOnly(revisadoValidUntil);
  const newRevYear = newRevUntil ? Number(newRevUntil.slice(0, 4)) : null;
  await syncPeriodicDocument(
    'vehicle_revisado_stickers',
    vehicle,
    actorUid,
    !!revisadoValidUntil || !!revisadoPhoto,
    (c) =>
      (newRevYear == null || c.sticker_year === newRevYear) &&
      (newRevUntil == null || toDateOnly(c.valid_until) === newRevUntil),
    () => ({ ...(revisadoPhoto ? { document_path: revisadoPhoto } : {}) }),
    (c) => ({
      sticker_year: newRevYear ?? c?.sticker_year ?? null,
      valid_until: newRevUntil ?? toDateOnly(c?.valid_until),
      document_path: revisadoPhoto ?? c?.document_path ?? null,
    }),
  );
}

/**
 * Punto de entrada para endpoints legacy de vehículo.
 * Re-evalúa el par conductor+vehículo al final (fire-and-forget seguro).
 */
export async function syncLegacyVehicleDocuments(
  vehicleId: string,
  input: LegacyVehicleDocsInput,
  actorUid: string,
): Promise<void> {
  try {
    const vehicle = await Vehicle.findByPk(vehicleId);
    if (!vehicle) return;

    await syncLegacyCirculation(vehicle, input, actorUid);
    await syncLegacyInsurance(vehicle, input, actorUid);
    await syncLegacyPeriodicDocs(vehicle, input, actorUid);

    await complianceService
      .canDriverOperateVehicle(vehicle.driver_id, vehicleId, null, { evaluatedBy: actorUid })
      .catch((e: any) => console.warn('⚠️ [legacyBridge] Error re-evaluando:', e?.message || e));
  } catch (error: any) {
    console.warn('⚠️ [legacyBridge] Error sincronizando documentos de vehículo:', error?.message || error);
  }
}
