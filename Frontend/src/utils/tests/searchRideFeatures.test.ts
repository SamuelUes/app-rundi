/// <reference types="jest" />

import {
  getDefaultSelectedFeatureCodes,
  getFeatureAvailability,
  getSelectedFeatureCodes,
  orderFeaturesBySelection,
} from '../rideFeatures';
import type { ServiceFeatureOption } from '../../services/servicesService';

const nightFeature: ServiceFeatureOption = {
  code: 'night',
  name: 'Night',
  description: null,
  pricingType: 'multiplier',
  pricingValue: 1.1,
  priority: 10,
  stackable: true,
  startTime: '22:00:00',
  endTime: '04:00:00',
  timezone: 'America/Managua',
  startsAt: null,
  endsAt: null,
  metadata: {},
};

const motoDiscount: ServiceFeatureOption = {
  ...nightFeature,
  code: 'designated_driver_moto_discount',
  name: 'Designated driver moto adjustment',
  pricingType: 'discount',
  pricingValue: 70,
  priority: 20,
  startTime: null,
  endTime: null,
};

describe('ride feature selection', () => {
  it('uses the Managua night window, including its midnight boundary', () => {
    expect(getFeatureAvailability(nightFeature, new Date('2026-10-25T09:59:00Z'))).toBe('eligible');
    expect(getFeatureAvailability(nightFeature, new Date('2026-10-25T10:00:00Z'))).toBe('condition-disabled');
  });

  it('defaults eligible assigned features on and keeps a manual off override', () => {
    const at = new Date('2026-10-25T09:59:00Z');
    expect(getDefaultSelectedFeatureCodes([nightFeature, motoDiscount], at)).toEqual([
      'night',
      'designated_driver_moto_discount',
    ]);
    expect(getSelectedFeatureCodes([nightFeature, motoDiscount], { night: false }, at)).toEqual([
      'designated_driver_moto_discount',
    ]);
  });

  it('orders selected features before manual and condition-disabled features', () => {
    expect(orderFeaturesBySelection([motoDiscount, nightFeature], ['night']).map((feature) => feature.code))
      .toEqual(['night', 'designated_driver_moto_discount']);
  });

  it('does not include a condition-disabled feature in selected codes', () => {
    expect(getSelectedFeatureCodes([nightFeature], {}, new Date('2026-10-25T10:00:00Z'))).toEqual([]);
  });
});
