import { buildGeometrySupportLoadInputModel } from '../geometry-workspace/GeometrySupportLoadInputModel.js';
import { applySupportLoadInputReview, lockReadySupportLoadInputs } from '../geometry-workspace/GeometrySupportLoadInputReview.js';
import { calculateSupportLoadResultsFromInputModel } from '../geometry-workspace/GeometrySupportLoadFormulaEngine.js';
import { buildSupportLoadCanvasOverlayPlan, SUPPORT_LOAD_CANVAS_OVERLAY_SCHEMA } from '../geometry-workspace/GeometrySupportLoadCanvasOverlayModel.js';

let passed = 0;
let failed = 0;
function check(condition, label) {
  if (condition) { console.log(`PASS: ${label}`); passed += 1; }
  else { console.error(`FAIL: ${label}`); failed += 1; }
}

const sourceObjects = [
  { id: 'PIPE-8-P25168', family: 'PIPE', objectType: 'PIPE', lineNo: '8"-P25168-61502-01', rawFields: { NS: 8, PipeOD: 219.075, WALL_THICK: 12.7, TEMP_EXP_C1: 100, TEMP_EXP_C2: 59, DEPSPAN: 10750, AUTOSPAN_MM: 5000, 'UnitPipewtKg/m': 70, 'FluidwtKg/m': 40, FLUID_WT_HYD_KG_M: 50 }, enrichedFields: { temperature1C: 100, wallThicknessMm: 12.7 }, geometry: { center: { x: 0, y: 0, z: 0 } } },
  { id: 'SUP-GUIDE-001', family: 'SUPPORT', objectType: 'SUPPORT', lineNo: '8"-P25168-61502-01', geometry: { center: { x: 10, y: -80, z: 0 } }, support: { supportType: 'GUIDE', supportTag: 'PS-G-001' }, pipe: { odMm: 219.075 } },
  { id: 'SUP-STOP-001', family: 'SUPPORT', objectType: 'SUPPORT', lineNo: '8"-P25168-61502-01', geometry: { center: { x: 40, y: -80, z: 0 } }, support: { supportType: 'LINE_STOP', supportTag: 'PS-LS-001' }, pipe: { odMm: 219.075 } },
];

const model = buildGeometrySupportLoadInputModel(sourceObjects, { evaluatedAt: '2026-06-22T00:00:00.000Z' });
const review = lockReadySupportLoadInputs(model, {}, { reviewedAt: '2026-06-22T01:00:00.000Z' });
const lockedModel = applySupportLoadInputReview(model, review);
const formulaResults = calculateSupportLoadResultsFromInputModel(lockedModel, { evaluatedAt: '2026-06-22T02:00:00.000Z' });
const beforeResults = JSON.stringify(formulaResults.calculatedObjects);
const beforeInputs = JSON.stringify(lockedModel.pipeInputs);
const plan = buildSupportLoadCanvasOverlayPlan({ formulaResults }, { generatedAt: '2026-06-22T03:00:00.000Z' });

check(plan.schema === SUPPORT_LOAD_CANVAS_OVERLAY_SCHEMA, 'canvas overlay schema is stable');
check(plan.status === 'READY', 'canvas overlay is ready when calculated support references exist');
check(plan.inputSource === 'calculatedFields.supportLoadReference', 'canvas overlay consumes calculated support references only');
check(plan.mutationPolicy === 'READ_ONLY_OVERLAY', 'canvas overlay declares read-only mutation policy');
check(plan.renderPolicy.includes('LINE_SEGMENTS_ONLY'), 'canvas overlay uses line-segment render policy');
check(plan.supportCount === 2, 'canvas overlay creates one row per calculated support reference');
check(plan.arrows.some(arrow => arrow.kind === 'VERTICAL_OPE' && arrow.supportTag === 'PS-G-001'), 'guide support gets vertical overlay arrow');
check(plan.arrows.some(arrow => arrow.kind === 'GUIDE_HORIZONTAL' && arrow.supportTag === 'PS-G-001'), 'guide support gets guide overlay arrow');
check(plan.arrows.some(arrow => arrow.kind === 'LINESTOP_HORIZONTAL' && arrow.supportTag === 'PS-LS-001'), 'line-stop support gets line-stop overlay arrow');
check(!plan.arrows.some(arrow => arrow.kind === 'GUIDE_HORIZONTAL' && arrow.supportTag === 'PS-LS-001'), 'line-stop support does not get guide overlay arrow');
check(plan.arrows.every(arrow => arrow.renderPrimitive === 'LINE_SEGMENTS_ONLY'), 'all arrows are line-segment only primitives');
check(plan.arrows.every(arrow => Number.isFinite(arrow.loadN) && arrow.loadN > 0), 'all arrows use existing positive calculated loads');
check(JSON.stringify(formulaResults.calculatedObjects) === beforeResults, 'canvas overlay plan does not mutate calculated objects');
check(JSON.stringify(lockedModel.pipeInputs) === beforeInputs, 'canvas overlay plan does not mutate pipe input packages');

if (failed) {
  console.error(`FAILED ${failed} checks, passed ${passed}`);
  process.exit(1);
}
console.log(`All support load canvas overlay checks passed (${passed}).`);
