import assert from 'node:assert/strict';

import {
  buildNodeMarkersFromSource,
  evaluateNodeMarkerStaleness,
  getDiagnostics,
  getLastBuild,
} from '../overlays/nodes/NodeMarkerApi.js';

function sourceWithPressure(p1 = '4140') {
  return {
    schema: 'managed-stage/staged-json-export/v1',
    sourceFile: 'node-marker-stale.json',
    branches: [{
      branchName: '/BR-STALE/B1',
      children: [
        { name: 'PIPE-A', type: 'PIPE', attributes: { APOS: [0, 0, 0], LPOS: [1000, 0, 0], BORE: '100', P1: p1, ComponentRefNo: 'PIPE-A' } },
        { name: 'FLANGE-A', type: 'FLANGE', attributes: { APOS: [1000, 0, 0], LPOS: [1100, 0, 0], ComponentRefNo: 'FLG-A' } },
      ],
    }],
  };
}

const initial = buildNodeMarkersFromSource(sourceWithPressure('4140'), { sourceKind: 'json', sourceFile: 'node-marker-stale.json', startNodeNumber: 500 });
assert.equal(initial.exportStatus, 'fresh');
assert.equal(initial.markers.length, 1);
assert.equal(initial.tables.branchRows[0].P1, '4140');
assert.ok(initial.diagnostics.sourceRevision, 'initial build has source revision');
assert.ok(initial.tableHash, 'initial build has table hash');

const same = evaluateNodeMarkerStaleness(sourceWithPressure('4140'), { sourceKind: 'json', sourceFile: 'node-marker-stale.json', startNodeNumber: 500 }, initial);
assert.equal(same.status, 'fresh');
assert.equal(same.staleReason, '');
assert.equal(same.previousSourceRevision, same.currentSourceRevision);

const changed = evaluateNodeMarkerStaleness(sourceWithPressure('7000'), { sourceKind: 'json', sourceFile: 'node-marker-stale.json', startNodeNumber: 500 }, initial);
assert.equal(changed.status, 'stale');
assert.equal(changed.staleReason, 'source-revision-changed');
assert.notEqual(changed.previousSourceRevision, changed.currentSourceRevision, 'attribute changes affect source revision');

const blocked = evaluateNodeMarkerStaleness(sourceWithPressure('4140'), {}, null);
assert.equal(blocked.status, 'blocked');
assert.equal(blocked.staleReason, 'no-previous-build');

const rebuilt = buildNodeMarkersFromSource(sourceWithPressure('7000'), { sourceKind: 'json', sourceFile: 'node-marker-stale.json', startNodeNumber: 500 });
assert.equal(rebuilt.tables.branchRows[0].P1, '7000', 'rebuild re-inherits changed upstream property');
assert.notEqual(rebuilt.diagnostics.sourceRevision, initial.diagnostics.sourceRevision);
assert.equal(getDiagnostics().sourceRevision, rebuilt.diagnostics.sourceRevision);
assert.equal(getLastBuild().tableHash, rebuilt.tableHash);

console.log('nonprimitive-node-marker-stale-diagnostics passed');
