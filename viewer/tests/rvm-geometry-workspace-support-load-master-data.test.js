import { buildDefaultSupportLoadMasterData, findDepSpanMasterRow, normalizeSupportLoadMasterDataPackage, summarizeSupportLoadMasterData, SUPPORT_LOAD_MASTER_DATA_SCHEMA } from '../geometry-workspace/GeometrySupportLoadMasterData.js';

let passed = 0;
let failed = 0;
function check(condition, label) {
  if (condition) { console.log(`PASS: ${label}`); passed += 1; }
  else { console.error(`FAIL: ${label}`); failed += 1; }
}

const defaults = buildDefaultSupportLoadMasterData({ generatedAt: '2026-06-23T00:00:00.000Z' });
const summary = summarizeSupportLoadMasterData(defaults);

check(defaults.schema === SUPPORT_LOAD_MASTER_DATA_SCHEMA, 'master data schema is stable');
check(defaults.policy.noSilentTopUp === true, 'master data policy blocks silent top-up');
check(defaults.policy.noFormulaExecution === true, 'master data policy does not run formulas');
check(summary.depSpanRowCount >= 20, 'default DEP span table is populated');
check(summary.pipeWeightRowCount === 0, 'default pipe weight table does not fabricate rows');
check(summary.status === 'MASTER_DATA_READY_FOR_INPUT_HYDRATION', 'summary status is hydration-ready only');

const dep8 = findDepSpanMasterRow(defaults, { nps: 8 });
check(dep8?.pipeOdMm === 219.075, 'DEP lookup resolves NPS 8 OD');
check(dep8?.depSpanMm === 10750, 'DEP lookup resolves NPS 8 DEPSpan');

const imported = normalizeSupportLoadMasterDataPackage({
  depSpanRows: [{ NPS: '8', PipeOD: '219.075', 'DEP SPAN': '10800', source: 'USER_PROJECT_TABLE' }],
  materialDensityRows: [{ Mat_Category: 'DSS', densityKgM3: '7800' }],
  pipeWeightRows: [{ NPS: 8, PipeOD: 219.075, SCH: '40', WALL_THICK: 12.7, 'UnitPipewtKg/m': 67.2 }],
  hydroDensityProfiles: [{ id: 'HYD_TEST', densityKgM3: 998.2 }],
  tempFunctionProfiles: [{ id: 'TEMP_TABLE', mode: 'piecewise', points: [{ x: 100, y: 100 }] }],
  roundingProfiles: [{ id: 'ROUND_25', roundStep: 25, roundMode: 'up' }]
}, { generatedAt: '2026-06-23T01:00:00.000Z' });

check(imported.depSpanRows[0].depSpanMm === 10800, 'import normalizes DEP span rows');
check(imported.materialDensityRows[0].materialDensityKgM3 === 7800, 'import normalizes material density rows');
check(imported.pipeWeightRows[0].unitPipeWtKgPerM === 67.2, 'import normalizes pipe weight rows');
check(imported.hydroDensityProfiles[0].fluidDensityHydKgM3 === 998.2, 'import normalizes hydro density profiles');
check(imported.tempFunctionProfiles[0].points[0].factor === 100, 'import preserves TempfnC points');
check(imported.roundingProfiles[0].roundStep === 25, 'import normalizes rounding profile');
check(!JSON.stringify(imported).includes('calculatedFields'), 'master data does not contain calculated fields');
check(!JSON.stringify(imported).includes('supportLoads'), 'master data does not contain support-load results');

if (failed) {
  console.error(`FAILED ${failed} checks, passed ${passed}`);
  process.exit(1);
}
console.log(`All support load master data checks passed (${passed}).`);
