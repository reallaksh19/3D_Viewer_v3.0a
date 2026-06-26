import { buildGeometrySupportLoadInputModel } from '../geometry-workspace/GeometrySupportLoadInputModel.js';
import { calculateSupportLoadResultsFromInputModel } from '../geometry-workspace/GeometrySupportLoadFormulaEngine.js';

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
function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freezeDeep(child)])));
}
function lockPipeInput(input) {
  return freezeDeep({
    ...input,
    readiness: {
      ...(input.readiness || {}),
      readyForCalculation: true,
      lockedForCalculation: true,
      calculationGateStatus: 'INPUT_LOCKED',
      status: 'INPUT_READY',
      missing: []
    }
  });
}
function lockHydratedObjects(objects, lockedInputs) {
  const byId = new Map(lockedInputs.map(input => [input.sourceObjectId, input]));
  return freezeDeep(objects.map(object => byId.has(object.id)
    ? { ...object, attributes: { ...(object.attributes || {}), supportLoadInput: byId.get(object.id) }, supportLoadInput: byId.get(object.id) }
    : object));
}

const bmCiiManagedStageObjects = freezeDeep([
  {
    id: 'BM-CII-PIPE-PE_004_PIPE_35_TO_70',
    family: 'PIPE',
    lineNo: 'LINE XYZ',
    displayName: 'PIPE PE_004_PIPE_35_TO_70',
    rawFields: {
      TYPE: 'PIPE',
      RAW_TYPE: 'PIPE',
      NAME: 'PE_004_PIPE_35_TO_70',
      LINE_NO: 'LINE XYZ',
      DIAMETER: '114.3mm',
      BORE: '114.3mm',
      WALL_THICK: '6.000000',
      TEMP_EXP_C1: '350.000000',
      TEMP_EXP_C2: '59.000000',
      MATERIAL: 'A106 B',
      Mat_Category: 'LT'
    },
    geometry: { center: { x: 0, y: 0, z: -1321.145992 } },
    pipe: { odMm: 114.3, wallThicknessMm: 6, materialCategory: 'LT' },
    process: { fluidDensityKgM3: 800, temperature1C: 350, temperature2C: 59 }
  },
  {
    id: 'BM-CII-SUPPORT-INPUTXML-10-REST',
    family: 'SUPPORT',
    lineNo: 'LINE XYZ',
    displayName: 'SUPPORT INPUTXML-10-REST',
    rawFields: {
      TYPE: 'ATTA',
      RAW_TYPE: 'ATTA',
      NAME: 'INPUTXML-10-REST',
      LINE_NO: 'LINE XYZ',
      SUPPORT_TAG: 'INPUTXML-10-REST',
      SUPPORT_KIND: 'REST',
      SUPPORT_TYPE: 'REST',
      ATTACHED_PIPE_OD: '114.3mm'
    },
    geometry: { center: { x: 0, y: 0, z: 0 } },
    support: { supportType: 'REST', supportTag: 'INPUTXML-10-REST' },
    pipe: { odMm: 114.3 }
  },
  {
    id: 'BM-CII-SUPPORT-INPUTXML-35-GUIDE',
    family: 'SUPPORT',
    lineNo: 'LINE XYZ',
    displayName: 'SUPPORT INPUTXML-35-GUIDE',
    rawFields: {
      TYPE: 'ATTA',
      RAW_TYPE: 'ATTA',
      NAME: 'INPUTXML-35-GUIDE',
      LINE_NO: 'LINE XYZ',
      SUPPORT_TAG: 'INPUTXML-35-GUIDE',
      SUPPORT_KIND: 'GUIDE',
      SUPPORT_TYPE: 'GUIDE',
      ATTACHED_PIPE_OD: '114.3mm'
    },
    geometry: { center: { x: 0, y: 0, z: -2642.291984 } },
    support: { supportType: 'GUIDE', supportTag: 'INPUTXML-35-GUIDE' },
    pipe: { odMm: 114.3 }
  },
  {
    id: 'BM-CII-SUPPORT-INPUTXML-130-LINESTOP',
    family: 'SUPPORT',
    lineNo: 'LINE XYZ',
    displayName: 'SUPPORT INPUTXML-130-LINESTOP',
    rawFields: {
      TYPE: 'ATTA',
      RAW_TYPE: 'ATTA',
      NAME: 'INPUTXML-130-LINESTOP',
      LINE_NO: 'LINE XYZ',
      SUPPORT_TAG: 'INPUTXML-130-LINESTOP',
      SUPPORT_KIND: 'LINESTOP',
      SUPPORT_TYPE: 'LINESTOP',
      ATTACHED_PIPE_OD: '114.3mm'
    },
    geometry: { center: { x: 0, y: 0, z: -4619.394376 } },
    support: { supportType: 'LINESTOP', supportTag: 'INPUTXML-130-LINESTOP' },
    pipe: { odMm: 114.3 }
  }
]);

const inputModel = buildGeometrySupportLoadInputModel(bmCiiManagedStageObjects, { evaluatedAt: '2026-06-23T00:00:00.000Z' });

check(inputModel.schemaVersion === 'geometry-support-load-input-model/v1', 'BM_CII managed-stage fixture builds support-load input model');
check(inputModel.pipeCandidateCount === 1, 'one pipe candidate is hydrated from real stagedJSON-like pipe data');
check(inputModel.objectCount === 3, 'three real stagedJSON-like support rows are associated');
check(inputModel.autoSpanSummary.autoResolvedCount === 3, 'AutoSpan is resolved from real support coordinates');

const pipeInput = inputModel.pipeInputs[0];
check(pipeInput.identity.nps === 4, 'NPS 4 is resolved from 114.3 mm OD via controlled DEP span table');
near(pipeInput.identity.pipeOdMm, 114.3, 0.001, 'pipe OD is hydrated from managed-stage pipe attribute');
near(pipeInput.pipePhysical.wallThicknessMm, 6, 0.001, 'wall thickness is hydrated from WALL_THICK');
near(pipeInput.pipePhysical.insideDiameterMm, 102.3, 0.001, 'inside diameter is derived as OD - 2 × wall for weight inputs');
near(pipeInput.pipePhysical.unitPipeWtKgPerM, 16.025, 0.001, 'pipe kg/m is deterministically derived from OD, ID, and material density');
near(pipeInput.process.fluidWtOpeKgPerM, 6.576, 0.001, 'operating fluid kg/m is derived from ID area and operating density');
near(pipeInput.process.fluidWtHydKgPerM, 8.219, 0.001, 'hydro fluid kg/m is derived from ID area and hydro density');
near(pipeInput.spans.depSpanMm, 6400, 0.001, 'DEPSpan is hydrated from NPS/OD master table');
near(pipeInput.spans.autoSpanMm, 2642.292, 0.001, 'AutoSpan uses dominant-axis adjacent support distance');
check((pipeInput.audit || []).some(row => row.source === 'DERIVED_PIPE_WEIGHT'), 'input audit records deterministic pipe-weight derivation');
check((pipeInput.audit || []).some(row => row.source === 'DERIVED_FLUID_WEIGHT' && row.field === 'process.fluidWtOpeKgPerM'), 'input audit records deterministic OPE fluid-weight derivation');
check((pipeInput.audit || []).some(row => row.source === 'PROJECT_MASTER_TABLE' && row.field === 'spans.depSpanMm'), 'input audit records DEP span project-master source');

const lockedPipeInputs = inputModel.pipeInputs.map(lockPipeInput);
const lockedModel = freezeDeep({
  ...inputModel,
  pipeInputs: lockedPipeInputs,
  hydratedObjects: lockHydratedObjects(inputModel.hydratedObjects || [], lockedPipeInputs)
});
const result = calculateSupportLoadResultsFromInputModel(lockedModel, { evaluatedAt: '2026-06-23T00:00:00.000Z' });

check(result.status === 'CALCULATED', 'real-model validation fixture calculates after explicit input lock');
check(result.calculatedPipeCount === 1, 'one pipe result is calculated');
near(result.pipeResults[0].calculatedFields.vertical.opeVA, 656.9, 0.15, 'OPE_V_A matches AutoSpan-based real-model fixture');
near(result.pipeResults[0].calculatedFields.vertical.hydVA, 704.7, 0.15, 'HYD_V_A matches AutoSpan-based real-model fixture');
near(result.pipeResults[0].calculatedFields.vertical.opeVDep, 1591.1, 0.15, 'OPE_V_DEP matches DEPSpan-based real-model fixture');
near(result.pipeResults[0].calculatedFields.vertical.hydVDep, 1706.8, 0.15, 'HYD_V_DEP matches DEPSpan-based real-model fixture');
near(result.pipeResults[0].calculatedFields.guide.guideHA, 197.07, 0.01, 'Guide_H_A uses max of rounded guide and 30 percent OPE_V_A');
near(result.pipeResults[0].calculatedFields.guide.guideHDep, 477.33, 0.01, 'Guide_H_DEP uses max of rounded guide and 30 percent OPE_V_DEP');
check(result.pipeResults[0].calculatedFields.lineStop.lineStopH === 10900, 'LineStop_H matches 4 inch real-model fixture with Access D-WT expression');

const guideRow = result.supportRows.find(row => row.supportTag === 'INPUTXML-35-GUIDE');
const lineStopRow = result.supportRows.find(row => row.supportTag === 'INPUTXML-130-LINESTOP');
const restRow = result.supportRows.find(row => row.supportTag === 'INPUTXML-10-REST');
check(Boolean(guideRow?.guide) && !guideRow.lineStop, 'GUIDE support receives guide result reference only');
check(Boolean(lineStopRow?.lineStop) && !lineStopRow.guide, 'LINESTOP support receives line-stop result reference only');
check(restRow?.applies?.vertical === true && !restRow.guide && !restRow.lineStop, 'REST support receives vertical applicability without horizontal result reference');
check(result.writebackAudit.inputPackageMutatedCount === 0, 'formula writeback does not mutate locked support-load input packages');
check(result.writebackAudit.pipeCalculatedWriteCount === 1, 'calculated support loads are written only to pipe calculated fields');
check(result.writebackAudit.supportCalculatedWriteCount === 3, 'support result references are written only to support calculated fields');

if (failed) {
  console.error(`FAILED ${failed} checks, passed ${passed}`);
  process.exit(1);
}
console.log(`All support-load real-model validation checks passed (${passed}).`);
