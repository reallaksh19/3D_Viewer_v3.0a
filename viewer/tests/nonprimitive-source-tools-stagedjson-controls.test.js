import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const settings = readFileSync('viewer/overlays/support/SupportOverlaySettings.js', 'utf8');
const supportBridge = readFileSync('viewer/tabs/RvmNonPrimitiveSupportOverlayBridge.js', 'utf8');
const sourceToolsBridge = readFileSync('viewer/tabs/RvmNonPrimitiveSourceToolsUiBridge.js', 'utf8');
const inputXmlBridge = readFileSync('viewer/rvm-viewer/RvmInputXmlSupportGraphicsUiBridge.js', 'utf8');
const inputXmlSetModelBridge = readFileSync('viewer/rvm-viewer/RvmInputXmlSupportGraphicsSetModelBridge.js', 'utf8');
const leftBridge = readFileSync('viewer/tabs/RvmLeftPanelResizeCollapseBridge.js', 'utf8');
const axisTransform = readFileSync('viewer/overlays/source-tools/SourceAxisTransform.js', 'utf8');

assert.match(settings, /labelsUserSet/, 'support overlay settings must distinguish stale label storage from explicit user label setting');
assert.match(settings, /labels:\s*labelsUserSet \? readBool\(storage, SUPPORT_OVERLAY_STORAGE_KEYS\.labels, false\) : false/, 'support labels must be false unless explicitly user-set');
assert.match(settings, /resetNonPrimitiveSupportOverlayLabels/, 'settings must expose a hard label-off helper');

assert.match(axisTransform, /source-axis-transform\/v1/, 'source axis transform schema must exist');
assert.match(axisTransform, /verticalAxis/, 'axis transform must expose vertical axis');
assert.match(axisTransform, /northAxis/, 'axis transform must expose north axis');
assert.match(axisTransform, /transformSourcePipeSegments/, 'axis transform must support pipe segment/resolver transformation');

assert.match(supportBridge, /SourceAxisTransform\.js/, 'support overlay must import source axis transform helper');
assert.match(supportBridge, /axisBasis:\s*sourceAxisBasis3\(axisTransform\)/, 'support coordinate mapper must use selected source axis transform');
assert.match(supportBridge, /transformSourcePipeSegments\(sourcePipeSegments, axisTransform\)/, 'support resolver pipe segments must use selected source axis transform');
assert.match(supportBridge, /labelsVisible:\s*Boolean\(settings\.labels\)/, 'support overlay diagnostics must expose final label visibility');

assert.match(inputXmlBridge, /window\.__3D_RVM_VIEWER__/, 'InputXML source-tools bridge must fall back to current global RVM viewer');
assert.match(inputXmlBridge, /document\.addEventListener\('change', handleLegacyControlEvent, true\)/, 'InputXML source-tools bridge must handle change events, not input only');
assert.match(inputXmlBridge, /refreshInputXmlAutoBendOnly/, 'InputXML source-tools bridge exposes Auto Bend only refresh path');
assert.match(inputXmlBridge, /refreshInputXmlSupportOverlayOnly/, 'InputXML source-tools bridge exposes Support Overlay only refresh path');
assert.match(inputXmlBridge, /__PCF_GLB_RVM_INPUTXML_SOURCE_TOOLS__/, 'InputXML source-tools bridge publishes compatibility API for right-panel controls');
assert.doesNotMatch(inputXmlBridge, /ribbon\.insertBefore|geo-top-ribbon|rvm-ribbon-section rvm-inputxml-controls/, 'InputXML controls must not be injected into the top ribbon');
assert.doesNotMatch(inputXmlBridge, /ensureResizeHandles|persistPanelWidths|panel\.style\.setProperty/, 'InputXML bridge must not own parent panel resizing');

assert.match(inputXmlSetModelBridge, /__PCF_GLB_RVM_INPUTXML_SOURCE_TOOLS__/, 'setModel bridge reads InputXML options from source-tools API when available');
assert.match(sourceToolsBridge, /data-source-tools-group="inputxml-family"/, 'right Source Tools panel must contain InputXML family group');
assert.match(sourceToolsBridge, /data-source-tools-group="support-overlay"/, 'right Source Tools panel must contain Support Overlay group');
assert.match(sourceToolsBridge, /rvm-inputxml-apply-transform/, 'axis transform must have an explicit Apply action in right panel');
assert.match(sourceToolsBridge, /AUTO_TOOLS[\s\S]*reapplyAutoBendFromControls/, 'Auto Bend controls must route to Auto Bend only');
assert.match(sourceToolsBridge, /SUPPORT_TOOLS[\s\S]*reapplySupportOverlayFromControls/, 'Support Symbol/Label controls must route to support overlay only');
assert.match(sourceToolsBridge, /apply-axis[\s\S]*reapplyFromControls/, 'axis Apply must reapply both systems');

assert.match(leftBridge, /data-rvm-hierarchy-width-controls/, 'hierarchy panel must expose width controls');
assert.match(leftBridge, /resize:both/, 'hierarchy tree must be horizontally and vertically resizable');
assert.match(leftBridge, /setPanelWidth[\s\S]*root\?\.style\?\.setProperty\(variable, value\)[\s\S]*body\?\.style\?\.setProperty\(variable, value\)/, 'parent panel resize must write width variables to root and .rvm-body');
assert.match(leftBridge, /--rvm-tree-kind-w/, 'hierarchy kind column width must be adjustable');
assert.match(leftBridge, /--rvm-tree-count-w/, 'hierarchy count column width must be adjustable');

console.log('nonprimitive source tools stagedJSON control regression passed');
