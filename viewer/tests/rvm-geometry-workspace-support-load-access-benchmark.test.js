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

const supportSpanMm = 10750;
const expectedOpeVDep = 13000;
const totalKgPerM = expectedOpeVDep * 1000 / (supportSpanMm * 10 * 1.1);
const pipeWtKgPerM = totalKgPerM * 0.6;
const fluidWtKgPerM = totalKgPerM * 0.4;

const result = calculateSupportLoadsForPipeInput(Object.freeze({
  schema: 'support-load-input/v1',
  version: 'access-nps8-benchmark',
  sourceObjectId: 'PIPE-8-P25168-BENCH',
  identity: Object.freeze({
    lineNo: '8"-P25168-61502-01',
    branchKey: 'P25168-61502-01',
    branchName: '',
    nps: 8,
    pipeOdMm: 219.075
  }),
  pipePhysical: Object.freeze({
    wallThicknessMm: 12.7,
    insideDiameterMm: 193.675,
    unitPipeWtKgPerM: pipeWtKgPerM
  }),
  process: Object.freeze({
    tempExpC1: 100,
    tempExpC2: 59,
    fluidWtOpeKgPerM: fluidWtKgPerM,
    fluidWtHydKgPerM: fluidWtKgPerM
  }),
  spans: Object.freeze({
    autoSpanMm: supportSpanMm,
    depSpanMm: supportSpanMm,
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
}));

check(result.status === 'CALCULATED', 'Access benchmark calculates from locked pipe input');
near(result.calculatedFields.vertical.opeVDep, expectedOpeVDep, 0.15, 'OPE_V_DEP benchmark is 13000 N');
check(result.calculatedFields.guide.roundedGuideHDep === 650, 'rounded Guide H benchmark is 650 N');
near(result.calculatedFields.guide.guideHDep, 3900, 0.0001, 'final Guide H uses Max(Rounded Guide H, 0.3 × OPE_V_DEP)');
check(result.calculatedFields.guide.guideDep.controlling === 'THIRTY_PERCENT_OPE_VERTICAL', 'Guide DEP controlling branch is 30 percent OPE vertical');
check(result.calculatedFields.lineStop.lineStopH === 8800, 'LineStop_H benchmark is 8800 N');
check(result.calculatedFields.lineStop.lineStop.formula.includes('D^4-(D-WT)^4'), 'LineStop expression preserves Dia - WALL_THICK');
check(result.calculatedFields.lineStop.lineStop.sectionTerm > 219000 && result.calculatedFields.lineStop.lineStop.sectionTerm < 220000, 'LineStop section term matches Access-style 8 inch benchmark range');

if (failed) {
  console.error(`FAILED ${failed} checks, passed ${passed}`);
  process.exit(1);
}
console.log(`All Access support-load benchmark checks passed (${passed}).`);
