import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');
const parserUrl = pathToFileURL(path.join(repoRoot, 'viewer/enrichment/selected-geometry-master-parser.js')).href;
const branchWorkflowUrl = pathToFileURL(path.join(repoRoot, 'viewer/enrichment/selected-geometry-branch-workflow.js')).href;
const { parseSelectedGeometryMasterText, parseSelectedGeometryMasterWorkbook } = await import(parserUrl);
const { buildSelectedGeometryBranchPreview, enrichSelectedGeometryScopeWithBranchWorkflow } = await import(branchWorkflowUrl);

const rendererPath = path.join(repoRoot, 'viewer/tabs/viewer3d-rvm-tab-renderer.js');
const rvmTabPath = path.join(repoRoot, 'viewer/tabs/viewer3d-rvm-tab.js');
const panelPath = path.join(repoRoot, 'viewer/enrichment/SelectedGeometryEnrichmentPanel.js');
const detailsPath = path.join(repoRoot, 'viewer/enrichment/SelectedGeometryEnrichmentDetails.js');
const popupRendererPath = path.join(repoRoot, 'viewer/enrichment/SelectedGeometryEnrichmentPopupRenderer.js');
const parserPath = path.join(repoRoot, 'viewer/enrichment/selected-geometry-master-parser.js');
const rendererText = fs.readFileSync(rendererPath, 'utf8');
const rvmTabText = fs.readFileSync(rvmTabPath, 'utf8');
const panelText = fs.readFileSync(panelPath, 'utf8');
const detailsText = fs.readFileSync(detailsPath, 'utf8');
const popupRendererText = fs.readFileSync(popupRendererPath, 'utf8');
const parserText = fs.readFileSync(parserPath, 'utf8');
const popupSourceText = `${panelText}\n${popupRendererText}`;

assert.ok(rendererText.includes('SelectedGeometryEnrichmentPanel.js?v=20260624-selected-geometry-floating-workflow-3'));
assert.ok(rendererText.includes('viewer3d-rvm-tab.js?v=20260624-selected-geometry-floating-workflow-3'));
assert.ok(rendererText.includes('installSelectedGeometryEnrichmentPanel();'));
assert.ok(rvmTabText.includes('SelectedGeometryEnrichmentPanel.js?v=20260624-selected-geometry-floating-workflow-3'));
assert.ok(rvmTabText.includes('syncSelectedGeometryEnrichmentPanels();'));

assert.ok(panelText.includes('data-sgw-open="true"'));
assert.ok(panelText.includes('data-sgw-drag-handle'));
assert.ok(panelText.includes("setAttribute('aria-modal', 'false')"));
assert.ok(panelText.includes("querySelector?.('#rvm-selected-geometry-enrichment-panel')?.remove();"));
assert.ok(!panelText.includes('ensurePanel'));
assert.ok(!panelText.includes('.rvm-right-panel'));

for (const action of ['preview', 'run', 'export', 'send', 'save-config', 'export-config']) {
  assert.ok(popupSourceText.includes(`data-sgw-action="${action}"`), `Missing floating action ${action}`);
}

for (const key of ['lineList', 'pipingClass', 'materialMap', 'weightMaster']) {
  assert.ok(panelText.includes(key), `Missing master ${key}`);
}

assert.ok(panelText.includes('PENDING_WORKSPACE_PACKAGE_STORAGE_KEY'));
assert.ok(panelText.includes('RVM_SELECTED_GEOMETRY_POST_MESSAGE_TYPE'));
assert.ok(panelText.includes('postMessage'));
assert.ok(popupRendererText.includes('.xlsx,.xlsm,.xlsb,.xls,.ods'));
assert.ok(popupRendererText.includes('data-sgw-row-field'));
assert.ok(panelText.includes('apply-common-overrides'));
assert.ok(panelText.includes('applyPreviewFillDown'));
assert.ok(detailsText.includes('renderSelectedGeometryEnrichmentDetails'));
assert.ok(detailsText.includes('applySelectedGeometryEnrichmentIndicators'));

const csv = parseSelectedGeometryMasterText('lineNo,pipingClass,service\n"8-L100,STEAM",66620M0,Steam\n', 'line-list.csv', 'lineList');
assert.strictEqual(csv.rows.length, 1);
assert.strictEqual(csv.rows[0].lineNo, '8-L100,STEAM');
assert.strictEqual(csv.rows[0].lineNoKey, '8-L100,STEAM');
assert.strictEqual(csv.rows[0].pipingClass, '66620M0');
assert.strictEqual(csv.rows[0]._bindings.lineNo, 'lineNo');
assert.strictEqual(csv.rows[0]._raw.service, 'Steam');

const aliasLineList = parseSelectedGeometryMasterText('Pipeline Reference,Pipe Class,Design Pressure,Design Temp,Fluid Density\nP1710011,66620M0,6000,90,100\n', 'line-list.csv', 'lineList');
assert.strictEqual(aliasLineList.rows[0].lineNo, 'P1710011');
assert.strictEqual(aliasLineList.rows[0].lineNoKey, 'P1710011');
assert.strictEqual(aliasLineList.rows[0].pipingClass, '66620M0');
assert.strictEqual(aliasLineList.rows[0].p1, '6000');
assert.strictEqual(aliasLineList.rows[0].t1, '90');
assert.strictEqual(aliasLineList.rows[0].density, '100');
assert.strictEqual(aliasLineList.rows[0]._bindings.pipingClass, 'Pipe Class');

const txt = parseSelectedGeometryMasterText('106 ASTM A106-B\n316 ASTM A312 TP316\n', 'PCF_MAT_MAP.TXT', 'materialMap');
assert.strictEqual(txt.rows.length, 2);
assert.strictEqual(txt.rows[0].code, '106');
assert.strictEqual(txt.rows[0].material, 'ASTM A106-B');
assert.strictEqual(txt.rows[0].materialCode, '106');
assert.strictEqual(txt.rows[0].materialName, 'ASTM A106-B');

const json = parseSelectedGeometryMasterText('{"version":"MAT-v1","rows":[{"materialCode":"106","materialName":"A106-B"}]}', 'materials.json', 'materialMap');
assert.strictEqual(json.version, 'MAT-v1');
assert.strictEqual(json.rows[0].materialCode, '106');
assert.strictEqual(json.rows[0].code, '106');

const classCsv = parseSelectedGeometryMasterText('Pipe Class,Material Code,Wall Thk,Corr,Pressure Class\n66620M0,106,12.7,1.5,600\n', 'pclass.csv', 'pipingClass');
assert.strictEqual(classCsv.rows[0].pipingClass, '66620M0');
assert.strictEqual(classCsv.rows[0].materialCode, '106');
assert.strictEqual(classCsv.rows[0].wallThickness, '12.7');
assert.strictEqual(classCsv.rows[0].corrosion, '1.5');
assert.strictEqual(classCsv.rows[0].rating, '600');
assert.strictEqual(classCsv.rows[0]._bindings.materialCode, 'Material Code');

const weightCsv = parseSelectedGeometryMasterText('BORE,RATING,LENGTH MM,WEIGHT KG,TYPE DESC\n250,600,311.15,742.8,FLANGED VALVE\n', 'weight.csv', 'weightMaster');
assert.strictEqual(weightCsv.rows[0].boreMm, '250');
assert.strictEqual(weightCsv.rows[0].rating, '600');
assert.strictEqual(weightCsv.rows[0].lengthMm, '311.15');
assert.strictEqual(weightCsv.rows[0].weight, '742.8');
assert.strictEqual(weightCsv.rows[0].typeDesc, 'FLANGED VALVE');
assert.strictEqual(weightCsv.rows[0]._bindings.weight, 'WEIGHT KG');

const workbook = parseSelectedGeometryMasterWorkbook(new ArrayBuffer(0), 'line-list.xls', 'lineList', {
  read() {
    return { SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } };
  },
  utils: {
    sheet_to_json() {
      return [{ 'Line Number': 'S8810101', 'Piping Class': '200AA1' }];
    },
  },
});
assert.strictEqual(workbook.format, 'workbook');
assert.strictEqual(workbook.rows.length, 1);
assert.strictEqual(workbook.rows[0]['Line Number'], 'S8810101');
assert.strictEqual(workbook.rows[0].lineNo, 'S8810101');
assert.strictEqual(workbook.rows[0].lineNoKey, 'S8810101');
assert.strictEqual(workbook.rows[0].pipingClass, '200AA1');
assert.strictEqual(workbook.rows[0]._bindings.lineNo, 'Line Number');

const scope = {
  schema: 'selected-geometry-scope/v1',
  scopeMode: 'selected',
  capturedAt: '2026-06-24T00:00:00.000Z',
  stats: { objects: 1 },
  objects: [{
    id: 'OBJ-1',
    name: 'Pipe 1',
    type: 'PIPE',
    sourcePath: '/ASIM-1885-10"-S8810101-200AA1-HC/B1',
    apos: { x: 0, y: 0, z: 0 },
    lpos: { x: 1000, y: 0, z: 0 },
    sourceAttributes: {
      OWNER: '/ASIM-1885-10"-S8810101-200AA1-HC/B1',
      NPS: '10',
    },
    attributes: {},
    calculatedFields: {},
  }],
};
const masters = {
  lineList: [{
    Service: '',
    'Line Number': 'S8810101',
    material: 'ASTM A106-B',
    p1: '70',
    t1: '120',
    density: '800',
  }],
  pipingClass: [{
    pipingClass: '200AA1',
    convertedBore: '250',
    componentType: 'PIPE',
    Material: 'ASTM A106-B',
    wallThickness: '12.7',
    corrosion: '1.5',
  }],
  materialMap: txt.rows,
  weightMaster: [{
    boreMm: '250',
    rating: '20000',
    lengthMm: '1000',
    weight: '20',
    typeDesc: 'Pipe rigid',
  }],
};
const preview = buildSelectedGeometryBranchPreview({ scope, masters, config: {} });
assert.strictEqual(preview.branchRows.length, 1);
assert.strictEqual(preview.branchRows[0].branchName, '/ASIM-1885-10"-S8810101-200AA1-HC/B1');
assert.strictEqual(preview.branchRows[0].lineKey, 'S8810101');
assert.strictEqual(preview.branchRows[0].pipingClass, '200AA1');
assert.strictEqual(preview.branchRows[0].rating, '20000');
assert.strictEqual(preview.branchRows[0].materialCode, '106');
assert.strictEqual(preview.branchRows[0].p1, '70');
assert.strictEqual(preview.branchRows[0].pipingClassNeedsReview, false);
assert.ok(['resolved', 'resolved-with-audit'].includes(preview.branchRows[0].status));
assert.strictEqual(preview.diagnostics.length, 0);
assert.deepStrictEqual(preview.diagnosticSummary, []);
assert.strictEqual(preview.counts.statuses[preview.branchRows[0].status], 1);
assert.strictEqual(preview.nodeRows[0].weight, 20);

const enriched = enrichSelectedGeometryScopeWithBranchWorkflow({ scope, masters, config: {} });
assert.strictEqual(enriched.objects[0].attributes.enrichment.schema, 'selected-geometry-branch-enrichment/v1');
assert.strictEqual(enriched.objects[0].attributes.enrichment.pipingClass.className, '200AA1');
assert.strictEqual(enriched.objects[0].attributes.enrichment.material.materialCode, '106');
assert.strictEqual(scope.objects[0].attributes.enrichment, undefined);

for (const sourceText of [panelText, detailsText, parserText]) {
  assert.ok(!/\.sourceAttributes\s*=/.test(sourceText), 'UI source must not assign sourceAttributes');
  assert.ok(!/\.attributes\.enrichment\s*=/.test(sourceText), 'UI source must not assign live enrichment attributes');
  assert.ok(!/function\s+[^(]*\([^)]*=\s*[^)]*\)/.test(sourceText), 'New UI functions must avoid default parameters');
}

console.log('selected geometry enrichment UI tests passed');
