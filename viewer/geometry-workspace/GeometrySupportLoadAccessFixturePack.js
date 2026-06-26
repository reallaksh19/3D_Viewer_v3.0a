import { calculateSupportLoadsForPipeInput } from './GeometrySupportLoadFormulaEngine.js?v=20260623-support-load-advanced-profiles-1';

export const SUPPORT_LOAD_ACCESS_FIXTURE_SCHEMA = 'support-load-access-fixture-pack/v1';
export const SUPPORT_LOAD_ACCESS_FIXTURE_VERSION = '20260623-access-fixture-import-1';

const ACCESS_PROFILE = Object.freeze({
  profileId: 'ACCESS_TEMP_WALL_WEIGHTED_V1',
  gravityFactor: 10,
  verticalLoadFactor: 1.1,
  roundMajor: 100,
  roundStep: 50,
  roundMode: 'up'
});

const NPS_OD_LOOKUP = Object.freeze([
  Object.freeze({ nps: 0.5, pipeOdMm: 21.34 }),
  Object.freeze({ nps: 0.75, pipeOdMm: 26.67 }),
  Object.freeze({ nps: 1, pipeOdMm: 33.4 }),
  Object.freeze({ nps: 1.5, pipeOdMm: 48.26 }),
  Object.freeze({ nps: 2, pipeOdMm: 60.325 }),
  Object.freeze({ nps: 3, pipeOdMm: 88.9 }),
  Object.freeze({ nps: 4, pipeOdMm: 114.3 }),
  Object.freeze({ nps: 6, pipeOdMm: 168.275 }),
  Object.freeze({ nps: 8, pipeOdMm: 219.075 }),
  Object.freeze({ nps: 10, pipeOdMm: 273.05 }),
  Object.freeze({ nps: 12, pipeOdMm: 323.85 }),
  Object.freeze({ nps: 14, pipeOdMm: 355.6 }),
  Object.freeze({ nps: 16, pipeOdMm: 406.4 }),
  Object.freeze({ nps: 18, pipeOdMm: 457.2 }),
  Object.freeze({ nps: 20, pipeOdMm: 508 }),
  Object.freeze({ nps: 24, pipeOdMm: 609.6 }),
  Object.freeze({ nps: 30, pipeOdMm: 762 }),
  Object.freeze({ nps: 36, pipeOdMm: 914.4 }),
  Object.freeze({ nps: 42, pipeOdMm: 1066.8 }),
  Object.freeze({ nps: 48, pipeOdMm: 1219.2 })
]);

export const DEFAULT_SUPPORT_LOAD_ACCESS_FIXTURES = Object.freeze([
  Object.freeze({
    fixtureId: 'access-aml-25-sys-001-rev2-nps8',
    source: 'ACCESS_EXPORTED_REFERENCE_ROW',
    jobName: 'AML-25-SYS-001 REV2 _PS UPDATE',
    lineNoInCii: '8"-P25168-61502-01',
    properLineNo: '0-1-',
    input: Object.freeze({
      nps: 8,
      pipeOdMm: 219.075,
      wallThicknessMm: 12.7,
      tempExpC1: 100,
      tempExpC2: 59,
      insulationThicknessMm: 0,
      depSpanMm: 10750,
      autoSpanMm: 10750,
      verticalNSS: 13000,
      minVerticalLoadN: -2700,
      accessMinHoriLoadN: 650,
      accessMinHoriLSLoadN: 8800,
      materialCategory: 'LT',
      insulated: 'No',
      toBeCleaned: 'To be Cleaned',
      remarks: 'Spec Not available'
    }),
    expected: Object.freeze({
      opeVDep: 13000,
      opeVA: 13000,
      roundedGuideHDep: 650,
      roundedGuideHA: 650,
      finalGuideHDep: 3900,
      finalGuideHA: 3900,
      lineStopH: 8800,
      lineStopIdExpression: 'D_MINUS_WT',
      guideControlling: 'THIRTY_PERCENT_OPE_VERTICAL'
    })
  })
]);

function number(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function text(value) { return String(value ?? '').trim(); }

function normalizeKey(value) { return text(value).toLowerCase().replace(/[^a-z0-9]+/g, ''); }

function round3(value) { return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null; }

function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freezeDeep(child)])));
}

function totalKgPerMForVertical({ verticalNSS, spanMm, gravityFactor = 10, verticalLoadFactor = 1.1 }) {
  const v = number(verticalNSS);
  const span = number(spanMm);
  const gravity = number(gravityFactor);
  const factor = number(verticalLoadFactor);
  if (v === null || span === null || span <= 0 || gravity === null || gravity <= 0 || factor === null || factor <= 0) return null;
  return v * 1000 / (span * gravity * factor);
}

function npsOd(nps) {
  const value = number(nps);
  if (value === null) return null;
  const row = NPS_OD_LOOKUP.find(item => Math.abs(item.nps - value) < 0.0001);
  return row?.pipeOdMm ?? null;
}

function splitDelimitedLine(line, delimiter) {
  const output = [];
  let current = '';
  let quoted = false;
  const source = String(line ?? '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      output.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  output.push(current.trim());
  return output;
}

function detectDelimiter(lines) {
  const sample = lines.find(line => text(line));
  if (!sample) return '\t';
  const tabCount = (sample.match(/\t/g) || []).length;
  const commaCount = (sample.match(/,/g) || []).length;
  return tabCount >= commaCount ? '\t' : ',';
}

function getField(row, names) {
  for (const name of names) {
    const normalized = normalizeKey(name);
    if (Object.prototype.hasOwnProperty.call(row, normalized)) return row[normalized];
  }
  return null;
}

function fixtureIdFromRow(row, index) {
  const line = text(getField(row, ['LinenoinCII', 'LineNoInCII', 'Line No in CII', 'lineNo']));
  const nps = text(getField(row, ['NS', 'NPS']));
  return `access-import-${index + 1}-${normalizeKey(line || `nps-${nps || 'unknown'}`)}`;
}

export function parseAccessSupportLoadFixtureText(sourceText, options = {}) {
  const lines = String(sourceText ?? '').split(/\r?\n/).filter(line => text(line));
  if (lines.length < 2) return freezeDeep({ schema: SUPPORT_LOAD_ACCESS_FIXTURE_SCHEMA, version: SUPPORT_LOAD_ACCESS_FIXTURE_VERSION, status: 'EMPTY', fixtures: [], warnings: ['no-tabular-access-fixture-rows'] });
  const delimiter = options.delimiter || detectDelimiter(lines);
  const headers = splitDelimitedLine(lines[0], delimiter).map(normalizeKey);
  const fixtures = [];
  const warnings = [];
  for (let index = 1; index < lines.length; index += 1) {
    const cells = splitDelimitedLine(lines[index], delimiter);
    if (!cells.some(cell => text(cell))) continue;
    const row = {};
    for (let column = 0; column < headers.length; column += 1) row[headers[column] || `col${column}`] = cells[column] ?? '';
    const nps = number(getField(row, ['NPS', 'NS']));
    const pipeOdMm = number(getField(row, ['PipeOD', 'PipeODMm', 'Dia', 'Diameter'])) ?? npsOd(nps);
    const depSpanMm = number(getField(row, ['DEP SPAN', 'DEPSPAN', 'SUPPORTSPAN', 'DEPSpanMm']));
    const verticalNSS = number(getField(row, ['Vertical_N_SS', 'VerticalNSS', 'OPE_V_DEP']));
    const accessMinHoriLoadN = number(getField(row, ['MinHoriLoad', 'RoundedGuideH', 'Rounded_Guide_H']));
    const accessMinHoriLSLoadN = number(getField(row, ['MinHoriLSLoad', 'LineStop_H', 'LineStopH']));
    const missing = [];
    if (nps === null) missing.push('NPS/NS');
    if (pipeOdMm === null) missing.push('PipeOD/Dia');
    if (number(getField(row, ['WALL_THICK', 'WallThickness', 'Wallthickness'])) === null) missing.push('WALL_THICK');
    if (number(getField(row, ['TEMP_EXP_C1', 'TempExpC1'])) === null) missing.push('TEMP_EXP_C1');
    if (depSpanMm === null) missing.push('DEPSpan/SUPPORTSPAN');
    if (verticalNSS === null) missing.push('Vertical_N_SS');
    if (accessMinHoriLoadN === null) missing.push('MinHoriLoad');
    if (accessMinHoriLSLoadN === null) missing.push('MinHoriLSLoad');
    if (missing.length) warnings.push(`row ${index + 1}: missing ${missing.join(', ')}`);
    const fixture = {
      fixtureId: fixtureIdFromRow(row, index),
      source: 'ACCESS_IMPORTED_TABULAR_REFERENCE_ROW',
      jobName: text(getField(row, ['JOBNAME', 'JobName'])),
      lineNoInCii: text(getField(row, ['LinenoinCII', 'LineNoInCII', 'Line No in CII', 'lineNo'])),
      properLineNo: text(getField(row, ['ProperlineNo', 'ProperLineNo', 'Proper line No'])),
      input: {
        nps,
        pipeOdMm,
        wallThicknessMm: number(getField(row, ['WALL_THICK', 'WallThickness', 'Wallthickness'])),
        tempExpC1: number(getField(row, ['TEMP_EXP_C1', 'TempExpC1'])),
        tempExpC2: number(getField(row, ['TEMP_EXP_C2', 'TempExpC2'])),
        insulationThicknessMm: number(getField(row, ['INSUL_THICK', 'InsulThick', 'InsulationThickness'])),
        depSpanMm,
        autoSpanMm: number(getField(row, ['AutoSpan', 'AutoSpanMm'])) ?? depSpanMm,
        verticalNSS,
        minVerticalLoadN: number(getField(row, ['MinVerLoad', 'MinVerticalLoad'])),
        accessMinHoriLoadN,
        accessMinHoriLSLoadN,
        materialCategory: text(getField(row, ['Mat_Category', 'MaterialCategory'])),
        insulated: text(getField(row, ['Insulated'])),
        toBeCleaned: text(getField(row, ['TobeCleaned', 'ToBeCleaned'])),
        remarks: text(getField(row, ['Remarks']))
      },
      expected: {
        opeVDep: verticalNSS,
        opeVA: verticalNSS,
        roundedGuideHDep: accessMinHoriLoadN,
        roundedGuideHA: accessMinHoriLoadN,
        finalGuideHDep: verticalNSS === null ? null : round3(0.3 * verticalNSS),
        finalGuideHA: verticalNSS === null ? null : round3(0.3 * verticalNSS),
        lineStopH: accessMinHoriLSLoadN,
        lineStopIdExpression: 'D_MINUS_WT',
        guideControlling: 'THIRTY_PERCENT_OPE_VERTICAL'
      },
      importAudit: [{ source: 'ACCESS_FIXTURE_IMPORT', field: 'delimiter', value: delimiter === '\t' ? 'tab' : delimiter }]
    };
    fixtures.push(freezeDeep(fixture));
  }
  return freezeDeep({
    schema: SUPPORT_LOAD_ACCESS_FIXTURE_SCHEMA,
    version: SUPPORT_LOAD_ACCESS_FIXTURE_VERSION,
    status: warnings.length ? 'IMPORTED_WITH_WARNINGS' : 'IMPORTED',
    delimiter: delimiter === '\t' ? 'tab' : delimiter,
    fixtureCount: fixtures.length,
    fixtures,
    warnings
  });
}

export function buildLockedPipeInputFromAccessFixture(fixture) {
  const input = fixture?.input || {};
  const nps = number(input.nps ?? input.NS);
  const pipeOdMm = number(input.pipeOdMm ?? input.PipeOD ?? input.Dia) ?? npsOd(nps);
  const wallThicknessMm = number(input.wallThicknessMm ?? input.WALL_THICK);
  const depSpanMm = number(input.depSpanMm ?? input.DEP_SPAN ?? input.SUPPORTSPAN);
  const autoSpanMm = number(input.autoSpanMm ?? depSpanMm);
  const verticalNSS = number(input.verticalNSS ?? input.Vertical_N_SS);
  const totalKgPerM = totalKgPerMForVertical({ verticalNSS, spanMm: depSpanMm });
  const fallbackPipeWtKgPerM = totalKgPerM === null ? null : totalKgPerM * 0.6;
  const unitPipeWtKgPerM = number(input.unitPipeWtKgPerM ?? input.UnitPipewtKgM ?? input['UnitPipewtKg/m']) ?? fallbackPipeWtKgPerM;
  const fallbackFluidWtOpeKgPerM = totalKgPerM === null || unitPipeWtKgPerM === null ? null : totalKgPerM - unitPipeWtKgPerM;
  const fluidWtOpeKgPerM = number(input.fluidWtOpeKgPerM ?? input.FluidwtKgM ?? input['FluidwtKg/m']) ?? fallbackFluidWtOpeKgPerM;
  const fluidWtHydKgPerM = number(input.fluidWtHydKgPerM ?? input.FluidwtHydKgM ?? input['FluidwtHydKg/m']) ?? fluidWtOpeKgPerM;
  const insideDiameterMm = number(input.insideDiameterMm) ?? (pipeOdMm === null || wallThicknessMm === null ? null : round3(pipeOdMm - 2 * wallThicknessMm));
  return freezeDeep({
    schema: 'support-load-input/v1',
    version: SUPPORT_LOAD_ACCESS_FIXTURE_VERSION,
    sourceObjectId: `ACCESS-FIXTURE-${text(fixture?.fixtureId) || text(fixture?.lineNoInCii) || 'ROW'}`,
    identity: {
      lineNo: text(fixture?.lineNoInCii || input.lineNoInCii || input.LinenoinCII),
      branchKey: text(fixture?.properLineNo || input.properLineNo || input.ProperlineNo),
      branchName: '',
      nps,
      pipeOdMm
    },
    pipePhysical: {
      wallThicknessMm,
      insideDiameterMm,
      materialCategory: text(input.materialCategory || input.Mat_Category),
      unitPipeWtKgPerM
    },
    process: {
      tempExpC1: number(input.tempExpC1 ?? input.TEMP_EXP_C1),
      tempExpC2: number(input.tempExpC2 ?? input.TEMP_EXP_C2),
      fluidWtOpeKgPerM,
      fluidWtHydKgPerM
    },
    spans: {
      autoSpanMm,
      depSpanMm,
      autoSpanBySupport: {}
    },
    formulaProfile: { ...ACCESS_PROFILE },
    supportRefs: [],
    readiness: {
      readyForVertical: true,
      readyForOpeVertical: true,
      readyForHydVertical: true,
      readyForGuide: true,
      readyForLineStop: true,
      readyForCalculation: true,
      lockedForCalculation: true,
      calculationGateStatus: 'INPUT_LOCKED',
      missing: [],
      status: 'INPUT_READY'
    },
    audit: [{
      source: 'ACCESS_FIXTURE_PACK',
      field: 'weightSplit',
      value: totalKgPerM === null ? 'unresolved' : 'benchmark-vertical-backsolve-for-regression-only',
      note: 'Fixture conversion reproduces Access exported Vertical_N_SS without becoming runtime hydration or top-up data.'
    }]
  });
}

export function evaluateAccessSupportLoadFixture(fixture) {
  const pipeInput = buildLockedPipeInputFromAccessFixture(fixture);
  const formulaResult = calculateSupportLoadsForPipeInput(pipeInput);
  const calc = formulaResult?.calculatedFields || {};
  const vertical = calc.vertical || {};
  const guide = calc.guide || {};
  const lineStop = calc.lineStop || {};
  const expected = fixture?.expected || {};
  const checks = [];
  const addNear = (field, actual, expectedValue, tolerance = 0.15) => {
    const ok = Number.isFinite(number(actual)) && Number.isFinite(number(expectedValue)) && Math.abs(number(actual) - number(expectedValue)) <= tolerance;
    checks.push({ field, actual, expected: expectedValue, tolerance, status: ok ? 'PASS' : 'FAIL' });
  };
  const addEqual = (field, actual, expectedValue) => {
    const ok = actual === expectedValue;
    checks.push({ field, actual, expected: expectedValue, status: ok ? 'PASS' : 'FAIL' });
  };
  addNear('vertical.opeVDep', vertical.opeVDep, expected.opeVDep);
  addNear('vertical.opeVA', vertical.opeVA, expected.opeVA);
  addEqual('guide.roundedGuideHDep', guide.roundedGuideHDep, expected.roundedGuideHDep);
  addEqual('guide.roundedGuideHA', guide.roundedGuideHA, expected.roundedGuideHA);
  addNear('guide.guideHDep', guide.guideHDep, expected.finalGuideHDep, 0.001);
  addNear('guide.guideHA', guide.guideHA, expected.finalGuideHA, 0.001);
  addEqual('guide.guideDep.controlling', guide.guideDep?.controlling, expected.guideControlling);
  addEqual('lineStop.lineStopH', lineStop.lineStopH, expected.lineStopH);
  addEqual('lineStop.lineStop.idExpression', lineStop.lineStop?.idExpression, expected.lineStopIdExpression);
  const failed = checks.filter(check => check.status !== 'PASS');
  return freezeDeep({
    schema: SUPPORT_LOAD_ACCESS_FIXTURE_SCHEMA,
    version: SUPPORT_LOAD_ACCESS_FIXTURE_VERSION,
    fixtureId: fixture?.fixtureId || null,
    status: failed.length ? 'FAIL' : 'PASS',
    pipeInput,
    formulaResult,
    checks,
    audit: [{
      source: 'ACCESS_FIXTURE_PACK',
      field: 'runtimeMutation',
      value: 'none',
      note: 'Fixture pack validates locked pipe inputs only; it does not mutate workspace inputs or calculated results.'
    }]
  });
}

export function evaluateDefaultAccessSupportLoadFixtures() {
  const results = DEFAULT_SUPPORT_LOAD_ACCESS_FIXTURES.map(evaluateAccessSupportLoadFixture);
  return freezeDeep({
    schema: SUPPORT_LOAD_ACCESS_FIXTURE_SCHEMA,
    version: SUPPORT_LOAD_ACCESS_FIXTURE_VERSION,
    total: results.length,
    passed: results.filter(result => result.status === 'PASS').length,
    failed: results.filter(result => result.status !== 'PASS').length,
    results
  });
}
