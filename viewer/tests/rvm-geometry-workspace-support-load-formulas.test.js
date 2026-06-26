import { buildGeometrySupportLoadInputModel } from '../geometry-workspace/GeometrySupportLoadInputModel.js';
import { applySupportLoadInputReview, lockReadySupportLoadInputs } from '../geometry-workspace/GeometrySupportLoadInputReview.js';
import { calculateSupportLoadResultsFromInputModel, calculateSupportLoadsForPipeInput, getRoundedNum } from '../geometry-workspace/GeometrySupportLoadFormulaEngine.js';

let passed = 0;
let failed = 0;
function check(condition, label) {
  if (condition) { console.log(`PASS: ${label}`); passed += 1; }
  else { console.error(`FAIL: ${label}`); failed += 1; }
}
function near(actual, expected, tol, label) {
  check(Math.abs(Number(actual) - expected) <= tol, `${label}: expected ${expected}, got ${actual}`);
}

check(getRoundedNum(639.2, 100, 50, 'up') === 650, 'Access round-up helper rounds 639.2 to 650');
check(getRoundedNum(8770.1, 100, 50, 'up') === 8800, 'Access round-up helper rounds line-stop benchmark to 8800 bucket');

const sourceObjects = [
  {
    id: 'PIPE-8-P25168',
    family: 'PIPE',
    lineNo: '8"-P25168-61502-01',
    rawFields: {
      NS: 8,
      PipeOD: 219.075,
      WALL_THICK: 12.7,
      TEMP_EXP_C1: 100,
      TEMP_EXP_C2: 59,
      DEPSPAN: 10750,
      AUTOSPAN_MM: 5000,
      'UnitPipewtKg/m': 70,
      'FluidwtKg/m': 40,
      FLUID_WT_HYD_KG_M: 50
    },
    geometry: { center: { x: 0, y: 0, z: 0 } }
  },
  {
    id: 'SUP-GUIDE-001',
    family: 'SUPPORT',
    lineNo: '8"-P25168-61502-01',
    geometry: { center: { x: 10, y: -80, z: 0 } },
    support: { supportType: 'GUIDE', supportTag: 'PS-G-001' },
    pipe: { odMm: 219.075 }
  },
  {
    id: 'SUP-LS-001',
    family: 'SUPPORT',
    lineNo: '8"-P25168-61502-01',
    geometry: { center: { x: 40, y: -80, z: 0 } },
    support: { supportType: 'LINE STOP', supportTag: 'PS-LS-001' },
    pipe: { odMm: 219.075 }
  }
];

const baseModel = buildGeometrySupportLoadInputModel(sourceObjects, { evaluatedAt: '2026-06-22T00:00:00.000Z' });
const baseInput = baseModel.pipeInputs[0];
check(baseInput.readiness.status === 'INPUT_READY', 'source pipe input is fully hydrated before lock');
const blocked = calculateSupportLoadsForPipeInput(baseInput);
check(blocked.status === 'BLOCKED', 'formula engine blocks unlocked pipe input');
check(blocked.reason === 'pipe-input-not-locked-for-calculation', 'blocked reason is lock gate, not missing data');

const staleModel = {
  ...baseModel,
  hydratedObjects: baseModel.hydratedObjects.map(object => {
    if (object.id === 'PIPE-8-P25168') return { ...object, calculatedFields: { ...(object.calculatedFields || {}), supportLoads: { stale: true } } };
    if (object.id === 'SUP-GUIDE-001') return { ...object, calculatedFields: { ...(object.calculatedFields || {}), supportLoadReference: { stale: true } } };
    return object;
  })
};
const staleBlockedResults = calculateSupportLoadResultsFromInputModel(staleModel, { evaluatedAt: '2026-06-22T00:30:00.000Z' });
const stalePipe = staleBlockedResults.calculatedObjects.find(object => object.id === 'PIPE-8-P25168');
const staleGuide = staleBlockedResults.calculatedObjects.find(object => object.id === 'SUP-GUIDE-001');
check(staleBlockedResults.status === 'BLOCKED', 'unlocked model remains blocked during writeback audit');
check(!stalePipe.calculatedFields?.supportLoads, 'blocked recalculation clears stale pipe supportLoads');
check(!staleGuide.calculatedFields?.supportLoadReference, 'blocked recalculation clears stale support reference');
check(staleBlockedResults.writebackAudit.stalePipeResultClearedCount === 1, 'writeback audit counts stale pipe result cleanup');
check(staleBlockedResults.writebackAudit.staleSupportReferenceClearedCount === 1, 'writeback audit counts stale support reference cleanup');
check(staleBlockedResults.writebackAudit.inputPackageMutatedCount === 0, 'writeback audit detects no input mutation during blocked cleanup');

const lockedState = lockReadySupportLoadInputs(baseModel, {}, { reviewedAt: '2026-06-22T01:00:00.000Z' });
const lockedModel = applySupportLoadInputReview(baseModel, lockedState);
check(lockedModel.pipeInputs[0].readiness.readyForCalculation === true, 'review lock opens calculation gate');

const results = calculateSupportLoadResultsFromInputModel(lockedModel, { evaluatedAt: '2026-06-22T02:00:00.000Z' });
check(results.status === 'CALCULATED', 'locked inputs calculate successfully');
check(results.calculatedPipeCount === 1, 'one pipe result calculated');
check(results.supportResultCount === 2, 'two support references receive result rows');
check(results.writebackAudit.status === 'OK', 'writeback audit status is OK');
check(results.writebackAudit.inputPackageMutatedCount === 0, 'calculated writeback does not mutate pipe input packages');
check(results.writebackAudit.pipeCalculatedWriteCount === 1, 'writeback audit counts pipe calculated field write');
check(results.writebackAudit.supportCalculatedWriteCount === 2, 'writeback audit counts support reference writes');

const calc = results.pipeResults[0].calculatedFields;
near(calc.vertical.opeVA, 6050, 0.0001, 'OPE_V_A uses operating fluid plus pipe weight and AutoSpan');
near(calc.vertical.hydVA, 6600, 0.0001, 'HYD_V_A uses hydro fluid plus pipe weight and AutoSpan');
near(calc.vertical.opeVDep, 13007.5, 0.0001, 'OPE_V_DEP uses operating fluid plus pipe weight and DEPSpan');
near(calc.vertical.hydVDep, 14190, 0.0001, 'HYD_V_DEP uses hydro fluid plus pipe weight and DEPSpan');
check(calc.guide.roundedGuideHDep === 650, 'temperature-wall weighted guide DEP component rounds to 650 N');
near(calc.guide.guideHDep, 3902.25, 0.0001, 'Guide DEP final uses max of rounded guide and 30 percent OPE_V_DEP');
check(calc.lineStop.lineStopH === 8800, 'line-stop benchmark calculates 8800 N for NPS 8 WT 12.7 T1 100');

const guideSupport = results.supportRows.find(row => row.supportTag === 'PS-G-001');
const lineStopSupport = results.supportRows.find(row => row.supportTag === 'PS-LS-001');
check(Boolean(guideSupport?.guide?.guideHDep), 'guide support row receives guide result');
check(guideSupport?.lineStop === null, 'guide support row does not receive line-stop result');
check(lineStopSupport?.lineStop?.lineStopH === 8800, 'line-stop support row receives line-stop result');
check(lineStopSupport?.guide === null, 'line-stop support row does not receive guide result');

const pipeObject = results.calculatedObjects.find(object => object.id === 'PIPE-8-P25168');
check(pipeObject.calculatedFields.supportLoads.lineStop.lineStopH === 8800, 'calculated fields are written separately to pipe object');
check(pipeObject.calculatedFields.supportLoads.writebackAudit.target === 'calculatedFields.supportLoads', 'pipe result writeback target is audited');
check(!pipeObject.calculatedFields.supportLoads.attributes, 'pipe result does not copy input attributes into calculated fields');
check(pipeObject.attributes.supportLoadInput.readiness.readyForCalculation === true, 'input package remains preserved after writeback');

if (failed) {
  console.error(`FAILED ${failed} checks, passed ${passed}`);
  process.exit(1);
}
console.log(`All support load formula checks passed (${passed}).`);
