import assert from 'node:assert/strict';

import {
  applyNodeMarkerOverrides,
  buildNodeMarkerCsvForXmlCii,
  buildNodeMarkersFromSource,
  buildNodeMarkerXmlCiiTablesFromMarkers,
  evaluateNodeMarkerStaleness,
  normalizeNodeMarkerOverrides,
} from '../overlays/nodes/NodeMarkerApi.js';
import {
  buildNodeMarkerOverrideStoreContext,
  loadNodeMarkerOverrideSet,
  nodeMarkerOverrideStorageKey,
  removeNodeMarkerOverride,
  saveNodeMarkerOverrideSet,
  upsertNodeMarkerOverride,
} from '../overlays/nodes/NodeMarkerOverrideStore.js';

const source = {
  schema: 'managed-stage/staged-json-export/v1',
  sourceFile: 'override-stage.json',
  branches: [{
    branchName: '/BR-OVERRIDE/B1',
    children: [
      { name: 'PIPE-A', type: 'PIPE', attributes: { APOS: [0, 0, 0], LPOS: [1000, 0, 0], BORE: '100', WallThickness: '6', ComponentRefNo: 'PIPE-A' } },
      { name: 'FLANGE-A', type: 'FLANGE', attributes: { APOS: [1000, 0, 0], LPOS: [1100, 0, 0], ComponentRefNo: 'FLG-A', Weight: '20', Endpoint: '2' } },
      { name: 'PIPE-B', type: 'PIPE', attributes: { APOS: [2000, 0, 0], LPOS: [3000, 0, 0], BORE: '80', ComponentRefNo: 'PIPE-B' } },
    ],
  }],
  supportRecords: [{ supportNo: 'PS-OVERRIDE', type: 'GUIDE', branchName: '/BR-OVERRIDE/B1', POS: [3000, 0, 0], RestraintType: 'GUIDE', Gap: '10' }],
};

const base = buildNodeMarkersFromSource(source, { sourceKind: 'json', sourceFile: 'override-stage.json', startNodeNumber: 100, nodeStep: 10 });
assert.equal(base.markers.length, 2, 'base fixture has two markers');
const flangeMarker = base.markers.find((marker) => marker.markerKind === 'PIPE_TO_FLANGE');
const supportMarker = base.markers.find((marker) => marker.markerKind === 'PIPE_TO_SUPPORT');
assert.ok(flangeMarker && supportMarker, 'both target markers exist');

const overrides = normalizeNodeMarkerOverrides([
  { markerId: flangeMarker.markerId, nodeNumber: 777, branchName: '/BR-OVERRIDE-CUSTOM/B1', componentRefNo: 'USER-REF-777', locked: true, reason: 'user certified node' },
  { markerId: supportMarker.markerId, suppressExport: true, reason: 'not required for this export' },
]);
assert.equal(overrides.length, 2);
assert.equal(overrides[0].nodeNumber, 777);
assert.equal(overrides[1].suppressExport, true);

const overrideResult = applyNodeMarkerOverrides(base.rawMarkers || base.markers, overrides);
assert.equal(overrideResult.markers.length, 1, 'suppressed marker is removed from export marker set');
assert.equal(overrideResult.diagnostics.overrideCount, 2);
assert.equal(overrideResult.diagnostics.suppressedCount, 1);
assert.equal(overrideResult.markers[0].nodeNumber, 777);
assert.equal(overrideResult.markers[0].nodeNumberSource, 'override');
assert.equal(overrideResult.markers[0].branchName, '/BR-OVERRIDE-CUSTOM/B1');
assert.equal(overrideResult.markers[0].componentRefNo, 'USER-REF-777');
assert.equal(overrideResult.markers[0].overrideStatus, 'locked');

const build = buildNodeMarkersFromSource(source, { sourceKind: 'json', sourceFile: 'override-stage.json', startNodeNumber: 100, nodeStep: 10, markerOverrides: overrides });
assert.equal(build.markers.length, 1, 'build applies overrides before table generation');
assert.equal(build.diagnostics.overrideCount, 2);
assert.equal(build.diagnostics.suppressedOverrideCount, 1);
assert.equal(build.overrideDiagnostics.outputMarkerCount, 1);
assert.equal(build.tables.branchRows.length, 1);
assert.equal(build.tables.branchRows[0].NodeNumber, 777);
assert.equal(build.tables.branchRows[0].BranchName, '/BR-OVERRIDE-CUSTOM/B1');
assert.equal(build.tables.coordinateRows[0].NodeNumber, 777);
assert.equal(build.tables.weightRows[0].ComponentRefNo, 'USER-REF-777');
assert.equal(build.tables.restraintRows.length, 0, 'suppressed support marker does not leak into restraint export');

const tablesFromMarkers = buildNodeMarkerXmlCiiTablesFromMarkers(base.markers, { markerOverrides: overrides });
assert.equal(tablesFromMarkers.branchRows.length, 1);
assert.equal(tablesFromMarkers.branchRows[0].NodeNumber, 777);
const csv = buildNodeMarkerCsvForXmlCii(build.tables);
assert.match(csv, /USER-REF-777/);
assert.doesNotMatch(csv, /PS-OVERRIDE/, 'suppressed support marker is absent from CSV');

assert.equal(evaluateNodeMarkerStaleness(source, { sourceKind: 'json', sourceFile: 'override-stage.json', markerOverrides: overrides }, build).status, 'fresh');
const stale = evaluateNodeMarkerStaleness(source, { sourceKind: 'json', sourceFile: 'override-stage.json', markerOverrides: [{ markerId: flangeMarker.markerId, nodeNumber: 778 }] }, build);
assert.equal(stale.status, 'stale');
assert.equal(stale.staleReason, 'override-revision-changed');

const memory = new Map();
const storage = { getItem: (key) => memory.has(key) ? memory.get(key) : null, setItem: (key, value) => memory.set(key, value) };
const context = buildNodeMarkerOverrideStoreContext(build);
assert.equal(context.sourceKind, 'json');
assert.equal(context.sourceSubKind, 'staged-json-export');
assert.ok(context.sourceRevision, 'override store context includes sourceRevision');
assert.match(nodeMarkerOverrideStorageKey(context), /^rvm\.nodeMarkers\.overrides\.v1:/);
const persisted = saveNodeMarkerOverrideSet(context, overrides, storage);
assert.equal(persisted.schema, 'non-primitive-node-marker-override-store/v1');
assert.equal(persisted.overrides.length, 2);
assert.equal(persisted.context.sourceRevision, context.sourceRevision);
assert.ok(persisted.overrideHash, 'persisted override payload has hash');
const loaded = loadNodeMarkerOverrideSet(context, storage);
assert.equal(loaded.overrides.length, 2);
assert.equal(loaded.overrideHash, persisted.overrideHash);
const replaced = upsertNodeMarkerOverride(loaded.overrides, { markerId: flangeMarker.markerId, nodeNumber: 778, suppressExport: true });
assert.equal(replaced.length, 2);
assert.equal(replaced.find((item) => item.markerId === flangeMarker.markerId).nodeNumber, 778);
const removed = removeNodeMarkerOverride(replaced, { markerId: flangeMarker.markerId });
assert.equal(removed.length, 1);
assert.notEqual(nodeMarkerOverrideStorageKey(context), nodeMarkerOverrideStorageKey({ ...context, sourceRevision: `${context.sourceRevision}-changed` }), 'sourceRevision scopes override persistence');

console.log('nonprimitive-node-marker-overrides passed');
