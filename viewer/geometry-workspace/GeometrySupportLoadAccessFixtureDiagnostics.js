import { SUPPORT_LOAD_ACCESS_FIXTURE_SCHEMA } from './GeometrySupportLoadAccessFixturePack.js?v=20260623-access-fixture-import-1';
import { evaluateAccessSupportLoadFixtureText } from './GeometrySupportLoadAccessFixtureBatchValidator.js?v=20260623-access-fixture-batch-validator-1';

export const SUPPORT_LOAD_ACCESS_FIXTURE_DIAGNOSTICS_VERSION = '20260623-access-fixture-diagnostics-1';

function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freezeDeep(child)])));
}

function mismatchRows(result) {
  const checks = Array.isArray(result?.checks) ? result.checks : [];
  return checks
    .filter(check => check?.status !== 'PASS')
    .map(check => Object.freeze({
      fixtureId: result?.fixtureId || null,
      field: check.field || null,
      actual: check.actual ?? null,
      expected: check.expected ?? null,
      tolerance: check.tolerance ?? null,
      status: check.status || 'FAIL'
    }));
}

export function buildAccessSupportLoadFixtureDiagnostics(validation) {
  const results = Array.isArray(validation?.results) ? validation.results : [];
  const mismatches = results.flatMap(mismatchRows);
  const rows = results.map(result => Object.freeze({
    fixtureId: result.fixtureId || null,
    status: result.status || 'UNKNOWN',
    lineNo: result.pipeInput?.identity?.lineNo || null,
    nps: result.pipeInput?.identity?.nps ?? null,
    pipeOdMm: result.pipeInput?.identity?.pipeOdMm ?? null,
    wallThicknessMm: result.pipeInput?.pipePhysical?.wallThicknessMm ?? null,
    tempExpC1: result.pipeInput?.process?.tempExpC1 ?? null,
    depSpanMm: result.pipeInput?.spans?.depSpanMm ?? null,
    opeVDep: result.formulaResult?.calculatedFields?.vertical?.opeVDep ?? null,
    roundedGuideHDep: result.formulaResult?.calculatedFields?.guide?.roundedGuideHDep ?? null,
    guideHDep: result.formulaResult?.calculatedFields?.guide?.guideHDep ?? null,
    lineStopH: result.formulaResult?.calculatedFields?.lineStop?.lineStopH ?? null,
    failedChecks: mismatchRows(result).length
  }));

  return freezeDeep({
    schema: SUPPORT_LOAD_ACCESS_FIXTURE_SCHEMA,
    version: SUPPORT_LOAD_ACCESS_FIXTURE_DIAGNOSTICS_VERSION,
    status: mismatches.length ? 'FAIL' : 'PASS',
    total: rows.length,
    passed: rows.filter(row => row.status === 'PASS').length,
    failed: rows.filter(row => row.status !== 'PASS').length,
    mismatchCount: mismatches.length,
    rows,
    mismatches,
    audit: [{
      source: 'ACCESS_FIXTURE_DIAGNOSTICS',
      field: 'scope',
      value: 'regression-fixture-only',
      note: 'Diagnostics are derived from fixture validation output only and do not hydrate runtime support-load inputs.'
    }]
  });
}

export function buildAccessSupportLoadFixtureDiagnosticsFromText(sourceText, options = {}) {
  const validation = evaluateAccessSupportLoadFixtureText(sourceText, options);
  const diagnostics = buildAccessSupportLoadFixtureDiagnostics(validation);
  return freezeDeep({
    ...diagnostics,
    importStatus: validation.importStatus,
    delimiter: validation.delimiter,
    importWarnings: validation.importWarnings || []
  });
}
