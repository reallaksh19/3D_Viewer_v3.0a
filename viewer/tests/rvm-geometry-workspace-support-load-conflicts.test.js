import { buildGeometrySupportLoadInputModel } from '../geometry-workspace/GeometrySupportLoadInputModel.js';
import { buildSupportLoadEnrichmentConflictModel } from '../geometry-workspace/GeometrySupportLoadConflictResolver.js';

let passed = 0;
let failed = 0;
function check(condition, label) {
  if (condition) { console.log(`PASS: ${label}`); passed += 1; }
  else { console.error(`FAIL: ${label}`); failed += 1; }
}

const objects = [
  {
    id: 'PIPE-CONFLICT-8',
    family: 'PIPE',
    lineNo: '8"-P25168-61502-01',
    displayName: 'PIPE conflict fixture',
    rawFields: { NS: 8, PipeOD: 219.075, WALL_THICK: 12.7, TEMP_EXP_C1: 100, 'UnitPipewtKg/m': 67 },
    pipe: { odMm: 219.075, wallThicknessMm: 12.7, materialCategory: 'LT', unitPipeWtKgPerM: 67 },
    process: { fluidDensityKgM3: 800, temperature1C: 100 },
    geometryEnrichment: { process: { temperature1C: 100, fluidDensityKgM3: 800 }, piping: { wallThicknessMm: 11.0 } },
    geometry: { center: { x: 0, y: 0, z: 0 } }
  },
  { id: 'SUP-CONFLICT-A', family: 'SUPPORT', lineNo: '8"-P25168-61502-01', displayName: 'GUIDE conflict fixture A', support: { supportType: 'GUIDE', supportTag: 'PS-A' }, pipe: { odMm: 219.075 }, geometry: { center: { x: 0, y: 0, z: 0 } } },
  { id: 'SUP-CONFLICT-B', family: 'SUPPORT', lineNo: '8"-P25168-61502-01', displayName: 'REST conflict fixture B', support: { supportType: 'REST', supportTag: 'PS-B' }, pipe: { odMm: 219.075 }, geometry: { center: { x: 6000, y: 0, z: 0 } } }
];

const inputModel = buildGeometrySupportLoadInputModel(objects, { evaluatedAt: '2026-06-23T00:00:00.000Z' });
const conflictModel = buildSupportLoadEnrichmentConflictModel(inputModel.hydratedObjects, { evaluatedAt: '2026-06-23T00:00:00.000Z' });
const row = conflictModel.rows[0];
const wallConflict = row?.fieldConflicts?.find(item => item.fieldPath === 'pipePhysical.wallThicknessMm');
const json = JSON.stringify(conflictModel);

check(conflictModel.schema === 'support-load-enrichment-conflict/v1', 'conflict model uses support-load conflict schema');
check(conflictModel.pipeCount === 1, 'conflict model evaluates hydrated pipe input objects');
check(conflictModel.conflictCount >= 1, 'conflict model detects at least one input-source conflict');
check(wallConflict?.status === 'REVIEW_REQUIRED', 'wall thickness conflict requires review');
check(wallConflict?.sources?.some(source => source.source === 'NATIVE_RAW_ATTRIBUTE' && Number(source.value) === 12.7), 'raw wall thickness source is preserved');
check(wallConflict?.sources?.some(source => source.source === 'XML_CII_ENRICHMENT' && Number(source.value) === 11), 'XML/CII enrichment wall thickness source is preserved');
check(wallConflict?.sources?.some(source => source.source === 'HYDRATED_PIPE_INPUT' && Number(source.value) === 11), 'hydrated pipe input selected value is audited');
check(conflictModel.policy.noSilentTopUp === true, 'conflict resolver declares no silent top-up policy');
check(conflictModel.policy.noFormulaExecution === true, 'conflict resolver does not execute formulas');
check(!json.includes('OPE_V_A') && !json.includes('Guide_H') && !json.includes('LineStop_H'), 'conflict audit does not create calculated support-load fields');

if (failed) {
  console.error(`FAILED ${failed} checks, passed ${passed}`);
  process.exit(1);
}
console.log(`All support load conflict resolver checks passed (${passed}).`);
