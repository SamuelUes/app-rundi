import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWriteWindow, observeWrite, devRideTrackingStage } from '../devWriteMetrics.ts';
import {
  claimTripLocationWrite,
  confirmTripLocationWrite,
  createTripLocationWriteGate,
  releaseTripLocationWrite,
  TRIP_LOCATION_WRITE_INTERVAL_MS,
} from '../ride/tripLocationWriteGate.ts';

test('counts writes and inter-attempt gaps without recording identifiers', () => {
  const window = createWriteWindow();
  assert.equal(observeWrite(window, 1000), null);
  assert.equal(observeWrite(window, 1100), null);
  assert.equal(observeWrite(window, 1600), null);
  assert.equal(observeWrite(window, 3000), null);
  const report = observeWrite(window, 31000);
  assert.deepEqual(report, {
    durationMs: 30000, attempts: 5, lt250ms: 1, lt1s: 1, lt2500ms: 1, gte2500ms: 1,
  });
  assert.equal(observeWrite(window, 31100), null);
  assert.deepEqual(observeWrite(window, 61000), {
    durationMs: 30000, attempts: 2, lt250ms: 1, lt1s: 0, lt2500ms: 0, gte2500ms: 1,
  });
});

test('ride diagnostics log only the fixed stage in development', () => {
  const oldDev = globalThis.__DEV__;
  const oldLog = console.log;
  const logs = [];
  console.log = (...args) => logs.push(args);
  try {
    globalThis.__DEV__ = false;
    devRideTrackingStage('trip_write_start');
    assert.equal(logs.length, 0);
    globalThis.__DEV__ = true;
    devRideTrackingStage('trip_write_start');
    assert.deepEqual(logs, [['[Ride tracking diagnostic]', { stage: 'trip_write_start' }]]);
  } finally {
    globalThis.__DEV__ = oldDev;
    console.log = oldLog;
  }
});

test('trip location gate coalesces writers without hiding failures', () => {
  const gate = createTripLocationWriteGate();
  assert.equal(claimTripLocationWrite(gate, 1_000), true);
  assert.equal(claimTripLocationWrite(gate, 1_001), false);
  releaseTripLocationWrite(gate);
  assert.equal(claimTripLocationWrite(gate, 1_002), true);
  confirmTripLocationWrite(gate, 2_000);
  assert.equal(claimTripLocationWrite(gate, 2_000 + TRIP_LOCATION_WRITE_INTERVAL_MS - 1), false);
  assert.equal(claimTripLocationWrite(gate, 2_000 + TRIP_LOCATION_WRITE_INTERVAL_MS), true);
});
