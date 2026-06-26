import { buildGeometrySupportLoadInputModel } from '../geometry-workspace/GeometrySupportLoadInputModel.js';
import { applySupportLoadInputReview, lockReadySupportLoadInputs } from '../geometry-workspace/GeometrySupportLoadInputReview.js';
import { calculateSupportLoadResultsFromInputModel } from '../geometry-workspace/GeometrySupportLoadFormulaEngine.js';
import { buildGeometryEnrichedStagedJson } from '../geometry-workspace/GeometryEnrichedStagedJsonExporter.js';

let passed = 0;
let failed = 0;
function check(condition, label) {
  if (condition) { console.log(`PASS: ${label}`); passed += 1; }
  else { console.error(`FAIL: ${label}`); failed += 1; }
}
function near(actual, expected, tol, label) {
  check(Math.abs(Number(actual) - expected) <= tol, `${label}: expected ${expected}, got ${actual}`);
}

const sourceObjects = [
  {
    id: 'PIPE-8-P25168',
    family: 'PIPE',
    objectType: 'PIPE',
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
      FLUID_WT_HYD_KG_M: 50,
    },
    enrichedFields: { temperature1C: 100, wallThicknessMm: 12.7 },
    geometry: { center: { x: 0, y: 0, z: 0 } },
  },
  {
    id: 'SUP-GUIDE-001',
    family: 'SUPPORT',
    objectType: 'SUPPORT',
    lineNo: '8"-P25168-61502-01',
    geometry: { center: { x: 10, y: -80, z: 0 } },
    support: { supportType: 'GUIDE', supportTag: 'PS-G-001' },
    pipe: { odMm: 219.075 },
  },
  {
    id: 'SUP-STOP-001',
    family: 'SUPPORT',
    objectType: 'SUPPORT',
    lineNo: '8"-P25168-61502-01',
    geometry: { center: { x: 40, y: -80, z: 0 } },
    support: { supportType: 'LINE_STOP', supportTag: 'PS-LS-001' },
    pipe: { odMm: 219.075 },
  },
];

const baseModel = buildGeometrySupportLoadInputModel(sourceObjects, { evaluatedAt: '2026-06-22T00:00:00.000Z' });
const lockedState = lockReadySupportLoadInputs(baseModel, {}, { reviewedAt: '2026-06-22T01:00:00.000Z' });
const lockedModel = applySupportLoadInputReview(baseModel, lockedState);
const formulaResults = calculateSupportLoadResultsFromInputModel(lockedModel, { evaluatedAt: '2026-06-22T02:00:00.000Z' });
const payload = buildGeometryEnrichedStagedJson(formulaResults.calculatedObjects, {
  sourceMode: 'geometry-workspace-support-load-calculated-objects',
  formulaResults,
  masterSummary: { testMaster: true },
});

check(payload.schemaVersion === 'geometry-enriched-stagedjson/v2', 'stagedJSON schema upgraded to v2');
check(payload.version === '20260622-geometry-enriched-stagedjson-support-loads-1', 'stagedJSON support-load version is stable');
check(payload.source.objectCount === 3, 'payload exports all calculated objects');
check(payload.source.supportLoadInputCount === 1, 'payload counts one pipe input package');
check(payload.source.supportLoadCalculatedCount === 1, 'payload counts one pipe support-load result');
check(payload.source.supportLoadReferenceCount === 2, 'payload counts two support-load reference results');
check(payload.policies.supportLoadInputExportedFromPipeAttributes === true, 'payload policy records pipe input source');
check(payload.policies.supportLoadFormulaApplied === true, 'payload policy records formula result export');
check(payload.policies.supportLoadExporterDoesNotTopUpInputs === true, 'payload policy forbids top-up data');
check(payload.supportLoads.schema === 'geometry-enriched-stagedjson-support-loads/v1', 'support-load export block schema is stable');
check(payload.supportLoads.inputSource === 'pipe.attributes.supportLoadInput', 'support-load block documents input source');
check(payload.supportLoads.resultSource.includes('calculatedFields.supportLoads'), 'support-load block documents result source');
check(payload.supportLoads.profileId === 'ACCESS_TEMP_WALL_WEIGHTED_V1', 'support-load block carries profile id');
check(payload.supportLoads.calculatedPipeResultCount === 1, 'support-load block counts calculated pipe result');
check(payload.supportLoads.supportReferenceResultCount === 2, 'support-load block counts support references');

const pipe = payload.elements.find(element => element.id === 'PIPE-8-P25168');
const guide = payload.elements.find(element => element.id === 'SUP-GUIDE-001');
const stop = payload.elements.find(element => element.id === 'SUP-STOP-001');
check(Boolean(pipe?.supportLoad?.input), 'pipe element exports input-only supportLoadInput package');
check(Boolean(pipe?.supportLoad?.calculatedFields?.supportLoads), 'pipe element exports calculated supportLoads separately');
check(pipe.supportLoad.input?.readiness?.readyForCalculation === true, 'pipe input is locked for calculation');
near(pipe.supportLoad.calculatedFields.supportLoads.vertical.opeVDep, 13007.5, 0.0001, 'pipe support-load result includes OPE_V_DEP');
near(pipe.supportLoad.calculatedFields.supportLoads.guide.guideHDep, 3902.25, 0.0001, 'pipe support-load result includes Guide_H_DEP');
check(pipe.supportLoad.calculatedFields.supportLoads.lineStop.lineStopH === 8800, 'pipe support-load result includes LineStop_H');
check(Boolean(guide?.supportLoad?.calculatedFields?.supportLoadReference), 'guide support exports supportLoadReference separately');
check(guide.supportLoad.calculatedFields.supportLoadReference.applies.guide === true, 'guide support reference applies guide');
check(Boolean(stop?.supportLoad?.calculatedFields?.supportLoadReference), 'line-stop support exports supportLoadReference separately');
check(stop.supportLoad.calculatedFields.supportLoadReference.applies.lineStop === true, 'line-stop support reference applies line-stop');
check(!pipe.supportLoad.input.vertical, 'input package does not contain calculated vertical outputs');

if (failed) {
  console.error(`FAILED ${failed} checks, passed ${passed}`);
  process.exit(1);
}
console.log(`All enriched stagedJSON support-load checks passed (${passed}).`);
