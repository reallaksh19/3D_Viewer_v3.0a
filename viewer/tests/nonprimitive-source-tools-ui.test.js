import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const uiBridgeSource = await fs.readFile(new URL('../tabs/RvmNonPrimitiveSourceToolsUiBridge.js', import.meta.url), 'utf8');
const deferredLoaderSource = await fs.readFile(new URL('../tabs/RvmDeferredBridgeLoader.js', import.meta.url), 'utf8');
const autoBridgeSource = await fs.readFile(new URL('../tabs/RvmNonPrimitiveAutoBendBridge.js', import.meta.url), 'utf8');
const supportSettingsSource = await fs.readFile(new URL('../overlays/support/SupportOverlaySettings.js', import.meta.url), 'utf8');
const inputXmlUiBridgeSource = await fs.readFile(new URL('../rvm-viewer/RvmInputXmlSupportGraphicsUiBridge.js', import.meta.url), 'utf8');

assert.match(uiBridgeSource, /rvm-non-primitive-source-tools-ui\/v7/, 'source-tools UI exposes v7 schema marker');
assert.match(uiBridgeSource, /dataset\.rvmNonPrimitiveSourceToolsStyle = 'v7'/, 'source-tools UI style injection is versioned');
assert.match(uiBridgeSource, /data-source-tools-layout="grouped-v2"/, 'source-tools UI renders grouped layout marker');
assert.match(uiBridgeSource, /data-source-tools-group="inputxml-family"/, 'source-tools UI groups InputXML-family controls');
assert.match(uiBridgeSource, /data-source-tools-group="support-overlay"/, 'source-tools UI groups support overlay controls');
assert.match(uiBridgeSource, /mode === 'source-preview' && isNonPrimitiveKind\(kind\)/, 'source-tools UI is gated by source-preview mode');
assert.match(uiBridgeSource, /clearNonPrimitiveRuntime/, 'source-tools UI clears non-primitive overlay runtimes when leaving source-preview mode');
assert.match(uiBridgeSource, /Auto Bend/, 'source-tools UI renders Auto Bend control');
assert.match(uiBridgeSource, /Radius/, 'source-tools UI renders Auto Bend radius control');
assert.match(uiBridgeSource, /Bend diagnostics/, 'source-tools UI renders bend diagnostics control');
assert.match(uiBridgeSource, /axisSelectHtml\('rvm-inputxml-vertical-axis'/, 'source-tools UI renders InputXML vertical-axis selector in right panel');
assert.match(uiBridgeSource, /axisSelectHtml\('rvm-inputxml-north-axis'/, 'source-tools UI renders InputXML north-axis selector in right panel');
assert.match(uiBridgeSource, /id="rvm-inputxml-apply-transform"/, 'source-tools UI renders axis Apply action in right panel');
assert.match(uiBridgeSource, /Support Overlay/, 'source-tools UI renders Support Overlay group');
assert.match(uiBridgeSource, /<span>Symbol<\/span>/, 'source-tools UI renders support symbol toggle');
assert.match(uiBridgeSource, /<span>Label<\/span>/, 'source-tools UI renders support label toggle');
assert.match(uiBridgeSource, /data-source-tool="support-scale"/, 'source-tools UI renders support overlay scale control');
assert.match(uiBridgeSource, /data-source-tool="support-filter"/, 'source-tools UI renders support family filter chips');
assert.match(uiBridgeSource, /Copy diagnostics JSON/, 'source-tools UI exposes diagnostics copy action');
assert.match(uiBridgeSource, /Download diagnostics JSON/, 'source-tools UI exposes diagnostics download action');
assert.match(uiBridgeSource, /writeNonPrimitiveAutoBendSettings/, 'source-tools UI persists auto-bend settings');
assert.match(uiBridgeSource, /writeNonPrimitiveSupportOverlaySettings/, 'source-tools UI persists support overlay settings');
assert.match(uiBridgeSource, /readSourceAxisTransformSettings/, 'source-tools UI reads shared source-axis transform settings');
assert.match(uiBridgeSource, /writeSourceAxisTransformSettings/, 'source-tools UI writes shared source-axis transform settings');
assert.match(uiBridgeSource, /AUTO_TOOLS[\s\S]*reapplyAutoBendFromControls/, 'source-tools UI routes Auto Bend controls to Auto Bend only');
assert.match(uiBridgeSource, /SUPPORT_TOOLS[\s\S]*reapplySupportOverlayFromControls/, 'source-tools UI routes Support Overlay controls to support overlay only');
assert.match(uiBridgeSource, /apply-axis[\s\S]*reapplyFromControls/, 'source-tools UI uses Apply to reapply both source systems after axis changes');

assert.match(inputXmlUiBridgeSource, /rvm-inputxml-source-tools-bridge\/v2/, 'InputXML compatibility bridge exposes source-tools API schema');
assert.doesNotMatch(inputXmlUiBridgeSource, /rvm-inputxml-graphics-controls|geo-top-ribbon/, 'InputXML compatibility bridge does not own top-ribbon UI');
assert.doesNotMatch(inputXmlUiBridgeSource, /ensureResizeHandles|persistPanelWidths|panel\.style\.setProperty/, 'InputXML compatibility bridge does not own parent panel resizing');

assert.match(deferredLoaderSource, /RvmNonPrimitiveSourceToolsUiBridge\.js\?v=20260624-source-tools-grouped-1/, 'sourcePreview deferred loader imports source-tools UI bridge with grouped cache key');
assert.match(deferredLoaderSource, /installRvmNonPrimitiveSourceToolsUiBridge/, 'sourcePreview deferred loader installs source-tools UI bridge');

assert.match(autoBridgeSource, /restoreVisualTrimmedSegments/, 'auto-bend bridge can restore visual trims for live UI toggles');
assert.match(autoBridgeSource, /nonPrimitiveAutoBendOriginalSegmentChild/, 'auto-bend bridge preserves original source-preview segment children');
assert.match(supportSettingsSource, /supportOverlay\.nonPrimitive\./, 'support settings use new non-primitive key namespace');
assert.match(supportSettingsSource, /labels/, 'support settings include labels key');
assert.match(supportSettingsSource, /scale/, 'support settings include scale key');
assert.match(supportSettingsSource, /filters/, 'support settings include filters key');

console.log('nonprimitive-source-tools-ui passed');