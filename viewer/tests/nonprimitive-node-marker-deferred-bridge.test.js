import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const loader = await fs.readFile(new URL('../tabs/RvmDeferredBridgeLoader.js', import.meta.url), 'utf8');
const renderer = await fs.readFile(new URL('../tabs/viewer3d-rvm-tab-renderer.js', import.meta.url), 'utf8');
const bridge = await fs.readFile(new URL('../tabs/RvmNonPrimitiveNodeMarkerBridge.js', import.meta.url), 'utf8');

assert.match(loader, /id: 'nonprimitive-node-markers'/, 'sourcePreview group includes node marker bridge');
assert.match(loader, /RvmNonPrimitiveNodeMarkerBridge\.js\?v=20260625-node-marker-deferred-1/, 'deferred loader imports node marker bridge with cache key');
assert.match(loader, /installRvmNonPrimitiveNodeMarkerBridge/, 'deferred loader installs node marker bridge');
assert.match(loader, /__PCF_GLB_RVM_NON_PRIMITIVE_NODE_MARKERS__\?\.applyFromSource/, 'loader refresh path applies node markers');
assert.match(loader, /__PCF_GLB_RVM_NON_PRIMITIVE_NODE_MARKERS__\?\.clear/, 'loader clear path clears node marker runtime');
assert.doesNotMatch(renderer, /RvmNonPrimitiveNodeMarkerBridge\.js\?v=/, 'renderer must not eagerly import node marker bridge');
assert.doesNotMatch(renderer, /installRvmNonPrimitiveNodeMarkerBridge\(\)/, 'renderer must not eagerly install node marker bridge');
assert.match(bridge, /rvm-non-primitive-node-marker-bridge\/v4/, 'bridge exposes override-persistence-aware schema');
assert.match(bridge, /attachNodeMarkerGlyphs|ensureNodeMarkerHover|ensureNodeMarkerDetailsPanel/, 'bridge attaches glyphs, hover, and details through deferred runtime');
assert.match(bridge, /saveOverride|clearOverride|persistOverrides|getOverrides/, 'bridge exposes override persistence actions');
assert.match(bridge, /non-primitive-node-marker-api\/v3|evaluateNodeMarkerStaleness/, 'bridge uses override-aware stale-aware node marker API');
assert.doesNotMatch(bridge, /RvmSelectionAdapter|objectSearch|selectObject|pickObject/, 'bridge does not use primitive RVM selection or search');

console.log('nonprimitive-node-marker-deferred-bridge passed');
