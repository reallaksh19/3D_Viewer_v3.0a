import { buildGeometrySupportLoadInputModel } from '../geometry-workspace/GeometrySupportLoadInputModel.js';

let passed = 0;
let failed = 0;
function check(condition, label) {
  if (condition) { console.log(`PASS: ${label}`); passed += 1; }
  else { console.error(`FAIL: ${label}`); failed += 1; }
}

const objects = [
  { id: 'PIPE-A', family: 'PIPE', lineNo: '8"-P25168-61502-01', rawFields: { NS: 8, PipeOD: 219.075, WALL_THICK: 12.7, TEMP_EXP_C1: 100 }, geometry: { center: { x: 3200, y: 0, z: 0 } }, pipe: { odMm: 219.075, wallThicknessMm: 12.7, materialCategory: 'LT' }, process: { fluidDensityKgM3: 800, temperature1C: 100 } },
  { id: 'SUP-A', family: 'SUPPORT', lineNo: '8"-P25168-61502-01', displayName: 'GUIDE PS-A', geometry: { center: { x: 0, y: 0, z: 0 } }, support: { supportType: 'GUIDE', supportTag: 'PS-A' }, pipe: { odMm: 219.075 } },
  { id: 'SUP-B', family: 'SUPPORT', lineNo: '8"-P25168-61502-01', displayName: 'REST PS-B', geometry: { center: { x: 6400, y: 0, z: 0 } }, support: { supportType: 'REST', supportTag: 'PS-B' }, pipe: { odMm: 219.075 } }
];

const model = buildGeometrySupportLoadInputModel(objects, { evaluatedAt: '2026-06-23T00:00:00.000Z' });
const pipe = model.pipeInputs[0];
const refs = pipe.supportRefs || [];

check(model.autoSpanResolverVersion === '20260623-support-load-autospan-resolver-1', 'model exposes AutoSpan resolver version');
check(model.autoSpanSummary.autoResolvedCount === 2, 'two support refs are AutoSpan-resolved');
check(pipe.spans.autoSpanMm === 6400, 'pipe-level AutoSpan uses resolved adjacent support distance');
check(pipe.spans.autoSpanBySupport['PS-A'] === 6400, 'AutoSpan is written by support tag for PS-A');
check(pipe.spans.autoSpanBySupport['PS-B'] === 6400, 'AutoSpan is written by support tag for PS-B');
check(refs.every(ref => ref.autoSpanStatus === 'AUTO_RESOLVED_SUPPORT_GRAPH'), 'support refs record AutoSpan resolution status');
check(pipe.audit.some(row => row.source === 'AUTO_SPAN_RESOLVER'), 'pipe audit records AutoSpan resolver source');
check(!JSON.stringify(pipe).includes('Guide_H') && !JSON.stringify(pipe).includes('LineStop_H'), 'AutoSpan hydration does not create calculated load fields');

if (failed) {
  console.error(`FAILED ${failed} checks, passed ${passed}`);
  process.exit(1);
}
console.log(`All support load AutoSpan checks passed (${passed}).`);
