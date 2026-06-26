import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  buildNodeMarkerDetailsJson,
  buildNodeMarkerDetailsPanelState,
  emptyNodeMarkerDetailsPanelState,
  renderNodeMarkerDetailsPanelHtml,
} from '../overlays/nodes/NodeMarkerDetailsPanel.js';

const bridge = await fs.readFile(new URL('../tabs/RvmNonPrimitiveNodeMarkerDetailsPanelBridge.js', import.meta.url), 'utf8');
const markerBridge = await fs.readFile(new URL('../tabs/RvmNonPrimitiveNodeMarkerBridge.js', import.meta.url), 'utf8');
const renderer = await fs.readFile(new URL('../tabs/viewer3d-rvm-tab-renderer.js', import.meta.url), 'utf8');

assert.match(bridge, /rvm-non-primitive-node-marker-details-panel-bridge\/v2/, 'details bridge exposes override-aware schema');
assert.match(bridge, /collectNodeMarkerRoots/, 'details bridge raycasts only node marker roots');
assert.match(bridge, /rvmNodeMarkerDetails/, 'details bridge reads dedicated marker details metadata');
assert.match(bridge, /readOverrideFromPanel/, 'details bridge can read override controls');
assert.match(bridge, /saveOverrideFromPanel/, 'details bridge can save override controls');
assert.match(bridge, /clearOverrideFromPanel/, 'details bridge can clear override controls');
assert.doesNotMatch(bridge, /RvmSelectionAdapter|objectSearch|selectObject|pickObject/, 'details bridge does not use primitive RVM selection/search');
assert.doesNotMatch(renderer, /RvmNonPrimitiveNodeMarkerDetailsPanelBridge|NodeMarkerDetailsPanel/, 'renderer must not eagerly import node marker details panel');
assert.match(markerBridge, /rvm-non-primitive-node-marker-bridge\/v4/, 'node marker bridge schema is override-persistence-aware');
assert.match(markerBridge, /saveOverride|clearOverride|persistOverrides/, 'node marker bridge exposes override persistence actions');

const marker = {
  markerId: 'NM-001',
  nodeNumber: 910,
  markerKind: 'PIPE_TO_FLANGE',
  branchName: '/BR-DETAIL/B1',
  componentType: 'FLANGE',
  componentRefNo: 'PIPE-REF-01',
  componentRefNoSource: 'upstream',
  sourcePath: '/BR-DETAIL/B1/PIPE-A',
  sourceKind: 'json',
  sourceSubKind: 'staged-json-export',
  sourceFile: 'details.json',
  positionSource: 'endpoint',
  nodeNumberSource: 'generated',
  confidence: 0.91,
  status: 'exact',
  overrideStatus: 'locked',
  overrideReason: 'certified',
  lockedByOverride: true,
  upstreamRef: { name: 'PIPE-A', type: 'PIPE', componentRefNo: 'PIPE-REF-01' },
  downstreamRef: { name: 'FLANGE-A', type: 'FLANGE', componentRefNo: 'FLG-REF-01' },
  warnings: [{ code: 'ok', message: 'No issue' }],
};

const state = buildNodeMarkerDetailsPanelState(marker);
assert.equal(state.status, 'selected');
assert.equal(state.xmlCii.BranchName, '/BR-DETAIL/B1');
assert.equal(state.xmlCii.NodeNumber, 910);
assert.equal(state.overrideStatus, 'locked');
assert.equal(state.overrideReason, 'certified');
assert.equal(state.lockedByOverride, true);
assert.equal(state.sourceSubKind, 'staged-json-export');
assert.equal(state.matchMethod, 'generated');
assert.equal(state.confidence, 0.91);

const html = renderNodeMarkerDetailsPanelHtml(state);
assert.match(html, /BranchName/);
assert.match(html, /NodeNumber/);
assert.match(html, /ComponentRefNo/);
assert.match(html, /sourcePath/);
assert.match(html, /Override/);
assert.match(html, /data-node-marker-override-field="nodeNumber"/);
assert.match(html, /data-node-marker-override-field="branchName"/);
assert.match(html, /data-node-marker-override-field="componentRefNo"/);
assert.match(html, /data-node-marker-override-field="suppressExport"/);
assert.match(html, /Save override/);
assert.match(html, /Clear override/);
assert.match(html, /Copy details JSON/);
assert.match(html, /Download details JSON/);

const empty = emptyNodeMarkerDetailsPanelState('unit-clear');
assert.equal(empty.status, 'empty');
assert.match(renderNodeMarkerDetailsPanelHtml(empty), /Select a Node Marker glyph/);
const json = buildNodeMarkerDetailsJson(state, { generatedAt: '2026-01-01T00:00:00.000Z' });
assert.equal(json.schema, 'non-primitive-node-marker-details-json/v2');
assert.equal(json.state.markerId, 'NM-001');

console.log('nonprimitive-node-marker-details-panel passed');
