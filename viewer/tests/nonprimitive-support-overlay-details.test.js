import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildSupportOverlayDetails,
  formatSupportOverlayDetailText,
  SUPPORT_OVERLAY_DETAILS_SCHEMA,
} from '../overlays/support/SupportOverlayDetails.js';

const details = buildSupportOverlayDetails({
  record: {
    tag: 'PS-101',
    supportNo: 'PS-101',
    kind: 'GUIDE',
    rawType: 'GUIDE +/-Z',
    local: { x: 1000, y: 0, z: 50 },
    gapMm: 10,
    pipeOdMm: 114.3,
    attrs: {
      SUPPORT_NO: 'PS-101',
      SUPPORT_TYPE: 'GUIDE',
      COMPLEX: { should: 'not leak deeply' },
      LIST: [1, 'two', { three: true }],
    },
  },
  symbol: {
    family: 'GUIDE',
    gapMm: 10,
    gapVisualSeparationMm: 100,
    popupRequired: false,
    warnings: ['axisFromNearestPipe'],
  },
  coordinateMapping: {
    sourcePoint: { x: 1000, y: 0, z: 50 },
    mappedPoint: { x: 1, y: 0, z: 0.05 },
    warnings: ['unitScaleApplied'],
  },
  pipeAxisResolution: {
    axis: { x: 1, y: 0, z: 0 },
    source: 'nearest-segment',
    matchedSegmentId: 'PIPE-A',
    warnings: ['nearestPipeAxisFallback'],
  },
  sourceKind: 'json',
  sourceFile: 'managed-stage-smoke.json',
});

assert.equal(details.schema, SUPPORT_OVERLAY_DETAILS_SCHEMA);
assert.equal(details.supportId, 'PS-101');
assert.equal(details.supportNo, 'PS-101');
assert.equal(details.family, 'GUIDE');
assert.equal(details.rawType, 'GUIDE +/-Z');
assert.deepEqual(details.sourceCoordinate, { x: 1000, y: 0, z: 50 });
assert.deepEqual(details.mappedCoordinate, { x: 1, y: 0, z: 0.05 });
assert.deepEqual(details.pipeAxis, { x: 1, y: 0, z: 0 });
assert.equal(details.pipeAxisSource, 'nearest-segment');
assert.equal(details.matchedPipeSegmentId, 'PIPE-A');
assert.equal(details.gapMm, 10);
assert.equal(details.gapVisualSeparationMm, 100);
assert.equal(details.pipeOdMm, 114.3);
assert.equal(details.warningCount, 1);
assert.deepEqual(details.coordinateWarnings, ['unitScaleApplied']);
assert.deepEqual(details.pipeAxisWarnings, ['nearestPipeAxisFallback']);
assert.equal(details.attributes.COMPLEX, '[object]');
assert.deepEqual(details.attributes.LIST, [1, 'two', '[object Object]']);
assert.equal(details.primitiveExcluded, true);
assert.equal(details.rvmSearchIndexed, false);
assert.equal(details.pickable, false);
assert.equal(details.selectable, false);
assert.match(formatSupportOverlayDetailText(details), /PS-101 GUIDE/);
assert.match(formatSupportOverlayDetailText(details), /gap 10 mm/);

const bridge = fs.readFileSync(new URL('../tabs/RvmNonPrimitiveSupportOverlayBridge.js', import.meta.url), 'utf8');
const glyphGeometry = fs.readFileSync(new URL('../overlays/support/SupportOverlayGlyphGeometry.js', import.meta.url), 'utf8');
const deferredLoader = fs.readFileSync(new URL('../tabs/RvmDeferredBridgeLoader.js', import.meta.url), 'utf8');
assert.ok(bridge.includes('SupportOverlayDetails.js'), 'support overlay bridge imports the details metadata builder');
assert.ok(bridge.includes('SUPPORT_OVERLAY_DETAILS_SCHEMA'), 'bridge exposes details schema');
assert.ok(bridge.includes('supportOverlayDetails'), 'bridge stores support overlay details on glyph userData');
assert.ok(bridge.includes('rvmSearchIndexed = false'), 'bridge keeps support overlay details out of RVM search indexing');
assert.ok(bridge.includes('pickable: false'), 'bridge keeps support overlay details non-pickable');
assert.ok(glyphGeometry.includes('selectable: false'), 'glyph groups remain non-selectable');
assert.ok(bridge.includes('rvm-non-primitive-support-overlay/v9'), 'bridge schema is bumped for axis-transform-aware details metadata');
assert.match(deferredLoader, /RvmNonPrimitiveSupportOverlayBridge\.js\?v=20260623-nonprimitive-support-overlay-9/, 'sourcePreview deferred loader owns support overlay v9 cache key');
assert.doesNotMatch(bridge, /RvmSupportSymbols|RvmSupportGeometryBridge|RvmRawSupportCylinderGuardBridge/, 'details metadata does not revive retired RVM support runtime');

console.log('non-primitive support overlay details tests passed');
