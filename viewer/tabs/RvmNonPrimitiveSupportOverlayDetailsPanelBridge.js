import * as THREE from 'three';
import { RvmViewer3D } from '../rvm-viewer/RvmViewer3D.js?v=20260622-rvm-leaf-picking-2';
import {
  buildSupportOverlayDetailsPanelState,
  emptySupportOverlayDetailsPanelState,
  renderSupportOverlayDetailsPanelHtml,
  SUPPORT_OVERLAY_DETAILS_PANEL_SCHEMA,
} from '../overlays/support/SupportOverlayDetailsPanel.js';
import {
  copySupportOverlayDetailsJson,
  downloadSupportOverlayDetailsJson,
  SUPPORT_OVERLAY_DETAILS_EXPORT_SCHEMA,
} from '../overlays/support/SupportOverlayDetailsExport.js';
import {
  clearSupportOverlayHighlights,
  createEmptySupportOverlayHighlightState,
  highlightSupportOverlayGlyph,
  SUPPORT_OVERLAY_HIGHLIGHT_SCHEMA,
} from '../overlays/support/SupportOverlayHighlight.js';

export const RVM_NON_PRIMITIVE_SUPPORT_DETAILS_PANEL_SCHEMA = 'rvm-non-primitive-support-overlay-details-panel/v4';

const ROOT_SELECTOR = '[data-rvm-viewer]';
const PANEL_ID = 'rvm-nonprimitive-support-details-panel';
const SUPPORT_OVERLAY_ROOT_NAME = '__RVM_NON_PRIMITIVE_SUPPORT_OVERLAY__';
const GLOBAL_KEY = '__PCF_GLB_RVM_NON_PRIMITIVE_SUPPORT_DETAILS_PANEL__';
const PATCH_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-support-details-panel-v4');
const VIEWER_PATCH_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-support-details-panel-viewer-v4');
const PICKING_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-support-details-picking-v4');
const STYLE_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-support-details-panel-style-v2');
const SOURCE_KIND_RE = /^(json|jscon|inputxml|txt|source-preview)$/i;
const PRIMITIVE_KIND_RE = /^(rvm|glb|gltf|rev)$/i;

export function installRvmNonPrimitiveSupportOverlayDetailsPanelBridge() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  globalThis[GLOBAL_KEY] = {
    schema: RVM_NON_PRIMITIVE_SUPPORT_DETAILS_PANEL_SCHEMA,
    panelSchema: SUPPORT_OVERLAY_DETAILS_PANEL_SCHEMA,
    exportSchema: SUPPORT_OVERLAY_DETAILS_EXPORT_SCHEMA,
    highlightSchema: SUPPORT_OVERLAY_HIGHLIGHT_SCHEMA,
    render: renderSupportOverlayDetailsPanel,
    sync: syncAllSupportOverlayDetailsPanels,
    clear: clearSupportOverlayDetailsPanel,
    selectFromPointer: selectSupportOverlayDetailsFromPointer,
    copyJson: copySupportOverlayDetailsJson,
    downloadJson: downloadSupportOverlayDetailsJson,
    clearHighlight: clearSupportOverlayHighlights,
    clearOnEscape: handleSupportDetailsKeyboardShortcut,
  };
  installSupportDetailsStyles();
  patchRvmViewerSetModelForSupportDetailsPanel();
  try { globalThis.addEventListener?.('rvm-nonprimitive-support-details-selected', () => syncAllSupportOverlayDetailsPanels()); } catch (_) {}
  try { globalThis.addEventListener?.('rvm-model-loaded', () => syncAllSupportOverlayDetailsPanels()); } catch (_) {}
  try { globalThis.addEventListener?.('keydown', handleSupportDetailsKeyboardShortcut, true); } catch (_) {}
  queueMicrotask(syncAllSupportOverlayDetailsPanels);
}

function installSupportDetailsStyles() {
  if (globalThis[STYLE_FLAG]) return;
  globalThis[STYLE_FLAG] = true;
  const doc = globalThis.document;
  if (!doc?.createElement) return;
  const style = doc.createElement('style');
  style.dataset.rvmNonPrimitiveSupportDetailsStyle = 'v2';
  style.textContent = `
    .rvm-support-details-panel {
      flex: 0 0 auto;
      padding: 7px;
      border-bottom: 1px solid var(--geo-border, #333);
      background: rgba(12, 17, 24, 0.82);
    }

    .rvm-source-tools-detail {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 5px;
      padding: 7px;
      border: 1px solid rgba(116, 139, 171, 0.26);
      border-radius: 8px;
      background: rgba(20, 26, 36, 0.82);
    }

    .rvm-source-tools-detail[data-support-details-highlighted="true"] {
      border-color: rgba(78, 195, 255, 0.58);
      box-shadow: inset 0 0 0 1px rgba(78, 195, 255, 0.18);
    }

    .rvm-source-tools-detail .rvm-source-tools-row strong {
      max-width: 64%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #dbe9ff;
      font-weight: 700;
    }

    .rvm-source-tools-detail ul {
      margin: 3px 0 0 14px;
      padding: 0;
    }

    .rvm-source-tools-actions--inline {
      padding: 0;
      border: 0;
      background: transparent;
    }
  `;
  doc.head?.appendChild?.(style);
}

function patchRvmViewerSetModelForSupportDetailsPanel() {
  const proto = RvmViewer3D?.prototype;
  if (!proto || proto[VIEWER_PATCH_FLAG] || typeof proto.setModel !== 'function') return;
  const originalSetModel = proto.setModel;
  proto.setModel = function setModelWithNonPrimitiveSupportDetailsPanel(model, upAxis = 'Y') {
    const result = originalSetModel.call(this, model, upAxis);
    ensureSupportDetailsPicking(this);
    const sourceKind = normalizeSourceKind(model?.userData?.__rvmNonPrimitiveSourceKind || model?.userData?.sourceKind || this?.sourceKind || '');
    if (!model?.userData?.__rvmNonPrimitiveSourceHierarchy && !isNonPrimitiveKind(sourceKind)) {
      clearViewerDetailsSelection(this, 'primitive-or-no-source-hierarchy');
    }
    syncAllSupportOverlayDetailsPanels();
    return result;
  };
  proto[VIEWER_PATCH_FLAG] = true;
}

export function syncAllSupportOverlayDetailsPanels() {
  const roots = globalThis.document?.querySelectorAll?.(ROOT_SELECTOR) || [];
  for (const root of roots) renderSupportOverlayDetailsPanel(root, globalThis.__3D_RVM_VIEWER__);
}

export function renderSupportOverlayDetailsPanel(root, viewer = globalThis.__3D_RVM_VIEWER__) {
  if (!root) return null;
  const mode = String(root.dataset?.rvmModelPrimitiveMode || '').toLowerCase();
  const kind = normalizeSourceKind(root.dataset?.rvmLoadedSourceKind || viewer?.nonPrimitiveSupportOverlayDiagnostics?.sourceKind || viewer?.sourceKind || '');
  const shouldShow = mode === 'source-preview' && isNonPrimitiveKind(kind);
  const panel = ensureDetailsPanel(root);
  if (!panel) return null;
  if (!shouldShow) return clearSupportOverlayDetailsPanel(panel, viewer, 'primitive-or-unsupported-source');

  panel.hidden = false;
  panel.dataset.supportDetailsActive = 'true';
  delete panel.dataset.supportDetailsCleared;
  const diagnostics = viewer?.nonPrimitiveSupportOverlayDiagnostics || {};
  const rawDetails = viewer?.nonPrimitiveSupportOverlaySelectedDetails;
  const state = buildSupportOverlayDetailsPanelState(rawDetails, {
    sourceKind: diagnostics.sourceKind || kind,
    sourceFile: diagnostics.sourceFile || '',
    highlighted: isSupportDetailsHighlighted(viewer, rawDetails),
  });
  panel.innerHTML = renderSupportOverlayDetailsPanelHtml(state, { escapeHtml });
  bindDetailsPanel(panel, viewer);
  return panel;
}

function ensureDetailsPanel(root) {
  let panel = root.querySelector(`#${PANEL_ID}`);
  if (panel) return panel;
  const rightPanel = root.querySelector('.rvm-right-panel');
  if (!rightPanel) return null;
  const header = globalThis.document?.createElement?.('div');
  panel = globalThis.document?.createElement?.('div');
  if (!header || !panel) return null;
  header.className = 'rvm-panel-header';
  header.dataset.rvmNonPrimitiveSupportDetailsHeader = 'true';
  header.textContent = 'Support Details';
  panel.id = PANEL_ID;
  panel.className = 'rvm-support-details-panel rvm-tag-list';
  panel.dataset.rvmNonPrimitiveSupportDetails = 'true';

  const sourceToolsPanel = rightPanel.querySelector('#rvm-nonprimitive-source-tools-panel');
  if (sourceToolsPanel?.nextSibling) {
    rightPanel.insertBefore(header, sourceToolsPanel.nextSibling);
    rightPanel.insertBefore(panel, header.nextSibling);
  } else if (sourceToolsPanel) {
    rightPanel.append(header, panel);
  } else {
    const diagnosticsHeader = rightPanel.querySelector('[data-rvm-browser-diagnostics-header="true"]');
    if (diagnosticsHeader) {
      rightPanel.insertBefore(header, diagnosticsHeader);
      rightPanel.insertBefore(panel, diagnosticsHeader);
    } else {
      rightPanel.append(header, panel);
    }
  }
  return panel;
}

export function clearSupportOverlayDetailsPanel(panel, viewer = globalThis.__3D_RVM_VIEWER__, reason = 'clear') {
  if (panel) {
    panel.hidden = true;
    panel.dataset.supportDetailsActive = 'false';
    panel.dataset.supportDetailsCleared = reason;
    panel.innerHTML = '';
  }
  clearViewerDetailsSelection(viewer, reason);
  return panel;
}

function bindDetailsPanel(panel, viewer) {
  if (panel.dataset.boundSupportDetailsPanel === 'true') return;
  panel.dataset.boundSupportDetailsPanel = 'true';
  panel.addEventListener('click', (event) => {
    const control = event.target?.closest?.('[data-support-details-action]');
    if (!control) return;
    const action = control.dataset.supportDetailsAction;
    if (action === 'clear') {
      clearViewerDetailsSelection(viewer || globalThis.__3D_RVM_VIEWER__, 'user-clear');
      renderSupportOverlayDetailsPanel(panel.closest?.(ROOT_SELECTOR), viewer || globalThis.__3D_RVM_VIEWER__);
      return;
    }
    if (action === 'copy-json' || action === 'download-json') {
      void handleDetailsExportAction(panel, viewer || globalThis.__3D_RVM_VIEWER__, action);
    }
  });
}

async function handleDetailsExportAction(panel, viewer, action) {
  const state = viewer?.nonPrimitiveSupportOverlaySelectedDetails;
  const diagnostics = viewer?.nonPrimitiveSupportOverlayDiagnostics || {};
  const context = {
    sourceKind: diagnostics.sourceKind || viewer?.sourceKind || '',
    sourceFile: diagnostics.sourceFile || '',
  };
  try {
    const result = action === 'copy-json'
      ? await copySupportOverlayDetailsJson(state, context)
      : downloadSupportOverlayDetailsJson(state, context);
    panel.dataset.supportDetailsExportStatus = result?.status || 'done';
    if (result?.fileName) panel.dataset.supportDetailsExportFile = result.fileName;
    return result;
  } catch (error) {
    panel.dataset.supportDetailsExportStatus = 'failed';
    panel.dataset.supportDetailsExportError = String(error?.message || error || 'export-failed');
    return { status: 'failed', reason: panel.dataset.supportDetailsExportError };
  }
}

function handleSupportDetailsKeyboardShortcut(event = {}) {
  if (String(event.key || '') !== 'Escape') return { status: 'ignored', reason: 'not-escape' };
  const viewer = globalThis.__3D_RVM_VIEWER__;
  if (!hasSelectedSupportDetails(viewer)) return { status: 'ignored', reason: 'no-selected-support-details' };
  clearViewerDetailsSelection(viewer, 'escape-key');
  syncAllSupportOverlayDetailsPanels();
  try { event.stopPropagation?.(); } catch (_) {}
  return { status: 'cleared', reason: 'escape-key' };
}

function clearViewerDetailsSelection(viewer, reason = 'clear') {
  if (!viewer) return;
  viewer.nonPrimitiveSupportOverlaySelectedDetails = emptySupportOverlayDetailsPanelState(reason);
  viewer.nonPrimitiveSupportOverlayHighlightState = clearViewerSupportHighlights(viewer, reason);
  emitDetailsSelection(viewer, viewer.nonPrimitiveSupportOverlaySelectedDetails);
}

function clearViewerSupportHighlights(viewer, reason = 'clear') {
  const roots = collectSupportOverlayRoots(viewer);
  if (!roots.length) return createEmptySupportOverlayHighlightState(reason);
  return clearSupportOverlayHighlights(roots, reason);
}

function ensureSupportDetailsPicking(viewer) {
  if (!viewer || viewer[PICKING_FLAG]) return;
  const dom = viewer.renderer?.domElement || viewer.container;
  if (!dom?.addEventListener) return;
  const onClick = (event) => selectSupportOverlayDetailsFromPointer(viewer, event);
  dom.addEventListener('click', onClick, false);
  viewer[PICKING_FLAG] = { dom, onClick };
}

export function selectSupportOverlayDetailsFromPointer(viewer = globalThis.__3D_RVM_VIEWER__, event = {}) {
  if (!viewer?.camera || !viewer?.scene) return { status: 'skipped', reason: 'viewer-missing' };
  const roots = collectSupportOverlayRoots(viewer);
  if (!roots.length) return { status: 'skipped', reason: 'support-overlay-root-missing' };

  const dom = viewer.renderer?.domElement || event.currentTarget || viewer.container;
  const rect = dom?.getBoundingClientRect?.();
  if (!rect || !Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) {
    return { status: 'skipped', reason: 'invalid-dom-rect' };
  }

  const pointer = new THREE.Vector2(
    ((Number(event.clientX) - rect.left) / rect.width) * 2 - 1,
    -(((Number(event.clientY) - rect.top) / rect.height) * 2 - 1),
  );
  const raycaster = viewer.raycaster || new THREE.Raycaster();
  raycaster.setFromCamera(pointer, viewer.camera);

  const targets = [];
  for (const root of roots) {
    root.traverse?.((object) => {
      if (object?.isMesh || object?.isLine || object?.isSprite) targets.push(object);
    });
  }
  const hits = raycaster.intersectObjects(targets, false);
  for (const hit of hits) {
    const owner = findDetailsOwner(hit.object, roots);
    if (!owner?.userData?.supportOverlayDetails) continue;
    const state = buildSupportOverlayDetailsPanelState(owner.userData.supportOverlayDetails, {
      sourceKind: owner.userData.sourceKind,
      sourceFile: owner.userData.sourceFile,
      highlighted: true,
    });
    viewer.nonPrimitiveSupportOverlayHighlightState = highlightSupportOverlayGlyph(owner, roots, {
      supportId: state.supportId,
      family: state.family,
    });
    viewer.nonPrimitiveSupportOverlaySelectedDetails = state;
    emitDetailsSelection(viewer, state);
    syncAllSupportOverlayDetailsPanels();
    return { status: 'selected', supportId: state.supportId, family: state.family, highlighted: true };
  }
  if (hasSelectedSupportDetails(viewer)) {
    clearViewerDetailsSelection(viewer, 'pointer-miss');
    syncAllSupportOverlayDetailsPanels();
    return { status: 'missed', cleared: true };
  }
  return { status: 'missed', cleared: false };
}

function collectSupportOverlayRoots(viewer) {
  const roots = [];
  const scan = (parent) => parent?.traverse?.((object) => {
    if (object?.name === SUPPORT_OVERLAY_ROOT_NAME || object?.userData?.nonPrimitiveSupportOverlay) roots.push(object);
  });
  scan(viewer?.scene);
  scan(viewer?.modelGroup);
  return Array.from(new Set(roots));
}

function findDetailsOwner(object, roots) {
  let current = object;
  while (current) {
    if (current.userData?.supportOverlayDetails) return current;
    if (roots.includes(current)) return null;
    current = current.parent;
  }
  return null;
}

function hasSelectedSupportDetails(viewer) {
  return viewer?.nonPrimitiveSupportOverlaySelectedDetails?.status === 'selected';
}

function isSupportDetailsHighlighted(viewer, details) {
  if (!details || details.status !== 'selected') return false;
  const state = viewer?.nonPrimitiveSupportOverlayHighlightState;
  if (!state || state.status !== 'highlighted') return false;
  const supportId = details.supportId || details.supportNo;
  return !supportId || !state.supportId || String(state.supportId) === String(supportId);
}

function emitDetailsSelection(viewer, state) {
  const EventCtor = globalThis.CustomEvent;
  if (EventCtor && globalThis.dispatchEvent) {
    try { globalThis.dispatchEvent(new EventCtor('rvm-nonprimitive-support-details-selected', { detail: { viewer, state } })); } catch (_) {}
  }
}

function isNonPrimitiveKind(kind) {
  const normalized = normalizeSourceKind(kind);
  return SOURCE_KIND_RE.test(normalized) && !PRIMITIVE_KIND_RE.test(normalized);
}

function normalizeSourceKind(value) {
  const kind = String(value || '').trim().toLowerCase().replace(/^\./, '');
  if (!kind || kind === 'aveva-json' || kind === 'source-preview') return 'json';
  if (kind === 'xml' || kind === 'uxml') return 'inputxml';
  return kind;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
