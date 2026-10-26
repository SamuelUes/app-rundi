/**
 * ComplianceRepository - Carga de facts para el motor de compliance.
 * Acepta Firebase UID o UUID interno para el conductor.
 */

import { Op } from 'sequelize';
import Driver from '../../models/Driver';
import Vehicle from '../../models/Vehicle';
import DriverLicense from '../../models/DriverLicense';
import VehicleCirculationCard from '../../models/VehicleCirculationCard';
import VehicleInsurancePolicy from '../../models/VehicleInsurancePolicy';
import VehicleInspection from '../../models/VehicleInspection';
import VehicleEmissionCertificate from '../../models/VehicleEmissionCertificate';
import VehicleRoadTax from '../../models/VehicleRoadTax';
import VehicleRevisadoSticker from '../../models/VehicleRevisadoSticker';
import ComplianceRule from '../../models/ComplianceRule';
import LicenseCategoryRule from '../../models/LicenseCategoryRule';
import { yearOf, todayNicaragua, toDateOnly } from './dateUtils';
import type {
  CategoryRuleRow,
  CirculationFacts,
  ComplianceFacts,
  EmissionsFacts,
  InsuranceFacts,
  InspectionFacts,
  LicenseFacts,
  RevisadoFacts,
  RoadTaxFacts,
  RuleConfig,
  VehicleFacts,
} from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ComplianceRepository {
  /** Resuelve conductor por UUID interno o Firebase UID (drivers.user_id). */
  async findDriver(identifier: string): Promise<Driver | null> {
    const where = UUID_RE.test(identifier)
      ? { [Op.or]: [{ id: identifier }, { user_id: identifier }] }
      : { user_id: identifier };
    return await Driver.findOne({ where });
  }

  async findVehicle(vehicleId: string): Promise<Vehicle | null> {
    if (!UUID_RE.test(vehicleId)) return null;
    return await Vehicle.findByPk(vehicleId);
  }

  async loadRulesConfig(): Promise<Map<string, RuleConfig>> {
    const rows = await ComplianceRule.findAll();
    const map = new Map<string, RuleConfig>();
    for (const row of rows) {
      const r = row.toJSON() as any;
      map.set(r.code, {
        code: r.code,
        severity: r.severity,
        blocking: r.blocking,
        enabled: r.enabled,
        warningDays: r.warning_days,
        legalBasis: r.legal_basis,
        params: r.params ?? {},
      });
    }
    return map;
  }

  async loadCategoryRules(): Promise<CategoryRuleRow[]> {
    const rows = await LicenseCategoryRule.findAll({ where: { is_active: true } });
    return rows.map((row) => {
      const r = row.toJSON() as any;
      return {
        vehicleType: r.vehicle_type,
        serviceCode: r.service_code,
        requiredCategories: r.required_categories ?? [],
        severity: r.severity,
        confirmedBySource: r.confirmed_by_source,
      };
    });
  }

  async getCurrentLicense(driverUuid: string): Promise<LicenseFacts | null> {
    const row = await DriverLicense.findOne({
      where: { driver_id: driverUuid, is_current: true },
      order: [['created_at', 'DESC']],
    });
    if (!row) return null;
    const r = row.toJSON() as any;
    return {
      id: r.id,
      status: r.status,
      licenseNumber: r.license_number,
      licenseType: r.license_type,
      categories: r.categories ?? [],
      issueDate: r.issue_date,
      expiryDate: r.expiry_date,
      reportedStatus: r.reported_status,
    };
  }

  async getCurrentCirculation(vehicleId: string): Promise<CirculationFacts | null> {
    const row = await VehicleCirculationCard.findOne({
      where: { vehicle_id: vehicleId, is_current: true },
      order: [['created_at', 'DESC']],
    });
    if (!row) return null;
    const r = row.toJSON() as any;
    return {
      id: r.id,
      status: r.status,
      cardNumber: r.card_number,
      issuedAt: r.issued_at,
      declaredPlate: r.declared_plate,
      declaredVin: r.declared_vin,
      declaredChasis: r.declared_chasis,
      declaredMotor: r.declared_motor,
      declaredServiceType: r.declared_service_type,
    };
  }

  async getCurrentRcInsurance(vehicleId: string): Promise<InsuranceFacts | null> {
    const row = await VehicleInsurancePolicy.findOne({
      where: { vehicle_id: vehicleId, coverage_type: 'rc_obligatorio', is_current: true },
      order: [['created_at', 'DESC']],
    });
    if (!row) return null;
    const r = row.toJSON() as any;
    return {
      id: r.id,
      status: r.status,
      policyNumber: r.policy_number,
      insurerCode: r.insurer_code,
      coverageType: r.coverage_type,
      effectiveFrom: r.effective_from,
      effectiveUntil: r.effective_until,
      insuredPlate: r.insured_plate,
      insuredVin: r.insured_vin,
      insuredMotor: r.insured_motor,
      insuredChasis: r.insured_chasis,
    };
  }

  async hasPassengerCoverage(vehicleId: string): Promise<boolean> {
    const count = await VehicleInsurancePolicy.count({
      where: { vehicle_id: vehicleId, coverage_type: 'pasajeros', is_current: true },
    });
    return count > 0;
  }

  async getCurrentInspection(vehicleId: string): Promise<InspectionFacts | null> {
    const row = await VehicleInspection.findOne({
      where: { vehicle_id: vehicleId, is_current: true },
      order: [['created_at', 'DESC']],
    });
    if (!row) return null;
    const r = row.toJSON() as any;
    return {
      id: r.id,
      status: r.status,
      inspectedAt: r.inspected_at,
      result: r.result,
      validUntil: r.valid_until,
    };
  }

  async getCurrentEmissions(vehicleId: string): Promise<EmissionsFacts | null> {
    const row = await VehicleEmissionCertificate.findOne({
      where: { vehicle_id: vehicleId, is_current: true },
      order: [['created_at', 'DESC']],
    });
    if (!row) return null;
    const r = row.toJSON() as any;
    return {
      id: r.id,
      status: r.status,
      testedAt: r.tested_at,
      result: r.result,
      validUntil: r.valid_until,
    };
  }

  async getRoadTaxForCurrentYear(vehicleId: string, today: string): Promise<RoadTaxFacts | null> {
    const year = yearOf(today);
    const row = await VehicleRoadTax.findOne({
      where: { vehicle_id: vehicleId, tax_year: year, is_current: true },
      order: [['created_at', 'DESC']],
    });
    if (!row) return null;
    const r = row.toJSON() as any;
    return {
      id: r.id,
      status: r.status,
      taxYear: r.tax_year,
      paidAt: r.paid_at,
      exempt: r.exempt,
    };
  }

  async getCurrentRevisado(vehicleId: string): Promise<RevisadoFacts | null> {
    const row = await VehicleRevisadoSticker.findOne({
      where: { vehicle_id: vehicleId, is_current: true },
      order: [['created_at', 'DESC']],
    });
    if (!row) return null;
    const r = row.toJSON() as any;
    return {
      id: r.id,
      status: r.status,
      stickerYear: r.sticker_year,
      validUntil: r.valid_until,
    };
  }

  // -------------------------------------------------------------------------
  // Duplicados
  // -------------------------------------------------------------------------

  async findLicenseNumberDuplicates(licenseNumber: string | null, excludeDriverId: string) {
    if (!licenseNumber) return [] as string[];
    const rows = await DriverLicense.findAll({
      where: {
        license_number: licenseNumber,
        is_current: true,
        driver_id: { [Op.ne]: excludeDriverId },
      },
      attributes: ['driver_id'],
      raw: true,
    });
    return rows.map((r: any) => r.driver_id as string);
  }

  async findPlateDuplicates(plate: string | null, excludeVehicleId: string) {
    if (!plate) return [] as string[];
    const rows = await Vehicle.findAll({
      where: { plate: { [Op.iLike]: plate }, id: { [Op.ne]: excludeVehicleId } },
      attributes: ['id'],
      raw: true,
    });
    return rows.map((r: any) => r.id as string);
  }

  async findVinDuplicates(vehicle: VehicleFacts, excludeVehicleId: string) {
    const ors: any[] = [];
    if (vehicle.vin) ors.push({ vin: vehicle.vin });
    if (vehicle.chasis) ors.push({ chasis: vehicle.chasis });
    if (vehicle.motor) ors.push({ motor: vehicle.motor });
    if (ors.length === 0) return [] as string[];
    const rows = await Vehicle.findAll({
      where: { [Op.or]: ors, id: { [Op.ne]: excludeVehicleId } },
      attributes: ['id'],
      raw: true,
    });
    return rows.map((r: any) => r.id as string);
  }

  async findPolicyDuplicates(policyNumber: string | null, excludeVehicleId: string) {
    if (!policyNumber) return [] as string[];
    const rows = await VehicleInsurancePolicy.findAll({
      where: {
        policy_number: policyNumber,
        is_current: true,
        vehicle_id: { [Op.ne]: excludeVehicleId },
      },
      attributes: ['vehicle_id'],
      raw: true,
    });
    return rows.map((r: any) => r.vehicle_id as string);
  }

  // -------------------------------------------------------------------------
  // Ensamblado de facts
  // -------------------------------------------------------------------------

  async loadFacts(
    driverIdentifier: string,
    vehicleId?: string | null,
    serviceCode?: string | null,
    today?: string,
  ): Promise<{ facts: ComplianceFacts; driver: Driver | null; vehicle: Vehicle | null }> {
    const driver = await this.findDriver(driverIdentifier);
    const vehicle = vehicleId ? await this.findVehicle(vehicleId) : null;
    const effectiveToday = today ?? todayNicaragua();
    const vehicleRequested = Boolean(vehicleId);

    const facts: ComplianceFacts = {
      driver: driver
        ? {
            id: driver.id,
            userId: driver.user_id,
            accountStatus: driver.status,
            documentsStatus: driver.documents_status ?? null,
          }
        : null,
      serviceCode: serviceCode ?? null,
    };

    if (driver) {
      facts.license = await this.getCurrentLicense(driver.id);
      const dupLicenseIds = await this.findLicenseNumberDuplicates(
        facts.license?.licenseNumber ?? null,
        driver.id,
      );
      facts.duplicates = { licenseNumberDriverIds: dupLicenseIds };
    }

    if (vehicleRequested) {
      facts.vehicle = null; // solicitado pero no encontrado → VEHICLE_NOT_FOUND
    }

    if (vehicle) {
      const v = vehicle.toJSON() as any;
      facts.vehicle = {
        id: v.id,
        driverId: v.driver_id,
        plate: v.plate,
        type: v.type,
        serviceType: v.service_type,
        vehicleClass: v.vehicle_class,
        vin: v.vin,
        chasis: v.chasis,
        motor: v.motor,
        year: v.year,
        emissionDate: v.emission_date,
        isActive: Boolean(v.is_active),
        createdAt: toDateOnly(v.created_at),
      };

      const [circulation, rcInsurance, hasPassengerCoverage, inspection, emissions, roadTax, revisado, plateDup, vinDup] =
        await Promise.all([
          this.getCurrentCirculation(vehicle.id),
          this.getCurrentRcInsurance(vehicle.id),
          this.hasPassengerCoverage(vehicle.id),
          this.getCurrentInspection(vehicle.id),
          this.getCurrentEmissions(vehicle.id),
          this.getRoadTaxForCurrentYear(vehicle.id, effectiveToday),
          this.getCurrentRevisado(vehicle.id),
          this.findPlateDuplicates(facts.vehicle.plate, vehicle.id),
          this.findVinDuplicates(facts.vehicle, vehicle.id),
        ]);

      facts.circulation = circulation;
      facts.rcInsurance = rcInsurance;
      facts.hasPassengerCoverage = hasPassengerCoverage;
      facts.inspection = inspection;
      facts.emissions = emissions;
      facts.roadTax = roadTax;
      facts.revisado = revisado;

      const policyDupIds = rcInsurance?.policyNumber
        ? await this.findPolicyDuplicates(rcInsurance.policyNumber, vehicle.id)
        : [];

      facts.duplicates = {
        ...(facts.duplicates ?? {}),
        plateVehicleIds: plateDup,
        vinVehicleIds: vinDup,
        policyVehicleIds: policyDupIds,
      };
    }

    return { facts, driver, vehicle };
  }
}
