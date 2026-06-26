import {
  buildAccessSupportLoadFixtureIntakeCompletion,
  getAccessFixtureSpanReferenceRows,
  SUPPORT_LOAD_ACCESS_FIXTURE_PREFILLED_REFERENCE_COLUMNS,
  SUPPORT_LOAD_ACCESS_FIXTURE_REQUIRED_ACCESS_COLUMNS
} from '../geometry-workspace/GeometrySupportLoadAccessFixtureIntakeCompletion.js';
import { parseAccessSupportLoadFixtureText } from '../geometry-workspace/GeometrySupportLoadAccessFixturePack.js';

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

const references = getAccessFixtureSpanReferenceRows();
check(references.length === 20, 'intake completion keeps the full NPS span reference matrix');
check(references.find(row => row.nps === 48)?.verticalNSS === 145000, 'intake completion preserves large-bore Vertical_N_SS reference');

const backlog = buildAccessSupportLoadFixtureIntakeCompletion();
check(backlog.status === 'PENDING_REAL_ACCESS_EXPORT_ROWS', 'default intake completion remains pending until real Access rows are supplied');
check(backlog.pendingRowCount === 19, 'default intake completion excludes the existing NPS 8 Access fixture');
check(backlog.pendingNps.includes(4), 'intake completion includes missing NPS 4');
check(!backlog.pendingNps.includes(8), 'intake completion skips already-covered NPS 8');
check(backlog.prefilledReferenceColumns.join('|') === SUPPORT_LOAD_ACCESS_FIXTURE_PREFILLED_REFERENCE_COLUMNS.join('|'), 'intake completion reports prefilled reference columns');
check(backlog.requiredAccessExportColumns.join('|') === SUPPORT_LOAD_ACCESS_FIXTURE_REQUIRED_ACCESS_COLUMNS.join('|'), 'intake completion reports required real Access columns');

const first = backlog.rows[0];
check(first.NS === 0.5, 'first backlog row starts at first missing NPS');
check(first.PipeOD === 21.34, 'first backlog row pre-fills PipeOD');
check(first.DEP_SPAN === 900, 'first backlog row pre-fills DEP span');
check(first.Vertical_N_SS === 3200, 'first backlog row pre-fills Vertical_N_SS');
check(first.WALL_THICK === '', 'first backlog row leaves WALL_THICK for real Access export');
check(first.TEMP_EXP_C1 === '', 'first backlog row leaves TEMP_EXP_C1 for real Access export');
check(first.MinHoriLoad === '', 'first backlog row leaves MinHoriLoad for real Access export');
check(first.MinHoriLSLoad === '', 'first backlog row leaves MinHoriLSLoad for real Access export');
check(backlog.tsv.startsWith('JOBNAME\tLinenoinCII\tProperlineNo'), 'intake completion exports tab-delimited header');
check(backlog.tsv.includes('\t0.5\t21.34\t900\t3200\t'), 'intake completion TSV includes filled NPS 0.5 reference values');
check((backlog.audit || []).some(item => item.value === 'regression-fixture-intake-only'), 'intake completion audit remains regression-only');
check((backlog.audit || []).some(item => String(item.note || '').includes('not used by runtime hydration')), 'intake completion explicitly blocks runtime top-up usage');

const suppliedRows = `JOBNAME\tLinenoinCII\tProperlineNo\tINSUL_THICK\tNS\tPipeOD\tDEP_SPAN\tVertical_N_SS\tWALL_THICK\tTEMP_EXP_C1\tTEMP_EXP_C2\tMinVerLoad\tMinHoriLoad\tMinHoriLSLoad\tTobeCleaned\tRemarks\tInsulated\tMat_Category
AML-25-SYS-001 REV2 _PS UPDATE\t"8""-P25168-61502-01"\t0-1-\t0\t8\t219.075\t10750\t13000\t12.7\t100\t59\t-2700\t650\t8800\tTo be Cleaned\tSpec Not available\tNo\tLT
NPS4-ACCESS-ROW\t"4""-ACCESS-0001"\t0-2-\t0\t4\t114.3\t6400\t7700\t6.02\t100\t59\t-1165\t200\t3150\tTo be Cleaned\tRegression row\tNo\tLT`;
const imported = parseAccessSupportLoadFixtureText(suppliedRows);
const reduced = buildAccessSupportLoadFixtureIntakeCompletion(imported.fixtures || []);
check(reduced.pendingRowCount === 18, 'intake completion removes newly supplied real Access fixture row from backlog');
check(!reduced.pendingNps.includes(4), 'intake completion skips imported NPS 4 after Access row is supplied');

if (failed) {
  console.error(`FAILED ${failed} checks, passed ${passed}`);
  process.exit(1);
}
console.log(`All support-load Access fixture intake completion checks passed (${passed}).`);
