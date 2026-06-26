import { buildGeometrySupportLoadInputModel } from '../geometry-workspace/GeometrySupportLoadInputModel.js';
import { applySupportLoadInputReview, lockReadySupportLoadInputs } from '../geometry-workspace/GeometrySupportLoadInputReview.js';
import { calculateSupportLoadResultsFromInputModel } from '../geometry-workspace/GeometrySupportLoadFormulaEngine.js';
import { buildSupportLoadReport, buildSupportLoadPipeCsv, buildSupportLoadSupportCsv } from '../geometry-workspace/GeometrySupportLoadReportExporter.js';

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
  { id: 'PIPE-8-P25168', family: 'PIPE', lineNo: '8"-P25168-61502-01', rawFields: { NS: 8, PipeOD: 219.075, WALL_THICK: 12.7, TEMP_EXP_C1: 100, TEMP_EXP_C2: 59, DEPSPAN: 10750, AUTOSPAN_MM: 5000, 'UnitPipewtKg/m': 70, 'FluidwtKg/m': 40, FLUID_WT_HYD_KG_M: 50 }, geometry: { center: { x: 0, y: 0, z: 0 } } },
  { id: 'SUP-GUIDE-001', family: 'SUPPORT', lineNo: '8"-P25168-61502-01', geometry: { center: { x: 10, y: -80, z: 0 } }, support: { supportType: 'GUIDE', supportTag: 'PS-G-001' }, pipe: { odMm: 219.075 } },
  { id: 'SUP-STOP-001', family: 'SUPPORT', lineNo: '8"-P25168-61502-01', geometry: { center: { x: 40, y: -80, z: 0 } }, support: { supportType: 'STOP', supportTag: 'PS-LS-001' }, pipe: { odMm: 219.075 } }
];

const baseModel = buildGeometrySupportLoadInputModel(sourceObjects, { evaluatedAt: '2026-06-22T00:00:00.000Z' });
const lockedState = lockReadySupportLoadInputs(baseModel, {}, { reviewedAt: '2026-06-22T01:00:00.000Z' });
const lockedModel = applySupportLoadInputReview(baseModel, lockedState);
const results = calculateSupportLoadResultsFromInputModel(lockedModel, { evaluatedAt: '2026-06-22T02:00:00.000Z' });
const report = buildSupportLoadReport(results, lockedModel, { generatedAt: '2026-06-22T03:00:00.000Z' });

check(report.schema === 'support-load-report/v1', 'report schema is stable');
check(report.status === 'READY_FOR_EXPORT', 'calculated report is ready for export');
check(report.summary.pipeRowCount === 1, 'report has one pipe row');
check(report.summary.supportRowCount === 2, 'report has two support rows');
check(report.summary.guideSupportRowCount === 1, 'report identifies one guide row');
check(report.summary.lineStopSupportRowCount === 1, 'report identifies one stop row');

const pipe = report.pipeRows[0];
check(pipe.inputLocked === true, 'report carries locked input status');
check(pipe.nps === 8, 'pipe report carries NPS');
check(pipe.pipeOdMm === 219.075, 'pipe report carries OD');
check(pipe.wallThicknessMm === 12.7, 'pipe report carries wall thickness');
near(pipe.opeVDep, 13007.5, 0.0001, 'pipe report carries OPE_V_DEP');
near(pipe.guideHDep, 3902.25, 0.0001, 'pipe report carries Guide_H_DEP');
check(pipe.lineStopH === 8800, 'pipe report carries LineStop_H');

const guideSupport = report.supportRows.find(row => row.supportTag === 'PS-G-001');
const stopSupport = report.supportRows.find(row => row.supportTag === 'PS-LS-001');
check(guideSupport.appliesGuide === true, 'guide report row applies guide');
check(guideSupport.lineStopH === null, 'guide row excludes stop result');
check(stopSupport.appliesLineStop === true, 'stop report row applies stop');
check(stopSupport.lineStopH === 8800, 'stop row includes stop result');
check(stopSupport.guideHDep === null, 'stop row excludes guide result');

const pipeCsv = buildSupportLoadPipeCsv(report);
const supportCsv = buildSupportLoadSupportCsv(report);
check(pipeCsv.includes('sourceObjectId,lineNo'), 'pipe CSV contains header');
check(pipeCsv.includes('PIPE-8-P25168'), 'pipe CSV contains pipe row');
check(supportCsv.includes('supportId,supportTag'), 'support CSV contains header');
check(supportCsv.includes('PS-G-001'), 'support CSV contains guide row');
check(supportCsv.includes('PS-LS-001'), 'support CSV contains stop row');

if (failed) {
  console.error(`FAILED ${failed} checks, passed ${passed}`);
  process.exit(1);
}
console.log(`All support load report checks passed (${passed}).`);
