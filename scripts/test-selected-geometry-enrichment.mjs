import assert from 'assert';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scopeUrl = pathToFileURL(path.join(__dirname, '../viewer/enrichment/selected-geometry-scope.js')).href;
const enrichmentUrl = pathToFileURL(path.join(__dirname, '../viewer/enrichment/selected-geometry-enrichment.js')).href;
const branchWorkflowUrl = pathToFileURL(path.join(__dirname, '../viewer/enrichment/selected-geometry-branch-workflow.js')).href;
const { cloneGeometryObjectForWorkspace } = await import(scopeUrl);
const {
  enrichGeometryObject,
  enrichSelectedGeometryScope,
  matchLineListRow,
  matchWeight,
} = await import(enrichmentUrl);
const { buildSelectedGeometryBranchPreview, enrichSelectedGeometryScopeWithBranchWorkflow } = await import(branchWorkflowUrl);

const sourcePipe = {
  id: 'PIPE-100-A',
  name: 'PIPE 8-L100',
  type: 'PIPE',
  attributes: {
    TYPE: 'PIPE',
    OWNER: '/AREA/8-L100-STEAM',
    LINE_NO: '8-L100-STEAM',
    PIPING_CLASS: '66620M0',
    NPS: '8',
    DIAMETER: '219.075',
    WALL_THICK: '12.7',
    MATERIAL_NAME: 'A106-B',
    APOS: { x: 0, y: 0, z: 0 },
    LPOS: { x: 10750, y: 0, z: 0 },
  },
};
const snapshot = cloneGeometryObjectForWorkspace(sourcePipe);
const masters = {
  lineListVersion: 'LL-v1',
  pipingClassVersion: 'PC-v1',
  materialMapVersion: 'MAT-v1',
  weightMasterVersion: 'WT-v1',
  lineList: [
    {
      lineNo: '8-L100-STEAM',
      service: 'Steam',
      fluid: 'Steam',
      pipingClass: '66620M0',
      temp1C: 100,
      fluidDensityKgM3: 800,
      insulationThicknessMm: 50,
    },
  ],
  pipingClass: [
    {
      pipingClass: '66620M0',
      componentType: 'PIPE',
      nps: 8,
      pipeOdMm: 219.075,
      wallThicknessMm: 12.7,
      schedule: '80',
      rating: '300',
      corrosionAllowanceMm: 1.5,
      materialName: 'A106-B',
      materialCode: '106',
    },
  ],
  materialMap: [
    {
      materialCode: '106',
      materialName: 'A106-B',
      materialCategory: 'CS',
      materialDensityKgM3: 7850,
    },
  ],
  weightMaster: [
    {
      nps: 8,
      pipeOdMm: 219.075,
      wallThicknessMm: 13.3,
      schedule: '80',
      componentType: 'PIPE',
      unitPipeWeightKgPerM: 64.6,
      source: 'fixture-weight-master',
    },
  ],
};

const lineMatch = matchLineListRow(snapshot, masters.lineList);
assert.strictEqual(lineMatch.method, 'line-list-exact');
assert.strictEqual(lineMatch.row.service, 'Steam');

const weightMatch = matchWeight(snapshot, masters.lineList[0], masters.pipingClass[0], masters.weightMaster);
assert.strictEqual(weightMatch.method, 'weight-master-approximate');
assert.ok(weightMatch.confidence > 0.7 && weightMatch.confidence < 1);

const enriched = enrichGeometryObject(snapshot, masters, {});
assert.strictEqual(enriched.sourceAttributes.WALL_THICK, '12.7');
assert.strictEqual(enriched.attributes.enrichment.schema, 'selected-geometry-enrichment/v1');
assert.strictEqual(enriched.attributes.enrichment.lineList.lineNo, '8-L100-STEAM');
assert.strictEqual(enriched.attributes.enrichment.pipingClass.className, '66620M0');
assert.strictEqual(enriched.attributes.enrichment.material.materialDensityKgM3, 7850);
assert.strictEqual(enriched.attributes.enrichment.weight.unitPipeWeightKgPerM, 64.6);
assert.strictEqual(enriched.attributes.enrichment.audit.needsReview, true);
assert.deepStrictEqual(enriched.attributes.enrichment.audit.missing, []);
assert.strictEqual(sourcePipe.attributes.enrichment, undefined);

const conflictingMaster = {
  ...masters,
  pipingClass: [{ ...masters.pipingClass[0], wallThicknessMm: 10 }],
};
const conflict = enrichGeometryObject(snapshot, conflictingMaster, {});
assert.ok(conflict.attributes.enrichment.audit.conflicts.some((item) => item.field === 'wallThicknessMm'));
assert.strictEqual(conflict.sourceAttributes.WALL_THICK, '12.7');

const missingWeight = enrichGeometryObject(snapshot, { ...masters, weightMaster: [] }, {});
assert.ok(missingWeight.attributes.enrichment.audit.missing.includes('weight'));
assert.strictEqual(missingWeight.attributes.enrichment.weight.unitPipeWeightKgPerM, null);

const scope = {
  schema: 'selected-geometry-scope/v1',
  scopeMode: 'selected',
  capturedAt: '2026-06-23T00:00:00.000Z',
  axisTransform: { verticalAxis: 'Y', northAxis: 'Z', handedness: 'right' },
  objects: [snapshot],
  stats: { objects: 1 },
};
const enrichedScope = enrichSelectedGeometryScope(scope, masters, {});
assert.strictEqual(enrichedScope.objects[0].attributes.enrichment.lineList.service, 'Steam');
assert.strictEqual(scope.objects[0].attributes.enrichment, undefined);

const meshBackedPipe = cloneGeometryObjectForWorkspace({
  type: 'Mesh',
  name: 'Mesh wrapper',
  userData: {
    attributes: {
      TYPE: 'VALV',
      OWNER: '/BTRM-1000-10"-P1710011-66620M0-01/B1',
      DIAMETER: '273.05',
      APOS: { x: 0, y: 0, z: 0 },
      LPOS: { x: 300, y: 0, z: 0 },
    },
  },
});
assert.strictEqual(meshBackedPipe.type, 'VALV');

const branchScope = {
  schema: 'selected-geometry-scope/v1',
  scopeMode: 'selected',
  capturedAt: '2026-06-23T00:00:00.000Z',
  axisTransform: { verticalAxis: 'Y', northAxis: 'Z', handedness: 'right' },
  objects: [meshBackedPipe],
  stats: { objects: 1 },
};
const branchMasters = {
  lineList: [
    {
      'Line Number': 'P1710011',
      'Piping Class': '66620M0',
      P1: '6000',
      T1: '90',
      DENSITY: '100',
    },
  ],
  pipingClass: [
    {
      SPEC: '66620M0',
      BORE: '250',
      RATING: '600',
      'Material Code': '106',
      Material: 'A106 B',
      'Wall Thickness': '12.7',
      CA: '0',
    },
  ],
  materialMap: [
    { 'Material Code': '106', Material: 'A106 B' },
  ],
  weightMaster: [
    {
      BORE: '250',
      RATING: '600',
      LENGTH: '300',
      WEIGHT: '25',
      TYPE: 'Gate Valve',
    },
  ],
};
const branchPreview = buildSelectedGeometryBranchPreview({
  scope: branchScope,
  masters: branchMasters,
  config: {
    linelist: { lineKeyTokenPositions: '4', tokenDelimiter: '-' },
    rating: { pipingClassTokenIndex: 5, ratingSequence: [['66620', '600']] },
    weight: { boreTokenIndex: 3, npsToDn: { 10: 250 } },
  },
});
assert.strictEqual(branchPreview.counts.branches, 1);
assert.strictEqual(branchPreview.branchRows[0].lineKey, 'P1710011');
assert.strictEqual(branchPreview.branchRows[0].materialCode, '106');
assert.strictEqual(branchPreview.branchRows[0].pipingClassNeedsReview, false);
assert.strictEqual(branchPreview.branchRows[0].weightRows[0].componentType, 'VALV');
assert.notStrictEqual(branchPreview.branchRows[0].weightRows[0].componentType, 'MESH');

const branchEnriched = enrichSelectedGeometryScopeWithBranchWorkflow({
  scope: branchScope,
  masters: branchMasters,
  config: {
    linelist: { lineKeyTokenPositions: '4', tokenDelimiter: '-' },
    rating: { pipingClassTokenIndex: 5, ratingSequence: [['66620', '600']] },
    weight: { boreTokenIndex: 3, npsToDn: { 10: 250 } },
  },
});
assert.strictEqual(branchEnriched.objects[0].attributes.enrichment.pipingClass.materialCode, '106');
assert.strictEqual(branchScope.objects[0].attributes.enrichment, undefined);

console.log('selected geometry enrichment tests passed');
