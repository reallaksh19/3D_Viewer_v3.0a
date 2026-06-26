import { buildSupportLoadQaDashboardModel } from '../geometry-workspace/GeometrySupportLoadQaDashboard.js';

let passed = 0;
let failed = 0;
function check(condition, label) {
  if (condition) { console.log(`PASS: ${label}`); passed += 1; }
  else { console.error(`FAIL: ${label}`); failed += 1; }
}

const inputModel = {
  status: 'BLOCKED',
  pipeCandidateCount: 3,
  pipeInputReadyCount: 1,
  pipeInputPartialCount: 1,
  pipeInputBlockedCount: 1,
  inputOverrideCount: 2,
  inputLockedCount: 1,
  calcReadyPipeInputCount: 1,
  autoSpanSummary: { autoResolvedCount: 2 },
  pipeInputs: [
    { readiness: { missing: [] }, inputReview: { locked: true } },
    { readiness: { missing: ['process.fluidWtOpeKgPerM', 'spans.autoSpanMm or spans.depSpanMm'] } }
  ]
};
const conflictModel = {
  status: 'REVIEW_REQUIRED',
  pipeCount: 3,
  conflictCount: 2,
  highSeverityCount: 1
};
const formulaResults = {
  status: 'PARTIAL_CALCULATION',
  pipeInputCount: 3,
  calculatedPipeCount: 1,
  blockedPipeCount: 2,
  supportResultCount: 4,
  writebackAudit: {
    inputPackageMutatedCount: 0,
    stalePipeResultClearedCount: 1,
    staleSupportReferenceClearedCount: 1
  }
};
const reportModel = {
  status: 'REPORT_READY',
  pipeRowCount: 1,
  supportRowCount: 4
};

const dashboard = buildSupportLoadQaDashboardModel({ inputModel, conflictModel, formulaResults, reportModel }, { evaluatedAt: '2026-06-23T00:00:00.000Z' });
const json = JSON.stringify(dashboard);

check(dashboard.schema === 'support-load-qa-dashboard/v1', 'QA dashboard schema is stable');
check(dashboard.input.pipeInputCount === 3, 'QA dashboard summarizes pipe input count');
check(dashboard.input.lockedCount === 1, 'QA dashboard summarizes locked input count');
check(dashboard.input.missingFieldCount === 2, 'QA dashboard counts missing input fields');
check(dashboard.conflicts.conflictCount === 2, 'QA dashboard summarizes conflict count');
check(dashboard.conflicts.highSeverityCount === 1, 'QA dashboard summarizes high severity conflicts');
check(dashboard.calculation.calculatedPipeCount === 1, 'QA dashboard summarizes calculated pipe rows');
check(dashboard.calculation.blockedPipeCount === 2, 'QA dashboard summarizes blocked calculation rows');
check(dashboard.calculation.inputMutationCount === 0, 'QA dashboard exposes input mutation count');
check(dashboard.nextActions.some(action => action.includes('Review source conflicts')), 'QA dashboard recommends conflict review');
check(dashboard.policy.noFormulaExecution === true, 'QA dashboard does not execute formulas');
check(dashboard.policy.noCalculatedFieldMutation === true, 'QA dashboard does not mutate calculated fields');
check(!json.includes('calculatedFields.supportLoads'), 'QA dashboard does not write support-load result fields');

if (failed) {
  console.error(`FAILED ${failed} checks, passed ${passed}`);
  process.exit(1);
}
console.log(`All support load QA dashboard checks passed (${passed}).`);
