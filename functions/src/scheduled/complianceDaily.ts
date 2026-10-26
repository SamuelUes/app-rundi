/**
 * Evaluación diaria de compliance documental.
 * Se ejecuta a las 03:00 America/Managua.
 *
 * 1) Marca como 'expired' los documentos vigentes cuya fecha pasó.
 * 2) Re-evalúa cada par conductor+vehículo activo (persistido, 'scheduled').
 * 3) Genera alertas document_alerts (expiring_soon / expired) deduplicadas.
 * 4) Notifica push al conductor por alertas nuevas.
 */

import * as functions from 'firebase-functions/v1';
import { Op } from 'sequelize';
import DriverLicense from '../sequelize/models/DriverLicense';
import VehicleInsurancePolicy from '../sequelize/models/VehicleInsurancePolicy';
import VehicleInspection from '../sequelize/models/VehicleInspection';
import VehicleEmissionCertificate from '../sequelize/models/VehicleEmissionCertificate';
import VehicleRevisadoSticker from '../sequelize/models/VehicleRevisadoSticker';
import Vehicle from '../sequelize/models/Vehicle';
import Driver from '../sequelize/models/Driver';
import DocumentAlert from '../sequelize/models/DocumentAlert';
import ComplianceRule from '../sequelize/models/ComplianceRule';
import { complianceService } from '../sequelize/services/compliance';
import {
  daysUntilExpiration,
  isExpired,
  isExpiringSoon,
  toDateOnly,
  todayNicaragua,
} from '../sequelize/services/compliance/dateUtils';
import { sendNotificationToUser } from '../services/pushNotifications';

interface ExpirableDoc {
  table: string;
  id: string;
  driverId: string | null;
  vehicleId: string | null;
  expiryField: string | null;
  displayName: string;
}

/** Documentos vigentes con fecha de vencimiento, por tabla. */
async function collectExpirableDocs(): Promise<ExpirableDoc[]> {
  const docs: ExpirableDoc[] = [];

  const push = (table: string, rows: any[], expiryField: string, displayName: string, driverId: string | null, vehicleId: string | null) => {
    for (const r of rows) {
      docs.push({
        table,
        id: r.id,
        driverId: r.driver_id ?? driverId,
        vehicleId: r.vehicle_id ?? vehicleId,
        expiryField: r[expiryField] ?? null,
        displayName,
      });
    }
  };

  const [licenses, policies, inspections, emissions, revisados] = await Promise.all([
    DriverLicense.findAll({ where: { is_current: true, expiry_date: { [Op.ne]: null } } as any, raw: true }),
    VehicleInsurancePolicy.findAll({ where: { is_current: true, coverage_type: 'rc_obligatorio' }, raw: true }),
    VehicleInspection.findAll({ where: { is_current: true }, raw: true }),
    VehicleEmissionCertificate.findAll({ where: { is_current: true }, raw: true }),
    VehicleRevisadoSticker.findAll({ where: { is_current: true }, raw: true }),
  ]);

  const driverByLicense = new Map<string, string>();
  for (const l of licenses as any[]) driverByLicense.set(l.id, l.driver_id);

  const driverByVehicle = new Map<string, string>();
  const vehicleIds = Array.from(
    new Set([
      ...(policies as any[]).map((r) => r.vehicle_id),
      ...(inspections as any[]).map((r) => r.vehicle_id),
      ...(emissions as any[]).map((r) => r.vehicle_id),
      ...(revisados as any[]).map((r) => r.vehicle_id),
    ]),
  );
  if (vehicleIds.length > 0) {
    const vehicles = await Vehicle.findAll({
      where: { id: vehicleIds } as any,
      attributes: ['id', 'driver_id'],
      raw: true,
    });
    for (const v of vehicles as any[]) driverByVehicle.set(v.id, v.driver_id);
  }

  push('driver_licenses', licenses as any[], 'expiry_date', 'Licencia de conducir', null, null);
  push('vehicle_insurance_policies', policies as any[], 'effective_until', 'Póliza de seguro', null, null);
  push('vehicle_inspections', inspections as any[], 'valid_until', 'Inspección técnico-mecánica', null, null);
  push('vehicle_emission_certificates', emissions as any[], 'valid_until', 'Certificado de emisiones', null, null);
  push('vehicle_revisado_stickers', revisados as any[], 'valid_until', 'Calcomanía de revisado', null, null);

  // Resolver driver_id para documentos de vehículo
  for (const doc of docs) {
    if (!doc.driverId && doc.vehicleId) {
      doc.driverId = driverByVehicle.get(doc.vehicleId) ?? null;
    }
  }
  for (const doc of docs) {
    if (!doc.driverId && doc.table === 'driver_licenses') {
      doc.driverId = driverByLicense.get(doc.id) ?? null;
    }
  }

  return docs;
}

const MODEL_BY_TABLE: Record<string, any> = {};
// se llena lazy para no acoplar imports circulares
function modelFor(table: string): any {
  if (!MODEL_BY_TABLE[table]) {
    MODEL_BY_TABLE['driver_licenses'] = DriverLicense;
    MODEL_BY_TABLE['vehicle_insurance_policies'] = VehicleInsurancePolicy;
    MODEL_BY_TABLE['vehicle_inspections'] = VehicleInspection;
    MODEL_BY_TABLE['vehicle_emission_certificates'] = VehicleEmissionCertificate;
    MODEL_BY_TABLE['vehicle_revisado_stickers'] = VehicleRevisadoSticker;
  }
  return MODEL_BY_TABLE[table];
}

async function createAlertIfMissing(params: {
  table: string;
  documentId: string;
  driverId: string | null;
  vehicleId: string | null;
  alertType: 'expiring_soon' | 'expired';
  dueDate: string;
  warningDays: number | null;
}): Promise<boolean> {
  const [, created] = await DocumentAlert.findOrCreate({
    where: {
      document_table: params.table,
      document_id: params.documentId,
      alert_type: params.alertType,
      due_date: params.dueDate,
    } as any,
    defaults: {
      driver_id: params.driverId,
      vehicle_id: params.vehicleId,
      status: 'open',
      warning_days_used: params.warningDays,
    } as any,
  });
  return created;
}

export const complianceDailyEvaluation = functions
  .runWith({ memory: '512MB', maxInstances: 1, timeoutSeconds: 540 })
  .pubsub
  .schedule('0 3 * * *')
  .timeZone('America/Managua')
  .onRun(async () => {
    const today = todayNicaragua();
    console.log(`📋 [complianceDaily] Evaluación diaria iniciada (${today})`);

    const stats = {
      docsExpired: 0,
      alertsCreated: 0,
      notificationsSent: 0,
      driversEvaluated: 0,
      vehiclesEvaluated: 0,
      errors: 0,
    };

    try {
      // warning_days por defecto desde compliance_rules
      const rules = await ComplianceRule.findAll({ raw: true });
      const warningDaysByCode = new Map<string, number>();
      for (const r of rules as any[]) {
        if (r.warning_days != null) warningDaysByCode.set(r.code, r.warning_days);
      }
      const defaultWarningDays = warningDaysByCode.get('INSURANCE_EXPIRING_SOON') ?? 30;

      const docs = await collectExpirableDocs();

      // 1) Transición a expired + alertas
      for (const doc of docs) {
        const expiry = toDateOnly(doc.expiryField);
        if (!expiry) continue;

        try {
          if (isExpired(expiry, today)) {
            const model = modelFor(doc.table);
            await model.update({ status: 'expired' } as any, {
              where: { id: doc.id, status: { [Op.ne]: 'expired' } } as any,
            });
            stats.docsExpired += 1;

            const created = await createAlertIfMissing({
              table: doc.table,
              documentId: doc.id,
              driverId: doc.driverId,
              vehicleId: doc.vehicleId,
              alertType: 'expired',
              dueDate: expiry,
              warningDays: null,
            });
            if (created) stats.alertsCreated += 1;
          } else if (isExpiringSoon(expiry, today, defaultWarningDays)) {
            const created = await createAlertIfMissing({
              table: doc.table,
              documentId: doc.id,
              driverId: doc.driverId,
              vehicleId: doc.vehicleId,
              alertType: 'expiring_soon',
              dueDate: expiry,
              warningDays: defaultWarningDays,
            });
            if (created) stats.alertsCreated += 1;
          }
        } catch (docError: any) {
          stats.errors += 1;
          console.warn(`⚠️ [complianceDaily] Error doc ${doc.id}:`, docError?.message);
        }
      }

      // 2) Notificar alertas nuevas (notified_at null)
      const pendingAlerts = await DocumentAlert.findAll({
        where: { status: 'open', notified_at: null } as any,
        raw: true,
      });

      const userIdByDriver = new Map<string, string>();
      for (const alert of pendingAlerts as any[]) {
        try {
          let userId = alert.driver_id ? userIdByDriver.get(alert.driver_id) : null;
          if (!userId && alert.driver_id) {
            const d = await Driver.findByPk(alert.driver_id, { attributes: ['id', 'user_id'], raw: true }) as any;
            userId = d?.user_id ?? null;
            if (userId) userIdByDriver.set(alert.driver_id, userId);
          }
          if (!userId) continue;

          const days = daysUntilExpiration(alert.due_date, today);
          const isExpiredAlert = alert.alert_type === 'expired';
          await sendNotificationToUser(userId, {
            title: isExpiredAlert ? 'Documento vencido' : 'Documento próximo a vencer',
            body: isExpiredAlert
              ? `Un documento venció el ${alert.due_date}. Renóvalo para seguir operando.`
              : `Un documento vence el ${alert.due_date}${days != null ? ` (en ${days} días)` : ''}.`,
            data: {
              type: isExpiredAlert ? 'document_expired' : 'document_expiring_soon',
              alertId: alert.id,
              documentTable: alert.document_table,
            },
            androidChannelId: 'rundi-default-v2',
            notificationKey: `doc-alert-${alert.id.slice(0, 8)}`,
          });
          await DocumentAlert.update({ notified_at: new Date() } as any, { where: { id: alert.id } });
          stats.notificationsSent += 1;
        } catch (notifyError: any) {
          console.warn('⚠️ [complianceDaily] Error notificando alerta:', notifyError?.message);
        }
      }

      // 3) Re-evaluar pares conductor+vehículo activo
      const activeDrivers = await Driver.findAll({
        where: { status: 'active' } as any,
        attributes: ['id', 'user_id'],
        raw: true,
      });

      for (const driver of activeDrivers as any[]) {
        try {
          await complianceService.canDriverOperate(driver.id, {
            evaluatedBy: 'scheduled',
            today,
          });
          stats.driversEvaluated += 1;

          const vehicles = await Vehicle.findAll({
            where: { driver_id: driver.id, is_active: true } as any,
            attributes: ['id'],
            raw: true,
          });
          for (const vehicle of vehicles as any[]) {
            try {
              await complianceService.canDriverOperateVehicle(driver.id, vehicle.id, null, {
                evaluatedBy: 'scheduled',
                today,
              });
              stats.vehiclesEvaluated += 1;
            } catch (vehError: any) {
              stats.errors += 1;
              console.warn(`⚠️ [complianceDaily] Error evaluando vehículo ${vehicle.id}:`, vehError?.message);
            }
          }
        } catch (driverError: any) {
          stats.errors += 1;
          console.warn(`⚠️ [complianceDaily] Error evaluando conductor ${driver.id}:`, driverError?.message);
        }
      }

      console.log('✅ [complianceDaily] Evaluación diaria completada:', stats);
      return stats;
    } catch (error: any) {
      console.error('❌ [complianceDaily] Error general:', error);
      throw error;
    }
  });
