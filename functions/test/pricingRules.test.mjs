import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const {
  applyPricingFeatures,
  calculateCommissionAmount,
  calculateDynamicMinimumFare,
  calculateSurgeRatio,
  roundFareToNearestFive,
  isFeatureActiveAt,
  validateSelectedFeatureCodes,
  getDefaultSelectedPricingFeatureCodes,
  resolveSurgeMultiplier,
} = require('../lib/helpers/pricingRules.js');

describe('pricing feature rules', () => {
  const night = {
    code: 'night',
    name: 'Night',
    pricingType: 'multiplier',
    pricingValue: 1.1,
    priority: 10,
    stackable: true,
    startTime: '22:00',
    endTime: '04:00',
    timezone: 'America/Managua',
  };

  it('handles a daily window that crosses midnight in Managua', () => {
    assert.equal(isFeatureActiveAt(night, new Date('2026-10-25T03:59:00Z')), false);
    assert.equal(isFeatureActiveAt(night, new Date('2026-10-25T04:00:00Z')), true);
    assert.equal(isFeatureActiveAt(night, new Date('2026-10-25T09:59:00Z')), true);
    assert.equal(isFeatureActiveAt(night, new Date('2026-10-25T10:00:00Z')), false);
    assert.equal(isFeatureActiveAt(night, new Date('2026-10-25T04:01:00Z')), true);
  });

  it('applies active features in deterministic priority order', () => {
    const result = applyPricingFeatures(100, [
      { ...night, code: 'later', priority: 20, startTime: null, endTime: null },
      { ...night, code: 'first', priority: 10, startTime: null, endTime: null },
    ], new Date('2026-10-25T15:00:00Z'));

    assert.equal(result.fare, 121);
    assert.deepEqual(result.features.map((feature) => feature.code), ['first', 'later']);
  });

  it('stops applying subsequent features after a non-stackable feature', () => {
    const result = applyPricingFeatures(100, [
      { ...night, code: 'exclusive', priority: 10, startTime: null, endTime: null, stackable: false },
      { ...night, code: 'other', priority: 20, startTime: null, endTime: null },
    ], new Date('2026-10-25T15:00:00Z'));

    assert.equal(result.fare, 110);
    assert.deepEqual(result.features.map((feature) => feature.code), ['exclusive']);
  });

  it('stacks the nightly uplift and the designated-moto fixed discount deterministically', () => {
    const result = applyPricingFeatures(150, [
      { ...night, code: 'night', priority: 10, startTime: null, endTime: null },
      {
        code: 'designated_driver_moto_discount',
        name: 'DD moto adjustment',
        pricingType: 'discount',
        pricingValue: 70,
        priority: 20,
        stackable: true,
      },
    ], new Date('2026-10-25T15:00:00Z'));

    assert.equal(result.fare, 95);
    assert.deepEqual(result.features.map((feature) => feature.code), [
      'night',
      'designated_driver_moto_discount',
    ]);
  });

  it('applies only explicitly selected eligible feature codes', () => {
    const result = applyPricingFeatures(150, [
      { ...night, code: 'night', startTime: null, endTime: null },
      {
        code: 'designated_driver_moto_discount',
        name: 'DD moto adjustment',
        pricingType: 'discount',
        pricingValue: 70,
        priority: 20,
        stackable: true,
      },
    ], new Date('2026-10-25T15:00:00Z'), ['night']);

    assert.equal(result.fare, 165);
    assert.deepEqual(result.features.map((feature) => feature.code), ['night']);
  });

  it('treats an explicit empty selection as no selected features', () => {
    const result = applyPricingFeatures(150, [night], new Date('2026-10-25T09:59:00Z'), []);
    assert.equal(result.fare, 150);
    assert.deepEqual(result.features, []);
  });

  it('preserves automatic feature application when selection is omitted', () => {
    const result = applyPricingFeatures(150, [night], new Date('2026-10-25T09:59:00Z'));
    assert.equal(result.fare, 165);
    assert.deepEqual(result.features.map((feature) => feature.code), ['night']);
  });

  it('keeps optional non-price features off by default while preserving existing defaults', () => {
    const features = [
      { ...night, code: 'night', startTime: null, endTime: null },
      {
        code: 'senior',
        name: 'Senior',
        pricingType: 'none',
        pricingValue: 0,
        priority: 20,
        stackable: true,
        defaultSelected: false,
      },
    ];
    assert.deepEqual(
      getDefaultSelectedPricingFeatureCodes(features, new Date('2026-10-25T09:59:00Z')),
      ['night'],
    );
  });

  it('accepts only assigned feature codes that are eligible at the calculation time', () => {
    assert.deepEqual(
      validateSelectedFeatureCodes(['night'], [night], new Date('2026-10-25T09:59:00Z')),
      ['night'],
    );
    assert.throws(
      () => validateSelectedFeatureCodes(['unknown'], [night], new Date('2026-10-25T09:59:00Z')),
      /not assigned/i,
    );
    assert.throws(
      () => validateSelectedFeatureCodes(['night'], [night], new Date('2026-10-25T10:00:00Z')),
      /not eligible/i,
    );
  });
});

describe('surge rules', () => {
  it('maps configured ratio thresholds to multipliers', () => {
    assert.deepEqual(
      [0.2, 0.8, 1.2, 1.5, 2, 3].map((ratio) => resolveSurgeMultiplier(ratio)),
      [1, 1.05, 1.15, 1.3, 1.45, 1.6],
    );
  });

  it('clamps invalid or out-of-range surge values safely', () => {
    assert.equal(resolveSurgeMultiplier(null), 1);
    assert.equal(resolveSurgeMultiplier(Number.NaN), 1);
    assert.equal(resolveSurgeMultiplier(5, [
      { minDemandSupplyRatio: 0, maxDemandSupplyRatio: null, multiplier: 4, priority: 1 },
    ]), 1.6);
    assert.equal(resolveSurgeMultiplier(5, [
      { minDemandSupplyRatio: 0, maxDemandSupplyRatio: null, multiplier: 0.5, priority: 1 },
    ]), 1);
  });

  it('requires five active requests and smooths sparse area samples', () => {
    assert.equal(calculateSurgeRatio(1, 0), null);
    assert.equal(calculateSurgeRatio(3, 1), null);
    assert.equal(calculateSurgeRatio(5, 1), 1.5);
    assert.equal(calculateSurgeRatio(30, 20), 1.36);
    assert.equal(calculateSurgeRatio(5, 0), 1.8);
    assert.equal(calculateSurgeRatio(0, 0), null);
    assert.equal(calculateSurgeRatio(-1, 2), null);
  });

  it('retains half of the surge uplift as the server-side negotiation floor', () => {
    assert.equal(calculateDynamicMinimumFare(143, 185, 1.3), 164.45);
    assert.equal(calculateDynamicMinimumFare(100, 100, 1), 66.67);
  });

  it('calculates commission from the agreed final fare, not the original quote', () => {
    assert.equal(calculateCommissionAmount(140, 0.15), 21);
    assert.notEqual(calculateCommissionAmount(140, 0.15), 150 * 0.15);
  });

  it('rounds automatic fares to the nearest C$5 while preserving half-up ties', () => {
    assert.equal(roundFareToNearestFive(83.4), 85);
    assert.equal(roundFareToNearestFive(87.4), 85);
    assert.equal(roundFareToNearestFive(82.2), 80);
    assert.equal(roundFareToNearestFive(88.2), 90);
    assert.equal(roundFareToNearestFive(82.5), 85);
  });
});
