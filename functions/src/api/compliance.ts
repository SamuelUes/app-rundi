/**
 * Compliance API - Endpoints de documentos y evaluación de compliance.
 *
 * - submitDriverLicense / submitVehicleDocument: carga de documentos (driver)
 * - getMyDocuments / getComplianceStatus / canOperateVehicle: consulta (driver)
 * - listDocumentsForReview / reviewDocument / getDocumentHistory: revisión (admin)
 * - acknowledgeDocumentAlert: alertas (driver)
 *
 * Reglas: nada de lógica de compliance aquí; todo va por ComplianceService.
 */

import * as functions from 'firebase-functions/v1';
import Driver from '../sequelize/models/Driver';
import Vehicle from '../sequelize/models/Vehicle';
import DocumentAlert from '../sequelize/models/DocumentAlert';
import {
  documentsRepository,
  DOCUMENT_TABLES,
  DocumentTable,
} from '../sequelize/repositories/DocumentsRepository';
import { complianceService } from '../sequelize/services/compliance';
import {
  attachSignedUrls,
  collectDocumentPaths,
  createSignedUrls,
} from '../sequelize/services/compliance/signedUrls';
import { sendNotificationToUser } from '../services/pushNotifications';
import { requireAdmin, requireDriver } from '../utils/sessionUtils';
import { validateData } from '../utils/validation';
import { toDateOnly, todayNicaragua } from '../sequelize/services/compliance/dateUtils';
import {
  AcknowledgeAlertSchema,
  CanOperateVehicleSchema,
  ListDocumentsForReviewSchema,
  ReviewDocumentSchema,
  SubmitDriverLicenseSchema,
  SubmitVehicleDocumentSchema,
} from '../sequelize/validators/compliance.validator';

async function resolveDriverOrThrow(firebaseUid: string): Promise<Driver> {
  const driver = await Driver.findOne({ where: { user_id: firebaseUid } });
  if (!driver) {
    throw new functions.https.HttpsError('not-found', 'Perfil de conductor no encontrado');
  }
  return driver;
}

async function assertVehicleOwnership(vehicleId: string, driverUuid: string): Promise<Vehicle> {
  const vehicle = await Vehicle.findByPk(vehicleId);
  if (!vehicle) {
    throw new functions.https.HttpsError('not-found', 'Vehículo no encontrado');
  }
  if (vehicle.driver_id !== driverUuid) {
    throw new functions.https.HttpsError('permission-denied', 'El vehículo no pertenece a este conductor');
  }
  return vehicle;
}

/** Tras cambios en documentos, re-evalúa y actualiza snapshots. Nunca lanza. */
async function reevaluateAfterChange(
  driverUuid: string,
  vehicleId: string | null,
  actorUid: string,
): Promise<void> {
  try {
    if (vehicleId) {
      await complianceService.canDriverOperateVehicle(driverUuid, vehicleId, null, {
        evaluatedBy: actorUid,
      });
    } else {
      await complianceService.canDriverOperate(driverUuid, { evaluatedBy: actorUid });
    }
  } catch (error: any) {
    console.warn('⚠️ [compliance] Error re-evaluando tras cambio de documento:', error?.message || error);
  }
}

// =============================================================================
// DRIVER: carga de documentos
// =============================================================================

/**
 * Sube una licencia de conducir (crea versión vigente; la anterior queda en historial).
 * Dual-write a columnas legacy drivers.license_* durante la transición.
 */
export const submitDriverLicense = functions.https.onCall(async (data, context) => {
  const uid = await requireDriver(context);
  try {
    const input = validateData(SubmitDriverLicenseSchema, data);
    const driver = await resolveDriverOrThrow(uid);

    const created = await documentsRepository.submitNewCurrent(
      'driver_licenses',
      'driver_id',
      driver.id,
      {
        license_number: input.licenseNumber,
        license_type: input.licenseType,
        categories: input.categories,
        issue_date: toDateOnly(input.issueDate),
        expiry_date: toDateOnly(input.expiryDate),
        document_path: input.photoFront ?? null,
        document_path_back: input.photoBack ?? null,
      },
    );

    // Compatibilidad: mantener columnas legacy actualizadas
    try {
      await driver.update({
        license_number: input.licenseNumber,
        license_expiry: toDateOnly(input.expiryDate) as any,
        license_photo_front: input.photoFront ?? driver.license_photo_front,
        license_photo_back: input.photoBack ?? driver.license_photo_back,
      } as any);
    } catch (legacyError: any) {
      console.warn('⚠️ [submitDriverLicense] Error actualizando columnas legacy:', legacyError?.message);
    }

    await documentsRepository.logEvent({
      entity_table: 'driver_licenses',
      entity_id: created.id,
      driver_id: driver.id,
      event: 'submitted',
      actor_uid: uid,
      payload: { licenseNumber: input.licenseNumber, expiryDate: toDateOnly(input.expiryDate) },
    });

    await reevaluateAfterChange(driver.id, null, uid);

    return { success: true, documentId: created.id, status: created.status };
  } catch (error: any) {
    console.error('❌ [submitDriverLicense] Error:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message);
  }
});

const VEHICLE_DOC_TABLE_BY_TYPE: Record<string, DocumentTable> = {
  circulation_card: 'vehicle_circulation_cards',
  insurance: 'vehicle_insurance_policies',
  inspection: 'vehicle_inspections',
  emissions: 'vehicle_emission_certificates',
  road_tax: 'vehicle_road_taxes',
  revisado: 'vehicle_revisado_stickers',
};

/**
 * Sube un documento del vehículo (circulación, seguro, ITM, emisiones, rodamiento, revisado).
 * Cada documento nuevo queda vigente; el anterior pasa a historial.
 */
export const submitVehicleDocument = functions.https.onCall(async (data, context) => {
  const uid = await requireDriver(context);
  try {
    const input = validateData(SubmitVehicleDocumentSchema, data);
    const driver = await resolveDriverOrThrow(uid);
    const vehicle = await assertVehicleOwnership(input.vehicleId, driver.id);

    const table = VEHICLE_DOC_TABLE_BY_TYPE[input.documentType];
    if (!table) {
      throw new functions.https.HttpsError('invalid-argument', `Tipo de documento inválido: ${input.documentType}`);
    }

    let created: any;
    let extraWhere: Record<string, any> = {};

    switch (input.documentType) {
      case 'circulation_card':
        created = await documentsRepository.submitNewCurrent(table, 'vehicle_id', vehicle.id, {
          card_number: input.cardNumber ?? null,
          issued_at: toDateOnly(input.issuedAt),
          declared_valid_until: toDateOnly(input.declaredValidUntil),
          declared_plate: vehicle.plate,
          declared_vin: vehicle.vin,
          declared_chasis: vehicle.chasis,
          declared_motor: vehicle.motor,
          declared_service_type: vehicle.service_type,
          document_path: input.documentPath ?? null,
          document_path_back: input.documentPathBack ?? null,
        });
        // Compatibilidad legacy
        await vehicle.update({
          registration_number: input.cardNumber ?? vehicle.registration_number,
          emission_date: toDateOnly(input.issuedAt) as any ?? vehicle.emission_date,
          registration_expiry: toDateOnly(input.declaredValidUntil) as any ?? vehicle.registration_expiry,
          registration_photo_front: input.documentPath ?? vehicle.registration_photo_front,
          registration_photo_back: input.documentPathBack ?? vehicle.registration_photo_back,
        } as any).catch((e: any) => console.warn('⚠️ legacy circulation write:', e?.message));
        break;

      case 'insurance':
        extraWhere = { coverage_type: input.coverageType };
        created = await documentsRepository.submitNewCurrent(
          table,
          'vehicle_id',
          vehicle.id,
          {
            policy_number: input.policyNumber ?? null,
            insurer_code: input.insurerCode ?? null,
            insurer_name: input.insurerName ?? null,
            coverage_type: input.coverageType,
            effective_from: toDateOnly(input.effectiveFrom),
            effective_until: toDateOnly(input.effectiveUntil),
            insured_plate: input.insuredPlate ?? vehicle.plate,
            insured_vin: input.insuredVin ?? vehicle.vin,
            insured_motor: input.insuredMotor ?? vehicle.motor,
            insured_chasis: input.insuredChasis ?? vehicle.chasis,
            policyholder_name: input.policyholderName ?? null,
            document_path: input.documentPath ?? null,
          },
          extraWhere,
        );
        if (input.coverageType === 'rc_obligatorio') {
          await vehicle.update({
            insurance_number: input.policyNumber ?? vehicle.insurance_number,
            insurance_company: input.insurerName ?? vehicle.insurance_company,
            insurance_start_date: toDateOnly(input.effectiveFrom) as any ?? vehicle.insurance_start_date,
            insurance_expiry: toDateOnly(input.effectiveUntil) as any ?? vehicle.insurance_expiry,
            insurance_photo: input.documentPath ?? vehicle.insurance_photo,
          } as any).catch((e: any) => console.warn('⚠️ legacy insurance write:', e?.message));
        }
        break;

      case 'inspection':
        created = await documentsRepository.submitNewCurrent(table, 'vehicle_id', vehicle.id, {
          inspected_at: toDateOnly(input.inspectedAt),
          result: input.result ?? null,
          certificate_number: input.certificateNumber ?? null,
          valid_until: toDateOnly(input.validUntil),
          issuer: input.issuer ?? null,
          document_path: input.documentPath ?? null,
        });
        break;

      case 'emissions':
        created = await documentsRepository.submitNewCurrent(table, 'vehicle_id', vehicle.id, {
          tested_at: toDateOnly(input.testedAt),
          result: input.result ?? null,
          certificate_number: input.certificateNumber ?? null,
          valid_until: toDateOnly(input.validUntil),
          issuer: input.issuer ?? null,
          document_path: input.documentPath ?? null,
        });
        break;

      case 'road_tax': {
        const year = input.taxYear ?? Number(todayNicaragua().slice(0, 4));
        created = await documentsRepository.submitNewCurrent(
          table,
          'vehicle_id',
          vehicle.id,
          {
            tax_year: year,
            municipality: input.municipality ?? null,
            paid_at: toDateOnly(input.paidAt),
            receipt_number: input.receiptNumber ?? null,
            exempt: input.exempt ?? false,
            exempt_reason: input.exemptReason ?? null,
            document_path: input.documentPath ?? null,
          },
          { tax_year: year },
        );
        break;
      }

      case 'revisado':
        created = await documentsRepository.submitNewCurrent(table, 'vehicle_id', vehicle.id, {
          sticker_year: input.stickerYear ?? null,
          issued_at: toDateOnly(input.issuedAt),
          valid_until: toDateOnly(input.validUntil),
          document_path: input.documentPath ?? null,
        });
        break;
    }

    await documentsRepository.logEvent({
      entity_table: table,
      entity_id: created.id,
      driver_id: driver.id,
      vehicle_id: vehicle.id,
      event: 'submitted',
      actor_uid: uid,
      payload: { documentType: input.documentType },
    });

    await reevaluateAfterChange(driver.id, vehicle.id, uid);

    return { success: true, documentId: created.id, status: created.status };
  } catch (error: any) {
    console.error('❌ [submitVehicleDocument] Error:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// =============================================================================
// DRIVER: consulta
// =============================================================================

/** Documentos vigentes + historial del conductor y de sus vehículos + alertas abiertas. */
export const getMyDocuments = functions.https.onCall(async (data, context) => {
  const uid = await requireDriver(context);
  try {
    const driver = await resolveDriverOrThrow(uid);
    const vehicles = await Vehicle.findAll({ where: { driver_id: driver.id }, raw: true });

    const [licenseHistory, alerts, evaluations] = await Promise.all([
      documentsRepository.findHistory('driver_licenses', 'driver_id', driver.id),
      documentsRepository.findOpenAlertsByDriver(driver.id),
      documentsRepository.latestEvaluations(driver.id, 3),
    ]);

    const vehicleDocuments: Record<string, any> = {};
    for (const vehicle of vehicles as any[]) {
      vehicleDocuments[vehicle.id] = await documentsRepository.findCurrentVehicleDocuments(vehicle.id);
    }

    // Bucket privado: firmar URLs de descarga para todos los documentos devueltos
    const licenseJson = licenseHistory.map((l: any) => (l.toJSON ? l.toJSON() : l));
    const allDocs: Record<string, any>[] = [
      ...licenseJson,
      ...Object.values(vehicleDocuments).flatMap((tables) => Object.values(tables).flat()),
    ];
    const signed = await createSignedUrls(collectDocumentPaths(allDocs));

    const signTables = (tables: Record<string, any[]>) =>
      Object.fromEntries(
        Object.entries(tables).map(([table, docs]) => [
          table,
          docs.map((d: any) => attachSignedUrls(d, signed)),
        ]),
      );

    return {
      success: true,
      licenses: licenseJson.map((l: any) => attachSignedUrls(l, signed)),
      vehicles: vehicles.map((v: any) => ({
        id: v.id,
        plate: v.plate,
        isActive: v.is_active,
        complianceStatus: v.compliance_status,
        documents: signTables(vehicleDocuments[v.id]),
      })),
      alerts,
      recentEvaluations: evaluations,
      complianceStatus: (driver as any).compliance_status,
    };
  } catch (error: any) {
    console.error('❌ [getMyDocuments] Error:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/** Estado de compliance del conductor (y su vehículo activo si tiene). */
export const getComplianceStatus = functions.https.onCall(async (data, context) => {
  const uid = await requireDriver(context);
  try {
    const driver = await resolveDriverOrThrow(uid);

    const activeVehicle = await Vehicle.findOne({
      where: { driver_id: driver.id, is_active: true },
      order: [['updated_at', 'DESC']],
    });

    const driverEvaluation = await complianceService.canDriverOperate(driver.id, {
      evaluatedBy: uid,
    });

    let pairEvaluation: any = null;
    if (activeVehicle) {
      pairEvaluation = await complianceService.canDriverOperateVehicle(
        driver.id,
        activeVehicle.id,
        null,
        { evaluatedBy: uid },
      );
    }

    const alerts = await documentsRepository.findOpenAlertsByDriver(driver.id);

    return {
      success: true,
      driver: {
        id: driver.id,
        accountStatus: driver.status,
        complianceStatus: (driver as any).compliance_status,
      },
      evaluation: pairEvaluation ?? driverEvaluation,
      activeVehicle: activeVehicle
        ? { id: activeVehicle.id, plate: activeVehicle.plate, complianceStatus: (activeVehicle as any).compliance_status }
        : null,
      alerts,
    };
  } catch (error: any) {
    console.error('❌ [getComplianceStatus] Error:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * canDriverOperateVehicle expuesto como callable.
 * Driver evalúa sus propios vehículos; admin puede evaluar cualquier par.
 */
export const canOperateVehicle = functions.https.onCall(async (data, context) => {
  const uid = await requireDriver(context);
  try {
    const input = validateData(CanOperateVehicleSchema, data);
    const driver = await resolveDriverOrThrow(uid);

    const evaluation = await complianceService.canDriverOperateVehicle(
      driver.id,
      input.vehicleId,
      input.serviceCode ?? null,
      { evaluatedBy: uid },
    );

    return { success: true, evaluation };
  } catch (error: any) {
    console.error('❌ [canOperateVehicle] Error:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/** Marca una alerta de documento como reconocida. */
export const acknowledgeDocumentAlert = functions.https.onCall(async (data, context) => {
  const uid = await requireDriver(context);
  try {
    const input = validateData(AcknowledgeAlertSchema, data);
    const driver = await resolveDriverOrThrow(uid);

    const alert = await documentsRepository.findAlertById(input.alertId);
    if (!alert) {
      throw new functions.https.HttpsError('not-found', 'Alerta no encontrada');
    }
    if (alert.driver_id !== driver.id) {
      throw new functions.https.HttpsError('permission-denied', 'La alerta no pertenece a este conductor');
    }

    await documentsRepository.updateAlertStatus(input.alertId, 'acknowledged');
    return { success: true };
  } catch (error: any) {
    console.error('❌ [acknowledgeDocumentAlert] Error:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// =============================================================================
// ADMIN: revisión de documentos
// =============================================================================

/** Documentos pendientes/en revisión para el backoffice. */
export const listDocumentsForReview = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);
  try {
    const input = validateData(ListDocumentsForReviewSchema, data);
    const statuses = input.status
      ? [input.status]
      : ['pending', 'in_review', 'requires_review'];

    const groups = await documentsRepository.findForReview(statuses, input.limit, input.offset);

    // Firmar URLs para que el revisor pueda ver los documentos (bucket privado)
    const signed = await createSignedUrls(
      collectDocumentPaths(groups.flatMap((g) => g.rows)),
    );

    return {
      success: true,
      groups: groups.map((g) => ({
        table: g.table,
        count: g.rows.length,
        documents: g.rows.map((d: any) => attachSignedUrls(d, signed)),
      })),
    };
  } catch (error: any) {
    console.error('❌ [listDocumentsForReview] Error:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Revisa un documento: approve → verified; reject → rejected + alerta;
 * request_review → requires_review. Trazable: verified_by/at + evento.
 */
export const reviewDocument = functions.https.onCall(async (data, context) => {
  const uid = await requireAdmin(context);
  try {
    const input = validateData(ReviewDocumentSchema, data);

    if (!DOCUMENT_TABLES.includes(input.documentTable as DocumentTable)) {
      throw new functions.https.HttpsError('invalid-argument', 'Tabla de documento inválida');
    }

    const model = documentsRepository.modelFor(input.documentTable as DocumentTable);
    const document = await model.findByPk(input.documentId);
    if (!document) {
      throw new functions.https.HttpsError('not-found', 'Documento no encontrado');
    }

    const now = new Date();
    let newStatus: string;
    let event: string;
    const update: Record<string, any> = {
      verified_by: uid,
      verification_method: 'manual',
      review_notes: input.reviewNotes ?? null,
    };

    if (input.action === 'approve') {
      newStatus = 'verified';
      event = 'verified';
      update.verified_at = now;
      update.rejection_reason = null;
    } else if (input.action === 'reject') {
      newStatus = 'rejected';
      event = 'rejected';
      update.verified_at = now;
      update.rejection_reason = input.rejectionReason ?? 'Rechazado por el equipo de verificación';
    } else {
      newStatus = 'requires_review';
      event = 'review_requested';
      update.rejection_reason = null;
    }

    update.status = newStatus;
    await document.update(update);

    const docJson = document.toJSON() as any;
    const driverId = docJson.driver_id ?? null;
    const vehicleId = docJson.vehicle_id ?? null;

    await documentsRepository.logEvent({
      entity_table: input.documentTable,
      entity_id: document.id,
      driver_id: driverId,
      vehicle_id: vehicleId,
      event,
      actor_uid: uid,
      actor_role: 'admin',
      payload: {
        previousStatus: docJson.status,
        rejectionReason: update.rejection_reason,
      },
    });

    // Alerta + push al conductor si fue rechazado o requiere revisión
    if (driverId && (input.action === 'reject' || input.action === 'request_review')) {
      const alertType = input.action === 'reject' ? 'rejected' : 'requires_review';
      try {
        await DocumentAlert.create({
          document_table: input.documentTable,
          document_id: document.id,
          driver_id: driverId,
          vehicle_id: vehicleId,
          alert_type: alertType,
          due_date: null,
          warning_days_used: null,
          status: 'open',
        } as any);

        const driver = await Driver.findByPk(driverId);
        if (driver?.user_id) {
          await sendNotificationToUser(driver.user_id, {
            title: 'Documento requiere atención',
            body:
              input.action === 'reject'
                ? `Un documento fue rechazado: ${update.rejection_reason}`
                : 'Un documento requiere revisión adicional.',
            data: {
              type: 'document_review',
              documentTable: input.documentTable,
              documentId: document.id,
              alertType,
            },
            androidChannelId: 'rundi-default-v2',
            notificationKey: `doc-${document.id.slice(0, 8)}`,
          });
        }
      } catch (notifyError: any) {
        console.warn('⚠️ [reviewDocument] Error notificando:', notifyError?.message);
      }
    }

    // Re-evaluar compliance tras la decisión
    if (driverId) {
      await reevaluateAfterChange(driverId, vehicleId, uid);
    }

    return { success: true, documentId: document.id, status: newStatus };
  } catch (error: any) {
    console.error('❌ [reviewDocument] Error:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/** Historial de versiones de un documento (admin: cualquiera; driver: propios). */
export const getDocumentHistory = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  const uid = context.auth.uid;
  try {
    const { documentTable, ownerId } = data as { documentTable: DocumentTable; ownerId: string };
    if (!documentTable || !ownerId || !DOCUMENT_TABLES.includes(documentTable)) {
      throw new functions.https.HttpsError('invalid-argument', 'documentTable y ownerId son requeridos');
    }

    const ownerField = documentTable === 'driver_licenses' ? 'driver_id' : 'vehicle_id';

    // Driver solo ve su propio historial
    const driver = await Driver.findOne({ where: { user_id: uid } });
    if (driver) {
      if (ownerField === 'driver_id' && ownerId !== driver.id) {
        throw new functions.https.HttpsError('permission-denied', 'Historial no pertenece a este conductor');
      }
      if (ownerField === 'vehicle_id') {
        await assertVehicleOwnership(ownerId, driver.id);
      }
    }
    // si no es driver, asumir admin (la UI de backoffice llama con admin)

    const history = await documentsRepository.findHistory(documentTable, ownerField as any, ownerId);
    return {
      success: true,
      documents: history.map((d: any) => (d.toJSON ? d.toJSON() : d)),
    };
  } catch (error: any) {
    console.error('❌ [getDocumentHistory] Error:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message);
  }
});
