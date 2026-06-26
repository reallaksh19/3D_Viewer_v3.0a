import { calculateSupportLoadsForPipeInput } from '../geometry-workspace/GeometrySupportLoadFormulaEngine.js';
import { normalizeSupportLoadFormulaProfile, resolveSupportLoadTempFnC, summarizeSupportLoadAdvancedProfiles } from '../geometry-workspace/GeometrySupportLoadAdvancedProfiles.js';

let passed = 0;
let failed = 0;
function check(condition, label) {
  if (condition) { console.log(`PASS: ${label}`); passed += 1; }
  else { console.error(`FAIL: ${label}`); failed += 1; }
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

function benchmarkInput(formulaProfile = {}) {
  return Object.freeze({
    schema: 'support-load-input/v1',
    version: 'advanced-profile-benchmark',
    sourceObjectId: 'PIPE-ADVANCED-PROFILE-BENCH',
    identity: Object.freeze({ lineNo: '8-P25168-61502-01', branchKey: 'P25168-61502-01', nps: 8, pipeOdMm: 219.075 }),
    pipePhysical: Object.freeze({ wallThicknessMm: 12.7, insideDiameterMm: 193.675, unitPipeWtKgPerM: pipeWtKgPerM }),
    process: Object.freeze({ tempExpC1: 100, tempExpC2: 59, fluidWtOpeKgPerM: fluidWtKgPerM, fluidWtHydKgPerM: fluidWtKgPerM }),
    spans: Object.freeze({ autoSpanMm: supportSpanMm, depSpanMm: supportSpanMm, autoSpanBySupport: Object.freeze({}) }),
    formulaProfile: Object.freeze(formulaProfile),
    supportRefs: Object.freeze([]),
    readiness: Object.freeze({ readyForVertical: true, readyForOpeVertical: true, readyForHydVertical: true, readyForGuide: true, readyForLineStop: true, readyForCalculation: true, lockedForCalculation: true, calculationGateStatus: 'INPUT_LOCKED', missing: Object.freeze([]), status: 'INPUT_READY' })
  });
}

const registry = summarizeSupportLoadAdvancedProfiles();
check(registry.status === 'ADVANCED_PROFILE_REGISTRY_READY', 'advanced profile registry is available');
check(registry.disabledProfiles.length >= 2, 'future advanced profiles are disabled until project data exists');
check(registry.policy.noMasterLookupInFormulaEngine === true, 'profile policy blocks master lookup inside formula engine');

const normalizedDefault = normalizeSupportLoadFormulaProfile({ profileId: 'ACCESS_TEMP_WALL_WEIGHTED_V1' });
check(normalizedDefault.guide.minimumOpeVerticalFactor === 0.3, 'default guide minimum factor remains 0.3');
check(normalizedDefault.lineStop.idExpression === 'D_MINUS_WT', 'default line stop preserves Dia minus wall thickness');

const defaultResult = calculateSupportLoadsForPipeInput(benchmarkInput({ profileId: 'ACCESS_TEMP_WALL_WEIGHTED_V1' }));
near(defaultResult.calculatedFields.vertical.opeVDep, 13000, 0.15, 'default profile keeps OPE_V_DEP benchmark');
check(defaultResult.calculatedFields.guide.roundedGuideHDep === 650, 'default profile keeps rounded Guide benchmark');
near(defaultResult.calculatedFields.guide.guideHDep, 3900, 0.0001, 'default profile keeps Guide final benchmark');
check(defaultResult.calculatedFields.lineStop.lineStopH === 8800, 'default profile keeps LineStop benchmark');
check(defaultResult.audit.some(row => row.source === 'SUPPORT_LOAD_ADVANCED_PROFILE'), 'formula result includes advanced profile audit');

const customResult = calculateSupportLoadsForPipeInput(benchmarkInput({ profileId: 'ACCESS_TEMP_WALL_WEIGHTED_V1_CUSTOM_MIN_GUIDE', guide: Object.freeze({ minimumOpeVerticalFactor: 0.4 }) }));
near(customResult.calculatedFields.vertical.opeVDep, 13000, 0.15, 'custom profile keeps vertical calculation unchanged');
check(customResult.calculatedFields.guide.roundedGuideHDep === 650, 'custom profile keeps rounded Guide component unchanged');
near(customResult.calculatedFields.guide.guideHDep, 5200, 0.0001, 'custom profile applies explicit guide minimum factor from locked input');
check(customResult.calculatedFields.guide.guideDep.profile.minimumOpeVerticalFactor === 0.4, 'custom guide factor is audited in result');
check(customResult.calculatedFields.lineStop.lineStopH === 8800, 'custom guide-only profile leaves line stop unchanged');

const tempProfile = normalizeSupportLoadFormulaProfile({ tempFunction: Object.freeze({ mode: 'table-linear', points: Object.freeze([{ inputC: 100, factor: 120 }, { inputC: 200, factor: 320 }]) }) });
near(resolveSupportLoadTempFnC(150, tempProfile), 220, 0.0001, 'table-linear TempfnC interpolates supplied locked profile points');

if (failed) {
  console.error(`FAILED ${failed} checks, passed ${passed}`);
  process.exit(1);
}
console.log(`All support-load advanced profile checks passed (${passed}).`);
