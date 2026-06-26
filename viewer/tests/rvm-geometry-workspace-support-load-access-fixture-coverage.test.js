import {
  buildAccessSupportLoadFixtureCoverage,
  buildAccessSupportLoadFixtureCoverageFromText,
  buildAccessSupportLoadFixtureIntakeTemplate,
  buildAccessSupportLoadFixtureIntakeTemplateFromText,
  buildDefaultAccessSupportLoadFixtureCoverage
} from '../geometry-workspace/GeometrySupportLoadAccessFixtureCoverage.js';

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

const defaultCoverage = buildDefaultAccessSupportLoadFixtureCoverage();
check(defaultCoverage.status === 'PARTIAL', 'default Access fixture coverage is partial until more Access exported rows are added');
check(defaultCoverage.fixtureCount >= 1, 'default Access fixture coverage sees existing default fixture rows');
check(defaultCoverage.depSpanRowCount === 20, 'coverage compares against full DEP span master NPS matrix');
check(defaultCoverage.coveredNps.includes(8), 'coverage marks NPS 8 as covered');
check(defaultCoverage.missingNps.includes(4), 'coverage marks missing NPS 4 when only default fixture exists');
check(defaultCoverage.missingNps.includes(48), 'coverage marks large-bore rows still needing Access fixtures');
check(defaultCoverage.rows.find(row => row.nps === 8)?.lineNos.includes('8"-P25168-61502-01'), 'coverage records line numbers for covered fixture rows');
check((defaultCoverage.audit || []).some(item => item.value === 'regression-fixture-only'), 'coverage audit stays regression-only');

const defaultTemplate = buildAccessSupportLoadFixtureIntakeTemplate(undefined, {}, { limit: 3 });
check(defaultTemplate.status === 'TEMPLATE_READY', 'fixture intake template is ready when coverage has missing NPS rows');
check(defaultTemplate.templateRowCount === 3, 'fixture intake template honors row limit');
check(defaultTemplate.rows[0].NS === 0.5, 'fixture intake template starts from first uncovered NPS');
check(defaultTemplate.rows[0].PipeOD === 21.34, 'fixture intake template pre-populates pipe OD from DEP span matrix');
check(defaultTemplate.rows[0].DEP_SPAN === 900, 'fixture intake template pre-populates DEP span from matrix');
check(defaultTemplate.rows[0].Vertical_N_SS === '', 'fixture intake template leaves Access result fields blank');
check(defaultTemplate.tsv.startsWith('JOBNAME\tLinenoinCII\tProperlineNo'), 'fixture intake template emits tabular header');
check(defaultTemplate.tsv.includes('\n\t\t\t\t0.5\t21.34\t900\t'), 'fixture intake template emits tab-delimited missing-row shell');
check((defaultTemplate.audit || []).some(item => item.value === 'regression-fixture-only'), 'fixture intake template is regression-only');

const batchAccessRows = `JOBNAME\tLinenoinCII\tProperlineNo\tINSUL_THICK\tNS\tPipeOD\tDEP_SPAN\tVertical_N_SS\tWALL_THICK\tTEMP_EXP_C1\tTEMP_EXP_C2\tMinVerLoad\tMinHoriLoad\tMinHoriLSLoad\tTobeCleaned\tRemarks\tInsulated\tMat_Category
AML-25-SYS-001 REV2 _PS UPDATE\t"8""-P25168-61502-01"\t0-1-\t0\t8\t219.075\t10750\t13000\t12.7\t100\t59\t-2700\t650\t8800\tTo be Cleaned\tSpec Not available\tNo\tLT
UNIT-TEST-NPS4\t"4""-UNIT-TEST-0001"\t0-2-\t0\t4\t114.3\t6400\t7700\t6.02\t100\t59\t-1165\t200\t3150\tTo be Cleaned\tRegression row\tNo\tLT`;

const batchCoverage = buildAccessSupportLoadFixtureCoverageFromText(batchAccessRows);
check(batchCoverage.status === 'PARTIAL', 'two-row Access fixture coverage is still partial against full matrix');
check(batchCoverage.fixtureCount === 2, 'coverage-from-text counts both imported Access fixtures');
check(batchCoverage.coveredNps.includes(4), 'coverage-from-text marks NPS 4 as covered');
check(batchCoverage.coveredNps.includes(8), 'coverage-from-text marks NPS 8 as covered');
check(batchCoverage.coveredNpsCount === 2, 'coverage-from-text counts two covered NPS rows');
check(batchCoverage.rows.find(row => row.nps === 4)?.fixtureCount === 1, 'coverage row records fixture count by NPS');
check(batchCoverage.importStatus === 'IMPORTED', 'coverage-from-text preserves parser import status');
check(batchCoverage.importWarnings.length === 0, 'coverage-from-text preserves clean parser warnings');

const batchTemplate = buildAccessSupportLoadFixtureIntakeTemplateFromText(batchAccessRows, { limit: 2 });
check(batchTemplate.status === 'TEMPLATE_READY', 'fixture intake template from text is ready for remaining missing NPS rows');
check(batchTemplate.importStatus === 'IMPORTED', 'fixture intake template from text preserves import status');
check(batchTemplate.rows.every(row => row.NS !== 4 && row.NS !== 8), 'fixture intake template from text skips already-covered NPS rows');
check(batchTemplate.templateRowCount === 2, 'fixture intake template from text honors limit');

const emptyCoverage = buildAccessSupportLoadFixtureCoverage([]);
check(emptyCoverage.status === 'EMPTY', 'empty Access fixture coverage reports EMPTY');
check(emptyCoverage.coveredNpsCount === 0, 'empty Access fixture coverage has no covered rows');
check(emptyCoverage.missingNpsCount === 20, 'empty Access fixture coverage still reports all DEP span rows missing');

if (failed) {
  console.error(`FAILED ${failed} checks, passed ${passed}`);
  process.exit(1);
}
console.log(`All support-load Access fixture coverage checks passed (${passed}).`);
