import { DEFAULT_SUPPORT_LOAD_ACCESS_FIXTURES, SUPPORT_LOAD_ACCESS_FIXTURE_SCHEMA } from './GeometrySupportLoadAccessFixturePack.js?v=20260623-access-fixture-import-1';
import { buildAccessSupportLoadFixtureCoverage } from './GeometrySupportLoadAccessFixtureCoverage.js?v=20260623-access-fixture-coverage-2';

export const SUPPORT_LOAD_ACCESS_FIXTURE_INTAKE_COMPLETION_VERSION = '20260623-access-fixture-intake-completion-1';

export const SUPPORT_LOAD_ACCESS_FIXTURE_COMPLETION_COLUMNS = Object.freeze([
  'JOBNAME', 'LinenoinCII', 'ProperlineNo', 'INSUL_THICK', 'NS', 'PipeOD', 'DEP_SPAN', 'Vertical_N_SS',
  'WALL_THICK', 'TEMP_EXP_C1', 'TEMP_EXP_C2', 'MinVerLoad', 'MinHoriLoad', 'MinHoriLSLoad',
  'TobeCleaned', 'Remarks', 'Insulated', 'Mat_Category'
]);

export const SUPPORT_LOAD_ACCESS_FIXTURE_REQUIRED_ACCESS_COLUMNS = Object.freeze([
  'LinenoinCII', 'WALL_THICK', 'TEMP_EXP_C1', 'MinHoriLoad', 'MinHoriLSLoad'
]);

export const SUPPORT_LOAD_ACCESS_FIXTURE_PREFILLED_REFERENCE_COLUMNS = Object.freeze([
  'NS', 'PipeOD', 'DEP_SPAN', 'Vertical_N_SS'
]);

const SPAN_REFERENCE_ROWS = Object.freeze([
  Object.freeze({ nps: 0.5, pipeOdMm: 21.34, depSpanMm: 900, verticalNSS: 3200 }),
  Object.freeze({ nps: 0.75, pipeOdMm: 26.67, depSpanMm: 1400, verticalNSS: 3050 }),
  Object.freeze({ nps: 1, pipeOdMm: 33.4, depSpanMm: 2200, verticalNSS: 3450 }),
  Object.freeze({ nps: 1.5, pipeOdMm: 48.26, depSpanMm: 2800, verticalNSS: 2100 }),
  Object.freeze({ nps: 2, pipeOdMm: 60.325, depSpanMm: 2800, verticalNSS: 1850 }),
  Object.freeze({ nps: 3, pipeOdMm: 88.9, depSpanMm: 6400, verticalNSS: 8750 }),
  Object.freeze({ nps: 4, pipeOdMm: 114.3, depSpanMm: 6400, verticalNSS: 7700 }),
  Object.freeze({ nps: 6, pipeOdMm: 168.275, depSpanMm: 9400, verticalNSS: 7200 }),
  Object.freeze({ nps: 8, pipeOdMm: 219.075, depSpanMm: 10750, verticalNSS: 13000 }),
  Object.freeze({ nps: 10, pipeOdMm: 273.05, depSpanMm: 10750, verticalNSS: 15200 }),
  Object.freeze({ nps: 12, pipeOdMm: 323.85, depSpanMm: 10750, verticalNSS: 23500 }),
  Object.freeze({ nps: 14, pipeOdMm: 355.6, depSpanMm: 10750, verticalNSS: 29000 }),
  Object.freeze({ nps: 16, pipeOdMm: 406.4, depSpanMm: 11000, verticalNSS: 31000 }),
  Object.freeze({ nps: 18, pipeOdMm: 457.2, depSpanMm: 11000, verticalNSS: 34500 }),
  Object.freeze({ nps: 20, pipeOdMm: 508, depSpanMm: 11500, verticalNSS: 50500 }),
  Object.freeze({ nps: 24, pipeOdMm: 609.6, depSpanMm: 12000, verticalNSS: 68000 }),
  Object.freeze({ nps: 30, pipeOdMm: 762, depSpanMm: 14000, verticalNSS: 140000 }),
  Object.freeze({ nps: 36, pipeOdMm: 914.4, depSpanMm: 16000, verticalNSS: 195000 }),
  Object.freeze({ nps: 42, pipeOdMm: 1066.8, depSpanMm: 18000, verticalNSS: 170000 }),
  Object.freeze({ nps: 48, pipeOdMm: 1219.2, depSpanMm: 20000, verticalNSS: 145000 })
]);

function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freezeDeep(child)])));
}

function tsvCell(value) {
  const text = String(value ?? '');
  return /["\t\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toTsv(rows) {
  return [
    SUPPORT_LOAD_ACCESS_FIXTURE_COMPLETION_COLUMNS.join('\t'),
    ...rows.map(row => SUPPORT_LOAD_ACCESS_FIXTURE_COMPLETION_COLUMNS.map(column => tsvCell(row[column])).join('\t'))
  ].join('\n');
}

function npsKey(value) { return String(Number(value)); }

function makeCompletionRow(reference, options = {}) {
  return Object.freeze({
    JOBNAME: options.jobName || '',
    LinenoinCII: '',
    ProperlineNo: '',
    INSUL_THICK: '',
    NS: reference.nps,
    PipeOD: reference.pipeOdMm,
    DEP_SPAN: reference.depSpanMm,
    Vertical_N_SS: reference.verticalNSS,
    WALL_THICK: '',
    TEMP_EXP_C1: '',
    TEMP_EXP_C2: '',
    MinVerLoad: '',
    MinHoriLoad: '',
    MinHoriLSLoad: '',
    TobeCleaned: '',
    Remarks: 'Paste real MS Access exported fixture values for blank columns only',
    Insulated: '',
    Mat_Category: ''
  });
}

export function buildAccessSupportLoadFixtureIntakeCompletion(fixtures = DEFAULT_SUPPORT_LOAD_ACCESS_FIXTURES, options = {}) {
  const coverage = buildAccessSupportLoadFixtureCoverage(fixtures, options.masterData || {});
  const covered = new Set((coverage.coveredNps || []).map(npsKey));
  const rows = SPAN_REFERENCE_ROWS
    .filter(reference => !covered.has(npsKey(reference.nps)))
    .map(reference => makeCompletionRow(reference, options));
  return freezeDeep({
    schema: SUPPORT_LOAD_ACCESS_FIXTURE_SCHEMA,
    version: SUPPORT_LOAD_ACCESS_FIXTURE_INTAKE_COMPLETION_VERSION,
    status: rows.length ? 'PENDING_REAL_ACCESS_EXPORT_ROWS' : 'COMPLETE',
    fixtureCount: coverage.fixtureCount,
    coveredNps: coverage.coveredNps,
    pendingNps: rows.map(row => row.NS),
    pendingRowCount: rows.length,
    prefilledReferenceColumns: SUPPORT_LOAD_ACCESS_FIXTURE_PREFILLED_REFERENCE_COLUMNS,
    requiredAccessExportColumns: SUPPORT_LOAD_ACCESS_FIXTURE_REQUIRED_ACCESS_COLUMNS,
    rows,
    tsv: toTsv(rows),
    audit: [{
      source: 'ACCESS_FIXTURE_INTAKE_COMPLETION',
      field: 'scope',
      value: 'regression-fixture-intake-only',
      note: 'Prefilled values come from the approved NPS/OD/DEPSpan/Vertical_N_SS matrix. Blank Access result fields must be supplied from real MS Access exports; this module is not used by runtime hydration or formula calculation.'
    }]
  });
}

export function getAccessFixtureSpanReferenceRows() {
  return SPAN_REFERENCE_ROWS;
}
