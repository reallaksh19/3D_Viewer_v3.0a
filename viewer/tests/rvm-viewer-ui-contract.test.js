import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewerRoot = path.resolve(__dirname, '..');

const files = {
  contract: path.join(viewerRoot, 'tabs/rvm-viewer-module-contract.js'),
  renderer: path.join(viewerRoot, 'tabs/viewer3d-rvm-tab-renderer.js'),
  tab: path.join(viewerRoot, 'tabs/viewer3d-rvm-tab.js'),
  resizeBridge: path.join(viewerRoot, 'tabs/RvmLeftPanelResizeCollapseBridge.js'),
  stagedExport: path.join(viewerRoot, 'tabs/RvmStagedJsonExportBridge.js'),
  stagedValidation: path.join(viewerRoot, 'tabs/RvmStagedJsonValidationBridge.js'),
  deferredLoader: path.join(viewerRoot, 'tabs/RvmDeferredBridgeLoader.js'),
  toolbarCompact: path.join(viewerRoot, 'tabs/RvmToolbarCompactBridge.js'),
  toolbarOverflow: path.join(viewerRoot, 'tabs/RvmToolbarOverflowController.js'),
  bottomDiagnostics: path.join(viewerRoot, 'tabs/RvmBottomDiagnosticsDrawerBridge.js'),
};

const ADVANCED_POSTMODEL_TOOLS = [
  ['object-search', 'RvmObjectSearchBridge.js?v=20260621-rvm-object-search-1', 'installRvmObjectSearchBridge'],
  ['visibility-snapshots', 'RvmVisibilitySnapshotsBridge.js?v=20260621-rvm-visibility-snapshots-1', 'installRvmVisibilitySnapshotsBridge'],
  ['selection-sets', 'RvmSelectionSetsBridge.js?v=20260621-rvm-selection-sets-1', 'installRvmSelectionSetsBridge'],
  ['report-export', 'RvmReportExportBridge.js?v=20260621-rvm-report-export-1', 'installRvmReportExportBridge'],
];

const SOURCE_PREVIEW_TOOLS = [
  ['nonprimitive-support-overlay', 'RvmNonPrimitiveSupportOverlayBridge.js?v=20260623-nonprimitive-support-overlay-9', 'installRvmNonPrimitiveSupportOverlayBridge'],
  ['nonprimitive-support-hard-disable', 'RvmNonPrimitiveSupportOverlayHardDisableBridge.js?v=20260623-nonprimitive-support-hard-disable-1', 'installRvmNonPrimitiveSupportOverlayHardDisableBridge'],
  ['nonprimitive-support-details-panel', 'RvmNonPrimitiveSupportOverlayDetailsPanelBridge.js?v=20260623-nonprimitive-support-details-panel-4', 'installRvmNonPrimitiveSupportOverlayDetailsPanelBridge'],
  ['nonprimitive-support-hover', 'RvmNonPrimitiveSupportOverlayHoverBridge.js?v=20260623-nonprimitive-support-hover-2', 'installRvmNonPrimitiveSupportOverlayHoverBridge'],
  ['nonprimitive-auto-bend', 'RvmNonPrimitiveAutoBendBridge.js?v=20260623-nonprimitive-auto-bend-preview-2', 'installRvmNonPrimitiveAutoBendBridge'],
  ['nonprimitive-node-markers', 'RvmNonPrimitiveNodeMarkerBridge.js?v=20260625-node-marker-deferred-1', 'installRvmNonPrimitiveNodeMarkerBridge'],
  ['nonprimitive-source-tools-ui', 'RvmNonPrimitiveSourceToolsUiBridge.js?v=20260624-source-tools-grouped-1', 'installRvmNonPrimitiveSourceToolsUiBridge'],
];

function read(file) {
  assert.ok(fs.existsSync(file), `missing source file: ${path.relative(viewerRoot, file)}`);
  return fs.readFileSync(file, 'utf8');
}

function rvmViewerImports(source) {
  return [...source.matchAll(/from\s+["']([^"']*RvmViewer3D\.js\?v=[^"']+)["']/g)].map((match) => match[1]);
}

function verifyModuleIdentity() {
  const contract = read(files.contract);
  const renderer = read(files.renderer);
  const tab = read(files.tab);
  const key = contract.match(/RVM_VIEWER3D_MODULE_CACHE_KEY\s*=\s*["']([^"']+)["']/)?.[1];
  assert.ok(key, 'module identity contract must expose RVM_VIEWER3D_MODULE_CACHE_KEY');
  const suffixes = [...rvmViewerImports(renderer), ...rvmViewerImports(tab)].map((specifier) => specifier.slice(specifier.lastIndexOf('RvmViewer3D.js')));
  assert.deepEqual([...new Set(suffixes)], [`RvmViewer3D.js?v=${key}`], 'renderer and mounted tab must share one RvmViewer3D ES module identity');
  assert.ok(renderer.includes('installToolbarActionCompatibility'), 'renderer must alias handleToolbarAction to dispatchAction for local toolbar binding');
}

function verifyResizablePanels() {
  const source = read(files.resizeBridge);
  assert.ok(source.includes('--rvm-left-panel-width'), 'left panel resize contract variable must be written');
  assert.ok(source.includes('--rvm-right-panel-width'), 'right panel resize contract variable must be written');
  assert.ok(source.includes('.rvm-left-panel[data-rvm-left-panel-resizable="true"]'), 'left panel CSS must consume resize variable');
  assert.ok(source.includes('.rvm-right-panel[data-rvm-right-panel-resizable="true"]'), 'right panel CSS must consume resize variable');
  assert.ok(source.includes('__3D_RVM_VIEWER__?.onWindowResize') || source.includes('__3D_RVM_VIEWER__?.resize'), 'panel resize must notify the active viewer to resize');
}

function verifySupportPolicyOptionA() {
  const stagedExport = read(files.stagedExport);
  const stagedValidation = read(files.stagedValidation);
  assert.ok(stagedExport.includes('SUPPORT_UNAVAILABLE_REASON'), 'support export must have an explicit unavailable reason');
  assert.ok(stagedExport.includes('binary-rvm-support-tools-retired'), 'support export must preserve binary RVM retirement policy');
  assert.ok(stagedExport.includes('evaluateSupportPolicy'), 'support export must evaluate source-preview prerequisites before exporting support data');
  assert.ok(stagedValidation.includes('support-mode-unavailable-for-current-source'), 'support validation must fail clearly when support mode is unavailable');
  assert.ok(stagedValidation.includes('supportModeAvailable'), 'support validation must expose a support availability gate');
}

function verifyDeferredSupportPolicyCacheKeys() {
  const deferredLoader = read(files.deferredLoader);
  const renderer = read(files.renderer);
  assert.ok(deferredLoader.includes('20260625-rvm-deferred-source-preview-tools-1'), 'deferred bridge loader must expose source-preview deferral cache contract');
  assert.ok(deferredLoader.includes('RvmStagedJsonExportBridge.js?v=20260624-rvm-stagedjson-support-policy-1'), 'post-model deferred loader must import current Option A staged export bridge');
  assert.ok(deferredLoader.includes('RvmStagedJsonValidationBridge.js?v=20260624-rvm-stagedjson-support-policy-1'), 'post-model deferred loader must import current Option A staged validation bridge');
  assert.ok(renderer.includes('RvmDeferredBridgeLoader.js?v=20260625-rvm-deferred-source-preview-tools-1'), 'renderer must import the current deferred loader cache key');
  assert.ok(!deferredLoader.includes('RvmStagedJsonExportBridge.js?v=20260621-rvm-button-hardening-1'), 'deferred loader must not keep stale staged export cache key');
  assert.ok(!deferredLoader.includes('RvmStagedJsonValidationBridge.js?v=20260620-rvm-stagedjson-validation-1'), 'deferred loader must not keep stale staged validation cache key');
}

function verifyToolbarCompactPolicy() {
  const renderer = read(files.renderer);
  const toolbar = read(files.toolbarCompact);
  const overflow = read(files.toolbarOverflow);
  assert.ok(renderer.includes('RvmToolbarCompactBridge.js?v=20260626-rvm-toolbar-compact-policy-2'), 'renderer must import compact toolbar policy bridge v2');
  assert.ok(renderer.includes('installRvmToolbarCompactBridge()'), 'renderer must install compact toolbar policy bridge');
  assert.ok(toolbar.includes('rvm-toolbar-compact-policy-2'), 'toolbar policy must expose versioned source contract');
  assert.ok(toolbar.includes('RvmToolbarOverflowController.js?v=20260626-rvm-toolbar-overflow-controller-1'), 'toolbar policy must use the single overflow owner module');
  assert.ok(toolbar.includes("CORE_LABELS = new Set(['Navigate', 'View'])"), 'toolbar policy must keep core Navigate/View top-level');
  assert.ok(toolbar.includes('data-rvm-toolbar-more'), 'toolbar policy must create a stable More tools button');
  assert.ok(toolbar.includes('data-rvm-tools-menu'), 'toolbar policy must provide a stable More tools menu marker');
  assert.ok(toolbar.includes('data-rvm-toolbar-more-panel'), 'toolbar policy must preserve legacy panel marker for compatibility');
  assert.ok(toolbar.includes("section.dataset.rvmToolbarPolicy = 'advanced'"), 'toolbar policy must mark moved secondary groups as advanced');
  assert.ok(toolbar.includes("section.dataset.rvmToolbarPolicy = 'duplicate-hidden'"), 'toolbar policy must hide exact duplicate groups rather than stacking them');
  assert.ok(!toolbar.includes('<details'), 'More Tools must not depend on native details toggling');
  assert.ok(overflow.includes('installRvmToolbarOverflow'), 'overflow controller must expose install lifecycle');
  assert.ok(overflow.includes('disposeRvmToolbarOverflow'), 'overflow controller must expose dispose lifecycle');
  assert.ok(overflow.includes('syncRvmToolbarOverflow'), 'overflow controller must expose sync lifecycle');
  assert.ok(overflow.includes('aria-expanded'), 'overflow controller must own aria-expanded state');
  assert.ok(overflow.includes('outside-pointerdown'), 'overflow controller must close on outside pointerdown');
  assert.ok(overflow.includes("event?.key !== 'Escape'"), 'overflow controller must close on Escape');
  assert.ok(!overflow.includes('MutationObserver'), 'overflow controller must not use MutationObserver as the More Tools behavior fix');
}

function verifyDockedDiagnosticsDrawer() {
  const renderer = read(files.renderer);
  const drawer = read(files.bottomDiagnostics);
  assert.ok(renderer.includes('RvmBottomDiagnosticsDrawerBridge.js?v=20260624-rvm-diagnostics-docked-drawer-1'), 'renderer must import docked diagnostics drawer cache key');
  assert.ok(drawer.includes('20260624-rvm-diagnostics-docked-drawer-1'), 'bottom diagnostics drawer must expose docked cache key');
  assert.ok(drawer.includes('function dockDrawer'), 'bottom diagnostics drawer must dock itself through a layout function');
  assert.ok(drawer.includes('root.insertBefore(drawer, statusbar)'), 'bottom diagnostics drawer must insert before the status bar, not overlay the viewport');
  assert.ok(drawer.includes('data-rvm-bottom-diagnostics-docked'), 'bottom diagnostics drawer must mark docked layout state');
  assert.ok(drawer.includes('.rvm-bottom-diagnostics-drawer{position:relative'), 'bottom diagnostics drawer CSS must be relative/docked');
  assert.ok(!drawer.includes('.rvm-bottom-diagnostics-drawer{position:fixed'), 'bottom diagnostics drawer must not use fixed viewport positioning');
  assert.ok(!drawer.includes('left:14px;right:14px;bottom:10px'), 'bottom diagnostics drawer must not retain old fixed overlay offsets');
}

function verifyPostModelHealthDeferral() {
  const renderer = read(files.renderer);
  const deferredLoader = read(files.deferredLoader);
  assert.ok(!renderer.includes('RvmModelHealthBridge.js?v='), 'renderer must not eagerly import model health bridge');
  assert.ok(!renderer.includes('RvmModelHealthIssuesBridge.js?v='), 'renderer must not eagerly import model health issues bridge');
  assert.ok(!renderer.includes('installRvmModelHealthBridge()'), 'renderer must not eagerly install model health bridge');
  assert.ok(!renderer.includes('installRvmModelHealthIssuesBridge()'), 'renderer must not eagerly install model health issues bridge');
  assert.ok(deferredLoader.includes("id: 'model-health'"), 'deferred postModel group must include model health bridge');
  assert.ok(deferredLoader.includes("id: 'model-health-issues'"), 'deferred postModel group must include model health issues bridge');
  assert.ok(deferredLoader.includes('RvmModelHealthBridge.js?v=20260621-rvm-health-issues-1'), 'deferred postModel group must import model health bridge');
  assert.ok(deferredLoader.includes('RvmModelHealthIssuesBridge.js?v=20260621-rvm-health-issues-1'), 'deferred postModel group must import model health issues bridge');
}

function verifyPostModelAdvancedToolDeferral() {
  const renderer = read(files.renderer);
  const deferredLoader = read(files.deferredLoader);
  for (const [id, specifier, installName] of ADVANCED_POSTMODEL_TOOLS) {
    assert.ok(!renderer.includes(`${specifier.split('?')[0]}?v=`), `renderer must not eagerly import ${id}`);
    assert.ok(!renderer.includes(`${installName}()`), `renderer must not eagerly install ${id}`);
    assert.ok(deferredLoader.includes(`id: '${id}'`), `deferred postModel group must include ${id}`);
    assert.ok(deferredLoader.includes(specifier), `deferred postModel group must import ${id}`);
    assert.ok(deferredLoader.includes(installName), `deferred postModel group must install ${id}`);
  }
  assert.ok(renderer.includes('RvmMeasureBridge.js?v=20260621-rvm-measure-tools-1'), 'core Measure bridge must stay eager');
  assert.ok(renderer.includes('RvmSectionBoxBridge.js?v=20260621-rvm-section-box-1'), 'core Section bridge must stay eager');
  assert.ok(renderer.includes('RvmVisibilityToolbarBridge.js?v=20260621-rvm-isolate-visibility-toolbar-1'), 'core Visibility bridge must stay eager');
}

function verifySourcePreviewToolDeferral() {
  const renderer = read(files.renderer);
  const deferredLoader = read(files.deferredLoader);
  const tab = read(files.tab);
  for (const [id, specifier, installName] of SOURCE_PREVIEW_TOOLS) {
    assert.ok(!renderer.includes(`${specifier.split('?')[0]}?v=`), `renderer must not eagerly import source-preview bridge ${id}`);
    assert.ok(!renderer.includes(`${installName}()`), `renderer must not eagerly install source-preview bridge ${id}`);
    assert.ok(deferredLoader.includes(`id: '${id}'`), `deferred sourcePreview group must include ${id}`);
    assert.ok(deferredLoader.includes(specifier), `deferred sourcePreview group must import ${id}`);
    assert.ok(deferredLoader.includes(installName), `deferred sourcePreview group must install ${id}`);
  }
  assert.ok(deferredLoader.includes('SOURCE_PREVIEW_KIND_RE'), 'deferred loader must gate source-preview bridge loading by source kind');
  assert.ok(deferredLoader.includes("mode === 'source-preview'"), 'deferred loader must gate source-preview bridge loading by primitive mode');
  assert.ok(deferredLoader.includes('refreshSourcePreviewRuntime'), 'deferred loader must refresh source-preview runtime after lazy install');
  assert.ok(tab.includes('stampSourcePreviewHierarchy(payload.gltf.scene, source, sourceKind, file.name)'), 'mounted RVM tab must stamp source hierarchy before setModel');
  assert.ok(tab.includes('__rvmNonPrimitiveSourceHierarchy') && tab.includes('__rvmNonPrimitiveAutoBendSourceHierarchy'), 'mounted RVM tab must preserve source hierarchy for lazy preview tools');
  assert.ok(tab.includes('ensureSourcePreview') && tab.includes("rvmModelPrimitiveMode === 'source-preview'"), 'mounted RVM tab must request source-preview bridges only for source-preview loads');
}

verifyModuleIdentity();
verifyResizablePanels();
verifySupportPolicyOptionA();
verifyDeferredSupportPolicyCacheKeys();
verifyToolbarCompactPolicy();
verifyDockedDiagnosticsDrawer();
verifyPostModelHealthDeferral();
verifyPostModelAdvancedToolDeferral();
verifySourcePreviewToolDeferral();

console.log('Verified RVM viewer module identity, side-panel resize UI contract, Option A staged support policy, deferred stagedJSON cache keys, controlled toolbar overflow policy, docked diagnostics drawer, post-model Health deferral, post-model advanced tool deferral, and source-preview tool deferral.');
