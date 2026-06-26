import { buildGeometrySupportLoadInputModel } from '../geometry-workspace/GeometrySupportLoadInputModel.js';
import { applySupportLoadInputReview, lockReadySupportLoadInputs } from '../geometry-workspace/GeometrySupportLoadInputReview.js';
import { calculateSupportLoadResultsFromInputModel } from '../geometry-workspace/GeometrySupportLoadFormulaEngine.js';
import { buildSupportLoadReport, buildSupportLoadPipeCsv, buildSupportLoadSupportCsv } from '../geometry-workspace/GeometrySupportLoadReportExporter.js';
import { buildGeometryEnrichedStagedJson } from '../geometry-workspace/GeometryEnrichedStagedJsonExporter.js';
import { buildSupportLoadBulkPackage, SUPPORT_LOAD_BULK_PACKAGE_SCHEMA } from '../geometry-workspace/GeometrySupportLoadBulkPackageExporter.js';

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
const report = buildSupportLoadReport(formulaResults, lockedModel, { generatedAt: '2026-06-22T03:00:00.000Z' });
const stagedJson = buildGeometryEnrichedStagedJson(formulaResults.calculatedObjects, { sourceMode: 'geometry-workspace-support-load-calculated-objects', formulaResults });
const beforeInputs = JSON.stringify(lockedModel.pipeInputs);
const beforeResults = JSON.stringify(formulaResults.calculatedObjects);
const pkg = buildSupportLoadBulkPackage({
  stagedJson,
  report,
  pipeCsv: buildSupportLoadPipeCsv(report),
  supportCsv: buildSupportLoadSupportCsv(report),
  qaDashboard: { schema: 'support-load-qa-dashboard/v1', status: 'READY', conflicts: { conflictCount: 0 } },
  conflictModel: { schema: 'support-load-enrichment-conflict/v1', status: 'OK', conflictCount: 0 },
  formulaResults,
  inputModel: lockedModel,
  masterData: { schema: 'support-load-master-data/v1' },
}, { generatedAt: '2026-06-22T04:00:00.000Z' });

check(pkg.schema === SUPPORT_LOAD_BULK_PACKAGE_SCHEMA, 'bulk package schema is stable');
check(pkg.status === 'READY_FOR_EXPORT', 'bulk package is ready when report and stagedJSON are ready');
check(pkg.audit.packageDoesNotHydrateInputs === true, 'bulk package declares no input hydration');
check(pkg.audit.packageDoesNotCalculateLoads === true, 'bulk package declares no formula execution');
check(pkg.audit.packageDoesNotTopUpMissingFields === true, 'bulk package forbids addendum top-up');
check(pkg.summary.pipeReportRows === 1, 'bulk package counts pipe report rows');
check(pkg.summary.supportReportRows === 2, 'bulk package counts support report rows');
check(pkg.packageIndex.some(file => file.path === 'geometry-enriched-stagedjson-support-loads.json'), 'package includes stagedJSON file');
check(pkg.packageIndex.some(file => file.path === 'support-load-report.json'), 'package includes report JSON file');
check(pkg.packageIndex.some(file => file.path === 'support-load-pipe-report.csv'), 'package includes pipe CSV file');
check(pkg.packageIndex.some(file => file.path === 'support-load-support-report.csv'), 'package includes support CSV file');
check(pkg.files.find(file => file.path === 'support-load-pipe-report.csv')?.content.includes('PIPE-8-P25168'), 'pipe CSV file content is embedded');
check(pkg.files.find(file => file.path === 'geometry-enriched-stagedjson-support-loads.json')?.content.includes('calculatedFields'), 'stagedJSON file content is embedded');
check(JSON.stringify(lockedModel.pipeInputs) === beforeInputs, 'bulk package does not mutate input packages');
check(JSON.stringify(formulaResults.calculatedObjects) === beforeResults, 'bulk package does not mutate calculated objects');

if (failed) {
  console.error(`FAILED ${failed} checks, passed ${passed}`);
  process.exit(1);
}
console.log(`All support load bulk package checks passed (${passed}).`);
