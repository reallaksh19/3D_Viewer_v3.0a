import { buildGeometrySupportLoadInputModel } from '../geometry-workspace/GeometrySupportLoadInputModel.js';
import { applySupportLoadInputReview, lockReadySupportLoadInputs } from '../geometry-workspace/GeometrySupportLoadInputReview.js';
import { setSupportLoadInputOverride, clearSupportLoadInputOverride } from '../geometry-workspace/GeometrySupportLoadInputOverrides.js';

let passed = 0;
let failed = 0;
function check(condition, label) {
  if (condition) { console.log(`PASS: ${label}`); passed += 1; }
  else { console.error(`FAIL: ${label}`); failed += 1; }
}

const sourceObjects = [
  {
    id: 'PIPE-MISSING-WEIGHT',
    family: 'PIPE',
    lineNo: '8"-P25168-61502-01',
    rawFields: { NS: 8, PipeOD: 219.075, WALL_THICK: 12.7, TEMP_EXP_C1: 100, TEMP_EXP_C2: 59, DEPSPAN: 10750 },
    process: { fluidDensityKgM3: 800, fluidDensityHydKgM3: 1000 }
  }
];

const baseModel = buildGeometrySupportLoadInputModel(sourceObjects, { evaluatedAt: '2026-06-22T00:00:00.000Z' });
const baseInput = baseModel.pipeInputs[0];
check(baseInput.readiness.status === 'BLOCKED' || baseInput.readiness.status === 'PARTIAL_INPUT', 'base input is not ready before reviewer override');
check(baseInput.readiness.missing.includes('pipePhysical.unitPipeWtKgPerM'), 'base input records missing pipe unit weight');

const key = baseInput.sourceObjectId;
const overrideState = setSupportLoadInputOverride({}, key, 'pipePhysical.unitPipeWtKgPerM', '67.25', { reason: 'validated weight master row' });
const reviewedModel = applySupportLoadInputReview(baseModel, overrideState);
const reviewedInput = reviewedModel.pipeInputs[0];
check(reviewedInput.pipePhysical.unitPipeWtKgPerM === 67.25, 'review override writes pipe wt onto pipe input package');
check(reviewedInput.inputOverrides.overrides['pipePhysical.unitPipeWtKgPerM'].reason === 'validated weight master row', 'review override preserves reason');
check(reviewedInput.audit.some(row => row.source === 'REVIEW_OVERRIDE' && row.field === 'pipePhysical.unitPipeWtKgPerM'), 'review override adds audit row');
check(reviewedInput.readiness.status === 'INPUT_READY', 'override can promote input package to ready state');

const lockedState = lockReadySupportLoadInputs(reviewedModel, overrideState, { reviewedAt: '2026-06-22T01:00:00.000Z' });
const lockedModel = applySupportLoadInputReview(baseModel, lockedState);
check(lockedModel.pipeInputs[0].readiness.readyForCalculation === true, 'lock gate allows calculation only after ready reviewed input');
check(lockedModel.inputOverrideCount === 1, 'model summary counts overridden pipe inputs');

const clearedState = clearSupportLoadInputOverride(lockedState, key, 'pipePhysical.unitPipeWtKgPerM');
const clearedModel = applySupportLoadInputReview(baseModel, clearedState);
check(clearedModel.pipeInputs[0].pipePhysical.unitPipeWtKgPerM === null, 'clearing override reverts to source hydrated value');
check(clearedModel.pipeInputs[0].readiness.readyForCalculation === false, 'clearing required override closes calculation gate');

if (failed) {
  console.error(`FAILED ${failed} checks, passed ${passed}`);
  process.exit(1);
}
console.log(`All support load input override checks passed (${passed}).`);
