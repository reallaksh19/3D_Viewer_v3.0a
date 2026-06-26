const VERSION = '20260625-rvm-deferred-source-preview-tools-1';
const API_KEY = '__PCF_GLB_RVM_BRIDGE_LOADER__';
const ACTION_DIAGNOSTICS_KEY = '__PCF_GLB_RVM_ACTION_DIAGNOSTICS__';

const SOURCE_PREVIEW_KIND_RE = /^(json|jscon|inputxml|uxml|txt|source-preview|stagedjson)$/i;

const BRIDGE_GROUPS = Object.freeze({
  sourcePreview: [
    { id: 'nonprimitive-support-overlay', specifier: './RvmNonPrimitiveSupportOverlayBridge.js?v=20260623-nonprimitive-support-overlay-9', install: 'installRvmNonPrimitiveSupportOverlayBridge' },
    { id: 'nonprimitive-support-hard-disable', specifier: './RvmNonPrimitiveSupportOverlayHardDisableBridge.js?v=20260623-nonprimitive-support-hard-disable-1', install: 'installRvmNonPrimitiveSupportOverlayHardDisableBridge' },
    { id: 'nonprimitive-support-details-panel', specifier: './RvmNonPrimitiveSupportOverlayDetailsPanelBridge.js?v=20260623-nonprimitive-support-details-panel-4', install: 'installRvmNonPrimitiveSupportOverlayDetailsPanelBridge' },
    { id: 'nonprimitive-support-hover', specifier: './RvmNonPrimitiveSupportOverlayHoverBridge.js?v=20260623-nonprimitive-support-hover-2', install: 'installRvmNonPrimitiveSupportOverlayHoverBridge' },
    { id: 'nonprimitive-auto-bend', specifier: './RvmNonPrimitiveAutoBendBridge.js?v=20260623-nonprimitive-auto-bend-preview-2', install: 'installRvmNonPrimitiveAutoBendBridge' },
    { id: 'nonprimitive-node-markers', specifier: './RvmNonPrimitiveNodeMarkerBridge.js?v=20260625-node-marker-deferred-1', install: 'installRvmNonPrimitiveNodeMarkerBridge' },
    { id: 'nonprimitive-source-tools-ui', specifier: './RvmNonPrimitiveSourceToolsUiBridge.js?v=20260624-source-tools-grouped-1', install: 'installRvmNonPrimitiveSourceToolsUiBridge' },
  ],
  postModel: [
    { id: 'stagedjson-export', specifier: './RvmStagedJsonExportBridge.js?v=20260624-rvm-stagedjson-support-policy-1', install: 'installRvmStagedJsonExportBridge' },
    { id: 'stagedjson-validation', specifier: './RvmStagedJsonValidationBridge.js?v=20260624-rvm-stagedjson-support-policy-1', install: 'installRvmStagedJsonValidationBridge' },
    { id: 'primitive-fallback', specifier: './RvmPrimitiveFallbackBridge.js?v=20260620-rvm-primitive-fallback-clickable-1', install: 'installRvmPrimitiveFallbackBridge' },
    { id: 'native-glb-export', specifier: './RvmNativeSceneGlbExportBridge.js?v=20260620-rvm-glb-component-hierarchy-v3-1', install: 'installRvmNativeSceneGlbExportBridge' },
    { id: 'glb-export-profile', specifier: './RvmGlbExportProfileBridge.js?v=20260620-rvm-glb-export-profile-units-1', install: 'installRvmGlbExportProfileBridge' },
    { id: 'glb-export-validation', specifier: './RvmGlbExportValidationBridge.js?v=20260620-rvm-glb-export-validation-1', install: 'installRvmGlbExportValidationBridge' },
    { id: 'glb-roundtrip-validation', specifier: './RvmGlbRoundTripValidationBridge.js?v=20260620-rvm-glb-roundtrip-validation-1', install: 'installRvmGlbRoundTripValidationBridge' },
    { id: 'glb-selection-parity', specifier: './RvmGlbSelectionParityBridge.js?v=20260620-rvm-glb-selection-details-parity-1', install: 'installRvmGlbSelectionParityBridge' },
    { id: 'glb-acceptance-pack', specifier: './RvmGlbAcceptancePackBridge.js?v=20260620-rvm-stagedjson-validation-1', install: 'installRvmGlbAcceptancePackBridge' },
    { id: 'native-tessellation-diagnostics', specifier: './RvmNativeTessellationDiagnosticsBridge.js?v=20260620-rvm-native-diagnostics-1', install: 'installRvmNativeTessellationDiagnosticsBridge' },
    { id: 'object-search', specifier: './RvmObjectSearchBridge.js?v=20260621-rvm-object-search-1', install: 'installRvmObjectSearchBridge' },
    { id: 'visibility-snapshots', specifier: './RvmVisibilitySnapshotsBridge.js?v=20260621-rvm-visibility-snapshots-1', install: 'installRvmVisibilitySnapshotsBridge' },
    { id: 'selection-sets', specifier: './RvmSelectionSetsBridge.js?v=20260621-rvm-selection-sets-1', install: 'installRvmSelectionSetsBridge' },
    { id: 'report-export', specifier: './RvmReportExportBridge.js?v=20260621-rvm-report-export-1', install: 'installRvmReportExportBridge' },
    { id: 'model-health', specifier: './RvmModelHealthBridge.js?v=20260621-rvm-health-issues-1', install: 'installRvmModelHealthBridge' },
    { id: 'model-health-issues', specifier: './RvmModelHealthIssuesBridge.js?v=20260621-rvm-health-issues-1', install: 'installRvmModelHealthIssuesBridge' },
  ],
});

const loadedSpecs = new Map();
const groupPromises = new Map();
let activeRoot = null;
let modelLoadedListenerInstalled = false;
let modelReadyPollStarted = false;
let actionDiagnosticsInstalled = false;

export function installRvmDeferredBridgeLoader() {
  refreshRootInstallEpoch();
  const api = globalThis[API_KEY] || {
    version: VERSION,
    groups: Object.keys(BRIDGE_GROUPS),
    ensureGroup: (groupName, reason = 'api') => ensureRvmBridgeGroup(groupName, reason),
    ensurePostModel: (reason = 'api') => ensureRvmBridgeGroup('postModel', reason),
    ensureSourcePreview: (reason = 'api') => ensureSourcePreviewGroupIfNeeded(reason),
    getLoadedBridgeIds: () => [...loadedSpecs.keys()],
    getDiagnostics: () => globalThis[ACTION_DIAGNOSTICS_KEY] || null,
  };
  api.version = VERSION;
  api.groups = Object.keys(BRIDGE_GROUPS);
  api.ensureSourcePreview = (reason = 'api') => ensureSourcePreviewGroupIfNeeded(reason);
  globalThis[API_KEY] = api;
  installRvmBridgeActionDiagnostics();
  installModelLoadedListener();
  startModelReadyPolling(api);
  afterFirstPaint(() => {
    const root = document.querySelector('[data-rvm-viewer]');
    if (root?.dataset?.rvmModelLoaded === 'true') {
      api.ensurePostModel('already-loaded-after-first-paint');
      api.ensureSourcePreview('already-loaded-after-first-paint');
    }
  });
  return api;
}

export function ensureRvmBridgeGroup(groupName, reason = 'manual') {
  refreshRootInstallEpoch();
  const group = BRIDGE_GROUPS[groupName];
  if (!group) return Promise.reject(new Error(`Unknown RVM bridge group: ${groupName}`));
  const existing = groupPromises.get(groupName);
  if (existing) return existing;
  const promise = Promise.allSettled(group.map((spec) => loadAndInstall(spec, reason))).then((results) => {
    const failures = results
      .map((result, index) => ({ result, spec: group[index] }))
      .filter(({ result }) => result.status === 'rejected');
    if (failures.length) {
      for (const { result, spec } of failures) reportRvmActionError(result.reason, { action: 'bridge-install', bridge: spec.id, group: groupName, reason });
    }
    if (groupName === 'sourcePreview' && !failures.length) refreshSourcePreviewRuntime(reason);
    refreshDiagnosticsDrawer();
    return { group: groupName, reason, results, failures };
  });
  groupPromises.set(groupName, promise);
  return promise;
}

async function loadAndInstall(spec, reason) {
  if (loadedSpecs.has(spec.id)) return loadedSpecs.get(spec.id);
  spec.beforeInstall?.();
  const module = await import(spec.specifier);
  const installer = module?.[spec.install];
  if (typeof installer !== 'function') throw new Error(`RVM bridge ${spec.id} missing installer ${spec.install}`);
  const api = installer();
  const entry = { id: spec.id, version: VERSION, reason, installedAt: new Date().toISOString(), api: Boolean(api) };
  loadedSpecs.set(spec.id, entry);
  return entry;
}

function refreshRootInstallEpoch() {
  const root = document.querySelector('[data-rvm-viewer]');
  if (!root || root === activeRoot) return;
  activeRoot = root;
  groupPromises.clear();
  loadedSpecs.clear();
}

function installModelLoadedListener() {
  if (modelLoadedListenerInstalled || typeof globalThis.addEventListener !== 'function') return;
  modelLoadedListenerInstalled = true;
  globalThis.addEventListener('rvm-model-loaded', (event) => {
    const reason = event?.detail?.reason || 'rvm-model-loaded';
    afterFirstPaint(() => {
      ensureRvmBridgeGroup('postModel', reason);
      ensureSourcePreviewGroupIfNeeded(reason);
    });
  });
}

function startModelReadyPolling(api) {
  if (modelReadyPollStarted) return;
  modelReadyPollStarted = true;
  let attempts = 0;
  const tick = () => {
    attempts += 1;
    const root = document.querySelector('[data-rvm-viewer]');
    const viewer = globalThis.__3D_RVM_VIEWER__;
    const modelReady = Boolean(root && viewer?.modelGroup?.children?.length);
    if (modelReady) {
      root.dataset.rvmModelLoaded = 'true';
      afterFirstPaint(() => {
        api.ensurePostModel('detected-model-group');
        api.ensureSourcePreview('detected-model-group');
      });
      return;
    }
    if (attempts < 240) setTimeout(tick, 500);
  };
  afterFirstPaint(tick);
}

function ensureSourcePreviewGroupIfNeeded(reason = 'source-preview-check') {
  const context = getSourcePreviewContext();
  if (!context.active) {
    clearSourcePreviewRuntime(context.viewer, context.reason || 'not-source-preview');
    return Promise.resolve({ group: 'sourcePreview', reason, skipped: true, status: 'not-source-preview' });
  }
  return ensureRvmBridgeGroup('sourcePreview', reason);
}

function getSourcePreviewContext() {
  const root = document.querySelector('[data-rvm-viewer]');
  const viewer = globalThis.__3D_RVM_VIEWER__;
  const model = viewer?.modelGroup || viewer?.scene || null;
  const userData = model?.userData || {};
  const mode = String(root?.dataset?.rvmModelPrimitiveMode || viewer?.modelPrimitiveMode || '').toLowerCase();
  const sourceKind = normalizeSourceKind(root?.dataset?.rvmLoadedSourceKind || userData.__rvmNonPrimitiveSourceKind || userData.__rvmNonPrimitiveAutoBendSourceKind || viewer?.sourceKind || '');
  const source = userData.__rvmNonPrimitiveAutoBendSourceHierarchy || userData.__rvmNonPrimitiveSourceHierarchy || null;
  const supportSource = userData.__rvmNonPrimitiveSourceHierarchy || source;
  const active = mode === 'source-preview' && SOURCE_PREVIEW_KIND_RE.test(sourceKind) && Boolean(source);
  return { root, viewer, model, source, supportSource, sourceKind, fileName: userData.fileName || '', active, reason: active ? '' : `mode:${mode || '-'} kind:${sourceKind || '-'}` };
}

function normalizeSourceKind(value) {
  return String(value || '').trim().toLowerCase();
}

function refreshSourcePreviewRuntime(reason = 'source-preview-loaded') {
  const context = getSourcePreviewContext();
  if (!context.active) return clearSourcePreviewRuntime(context.viewer, context.reason || reason);
  const { root, viewer, source, supportSource, sourceKind, fileName } = context;
  try { globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_AUTO_BEND__?.applyFromSource?.({ viewer, source, sourceKind, fileName }); } catch (error) { reportRvmActionError(error, { action: 'source-preview-auto-bend', reason }); }
  try { globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_SUPPORT_OVERLAY__?.applyFromSource?.({ viewer, root, source: supportSource, sourceKind, fileName }); } catch (error) { reportRvmActionError(error, { action: 'source-preview-support-overlay', reason }); }
  try { globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_NODE_MARKERS__?.applyFromSource?.({ viewer, root, source, sourceKind, fileName }); } catch (error) { reportRvmActionError(error, { action: 'source-preview-node-markers', reason }); }
  try { globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_SOURCE_TOOLS_UI__?.sync?.(); } catch (error) { reportRvmActionError(error, { action: 'source-preview-tools-sync', reason }); }
  return { status: 'refreshed', sourceKind, reason };
}

function clearSourcePreviewRuntime(viewer, reason = 'clear-source-preview-runtime') {
  try { globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_AUTO_BEND__?.clear?.(viewer, reason); } catch (_) {}
  try { globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_SUPPORT_OVERLAY__?.clear?.(viewer, reason); } catch (_) {}
  try { globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_NODE_MARKERS__?.clear?.(viewer, reason); } catch (_) {}
  try { globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_SOURCE_TOOLS_UI__?.sync?.(); } catch (_) {}
  return { status: 'cleared', reason };
}

function installRvmBridgeActionDiagnostics() {
  if (actionDiagnosticsInstalled) return;
  actionDiagnosticsInstalled = true;
  globalThis.__PCF_GLB_RVM_REPORT_ACTION_ERROR__ = reportRvmActionError;
  globalThis.addEventListener?.('unhandledrejection', (event) => {
    if (!document.querySelector('[data-rvm-viewer]')) return;
    reportRvmActionError(event.reason || event, { action: 'unhandled-promise' });
  });
  globalThis.addEventListener?.('error', (event) => {
    if (!document.querySelector('[data-rvm-viewer]')) return;
    reportRvmActionError(event.error || event.message || event, { action: 'window-error' });
  });
}

function reportRvmActionError(error, context = {}) {
  const root = document.querySelector('[data-rvm-viewer]');
  const message = String(error?.message || error || 'Unknown RVM action error');
  const entry = {
    at: new Date().toISOString(),
    message,
    stack: String(error?.stack || ''),
    ...context,
  };
  const current = globalThis[ACTION_DIAGNOSTICS_KEY] || { schema: 'rvm-action-diagnostics/v1', version: VERSION, failures: [] };
  current.version = VERSION;
  current.failures = [entry, ...(current.failures || [])].slice(0, 20);
  current.failureCount = current.failures.length;
  globalThis[ACTION_DIAGNOSTICS_KEY] = current;
  if (root) {
    root.dataset.rvmButtonActionFailures = String(current.failureCount);
    const status = root.querySelector('#rvm-sb-msg');
    if (status) status.textContent = `RVM action failed: ${message}`;
    updateActionDiagnosticsPanel(root, current);
  }
  try { globalThis.dispatchEvent?.(new CustomEvent('rvm-action-diagnostics', { detail: current })); } catch (_) {}
  refreshDiagnosticsDrawer();
  console.warn('[RVM action diagnostics]', context, error);
  return current;
}

function updateActionDiagnosticsPanel(root, diagnostics) {
  if (!root) return;
  let panel = root.querySelector('[data-rvm-action-diagnostics-panel]');
  if (!panel) {
    panel = document.createElement('div');
    panel.dataset.rvmActionDiagnosticsPanel = VERSION;
    panel.className = 'rvm-action-diagnostics-panel rvm-browser-parse-diagnostics';
    panel.innerHTML = '<h3>RVM Action Errors</h3><div data-rvm-action-diagnostics-body></div>';
    const right = root.querySelector('.rvm-right-panel') || root;
    right.appendChild(panel);
  }
  const body = panel.querySelector('[data-rvm-action-diagnostics-body]') || panel;
  const failures = diagnostics?.failures || [];
  body.innerHTML = failures.length
    ? failures.slice(0, 6).map((failure) => `<div class="rvm-browser-diag-warning"><b>${escapeHtml(failure.action || failure.bridge || 'action')}</b>: ${escapeHtml(failure.message)}</div>`).join('')
    : '<div class="rvm-empty-state">No action errors.</div>';
}

function refreshDiagnosticsDrawer() {
  try { globalThis.__PCF_GLB_RVM_BOTTOM_DIAGNOSTICS_DRAWER__?.refresh?.(); } catch (_) {}
}

function afterFirstPaint(fn) {
  const run = () => {
    if (typeof globalThis.requestIdleCallback === 'function') globalThis.requestIdleCallback(fn, { timeout: 1200 });
    else setTimeout(fn, 0);
  };
  if (typeof globalThis.requestAnimationFrame === 'function') globalThis.requestAnimationFrame(run);
  else setTimeout(run, 0);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
