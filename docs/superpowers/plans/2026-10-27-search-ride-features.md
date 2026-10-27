# Search Ride Feature Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show database-assigned service features in a horizontal selection rail, recalculate prices with validated customer choices, and refine the Pro Max summary while keeping route distance and duration visible.

**Architecture:** `getServices` returns active feature assignments as display metadata; the client tracks per-service overrides and sends selected feature codes to the pricing endpoint and ride request. The pricing helper remains the source of truth: it validates codes against the service's active assignments and conditions before applying adjustments. The search screen renders the selected service's feature rail and a summary with separate route metrics, availability, fare, payment, suggested price, and comment.

**Tech Stack:** Expo React Native, TypeScript, Firebase Callable Functions/HTTP Functions, Supabase service-role REST helper, Jest, Node test runner.

---

## File Map

- Modify `functions/src/api/services_sequelize.ts`: attach active feature assignments and presentation/pricing metadata to `getServices`.
- Modify `functions/src/helpers/pricingRules.ts`: support an explicit set of selected codes without changing legacy behavior when the caller omits the set.
- Modify `functions/src/helpers/priceCalculator.ts`: validate selected codes against the loaded service assignments and apply only validated features.
- Modify `functions/src/index.ts`: accept selected feature codes and calculation time on single and batch price endpoints.
- Modify `functions/src/api/rides_sequelize.ts`: forward selected feature codes for immediate and scheduled authoritative fare calculations.
- Modify `Frontend/src/services/servicesService.ts`: normalize feature assignment metadata in the typed service catalog.
- Create `Frontend/src/services/tests/servicesService.test.ts`: verify feature metadata normalization.
- Modify `Frontend/src/utils/priceCalculatorCentralize.ts`: include feature selections and calculation time in individual/batch payloads and local fallback.
- Modify `Frontend/src/hooks/client/SearchRideScreen/useRideRouteCalculation.ts`: recalculate selected-service price on feature changes and scheduled-time changes, retaining per-service overrides for the form session.
- Modify `Frontend/src/hooks/client/SearchRideScreen/useSearchRideSubmission.ts`: submit selected codes with both immediate and scheduled ride requests.
- Modify `Frontend/src/screens/Client/SearchRideScreen.tsx`: connect catalog, per-service selections, route calculation, vehicle selector, summary, and style tokens.
- Modify `Frontend/src/components/client/SearchRide/SearchRideVehicleOptions.tsx`: render and control the horizontal active-left/inactive-right feature rail; correct the MaterialIcons recursion in `RideIcon`.
- Modify `Frontend/src/components/client/SearchRide/SearchRideSummary.tsx`: implement Pro Max fare/payment emphasis and keep route km/min in a dedicated, non-truncated row.
- Modify `Frontend/src/i18n/index.ts`: add English and Spanish strings for feature labels/states, condition hints, and summary labels.
- Create `Frontend/src/utils/tests/searchRideFeatures.test.ts`: test feature display ordering, eligibility, and local selection defaults.
- Modify `functions/test/pricingRules.test.mjs`: cover selected feature allowlists, time-window validation, and legacy default behavior.

No database migration is planned. `features` and `service_feature_assignments` already contain the active state, service relationship, time window, pricing type/value, stackability, priority, and per-assignment configuration needed for the catalog and authoritative validation.

### Task 1: Add pricing-rule tests for explicit feature selection

**Files:**
- Modify: `functions/test/pricingRules.test.mjs`
- Modify: `functions/src/helpers/pricingRules.ts`

- [ ] **Step 1: Add failing selection tests**

Extend the existing `pricing feature rules` suite:

```js
it('applies only explicitly selected eligible feature codes', () => {
  const result = applyPricingFeatures(
    150,
    [
      { ...night, code: 'night', startTime: null, endTime: null },
      {
        code: 'designated_driver_moto_discount',
        name: 'DD moto adjustment',
        pricingType: 'discount',
        pricingValue: 70,
        priority: 20,
        stackable: true,
      },
    ],
    new Date('2026-10-25T15:00:00Z'),
    ['night'],
  );

  assert.equal(result.fare, 165);
  assert.deepEqual(result.features.map((feature) => feature.code), ['night']);
});

it('treats an explicit empty selection as no selected features', () => {
  const result = applyPricingFeatures(150, [night], new Date('2026-10-25T15:00:00Z'), []);
  assert.equal(result.fare, 150);
  assert.deepEqual(result.features, []);
});

it('preserves automatic feature application when the selection argument is omitted', () => {
  const result = applyPricingFeatures(150, [night], new Date('2026-10-25T09:59:00Z'));
  assert.equal(result.fare, 165);
  assert.deepEqual(result.features.map((feature) => feature.code), ['night']);
});
```

- [ ] **Step 2: Run the test and confirm the explicit-selection cases fail**

Run: `cd functions && npm run build && node --test test/pricingRules.test.mjs`

Expected: TypeScript build succeeds; the new JavaScript tests fail because `applyPricingFeatures` does not yet accept selected feature codes.

- [ ] **Step 3: Implement optional selection filtering**

Add an optional fourth argument and filter by it before applying the existing time, order, and stackability rules:

```ts
export function applyPricingFeatures(
  baseFare: number,
  features: PricingFeature[],
  date: Date,
  selectedFeatureCodes?: readonly string[],
): { fare: number; features: AppliedFeature[] } {
  const selected = selectedFeatureCodes === undefined
    ? null
    : new Set(selectedFeatureCodes);
  const ordered = [...features]
    .filter((feature) => selected === null || selected.has(feature.code))
    .filter((feature) => ['none', 'surcharge', 'discount', 'multiplier'].includes(feature.pricingType))
    // Retain the existing validation, time eligibility, priority, and stacking steps.
```

Keep the current implementation below this filter intact.

- [ ] **Step 4: Run the pricing tests and build**

Run: `cd functions && npm run build && node --test test/pricingRules.test.mjs`

Expected: build succeeds and all pricing-rule tests pass.

- [ ] **Step 5: Commit the isolated pricing-rule change**

```bash
git add functions/src/helpers/pricingRules.ts functions/test/pricingRules.test.mjs
git commit -m "feat: support selected pricing features"
```

### Task 2: Validate selections in the authoritative pricing helper

**Files:**
- Modify: `functions/src/helpers/priceCalculator.ts`
- Modify: `functions/src/helpers/pricingRules.ts`
- Modify: `functions/test/pricingRules.test.mjs`

- [ ] **Step 1: Add failing tests for assigned and eligible feature codes**

Extract a pure validator in `pricingRules.ts` and add these tests:

Import `validateSelectedFeatureCodes` from `../lib/helpers/pricingRules.js` in the existing `createRequire` destructuring next to `isFeatureActiveAt`.

```js
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
```

Use a Managua time that is inside the night window for the accepted case and outside it for the rejected case. Dates in the existing suite use `2026-10-25T09:59:00Z` as an inside-window instant and `2026-10-25T10:00:00Z` as outside.

- [ ] **Step 2: Run the focused tests and confirm validator failures**

Run: `cd functions && npm run build && node --test test/pricingRules.test.mjs`

Expected: the test fails because `validateSelectedFeatureCodes` is not exported yet.

- [ ] **Step 3: Add the validator and extend pricing options**

Implement this contract in `pricingRules.ts`:

```ts
export function validateSelectedFeatureCodes(
  selectedCodes: readonly string[],
  assignedFeatures: readonly PricingFeature[],
  date: Date,
): string[] {
  const assignedByCode = new Map(assignedFeatures.map((feature) => [feature.code, feature]));
  const uniqueCodes = [...new Set(selectedCodes)];
  for (const code of uniqueCodes) {
    const feature = assignedByCode.get(code);
    if (!feature) throw new RangeError(`Selected feature is not assigned: ${code}`);
    if (!isFeatureActiveAt(feature, date)) throw new RangeError(`Selected feature is not eligible: ${code}`);
  }
  return uniqueCodes;
}
```

Add `selectedFeatureCodes?: readonly string[]` to `RidePriceOptions` in `priceCalculator.ts`. When it is defined, validate it against `loadServiceFeatures(service.id)` at the chosen `calculationAt`, then pass the validated set into `applyPricingFeatures`. When it is omitted, preserve current automatic application. Translate `RangeError` at callable/request boundaries to `invalid-argument`.

- [ ] **Step 4: Run pricing tests and build**

Run: `cd functions && npm run build && node --test test/pricingRules.test.mjs`

Expected: all selection, time-window, stacking, commission, and rounding tests pass.

- [ ] **Step 5: Commit the authoritative validation**

```bash
git add functions/src/helpers/priceCalculator.ts functions/src/helpers/pricingRules.ts functions/test/pricingRules.test.mjs
git commit -m "feat: validate selected features in pricing"
```

### Task 3: Return the service feature catalog from `getServices`

**Files:**
- Modify: `functions/src/api/services_sequelize.ts`
- Modify: `Frontend/src/services/servicesService.ts`

- [ ] **Step 1: Add a focused normalization test for returned feature metadata**

Create or extend a test for service normalization to assert the frontend model accepts:

```ts
{
  code: 'night',
  name: 'Night',
  description: 'Night fare',
  pricingType: 'multiplier',
  pricingValue: 1.1,
  startTime: '22:00:00',
  endTime: '04:00:00',
  timezone: 'America/Managua',
  priority: 10,
  stackable: true
}
```

Also assert an absent feature list normalizes to `[]`.

- [ ] **Step 2: Extend `ServiceItem` and normalize camel/snake-case fields**

Define a `ServiceFeatureOption` type in `servicesService.ts` with `code`, `name`, `description`, `pricingType`, `pricingValue`, `startTime`, `endTime`, `timezone`, `startsAt`, `endsAt`, `priority`, and `stackable`. Add `features: ServiceFeatureOption[]` to `ServiceItem` and normalize both server response naming conventions without dropping zero-valued pricing fields.

- [ ] **Step 3: Extend `getServices` with one batched assignment query**

After `serviceRepo.findActive()`, query `service_feature_assignments` through the existing privileged `supabaseGet` helper with the joined feature fields. Filter both assignment and feature `enabled` flags, group by `service_id`, then attach each group to the matching active service. Do not issue one query per service. Preserve service responses if the feature lookup fails by returning an empty feature list and logging the lookup failure; the UI must not invent options.

The response shape per service is:

```ts
features: [{
  code, name, description, pricingType, pricingValue,
  startTime, endTime, timezone, startsAt, endsAt,
  priority, stackable
}]
```

- [ ] **Step 4: Run backend build and catalog normalization tests**

Run: `cd functions && npm run build`

Run the frontend focused Jest test: `cd Frontend && npx jest src/services/tests/servicesService.test.ts --runInBand`

Expected: the callable response remains backward-compatible and feature fields normalize to the typed model. If no service normalization test file exists, create `Frontend/src/services/tests/servicesService.test.ts` using the project's Jest preset.

- [ ] **Step 5: Commit catalog propagation**

```bash
git add functions/src/api/services_sequelize.ts Frontend/src/services/servicesService.ts Frontend/src/services/tests/servicesService.test.ts
git commit -m "feat: return assigned features with ride services"
```

### Task 4: Add frontend feature eligibility, ordering, and default-state tests

**Files:**
- Create: `Frontend/src/utils/rideFeatures.ts`
- Create: `Frontend/src/utils/tests/searchRideFeatures.test.ts`

- [ ] **Step 1: Write failing tests for eligibility and ordering**

Cover these cases:

```ts
expect(getFeatureAvailability(nightFeature, new Date('2026-10-25T09:59:00Z'))).toBe('eligible');
expect(getFeatureAvailability(nightFeature, new Date('2026-10-25T10:00:00Z'))).toBe('condition-disabled');
expect(orderFeaturesBySelection(features, ['discount']).map((item) => item.code))
  .toEqual(['discount', 'night']);
expect(getDefaultSelectedFeatureCodes(features, new Date('2026-10-25T09:59:00Z')))
  .toEqual(['night', 'discount']);
```

Also verify a condition-disabled feature cannot remain in the selected-code result, and that a manually deselected eligible feature moves to the inactive group.

- [ ] **Step 2: Run the new tests to confirm the utility is missing**

Run: `cd Frontend && npx jest src/utils/tests/searchRideFeatures.test.ts --runInBand`

Expected: Jest reports the module or exported functions are missing.

- [ ] **Step 3: Implement a pure feature-state utility**

Implement pure helpers that accept the normalized service feature type:

```ts
type FeatureAvailability = 'eligible' | 'condition-disabled' | 'date-disabled';

export function getFeatureAvailability(feature: ServiceFeatureOption, at: Date): FeatureAvailability;
export function getDefaultSelectedFeatureCodes(features: ServiceFeatureOption[], at: Date): string[];
export function orderFeaturesBySelection(
  features: ServiceFeatureOption[],
  selectedCodes: string[],
): ServiceFeatureOption[];
```

Use `Intl.DateTimeFormat(..., { timeZone: feature.timezone })` for clock windows, including intervals crossing midnight. Apply `startsAt`/`endsAt` instants before the daily window. Preserve feature priority inside each selected/unselected group. Do not use machine-local time for the Managua pricing condition.

- [ ] **Step 4: Run the utility tests**

Run: `cd Frontend && npx jest src/utils/tests/searchRideFeatures.test.ts --runInBand`

Expected: all time-window, date-window, initial-state, and ordering cases pass.

- [ ] **Step 5: Commit the feature-state utility**

```bash
git add Frontend/src/utils/rideFeatures.ts Frontend/src/utils/tests/searchRideFeatures.test.ts
git commit -m "feat: model ride feature selection states"
```

### Task 5: Pass selected feature codes and calculation time through price endpoints

**Files:**
- Modify: `Frontend/src/utils/priceCalculatorCentralize.ts`
- Modify: `functions/src/index.ts`
- Modify: `functions/test/pricingRules.test.mjs`

- [ ] **Step 1: Add endpoint contract tests**

Extend the pricing/helper tests or add a focused endpoint test for:

- An explicit `selectedFeatureCodes: []` producing a fare without feature adjustments.
- A selected assigned and time-eligible feature appearing in `pricingSnapshot.featureCodes`.
- An unknown or condition-ineligible code returning an invalid-argument response.
- Omitting `selectedFeatureCodes` retaining the current auto-feature behavior for older clients.

- [ ] **Step 2: Add options to the frontend request contract**

Add `selectedFeatureCodes?: string[]` and `calculationAt?: string` to frontend `RidePriceOptions` and `BackendPricePayload`. Add the same fields to each `PriceBatchVariant`; serialize a stable ISO timestamp. In `calculateRidePricesBatch`, forward the per-variant code list and timestamp in each variant, and pass them through individual fallback calculations.

- [ ] **Step 3: Add validated fields to single and batch HTTP handlers**

In `calculateRidePriceHttp` and `calculateRidePricesHttp`, accept only an array of strings for an explicitly supplied `selectedFeatureCodes`. Parse `calculationAt` as a valid ISO date and pass it as `calculationAt` to the helper. Pass selected codes into `RidePriceOptions`; map unknown, unassigned, or time-ineligible codes to HTTP 400. Leave the field undefined when omitted so old clients preserve current behavior.

- [ ] **Step 4: Add local fallback parity**

Update `calculateRidePriceFallback` to use the same explicit selection semantics: omitted selection keeps current default auto-application; an explicit array applies only listed codes; an explicit empty array applies none. Use `options.calculationAt ?? new Date()` for date conditions. The local fallback is a display/availability fallback, not an authority for ride creation.

- [ ] **Step 5: Run backend and frontend checks**

Run: `cd functions && npm run build && node --test test/pricingRules.test.mjs`

Run: `cd Frontend && npx tsc --noEmit`

Expected: backend pricing tests pass. Frontend TypeScript reports no new errors; existing `designatedDriverEvidence.test.ts` Jest-global errors are known and unrelated.

- [ ] **Step 6: Commit endpoint propagation**

```bash
git add Frontend/src/utils/priceCalculatorCentralize.ts functions/src/index.ts functions/test/pricingRules.test.mjs
git commit -m "feat: pass selected features to fare endpoints"
```

### Task 6: Thread per-service choices through route recalculation and ride creation

**Files:**
- Modify: `Frontend/src/hooks/client/SearchRideScreen/useRideRouteCalculation.ts`
- Modify: `Frontend/src/hooks/client/SearchRideScreen/useSearchRideSubmission.ts`
- Modify: `Frontend/src/screens/Client/SearchRideScreen.tsx`
- Modify: `functions/src/api/rides_sequelize.ts`
- Modify: `functions/src/scheduled/programmedRides.ts` only if a later scheduled execution recalculates rather than consuming the stored snapshot

- [ ] **Step 1: Add tests for immediate and programmed request payloads**

Add focused tests around a pure request-payload builder or existing submission service to assert that the selected feature codes are included for both immediate and scheduled requests, including `[]` when the user explicitly disables every feature. Assert that a scheduled ride sends its scheduled timestamp rather than the client's current time.

- [ ] **Step 2: Track feature overrides per service**

Add screen-level state keyed by service code. Seed each service from `getDefaultSelectedFeatureCodes`. A toggle updates only that service's override; selecting another service restores its in-session selection. Remove codes that are no longer assigned or eligible before calculation/submission.

- [ ] **Step 3: Recalculate the selected service when its feature selection changes**

Extend `recalcPriceOnly` to receive the selected service's code list and the fare's calculation timestamp. Extend the individual/batch route price variant payloads to carry per-service defaults so option prices and `pricingSnapshot.featureCodes` remain aligned. Use `scheduledAt` when present, otherwise the current time. Keep the existing route-request sequence guard so stale responses cannot overwrite a newer selection.

- [ ] **Step 4: Add selection to the immediate authoritative ride price**

At the `requestRide` authoritative pricing call in `functions/src/api/rides_sequelize.ts`, pass `selectedFeatureCodes` and `calculationAt` from validated request fields. Use the scheduled-ride creation path's existing `new Date(scheduledAt)` for scheduled rides. Store only the codes and adjustments returned by the authoritative `pricingSnapshot`; ignore client-supplied prices and adjustments.

- [ ] **Step 5: Include selected codes in both client submissions**

Add `selectedFeatureCodes` to `requestData` in `useSearchRideSubmission.ts`. Preserve empty arrays. When building a scheduled request, forward the selected codes with the scheduled timestamp so the existing scheduled-ride server flow computes and stores the corresponding authoritative snapshot.

- [ ] **Step 6: Run focused checks**

Run: `cd functions && npm run build && node --test test/pricingRules.test.mjs`

Run: `cd Frontend && npx jest src/utils/tests/searchRideFeatures.test.ts --runInBand && npx tsc --noEmit`

Expected: payload tests confirm both submission paths carry explicit selections; no new TypeScript errors occur.

- [ ] **Step 7: Commit selection-to-request wiring**

```bash
git add Frontend/src/hooks/client/SearchRideScreen/useRideRouteCalculation.ts Frontend/src/hooks/client/SearchRideScreen/useSearchRideSubmission.ts Frontend/src/screens/Client/SearchRideScreen.tsx functions/src/api/rides_sequelize.ts functions/src/scheduled/programmedRides.ts Frontend/src/utils/tests/searchRideFeatures.test.ts
git commit -m "feat: carry feature choices into ride pricing"
```

### Task 7: Render the selected service feature carousel

**Files:**
- Modify: `Frontend/src/components/client/SearchRide/SearchRideVehicleOptions.tsx`
- Modify: `Frontend/src/screens/Client/SearchRideScreen.tsx`
- Modify: `Frontend/src/utils/tests/searchRideFeatures.test.ts`

- [ ] **Step 1: Extend component props with catalog state and selection callback**

Pass the selected option's `features`, selected feature codes, `calculationAt`, and `onToggleFeature(code)` callback. Do not derive feature choices from `priceBreakdown.featureCodes`; that array remains a display of adjustments actually returned by pricing.

- [ ] **Step 2: Add a horizontal feature rail inside the expanded service**

Render a horizontal `ScrollView` only when the selected service has assigned features. Sort active codes first and inactive/condition-disabled codes second, preserving backend priority within each group. Each item shows localized title, pricing impact, condition/time hint, and selected/disabled state. For a condition-disabled item, disable the toggle and explain the condition. For an eligible manually deselected item, keep its toggle available so it can be reactivated.

- [ ] **Step 3: Correct and verify icon-family rendering**

In `RideIcon`, render `<MaterialIcons ... />` in the Material branch rather than recursively rendering `<RideIcon />`. Keep the `iconSet` prop configurable. Add or update tests/manual checks for the `directions-car` and `two-wheeler` glyph mappings in both icon families; retain the user's existing Ionicons mapping change.

- [ ] **Step 4: Add the horizontal rail visual tokens**

In `createStyles` in `SearchRideScreen.tsx`, add compact feature tile styles, 44-point or larger interaction bounds, clear selected/inactive/locked treatments, and spacing that reveals part of the next tile. Keep the established dark/light theme colors and do not add horizontal overflow to the form itself.

- [ ] **Step 5: Add English and Spanish copy**

Add localized names, price impact format labels, “available/unavailable by schedule” messages, and selected/off accessibility labels to the existing `shared.searchRide` dictionaries in `Frontend/src/i18n/index.ts`. Use database name/description as fallback only when no localized code mapping exists.

- [ ] **Step 6: Run UI model tests and typecheck**

Run: `cd Frontend && npx jest src/utils/tests/searchRideFeatures.test.ts --runInBand && npx tsc --noEmit`

Expected: selection ordering and disabled states pass; TypeScript has no new errors.

- [ ] **Step 7: Commit the carousel**

```bash
git add Frontend/src/components/client/SearchRide/SearchRideVehicleOptions.tsx Frontend/src/screens/Client/SearchRideScreen.tsx Frontend/src/i18n/index.ts Frontend/src/utils/tests/searchRideFeatures.test.ts
git commit -m "feat: add service feature selection carousel"
```

### Task 8: Implement the Pro Max summary with always-visible route metrics

**Files:**
- Modify: `Frontend/src/components/client/SearchRide/SearchRideSummary.tsx`
- Modify: `Frontend/src/screens/Client/SearchRideScreen.tsx`
- Modify: `Frontend/src/i18n/index.ts`

- [ ] **Step 1: Preserve and test the summary prop contract**

Pass `estimatedDistance`, `estimatedDuration`, current `estimatedPrice`, selected payment method, availability, suggested price, and comment. Add tests for route text containing both units and a separate availability row; if no component-test library exists, expose a pure route-label formatter and test it with Jest.

- [ ] **Step 2: Recompose the summary**

Render `km` and `min` in a dedicated row with separate non-shrinking values. Place driver availability in its own semantic row so it never squeezes route metrics. Highlight the current estimated fare and payment method compactly, followed by suggested price and comment fields. Keep the service-card estimate synchronized with the same current price.

- [ ] **Step 3: Add loading, error, and no-availability states**

When calculating, show an inline price-pending state without replacing route metrics. On calculation failure, do not label a stale amount as current. Preserve the existing checking/unknown/no-driver/available distinctions and semantic colors.

- [ ] **Step 4: Run frontend checks**

Run: `cd Frontend && npx jest src/utils/tests/searchRideFeatures.test.ts --runInBand && npx tsc --noEmit`

Expected: route metrics remain present in all availability/loading states and no new type errors occur.

- [ ] **Step 5: Commit the summary**

```bash
git add Frontend/src/components/client/SearchRide/SearchRideSummary.tsx Frontend/src/screens/Client/SearchRideScreen.tsx Frontend/src/i18n/index.ts Frontend/src/utils/tests/searchRideFeatures.test.ts
git commit -m "feat: highlight fare and route in ride summary"
```

### Task 9: Verify service, pricing, and presentation edge cases

**Files:**
- Modify tests in: `functions/test/pricingRules.test.mjs`
- Modify tests in: `Frontend/src/utils/tests/searchRideFeatures.test.ts`
- Verify: `Frontend/src/components/client/SearchRide/SearchRideVehicleOptions.tsx`, `Frontend/src/components/client/SearchRide/SearchRideSummary.tsx`, `Frontend/src/screens/Client/SearchRideScreen.tsx`

- [ ] **Step 1: Add boundary coverage**

Verify the `night` interval at 21:59, 22:00, 03:59, and 04:00 Managua time; verify selected empty array, manual disable, service switch restoration, service without features, and a mode switch away from designated moto. Verify stale price responses cannot replace the newest selection.

- [ ] **Step 2: Run backend and frontend test suites**

Run: `cd functions && npm run build && node --test test/pricingRules.test.mjs`

Run: `cd Frontend && npx jest src/utils/tests/searchRideFeatures.test.ts --runInBand`

Run: `cd Frontend && npx tsc --noEmit`

Expected: all new feature tests and backend build pass. Report only the pre-existing `designatedDriverEvidence.test.ts` missing Jest globals if that remains the sole `tsc` failure.

- [ ] **Step 3: Inspect mobile layout and icon variants**

Run the app or Storybook-equivalent available in the project and inspect the expanded panel at a narrow phone width. Verify the horizontal gesture is confined to the feature rail, the next feature peeks into view, km/min remain readable, comment/price inputs remain at least 44 points high, and both Ionicons and MaterialIcons render without recursion or fallback ellipses.

- [ ] **Step 4: Review final diff and commit**

Run: `git diff --check`

Expected: no whitespace errors, no unrelated formatting churn, and no unexpected schema changes. Commit the completed verification fixes with:

```bash
git add \
  Frontend/src/components/client/SearchRide/SearchRideVehicleOptions.tsx \
  Frontend/src/components/client/SearchRide/SearchRideSummary.tsx \
  Frontend/src/screens/Client/SearchRideScreen.tsx \
  Frontend/src/services/servicesService.ts \
  Frontend/src/services/tests/servicesService.test.ts \
  Frontend/src/utils/priceCalculatorCentralize.ts \
  Frontend/src/utils/rideFeatures.ts \
  Frontend/src/utils/tests/searchRideFeatures.test.ts \
  Frontend/src/hooks/client/SearchRideScreen/useRideRouteCalculation.ts \
  Frontend/src/hooks/client/SearchRideScreen/useSearchRideSubmission.ts \
  Frontend/src/i18n/index.ts \
  functions/src/api/services_sequelize.ts \
  functions/src/api/rides_sequelize.ts \
  functions/src/scheduled/programmedRides.ts \
  functions/src/helpers/priceCalculator.ts \
  functions/src/helpers/pricingRules.ts \
  functions/src/index.ts \
  functions/test/pricingRules.test.mjs
git commit -m "test: verify search ride feature selection"
```

## Self-Review

- Spec coverage: catalog delivery, service-specific horizontal rail, active-left/inactive-right order, night time lock, manual overrides, server validation, immediate/scheduled pricing, Pro Max summary, km/min visibility, availability, accessibility, icon families, tests, and no-migration decision each have a task.
- Security: the backend applies only codes that are assigned to the resolved service and eligible at the authoritative calculation time; client prices and adjustment amounts are never trusted.
- Compatibility: omitting selected codes preserves existing behavior for older callers; the new client always sends an explicit array after its selection state is initialized.
- Scheduled rides: the scheduled departure instant is used for time-window eligibility, matching the scheduled flow's existing authoritative price calculation.
- Completeness scan: no unresolved placeholders or vague test-only steps remain. New tests include commands and expected outcomes.
- Type consistency: request field name is `selectedFeatureCodes` from screen state through HTTP and final ride request; persisted pricing uses server-produced `featureCodes` in `pricingSnapshot`.
