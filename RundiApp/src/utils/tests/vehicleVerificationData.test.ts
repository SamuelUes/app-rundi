import { describe, expect, it } from '@jest/globals';
import { vehicleVerificationData } from '../driver/vehicleVerificationData';

describe('vehicle verification data', () => {
  it('uses current compliance documents and the mandatory insurance policy', () => {
    const data = vehicleVerificationData({ registrationNumber: 'legacy' }, {
      vehicle_circulation_cards: [{
        card_number: 'current', issued_at: '2024-03-15',
        declared_brand: 'Toyota', declared_model: 'Corolla',
        declared_year: 2020, declared_vin: 'VIN-1',
        document_path: 'drivers/front.jpg', document_path_back: 'drivers/back.jpg',
      }],
      vehicle_insurance_policies: [
        { coverage_type: 'otro', policy_number: 'other' },
        { coverage_type: 'rc_obligatorio', policy_number: 'policy', insurer_name: 'insurer',
          effective_until: '2027-03-04', document_path: 'drivers/insurance.jpg' },
      ],
    });
    expect(data.registrationNumber).toBe('current');
    expect(data.emissionDate).toBe('2024-03-15');
    expect(data.brand).toBe('Toyota');
    expect(data.model).toBe('Corolla');
    expect(data.year).toBe('2020');
    expect(data.vin).toBe('VIN-1');
    expect(data.registrationPhotoFront).toBe('drivers/front.jpg');
    expect(data.registrationPhotoBack).toBe('drivers/back.jpg');
    expect(data.insuranceNumber).toBe('policy');
    expect(data.insuranceExpiry).toBe('2027-03-04');
  });

  it('extracts periodic documents and the road tax of the current year', () => {
    const year = new Date().getFullYear();
    const data = vehicleVerificationData({}, {
      vehicle_inspections: [{ inspected_at: '2026-05-01', valid_until: '2027-05-01', document_path: 'drivers/itm.jpg' }],
      vehicle_emission_certificates: [{ tested_at: '2026-05-02', valid_until: '2027-05-02' }],
      vehicle_road_taxes: [
        { tax_year: year - 1, paid_at: '2025-01-10' },
        { tax_year: year, paid_at: '2026-01-15', document_path: 'drivers/tax.jpg' },
      ],
      vehicle_revisado_stickers: [{ valid_until: '2026-12-31' }],
    });
    expect(data.inspectionDate).toBe('2026-05-01');
    expect(data.inspectionValidUntil).toBe('2027-05-01');
    expect(data.emissionsTestedAt).toBe('2026-05-02');
    expect(data.roadTaxPaidAt).toBe('2026-01-15');
    expect(data.roadTaxPhoto).toBe('drivers/tax.jpg');
    expect(data.revisadoValidUntil).toBe('2026-12-31');
  });

  it('falls back to legacy vehicle data when current documents are absent or partial', () => {
    const data = vehicleVerificationData({
      registrationNumber: 'legacy', emissionDate: '2017-06-02T00:00:00Z',
      brand: 'Kia', year: 2015, vin: 'VIN-LEGACY',
      registrationPhotoFront: 'drivers/legacy.jpg', insuranceNumber: 'legacy-policy',
    }, { vehicle_circulation_cards: [{ card_number: null }] });
    expect(data.registrationNumber).toBe('legacy');
    expect(data.emissionDate).toBe('2017-06-02');
    expect(data.brand).toBe('Kia');
    expect(data.year).toBe('2015');
    expect(data.vin).toBe('VIN-LEGACY');
    expect(data.registrationPhotoFront).toBe('drivers/legacy.jpg');
    expect(data.insuranceNumber).toBe('legacy-policy');
  });
});
