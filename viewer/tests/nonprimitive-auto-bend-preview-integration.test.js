import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { collectExistingAutoBendNodeKinds, collectNonPrimitiveAutoBendSegments } from '../overlays/autobend/NonPrimitiveAutoBendSourceAdapter.js';
import { resolveNonPrimitiveAutoBends } from '../overlays/autobend/NonPrimitiveAutoBendResolver.js';

const bridgeSource = await fs.readFile(new URL('../tabs/RvmNonPrimitiveAutoBendBridge.js', import.meta.url), 'utf8');
const deferredLoaderSource = await fs.readFile(new URL('../tabs/RvmDeferredBridgeLoader.js', import.meta.url), 'utf8');

function pipe(name, apos, lpos, extra = {}) {
  return {
    name,
    type: 'PIPE',
    attributes: {
      APOS: apos,
      LPOS: lpos,
      BORE: '100',
      ...extra,
    },
  };
}

const source = {
  name: 'ROOT',
  type: 'BRANCH',
  attributes: { NAME: 'BR-1' },
  children: [
    pipe('PIPE-A', [0, 0, 0], [1000, 0, 0]),
    pipe('PIPE-B', [1000, 0, 0], [1000, 0, 1000]),
  ],
};

const segments = collectNonPrimitiveAutoBendSegments(source);
assert.equal(segments.length, 2, 'source adapter extracts two pipe segments');
assert.equal(segments[0].id, 'ROOT/PIPE-A', 'adapter segment id matches AvevaJsonLoader currentPath convention');
assert.equal(segments[0].toNode, segments[1].fromNode, 'coordinate-derived node ids join pipe corners');

const result = resolveNonPrimitiveAutoBends({
  sourceKind: 'json',
  segments,
  existingNodeKinds: collectExistingAutoBendNodeKinds(source),
});
assert.equal(result.bends.length, 1, 'source adapter output feeds one auto-bend');
assert.equal(result.trims.length, 2, 'auto-bend emits two visual trims for source-preview segments');
assert.equal(Math.round(result.bends[0].turnAngleDeg), 90, 'corner bend angle remains 90 degrees');

const explicitElbowSource = {
  name: 'ROOT',
  type: 'BRANCH',
  children: [
    pipe('PIPE-A', [0, 0, 0], [1000, 0, 0]),
    { name: 'ELBOW-B', type: 'ELBOW', attributes: { POS: [1000, 0, 0] } },
    pipe('PIPE-B', [1000, 0, 0], [1000, 0, 1000]),
  ],
};
const explicitSegments = collectNonPrimitiveAutoBendSegments(explicitElbowSource);
const explicitResult = resolveNonPrimitiveAutoBends({
  sourceKind: 'json',
  segments: explicitSegments,
  existingNodeKinds: collectExistingAutoBendNodeKinds(explicitElbowSource),
});
assert.equal(explicitResult.bends.length, 0, 'explicit elbow node blocks generated auto-bend');
assert.equal(explicitResult.diagnostics.skippedExistingComponentCount, 1, 'explicit elbow skip is diagnosed');

assert.match(bridgeSource, /RVM_NON_PRIMITIVE_AUTO_BEND_SCHEMA = 'rvm-non-primitive-auto-bend\/v1'/, 'bridge exposes schema marker');
assert.match(bridgeSource, /__NON_PRIMITIVE_AUTO_BEND_OVERLAY__/, 'bridge uses isolated auto-bend overlay root');
assert.match(bridgeSource, /setModelWithNonPrimitiveAutoBend/, 'bridge can patch setModel after source-preview load');
assert.match(bridgeSource, /applyVisualTrimmedSegments/, 'bridge applies visual source-preview trim contract');
assert.match(bridgeSource, /createTrimmedSegmentCylinder/, 'bridge replaces straight preview segment with trimmed cylinder');
assert.match(bridgeSource, /canUseAutoBend/, 'bridge uses central primitive-exclusion gate');
assert.doesNotMatch(bridgeSource, /RvmSupportSymbols|RvmSupportGeometryBridge|RvmRawSupportCylinderGuardBridge/, 'bridge does not reintroduce retired support runtime');
assert.match(deferredLoaderSource, /RvmNonPrimitiveAutoBendBridge\.js\?v=20260623-nonprimitive-auto-bend-preview-2/, 'sourcePreview deferred loader imports auto-bend bridge with updated cache key');
assert.match(deferredLoaderSource, /installRvmNonPrimitiveAutoBendBridge/, 'sourcePreview deferred loader installs non-primitive auto-bend bridge');

console.log('nonprimitive-auto-bend-preview-integration passed');