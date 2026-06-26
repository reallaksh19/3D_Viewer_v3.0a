import assert from 'node:assert/strict';

import {
  SUPPORT_OVERLAY_FILTER_DIAGNOSTICS_SCHEMA,
  buildSupportOverlayFilterPlan,
  isSupportFamilyEnabled,
  normalizeSupportFamily,
  normalizeSupportOverlayFilters,
} from '../overlays/support/SupportOverlayFilterDiagnostics.js';

assert.equal(SUPPORT_OVERLAY_FILTER_DIAGNOSTICS_SCHEMA, 'support-overlay-filter-diagnostics/v1');
assert.equal(normalizeSupportFamily('spring'), 'SPRING_CAN');
assert.equal(normalizeSupportFamily('line stop'), 'LINESTOP');
assert.equal(normalizeSupportFamily('not-a-family'), 'UNKNOWN');

const filters = normalizeSupportOverlayFilters({ GUIDE: false, SPRING: false, LIM: true });
assert.equal(filters.GUIDE, false);
assert.equal(filters.SPRING_CAN, false);
assert.equal(filters.LIM, true);
assert.equal(isSupportFamilyEnabled({ filters }, 'GUIDE'), false);
assert.equal(isSupportFamilyEnabled({ filters }, 'SPRING_CAN'), false);
assert.equal(isSupportFamilyEnabled({ filters }, 'REST'), true);

const records = [
  { tag: 'PS-REST', kind: 'REST' },
  { tag: 'PS-GUIDE', kind: 'GUIDE' },
  { tag: 'PS-LIM', kind: 'LIM' },
  { tag: 'PS-SPRING', kind: 'SPRING_CAN' },
  { tag: 'PS-UNKNOWN', kind: 'UNKNOWN' },
];

const plan = buildSupportOverlayFilterPlan(records, { filters });
assert.equal(plan.schema, SUPPORT_OVERLAY_FILTER_DIAGNOSTICS_SCHEMA);
assert.equal(plan.totalRecords, 5);
assert.equal(plan.acceptedCount, 3);
assert.equal(plan.filteredOut, 2);
assert.deepEqual(plan.disabledFamilies, ['GUIDE', 'SPRING_CAN']);
assert.deepEqual(plan.filteredByFamily, { GUIDE: 1, SPRING_CAN: 1 });
assert.equal(plan.sourceByFamily.REST, 1);
assert.equal(plan.sourceByFamily.GUIDE, 1);
assert.equal(plan.sourceByFamily.LIM, 1);
assert.equal(plan.filtersApplied, true);
assert.deepEqual(plan.acceptedRecords.map((record) => record.tag), ['PS-REST', 'PS-LIM', 'PS-UNKNOWN']);
assert.deepEqual(plan.filteredRecords.map((record) => record.reason), ['family-filter-disabled', 'family-filter-disabled']);

const defaultPlan = buildSupportOverlayFilterPlan(records, {});
assert.equal(defaultPlan.filteredOut, 0);
assert.equal(defaultPlan.acceptedCount, 5);
assert.equal(defaultPlan.filtersApplied, false);

console.log('non-primitive support filter diagnostics tests passed');
