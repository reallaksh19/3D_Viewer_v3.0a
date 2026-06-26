import { buildDefaultSupportLoadMasterData } from '../geometry-workspace/GeometrySupportLoadMasterData.js';
import { calculateSupportLoadsForPipeInput } from '../geometry-workspace/GeometrySupportLoadFormulaEngine.js';

let passed = 0;
let failed = 0;
function check(condition, label) {
  if (condition) {
    console.log(`PASS: ${label}`);
    passed += 1;
  } else {
    console.error(`FAIL: ${label}`);
    failed += 1;
  }
}
function near(actual, expected, tolerance, label) {
  const value = Number(actual);
  check(Number.isFinite(value) && Math.abs(value - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}
function round3(value) { return Math.round(value * 1000) / 1000; }

const spanMatrix = Object.freeze([
  { nps: 0.5, pipeOdMm: 21.34, depSpanMm: 900, verticalNSS: 3200 },
  { nps: 0.75, pipeOdMm: 26.67, depSpanMm: 1400, verticalNSS: 3050 },
  { nps: 1, pipeOdMm: 33.4, depSpanMm: 2200, verticalNSS: 3450 },
  { nps: 1.5, pipeOdMm: 48.26, depSpanMm: 2800, verticalNSS: 2100 },
  { nps: 2, pipeOdMm: 60.325, depSpanMm: 2800, verticalNSS: 1850 },
  { nps: 3, pipeOdMm: 88.9, depSpanMm: 6400, verticalNSS: 8750 },
  { nps: 4, pipeOdMm: 114.3, depSpanMm: 6400, verticalNSS: 7700 },
  { nps: 6, pipeOdMm: 168.275, depSpanMm: 9400, verticalNSS: 7200 },
  { nps: 8, pipeOdMm: 219.075, depSpanMm: 10750, verticalNSS: 13000 },
  { nps: 10, pipeOdMm: 273.05, depSpanMm: 10750, verticalNSS: 15200 },
  { nps: 12, pipeOdMm: 323.85, depSpanMm: 10750, verticalNSS: 23500 },
  { nps: 14, pipeOdMm: 355.6, depSpanMm: 10750, verticalNSS: 29000 },
  { nps: 16, pipeOdMm: 406.4, depSpanMm: 11000, verticalNSS: 31000 },
  { nps: 18, pipeOdMm: 457.2, depSpanMm: 11000, verticalNSS: 34500 },
  { nps: 20, pipeOdMm: 508, depSpanMm: 11500, verticalNSS: 50500 },
  { nps: 24, pipeOdMm: 609.6, depSpanMm: 12000, verticalNSS: 68000 },
  { nps: 30, pipeOdMm: 762, depSpanMm: 14000, verticalNSS: 140000 },
  { nps: 36, pipeOdMm: 914.4, depSpanMm: 16000, verticalNSS: 195000 },
  { nps: 42, pipeOdMm: 1066.8, depSpanMm: 18000, verticalNSS: 170000 },
  { nps: 48, pipeOdMm: 1219.2, depSpanMm: 20000, verticalNSS: 145000 }
]);

const masterData = buildDefaultSupportLoadMasterData({ generatedAt: '2026-06-23T00:00:00.000Z' });
check(masterData.depSpanRows.length === spanMatrix.length, 'default DEP span table contains the complete NPS matrix');
for (const row of spanMatrix) {
  const masterRow = masterData.depSpanRows.find(item => Math.abs(Number(item.nps) - row.nps) < 0.0001);
  check(Boolean(masterRow), `DEP span row exists for NPS ${row.nps}`);
  if (masterRow) {
    near(masterRow.pipeOdMm, row.pipeOdMm, 0.001, `NPS ${row.nps} OD matches benchmark matrix`);
    near(masterRow.depSpanMm, row.depSpanMm, 0.001, `NPS ${row.nps} DEPSpan matches benchmark matrix`);
  }
}

for (const row of spanMatrix) {
  const totalKgPerM = row.verticalNSS * 1000 / (row.depSpanMm * 10 * 1.1);
  const pipeWtKgPerM = totalKgPerM * 0.6;
  const fluidWtKgPerM = totalKgPerM * 0.4;
  const input = Object.freeze({
    schema: 'support-load-input/v1',
    version: `span-matrix-nps-${row.nps}`,
    sourceObjectId: `PIPE-NPS-${row.nps}`,
    identity: Object.freeze({
      lineNo: `${row.nps}"-SPAN-MATRIX`,
      branchKey: `SPAN-MATRIX-${row.nps}`,
      branchName: '',
      nps: row.nps,
      pipeOdMm: row.pipeOdMm
    }),
    pipePhysical: Object.freeze({
      wallThicknessMm: 6.3,
      insideDiameterMm: row.pipeOdMm - 12.6,
      unitPipeWtKgPerM: pipeWtKgPerM
    }),
    process: Object.freeze({
      tempExpC1: 100,
      tempExpC2: null,
      fluidWtOpeKgPerM: fluidWtKgPerM,
      fluidWtHydKgPerM: fluidWtKgPerM
    }),
    spans: Object.freeze({
      autoSpanMm: row.depSpanMm,
      depSpanMm: row.depSpanMm,
      autoSpanBySupport: Object.freeze({})
    }),
    formulaProfile: Object.freeze({
      profileId: 'ACCESS_TEMP_WALL_WEIGHTED_V1',
      gravityFactor: 10,
      verticalLoadFactor: 1.1,
      roundMajor: 100,
      roundStep: 50,
      roundMode: 'up'
    }),
    supportRefs: Object.freeze([]),
    readiness: Object.freeze({
      readyForVertical: true,
      readyForOpeVertical: true,
      readyForHydVertical: true,
      readyForGuide: true,
      readyForLineStop: true,
      readyForCalculation: true,
      lockedForCalculation: true,
      calculationGateStatus: 'INPUT_LOCKED',
      missing: Object.freeze([]),
      status: 'INPUT_READY'
    })
  });
  const result = calculateSupportLoadsForPipeInput(input);
  check(result.status === 'CALCULATED', `NPS ${row.nps} span-matrix input calculates from locked input`);
  near(result.calculatedFields.vertical.opeVDep, row.verticalNSS, 0.15, `NPS ${row.nps} OPE_V_DEP reproduces Vertical_N_SS benchmark`);
  near(result.calculatedFields.vertical.opeVA, row.verticalNSS, 0.15, `NPS ${row.nps} OPE_V_A reproduces Vertical_N_SS when AutoSpan equals DEPSpan`);
  near(result.calculatedFields.guide.guideHDep, round3(row.verticalNSS * 0.3), 0.001, `NPS ${row.nps} Guide_H_DEP uses 30 percent OPE vertical control under normalized 100 C / 6.3 mm case`);
  check(result.calculatedFields.lineStop.lineStopH > 0, `NPS ${row.nps} LineStop_H remains calculable from OD, wall, and temperature`);
  check(result.audit.some(item => item.field === 'inputSource' && item.value === 'pipe.attributes.supportLoadInput'), `NPS ${row.nps} formula audit preserves pipe input source`);
}

if (failed) {
  console.error(`FAILED ${failed} checks, passed ${passed}`);
  process.exit(1);
}
console.log(`All support-load span matrix regression checks passed (${passed}).`);
