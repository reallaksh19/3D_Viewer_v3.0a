import {
  DEFAULT_SUPPORT_LOAD_ACCESS_FIXTURES,
  evaluateAccessSupportLoadFixture,
  evaluateDefaultAccessSupportLoadFixtures,
  parseAccessSupportLoadFixtureText
} from '../geometry-workspace/GeometrySupportLoadAccessFixturePack.js';
import {
  evaluateAccessSupportLoadFixtureText
} from '../geometry-workspace/GeometrySupportLoadAccessFixtureBatchValidator.js';
import {
  buildAccessSupportLoadFixtureDiagnosticsFromText
} from '../geometry-workspace/GeometrySupportLoadAccessFixtureDiagnostics.js';

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
function near(actual, expected, tolerance, label) {
  const value = Number(actual);
  check(Number.isFinite(value) && Math.abs(value - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}

const summary = evaluateDefaultAccessSupportLoadFixtures();
check(summary.total >= 1, 'default Access fixture pack contains at least one exported reference row');
check(summary.failed === 0, 'default Access fixture pack has no failed rows');
check(summary.passed === summary.total, 'all default Access fixture rows pass');

const fixture = DEFAULT_SUPPORT_LOAD_ACCESS_FIXTURES[0];
const result = evaluateAccessSupportLoadFixture(fixture);
const input = result.pipeInput;
const calc = result.formulaResult?.calculatedFields || {};

if (result.status !== 'PASS') {
  console.error(`Access fixture mismatch diagnostics: ${JSON.stringify(result.checks, null, 2)}`);
}

check(result.status === 'PASS', 'AML NPS 8 Access fixture evaluates successfully');
check(input.identity.lineNo === '8"-P25168-61502-01', 'Access fixture preserves CII line number');
check(input.identity.nps === 8, 'Access fixture preserves NPS 8');
near(input.identity.pipeOdMm, 219.075, 0.001, 'Access fixture preserves 8 inch OD');
near(input.pipePhysical.wallThicknessMm, 12.7, 0.001, 'Access fixture preserves wall thickness');
near(input.process.tempExpC1, 100, 0.001, 'Access fixture preserves TEMP_EXP_C1');
near(input.spans.depSpanMm, 10750, 0.001, 'Access fixture preserves DEP span');
near(calc.vertical?.opeVDep, 13000, 0.15, 'Access fixture reproduces OPE_V_DEP from exported Vertical_N_SS');
check(calc.guide?.roundedGuideHDep === 650, 'Access fixture preserves exported rounded guide component 650 N');
near(calc.guide?.guideHDep, 3900, 0.001, 'Access fixture applies final guide Max rule');
check(calc.lineStop?.lineStopH === 8800, 'Access fixture preserves exported line-stop 8800 N');
check(calc.lineStop?.lineStop?.idExpression === 'D_MINUS_WT', 'Access fixture preserves Access Dia - WALL_THICK line-stop expression');
check((result.audit || []).some(item => item.field === 'runtimeMutation' && item.value === 'none'), 'Access fixture validation does not mutate runtime workspace data');
check((input.audit || []).some(item => item.field === 'weightSplit' && String(item.value).includes('benchmark-vertical-backsolve')), 'Access fixture marks Vertical_N_SS weight split as regression-only');

const pastedAccessRows = `JOBNAME	LinenoinCII	ProperlineNo	INSUL_THICK	NS	PipeOD	DEP_SPAN	Vertical_N_SS	WALL_THICK	TEMP_EXP_C1	TEMP_EXP_C2	MinVerLoad	MinHoriLoad	MinHoriLSLoad	TobeCleaned	Remarks	Insulated	Mat_Category
AML-25-SYS-001 REV2 _PS UPDATE	"8""-P25168-61502-01"	0-1-	0	8	219.075	10750	13000	12.7	100	59	-2700	650	8800	To be Cleaned	Spec Not available	No	LT`;

const imported = parseAccessSupportLoadFixtureText(pastedAccessRows);
check(imported.status === 'IMPORTED', 'Access fixture text importer accepts tab-delimited Access rows');
check(imported.fixtureCount === 1, 'Access fixture text importer returns one fixture row');
check(imported.warnings.length === 0, 'Access fixture text importer has no warnings for complete row');
const importedResult = evaluateAccessSupportLoadFixture(imported.fixtures[0]);
check(importedResult.status === 'PASS', 'imported Access row passes fixture evaluation');
near(importedResult.formulaResult.calculatedFields.vertical.opeVDep, 13000, 0.15, 'imported Access row reproduces OPE_V_DEP');
check(importedResult.formulaResult.calculatedFields.guide.roundedGuideHDep === 650, 'imported Access row reproduces rounded guide component');
check(importedResult.formulaResult.calculatedFields.lineStop.lineStopH === 8800, 'imported Access row reproduces line-stop result');
check(imported.fixtures[0].importAudit.some(item => item.source === 'ACCESS_FIXTURE_IMPORT'), 'imported Access row stores import audit');

const batchAccessRows = `JOBNAME	LinenoinCII	ProperlineNo	INSUL_THICK	NS	PipeOD	DEP_SPAN	Vertical_N_SS	WALL_THICK	TEMP_EXP_C1	TEMP_EXP_C2	MinVerLoad	MinHoriLoad	MinHoriLSLoad	TobeCleaned	Remarks	Insulated	Mat_Category
AML-25-SYS-001 REV2 _PS UPDATE	"8""-P25168-61502-01"	0-1-	0	8	219.075	10750	13000	12.7	100	59	-2700	650	8800	To be Cleaned	Spec Not available	No	LT
UNIT-TEST-NPS4	"4""-UNIT-TEST-0001"	0-2-	0	4	114.3	6400	7700	6.02	100	59	-1165	200	3150	To be Cleaned	Regression row	No	LT`;

const batch = evaluateAccessSupportLoadFixtureText(batchAccessRows);
check(batch.status === 'PASS', 'batch Access fixture validator passes complete pasted rows');
check(batch.total === 2, 'batch Access fixture validator evaluates two rows');
check(batch.failed === 0, 'batch Access fixture validator has no failed rows');
check(batch.results.every(row => row.status === 'PASS'), 'batch Access fixture validator returns row-level pass status');
check(batch.results[1].formulaResult.calculatedFields.guide.roundedGuideHDep === 200, 'batch Access validator preserves NPS4 rounded guide component');
near(batch.results[1].formulaResult.calculatedFields.guide.guideHDep, 2310, 0.001, 'batch Access validator applies NPS4 guide Max rule');
check(batch.results[1].formulaResult.calculatedFields.lineStop.lineStopH === 3150, 'batch Access validator preserves NPS4 line-stop reference');
check((batch.audit || []).some(item => item.value === 'regression-fixture-only'), 'batch Access validator is marked regression-only, not runtime top-up');

const diagnostics = buildAccessSupportLoadFixtureDiagnosticsFromText(batchAccessRows);
check(diagnostics.status === 'PASS', 'Access fixture diagnostics pass for complete batch');
check(diagnostics.total === 2, 'Access fixture diagnostics includes both rows');
check(diagnostics.mismatchCount === 0, 'Access fixture diagnostics has no mismatches for valid rows');
check(diagnostics.rows[0].lineNo === '8"-P25168-61502-01', 'Access fixture diagnostics records row line number');
check(diagnostics.rows[1].nps === 4, 'Access fixture diagnostics records NPS4 row');
check(diagnostics.rows[1].roundedGuideHDep === 200, 'Access fixture diagnostics records rounded guide value');
check((diagnostics.audit || []).some(item => item.value === 'regression-fixture-only'), 'Access fixture diagnostics remains regression-only');

const mismatchedAccessRows = `JOBNAME	LinenoinCII	ProperlineNo	INSUL_THICK	NS	PipeOD	DEP_SPAN	Vertical_N_SS	WALL_THICK	TEMP_EXP_C1	TEMP_EXP_C2	MinVerLoad	MinHoriLoad	MinHoriLSLoad	TobeCleaned	Remarks	Insulated	Mat_Category
AML-25-SYS-001 REV2 _PS UPDATE	"8""-P25168-61502-01"	0-1-	0	8	219.075	10750	13000	12.7	100	59	-2700	999	9999	To be Cleaned	Deliberate mismatch row	No	LT`;

const mismatchDiagnostics = buildAccessSupportLoadFixtureDiagnosticsFromText(mismatchedAccessRows);
check(mismatchDiagnostics.status === 'FAIL', 'Access fixture diagnostics fails deliberate mismatched reference row');
check(mismatchDiagnostics.total === 1, 'Access fixture diagnostics still reports mismatched row count');
check(mismatchDiagnostics.mismatchCount >= 2, 'Access fixture diagnostics captures multiple mismatched fields');
check(mismatchDiagnostics.rows[0].status === 'FAIL', 'Access fixture diagnostics marks mismatched row as failed');
check(mismatchDiagnostics.rows[0].failedChecks >= 2, 'Access fixture diagnostics records failed check count on row');
check(mismatchDiagnostics.mismatches.some(item => item.field === 'guide.roundedGuideHDep'), 'Access fixture diagnostics includes rounded guide mismatch field');
check(mismatchDiagnostics.mismatches.some(item => item.field === 'lineStop.lineStopH'), 'Access fixture diagnostics includes line-stop mismatch field');
check((mismatchDiagnostics.audit || []).some(item => item.value === 'regression-fixture-only'), 'Access fixture mismatch diagnostics remains regression-only');

if (failed) {
  console.error(`FAILED ${failed} checks, passed ${passed}`);
  process.exit(1);
}
console.log(`All support-load Access fixture pack checks passed (${passed}).`);
