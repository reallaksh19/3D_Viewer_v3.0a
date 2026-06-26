import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  copyDiagnosticsJson,
  copyXmlCiiCsv,
  downloadDiagnosticsJson,
  downloadXmlCiiCsv,
  installRvmNonPrimitiveNodeMarkerSourceToolsBridge,
  sync,
} from '../tabs/RvmNonPrimitiveNodeMarkerSourceToolsBridge.js';

const markerBridge = await fs.readFile(new URL('../tabs/RvmNonPrimitiveNodeMarkerBridge.js', import.meta.url), 'utf8');
const sourceToolsBridge = await fs.readFile(new URL('../tabs/RvmNonPrimitiveNodeMarkerSourceToolsBridge.js', import.meta.url), 'utf8');
const sourceToolsUi = await fs.readFile(new URL('../tabs/RvmNonPrimitiveSourceToolsUiBridge.js', import.meta.url), 'utf8');
const renderer = await fs.readFile(new URL('../tabs/viewer3d-rvm-tab-renderer.js', import.meta.url), 'utf8');

assert.match(sourceToolsBridge, /rvm-non-primitive-node-marker-source-tools\/v1/, 'source tools bridge exposes schema');
assert.match(sourceToolsBridge, /Copy XML-CII CSV/, 'Node Marker group exposes Copy XML-CII CSV');
assert.match(sourceToolsBridge, /Download XML-CII CSV/, 'Node Marker group exposes Download XML-CII CSV');
assert.match(sourceToolsBridge, /Copy diagnostics JSON/, 'Node Marker group exposes Copy diagnostics JSON');
assert.match(sourceToolsBridge, /Download diagnostics JSON/, 'Node Marker group exposes Download diagnostics JSON');
assert.match(sourceToolsBridge, /ensureFreshCsv/, 'CSV export checks freshness before export');
assert.match(sourceToolsBridge, /stale-before-export|blocked-before-export/, 'stale/blocked export triggers rebuild reason');
assert.match(markerBridge, /RvmNonPrimitiveNodeMarkerSourceToolsBridge\.js/, 'node marker bridge imports the source tools controls bridge');
assert.match(markerBridge, /scheduleSourceToolsSync/, 'node marker bridge schedules source tools sync after marker build');
assert.doesNotMatch(renderer, /RvmNonPrimitiveNodeMarkerSourceToolsBridge\.js/, 'renderer must not eagerly import node marker source tools');
assert.match(sourceToolsUi, /rvm-nonprimitive-source-tools-panel/, 'controls target the existing Source Tools panel, not Model Converter UI');

const apiA = installRvmNonPrimitiveNodeMarkerSourceToolsBridge();
const apiB = installRvmNonPrimitiveNodeMarkerSourceToolsBridge();
assert.equal(apiA, apiB, 'source tools bridge install is idempotent');
assert.equal(apiA.schema, 'rvm-non-primitive-node-marker-source-tools/v1');
assert.equal(sync({}).status, 'skipped', 'sync safely skips without DOM panel');

const viewer = {
  nonPrimitiveNodeMarkers: [{ markerId: 'NODE-00001' }],
  nonPrimitiveNodeMarkerDiagnostics: { schema: 'diag', markerCount: 1 },
  nonPrimitiveNodeMarkerTables: {
    headers: { branchRows: ['BranchName'], coordinateRows: ['BranchName'], weightRows: ['BranchName'], restraintRows: ['BranchName'], dtxrRows: ['BranchName'] },
    branchRows: [{ BranchName: '/BR/B1' }],
    coordinateRows: [],
    weightRows: [],
    restraintRows: [],
    dtxrRows: [],
  },
  modelGroup: { userData: { fileName: 'node-marker-source.json' } },
};
globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_NODE_MARKERS__ = {
  getMarkers: () => viewer.nonPrimitiveNodeMarkers,
  getDiagnostics: () => viewer.nonPrimitiveNodeMarkerDiagnostics,
  getStaleStatus: () => ({ status: 'fresh' }),
  getCsv: () => '# branchRows\nBranchName\n/BR/B1',
  rebuild: () => ({ status: 'rebuilt' }),
};

const copyCsv = await copyXmlCiiCsv(viewer);
assert.equal(copyCsv.status, 'unavailable', 'copy safely reports unavailable without clipboard');
assert.equal(copyCsv.kind, 'xml-cii-csv');
const copyDiag = await copyDiagnosticsJson(viewer);
assert.equal(copyDiag.status, 'unavailable', 'diagnostic copy safely reports unavailable without clipboard');
assert.equal(downloadXmlCiiCsv(viewer).status, 'unavailable', 'CSV download safely reports unavailable without browser download APIs');
assert.equal(downloadDiagnosticsJson(viewer).status, 'unavailable', 'diagnostic download safely reports unavailable without browser download APIs');

delete globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_NODE_MARKERS__;
console.log('nonprimitive-node-marker-source-tools passed');
