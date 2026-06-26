import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const bridgeSource = await fs.readFile(new URL('../tabs/RvmNonPrimitiveSupportOverlayHardDisableBridge.js', import.meta.url), 'utf8');
const deferredLoaderSource = await fs.readFile(new URL('../tabs/RvmDeferredBridgeLoader.js', import.meta.url), 'utf8');

assert.match(bridgeSource, /rvm-non-primitive-support-overlay-hard-disable\/v1/, 'hard-disable bridge exposes a versioned schema');
assert.match(bridgeSource, /data-source-tool[\s\S]*support-enabled[\s\S]*control\.checked === false/, 'hard-disable bridge listens to the Support Overlay checkbox off state');
assert.match(bridgeSource, /data-source-tool[\s\S]*support-labels[\s\S]*control\.checked === false/, 'hard-disable bridge listens to the Support labels checkbox off state');
assert.match(bridgeSource, /queueMicrotask[\s\S]*hardDisableNonPrimitiveSupportOverlay/, 'checkbox off cleanup runs after Source Tools persists settings and reapplies');
assert.match(bridgeSource, /__PCF_GLB_RVM_NON_PRIMITIVE_SUPPORT_OVERLAY__[\s\S]*\.clear/, 'hard disable clears the support overlay root');
assert.match(bridgeSource, /__PCF_GLB_RVM_NON_PRIMITIVE_SUPPORT_HOVER__[\s\S]*\.clear/, 'hard disable clears hover preview/highlight runtime');
assert.match(bridgeSource, /__PCF_GLB_RVM_NON_PRIMITIVE_SUPPORT_DETAILS_PANEL__[\s\S]*\.clear/, 'hard disable clears selected support details panel/runtime');
assert.match(bridgeSource, /non-primitive-support-overlay-label/, 'hard disable removes CSS2D support overlay labels from DOM');
assert.match(bridgeSource, /data-rvm-nonprimitive-support-hover-preview/, 'hard disable clears hover tooltip DOM text');
assert.match(bridgeSource, /SUPPORT_OVERLAY_ROOT_NAME|__RVM_NON_PRIMITIVE_SUPPORT_OVERLAY__/, 'hard disable has a fallback scene-root purge');
assert.match(bridgeSource, /readNonPrimitiveSupportOverlaySettings/, 'hard disable enforces persisted support overlay settings after model load');
assert.match(bridgeSource, /primitiveExcluded: true/, 'hard disable diagnostics preserve primitive exclusion');
assert.match(bridgeSource, /rvmSearchIndexed: false/, 'hard disable does not index support text into RVM search');
assert.match(bridgeSource, /rvmSelectionUsed: false/, 'hard disable does not use RVM primitive selection');
assert.doesNotMatch(bridgeSource, /Support Summary|SupportATT|SupportEngine|Raw\/Symbol\/Both|rvm_support_render_mode_v1|rvm_support_geometry_mode_v1/, 'hard-disable bridge does not revive retired RVM support UI or keys');

assert.match(deferredLoaderSource, /RvmNonPrimitiveSupportOverlayHardDisableBridge\.js\?v=20260623-nonprimitive-support-hard-disable-1/, 'sourcePreview deferred loader imports hard-disable bridge with a cache key');
assert.match(deferredLoaderSource, /installRvmNonPrimitiveSupportOverlayHardDisableBridge/, 'sourcePreview deferred loader installs hard-disable bridge');

console.log('nonprimitive-support-overlay-hard-disable passed');