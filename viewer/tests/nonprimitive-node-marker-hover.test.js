import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { buildNodeMarkerHoverPreview, emptyNodeMarkerHoverState, renderNodeMarkerHoverHtml } from '../overlays/nodes/NodeMarkerHover.js';

const hoverBridge = await fs.readFile(new URL('../tabs/RvmNonPrimitiveNodeMarkerHoverBridge.js', import.meta.url), 'utf8');
const renderer = await fs.readFile(new URL('../tabs/viewer3d-rvm-tab-renderer.js', import.meta.url), 'utf8');

assert.match(hoverBridge, /rvm-non-primitive-node-marker-hover-bridge\/v1/, 'hover bridge exposes schema');
assert.match(hoverBridge, /collectNodeMarkerRoots/, 'hover bridge raycasts only node marker roots');
assert.match(hoverBridge, /rvmNodeMarkerDetails/, 'hover bridge reads marker details from glyph metadata');
assert.match(hoverBridge, /pointerEvents\s*=\s*'none'|pointer-events:none/, 'hover tooltip must not block canvas navigation');
assert.doesNotMatch(hoverBridge, /RvmSelectionAdapter|objectSearch|selectObject|pickObject/, 'hover bridge does not use primitive selection/search');
assert.doesNotMatch(renderer, /RvmNonPrimitiveNodeMarkerHoverBridge\.js|NodeMarkerHover\.js/, 'renderer must not eagerly import node marker hover code');

const marker = {
  markerId: 'NODE-00009',
  nodeNumber: 990,
  branchName: '/BR-HOVER/B1',
  markerKind: 'PIPE_TO_SUPPORT',
  componentRefNo: 'PS-REF-9',
  status: 'approximate',
  confidence: 0.75,
  upstreamRef: { name: 'PIPE-9', type: 'PIPE' },
  downstreamRef: { name: 'PS-9', type: 'GUIDE' },
};
const preview = buildNodeMarkerHoverPreview(marker);
assert.equal(preview.nodeNumber, 990);
assert.equal(preview.branchName, '/BR-HOVER/B1');
assert.equal(preview.upstreamName, 'PIPE-9');
assert.equal(preview.downstreamType, 'GUIDE');
assert.equal(preview.status, 'approximate');

const html = renderNodeMarkerHoverHtml(preview);
assert.match(html, /Node 990/);
assert.match(html, /Branch: \/BR-HOVER\/B1/);
assert.match(html, /ComponentRefNo: PS-REF-9/);
assert.match(html, /approximate · 75%/);

const empty = emptyNodeMarkerHoverState('unit-test');
assert.equal(empty.status, 'cleared');
assert.equal(empty.primitiveExcluded, true);
assert.equal(empty.rvmSearchIndexed, false);
assert.equal(empty.rvmSelectionUsed, false);

console.log('nonprimitive-node-marker-hover passed');
