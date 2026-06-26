import { buildGeometrySupportLoadInputModel, exampleSupportLoadInputObjects } from '../geometry-workspace/GeometrySupportLoadInputModel.js';
import { normalizeSupportLoadMasterDataPackage } from '../geometry-workspace/GeometrySupportLoadMasterData.js';

let passed = 0;
let failed = 0;
function check(condition, label) {
  if (condition) { console.log(`PASS: ${label}`); passed += 1; }
  else { console.error(`FAIL: ${label}`); failed += 1; }
}

const masterData = normalizeSupportLoadMasterDataPackage({
  depSpanRows: [{ nps: 8, pipeOdMm: 219.075, depSpanMm: 10800, source: 'TEST_DEP_TABLE' }],
  materialDensityRows: [{ materialCategory: 'LT', materialDensityKgM3: 7900, source: 'TEST_MATERIAL_TABLE' }],
  pipeWeightRows: [{ nps: 8, pipeOdMm: 219.075, wallThicknessMm: 12.7, unitPipeWtKgPerM: 68.5, source: 'TEST_PIPE_WEIGHT_TABLE' }],
  hydroDensityProfiles: [{ profileId: 'TEST_HYDRO', fluidDensityHydKgM3: 998.2, source: 'TEST_HYDRO_TABLE' }],
  tempFunctionProfiles: [{ profileId: 'TEST_TEMP_IDENTITY', mode: 'identity', source: 'TEST_TEMP_TABLE' }],
  roundingProfiles: [{ profileId: 'TEST_ROUND_25', roundMajor: 100, roundStep: 25, roundMode: 'up', source: 'TEST_ROUNDING_TABLE' }]
}, { generatedAt: '2026-06-23T00:00:00.000Z' });

const model = buildGeometrySupportLoadInputModel(exampleSupportLoadInputObjects(), { supportLoadMasterData: masterData, evaluatedAt: '2026-06-23T00:00:00.000Z' });
const pipe = model.pipeInputs[0];
const pipeJson = JSON.stringify(pipe);

check(model.masterDataSummary.depSpanRowCount === 1, 'model records supplied master DEP span package');
check(model.masterDataSummary.pipeWeightRowCount === 1, 'model records supplied pipe weight package');
check(pipe.spans.depSpanMm === 10800, 'DEP span is hydrated from controlled master table when raw value is absent');
check(pipe.pipePhysical.materialDensityKgM3 === 7900, 'material density is hydrated from controlled master table');
check(pipe.pipePhysical.unitPipeWtKgPerM === 68.5, 'pipe weight uses controlled pipe weight table before deterministic derivation');
check(pipe.process.fluidDensityHydKgM3 === 998.2, 'hydro density is hydrated from controlled profile');
check(pipe.formulaProfile.roundStep === 25, 'rounding metadata is hydrated from controlled profile');
check(pipe.formulaProfile.tempFunctionProfileId === 'TEST_TEMP_IDENTITY', 'TempfnC profile metadata is hydrated from controlled profile');
check(pipe.audit.some(row => row.source === 'PROJECT_MASTER_TABLE' && row.field === 'pipePhysical.unitPipeWtKgPerM'), 'pipe weight master usage is audited');
check(pipe.audit.some(row => row.source === 'PROJECT_MASTER_TABLE' && row.field === 'spans.depSpanMm'), 'DEP span master usage is audited');
check(!pipeJson.includes('OPE_V_A') && !pipeJson.includes('Guide_H') && !pipeJson.includes('LineStop_H'), 'hydration does not write calculated support-load outputs');
check(model.noLoadFormula === true, 'hydration model remains formula-free');

if (failed) {
  console.error(`FAILED ${failed} checks, passed ${passed}`);
  process.exit(1);
}
console.log(`All support load master hydration checks passed (${passed}).`);
