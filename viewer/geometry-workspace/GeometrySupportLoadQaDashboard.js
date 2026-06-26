export const SUPPORT_LOAD_QA_DASHBOARD_SCHEMA = 'support-load-qa-dashboard/v1';
export const SUPPORT_LOAD_QA_DASHBOARD_VERSION = '20260623-support-load-qa-dashboard-1';
export const SUPPORT_LOAD_QA_DASHBOARD_MODULE_ID = 'support-load-qa-dashboard/v1';

function count(items, predicate) { return (Array.isArray(items) ? items : []).filter(predicate).length; }
function arr(value) { return Array.isArray(value) ? value : []; }
function num(value) { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }
function statusRank(status) {
  const s = String(status || '').toUpperCase();
  if (s.includes('BLOCK') || s.includes('REVIEW_REQUIRED') || s.includes('CONFLICT')) return 3;
  if (s.includes('PARTIAL') || s.includes('WARNING')) return 2;
  if (s.includes('READY') || s.includes('CALCULATED') || s.includes('NO_CONFLICT')) return 1;
  return 0;
}
function worstStatus(statuses) {
  const ordered = arr(statuses).slice().sort((a, b) => statusRank(b) - statusRank(a));
  return ordered[0] || 'EMPTY';
}
function inputSummary(inputModel = {}) {
  const pipes = arr(inputModel.pipeInputs);
  return Object.freeze({
    schema: 'support-load-qa-input-summary/v1',
    status: inputModel.status || (pipes.length ? 'INPUT_MODEL_PRESENT' : 'MISSING_INPUT_MODEL'),
    pipeInputCount: num(inputModel.pipeCandidateCount) || pipes.length,
    readyCount: num(inputModel.pipeInputReadyCount) || count(pipes, pipe => pipe?.readiness?.status === 'INPUT_READY'),
    partialCount: num(inputModel.pipeInputPartialCount) || count(pipes, pipe => pipe?.readiness?.status === 'PARTIAL_INPUT'),
    blockedCount: num(inputModel.pipeInputBlockedCount) || count(pipes, pipe => pipe?.readiness?.status === 'BLOCKED'),
    overrideCount: num(inputModel.inputOverrideCount) || count(pipes, pipe => Object.keys(pipe?.inputOverrides?.overrides || {}).length),
    lockedCount: num(inputModel.inputLockedCount) || count(pipes, pipe => pipe?.inputReview?.locked === true),
    calcReadyCount: num(inputModel.calcReadyPipeInputCount) || count(pipes, pipe => pipe?.readiness?.readyForCalculation === true),
    missingFieldCount: pipes.reduce((sum, pipe) => sum + arr(pipe?.readiness?.missing).length, 0),
    autoSpanResolvedCount: num(inputModel.autoSpanSummary?.autoResolvedCount)
  });
}
function conflictSummary(conflictModel = {}) {
  return Object.freeze({
    schema: 'support-load-qa-conflict-summary/v1',
    status: conflictModel.status || 'NOT_RUN',
    pipeCount: num(conflictModel.pipeCount),
    conflictCount: num(conflictModel.conflictCount),
    highSeverityCount: num(conflictModel.highSeverityCount)
  });
}
function calculationSummary(formulaResults = {}) {
  const rows = arr(formulaResults.pipeResults);
  return Object.freeze({
    schema: 'support-load-qa-calculation-summary/v1',
    status: formulaResults.status || (rows.length ? 'FORMULA_RESULTS_PRESENT' : 'NOT_RUN'),
    pipeInputCount: num(formulaResults.pipeInputCount) || rows.length,
    calculatedPipeCount: num(formulaResults.calculatedPipeCount) || count(rows, row => row.status === 'CALCULATED'),
    blockedPipeCount: num(formulaResults.blockedPipeCount) || count(rows, row => row.status === 'BLOCKED'),
    supportResultCount: num(formulaResults.supportResultCount) || arr(formulaResults.supportRows).length,
    inputMutationCount: num(formulaResults.writebackAudit?.inputPackageMutatedCount),
    staleClearedCount: num(formulaResults.writebackAudit?.stalePipeResultClearedCount) + num(formulaResults.writebackAudit?.staleSupportReferenceClearedCount)
  });
}
function reportSummary(reportModel = {}) {
  return Object.freeze({
    schema: 'support-load-qa-report-summary/v1',
    status: reportModel.status || (reportModel.schema ? 'REPORT_READY' : 'NOT_RUN'),
    pipeRowCount: num(reportModel.pipeRowCount) || arr(reportModel.pipeRows).length,
    supportRowCount: num(reportModel.supportRowCount) || arr(reportModel.supportRows).length
  });
}
function nextActions(input, conflicts, calc) {
  const actions = [];
  if (!input.pipeInputCount) actions.push('Run LOAD → Inputs to hydrate pipe.attributes.supportLoadInput.');
  if (input.missingFieldCount) actions.push('Resolve missing input fields in LOAD → Inputs or LOAD → Masters.');
  if (conflicts.status === 'NOT_RUN') actions.push('Run LOAD → Conflicts before recalculation.');
  if (conflicts.conflictCount) actions.push('Review source conflicts before locking/recalculation.');
  if (!input.calcReadyCount) actions.push('Lock reviewed ready pipe inputs before formula execution.');
  if (input.calcReadyCount && calc.status === 'NOT_RUN') actions.push('Run LOAD → Calc on locked pipe inputs.');
  if (calc.blockedPipeCount) actions.push('Clear blocked formula rows by resolving readiness conflicts/missing fields.');
  if (calc.inputMutationCount) actions.push('Investigate writeback audit: calculated writeback must not mutate input packages.');
  return Object.freeze(actions);
}
export function buildSupportLoadQaDashboardModel({ inputModel = null, conflictModel = null, formulaResults = null, reportModel = null } = {}, options = {}) {
  const input = inputSummary(inputModel || {});
  const conflicts = conflictSummary(conflictModel || {});
  const calculation = calculationSummary(formulaResults || {});
  const report = reportSummary(reportModel || {});
  const actions = nextActions(input, conflicts, calculation);
  const status = actions.length ? worstStatus([input.status, conflicts.status, calculation.status, report.status, 'REVIEW_REQUIRED']) : 'QA_READY';
  return Object.freeze({
    schema: SUPPORT_LOAD_QA_DASHBOARD_SCHEMA,
    version: SUPPORT_LOAD_QA_DASHBOARD_VERSION,
    moduleId: SUPPORT_LOAD_QA_DASHBOARD_MODULE_ID,
    evaluatedAt: options.evaluatedAt || new Date().toISOString(),
    status,
    input,
    conflicts,
    calculation,
    report,
    nextActions: actions,
    policy: Object.freeze({
      noSilentTopUp: true,
      noFormulaExecution: true,
      noCalculatedFieldMutation: true,
      readsOnlyWorkspaceModels: true
    })
  });
}
