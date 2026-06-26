import {
  DEFAULT_SUPPORT_LOAD_ACCESS_FIXTURES,
  parseAccessSupportLoadFixtureText,
  SUPPORT_LOAD_ACCESS_FIXTURE_SCHEMA
} from './GeometrySupportLoadAccessFixturePack.js?v=20260623-access-fixture-import-1';
import { normalizeSupportLoadMasterDataPackage } from './GeometrySupportLoadMasterData.js?v=20260623-support-load-master-data-1';

export const SUPPORT_LOAD_ACCESS_FIXTURE_COVERAGE_VERSION = '20260623-access-fixture-coverage-2';

export const SUPPORT_LOAD_ACCESS_FIXTURE_INTAKE_COLUMNS = Object.freeze([
  'JOBNAME',
  'LinenoinCII',
  'ProperlineNo',
  'INSUL_THICK',
  'NS',
  'PipeOD',
  'DEP_SPAN',
  'Vertical_N_SS',
  'WALL_THICK',
  'TEMP_EXP_C1',
  'TEMP_EXP_C2',
  'MinVerLoad',
  'MinHoriLoad',
  'MinHoriLSLoad',
  'TobeCleaned',
  'Remarks',
  'Insulated',
  'Mat_Category'
]);

function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freezeDeep(child)])));
}

function number(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function npsKey(value) {
  const n = number(value);
  return n === null ? 'unknown' : String(n);
}

function fixtureNps(fixture) {
  return number(fixture?.input?.nps ?? fixture?.input?.NS);
}

function fixtureLineNo(fixture) {
  return String(fixture?.lineNoInCii || fixture?.input?.lineNoInCii || fixture?.fixtureId || '').trim();
}

function summarizeFixtureRows(fixtures = []) {
  const rows = Array.isArray(fixtures) ? fixtures : [];
  const byNps = new Map();
  for (const fixture of rows) {
    const nps = fixtureNps(fixture);
    const key = npsKey(nps);
    const current = byNps.get(key) || { nps, fixtureCount: 0, fixtureIds: [], lineNos: [] };
    current.fixtureCount += 1;
    if (fixture?.fixtureId) current.fixtureIds.push(fixture.fixtureId);
    const lineNo = fixtureLineNo(fixture);
    if (lineNo) current.lineNos.push(lineNo);
    byNps.set(key, current);
  }
  return byNps;
}

function tsvCell(value) {
  const text = String(value ?? '');
  return /["\t\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function tsvRows(rows) {
  return [SUPPORT_LOAD_ACCESS_FIXTURE_INTAKE_COLUMNS.join('\t'), ...rows.map(row => SUPPORT_LOAD_ACCESS_FIXTURE_INTAKE_COLUMNS.map(column => tsvCell(row[column])).join('\t'))].join('\n');
}

function templateRow(row, options = {}) {
  return Object.freeze({
    JOBNAME: options.jobName || '',
    LinenoinCII: '',
    ProperlineNo: '',
    INSUL_THICK: '',
    NS: row.nps ?? '',
    PipeOD: row.pipeOdMm ?? '',
    DEP_SPAN: row.depSpanMm ?? '',
    Vertical_N_SS: '',
    WALL_THICK: '',
    TEMP_EXP_C1: '',
    TEMP_EXP_C2: '',
    MinVerLoad: '',
    MinHoriLoad: '',
    MinHoriLSLoad: '',
    TobeCleaned: '',
    Remarks: 'Access fixture required for this DEP span/NPS row',
    Insulated: '',
    Mat_Category: ''
  });
}

export function buildAccessSupportLoadFixtureCoverage(fixtures = DEFAULT_SUPPORT_LOAD_ACCESS_FIXTURES, masterData = {}) {
  const normalizedMaster = normalizeSupportLoadMasterDataPackage(masterData);
  const fixtureRows = Array.isArray(fixtures) ? fixtures : [];
  const grouped = summarizeFixtureRows(fixtureRows);
  const coverageRows = (normalizedMaster.depSpanRows || []).map(row => {
    const key = npsKey(row.nps);
    const coverage = grouped.get(key);
    return Object.freeze({
      nps: row.nps ?? null,
      pipeOdMm: row.pipeOdMm ?? null,
      depSpanMm: row.depSpanMm ?? null,
      covered: Boolean(coverage && coverage.fixtureCount > 0),
      fixtureCount: coverage?.fixtureCount || 0,
      fixtureIds: Object.freeze([...(coverage?.fixtureIds || [])]),
      lineNos: Object.freeze([...(coverage?.lineNos || [])])
    });
  });
  const coveredRows = coverageRows.filter(row => row.covered);
  const missingRows = coverageRows.filter(row => !row.covered);
  const unknownFixtureRows = fixtureRows
    .filter(fixture => !coverageRows.some(row => String(row.nps) === npsKey(fixtureNps(fixture))))
    .map(fixture => Object.freeze({ fixtureId: fixture?.fixtureId || null, nps: fixtureNps(fixture), lineNo: fixtureLineNo(fixture) || null }));
  const coveragePercent = coverageRows.length ? Math.round((coveredRows.length / coverageRows.length) * 1000) / 10 : 0;
  const status = fixtureRows.length === 0
    ? 'EMPTY'
    : missingRows.length === 0 && unknownFixtureRows.length === 0
      ? 'COMPLETE'
      : 'PARTIAL';
  return freezeDeep({
    schema: SUPPORT_LOAD_ACCESS_FIXTURE_SCHEMA,
    version: SUPPORT_LOAD_ACCESS_FIXTURE_COVERAGE_VERSION,
    status,
    fixtureCount: fixtureRows.length,
    depSpanRowCount: coverageRows.length,
    coveredNpsCount: coveredRows.length,
    missingNpsCount: missingRows.length,
    unknownFixtureNpsCount: unknownFixtureRows.length,
    coveragePercent,
    coveredNps: coveredRows.map(row => row.nps),
    missingNps: missingRows.map(row => row.nps),
    rows: coverageRows,
    unknownFixtureRows,
    audit: [{
      source: 'ACCESS_FIXTURE_COVERAGE',
      field: 'scope',
      value: 'regression-fixture-only',
      note: 'Coverage summarizes Access regression fixture breadth against DEP span master rows only; it does not hydrate runtime inputs or write calculated fields.'
    }]
  });
}

export function buildDefaultAccessSupportLoadFixtureCoverage(masterData = {}) {
  return buildAccessSupportLoadFixtureCoverage(DEFAULT_SUPPORT_LOAD_ACCESS_FIXTURES, masterData);
}

export function buildAccessSupportLoadFixtureCoverageFromText(sourceText, options = {}) {
  const imported = parseAccessSupportLoadFixtureText(sourceText, options);
  const coverage = buildAccessSupportLoadFixtureCoverage(imported.fixtures || [], options.masterData || {});
  return freezeDeep({
    ...coverage,
    importStatus: imported.status,
    delimiter: imported.delimiter,
    importWarnings: imported.warnings || []
  });
}

export function buildAccessSupportLoadFixtureIntakeTemplate(fixtures = DEFAULT_SUPPORT_LOAD_ACCESS_FIXTURES, masterData = {}, options = {}) {
  const coverage = buildAccessSupportLoadFixtureCoverage(fixtures, masterData);
  const limit = Number.isFinite(Number(options.limit)) && Number(options.limit) > 0 ? Number(options.limit) : null;
  const missingRows = (coverage.rows || []).filter(row => !row.covered);
  const selected = limit ? missingRows.slice(0, limit) : missingRows;
  const rows = selected.map(row => templateRow(row, options));
  return freezeDeep({
    schema: SUPPORT_LOAD_ACCESS_FIXTURE_SCHEMA,
    version: SUPPORT_LOAD_ACCESS_FIXTURE_COVERAGE_VERSION,
    status: rows.length ? 'TEMPLATE_READY' : 'NO_MISSING_FIXTURES',
    sourceCoverageStatus: coverage.status,
    missingNpsCount: coverage.missingNpsCount,
    templateRowCount: rows.length,
    columns: SUPPORT_LOAD_ACCESS_FIXTURE_INTAKE_COLUMNS,
    rows,
    tsv: tsvRows(rows),
    audit: [{
      source: 'ACCESS_FIXTURE_INTAKE_TEMPLATE',
      field: 'scope',
      value: 'regression-fixture-only',
      note: 'Template rows identify Access-export fixture gaps only; they are not runtime hydration data and do not top up support-load inputs.'
    }]
  });
}

export function buildAccessSupportLoadFixtureIntakeTemplateFromText(sourceText, options = {}) {
  const imported = parseAccessSupportLoadFixtureText(sourceText, options);
  const template = buildAccessSupportLoadFixtureIntakeTemplate(imported.fixtures || [], options.masterData || {}, options);
  return freezeDeep({
    ...template,
    importStatus: imported.status,
    delimiter: imported.delimiter,
    importWarnings: imported.warnings || []
  });
}
