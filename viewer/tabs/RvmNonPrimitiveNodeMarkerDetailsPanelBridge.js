import * as THREE from 'three';
import { collectNodeMarkerRoots } from '../overlays/nodes/NodeMarkerGlyphGeometry.js';
import { buildNodeMarkerDetailsJson, buildNodeMarkerDetailsPanelState, emptyNodeMarkerDetailsPanelState, renderNodeMarkerDetailsPanelHtml } from '../overlays/nodes/NodeMarkerDetailsPanel.js';

export const RVM_NON_PRIMITIVE_NODE_MARKER_DETAILS_PANEL_SCHEMA = 'rvm-non-primitive-node-marker-details-panel-bridge/v2';
const GLOBAL_KEY = '__PCF_GLB_RVM_NON_PRIMITIVE_NODE_MARKER_DETAILS_PANEL__';
const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-node-marker-details-panel-v2');
const PICKING_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-node-marker-details-picking-v2');
const PANEL_ID = 'rvm-nonprimitive-node-marker-details-panel';
const ROOT_SELECTOR = '[data-rvm-viewer]';

export function installRvmNonPrimitiveNodeMarkerDetailsPanelBridge() {
  if (globalThis[INSTALL_FLAG] && globalThis[GLOBAL_KEY]) return globalThis[GLOBAL_KEY];
  globalThis[INSTALL_FLAG] = true;
  const api = { schema: RVM_NON_PRIMITIVE_NODE_MARKER_DETAILS_PANEL_SCHEMA, ensure, render, clear, selectFromPointer, copyJson, downloadJson };
  globalThis[GLOBAL_KEY] = api;
  return api;
}

export function ensure(viewer = globalThis.__3D_RVM_VIEWER__) {
  installRvmNonPrimitiveNodeMarkerDetailsPanelBridge();
  bindCanvasClick(viewer);
  renderAll(viewer);
  return { status: viewer ? 'ensured' : 'skipped' };
}

export function renderAll(viewer = globalThis.__3D_RVM_VIEWER__) {
  const roots = globalThis.document?.querySelectorAll?.(ROOT_SELECTOR) || [];
  for (const root of roots) render(root, viewer);
}

export function render(root, viewer = globalThis.__3D_RVM_VIEWER__) {
  if (!root) return null;
  const panel = ensurePanel(root);
  if (!panel) return null;
  const state = viewer?.nonPrimitiveNodeMarkerSelectedDetails || emptyNodeMarkerDetailsPanelState('no-selection');
  panel.hidden = false;
  panel.dataset.nodeMarkerDetailsActive = 'true';
  panel.innerHTML = renderNodeMarkerDetailsPanelHtml(state, { escapeHtml });
  bindPanel(panel, viewer);
  return panel;
}

export function clear(viewer = globalThis.__3D_RVM_VIEWER__, reason = 'clear') {
  if (viewer) viewer.nonPrimitiveNodeMarkerSelectedDetails = emptyNodeMarkerDetailsPanelState(reason);
  const panel = globalThis.document?.querySelector?.(`#${PANEL_ID}`);
  if (panel) {
    panel.hidden = true;
    panel.dataset.nodeMarkerDetailsActive = 'false';
    panel.dataset.nodeMarkerDetailsCleared = reason;
    panel.innerHTML = '';
  }
  return { status: 'cleared', reason };
}

export function selectFromPointer(viewer = globalThis.__3D_RVM_VIEWER__, event = {}) {
  if (!viewer?.camera || !viewer?.scene) return { status: 'skipped', reason: 'viewer-missing' };
  const roots = collectNodeMarkerRoots(viewer);
  if (!roots.length) return { status: 'skipped', reason: 'node-marker-root-missing' };
  const owner = pickNodeMarker(viewer, roots, event);
  if (!owner?.userData?.rvmNodeMarkerDetails) return { status: 'missed', cleared: false };
  const diagnostics = viewer?.nonPrimitiveNodeMarkerDiagnostics || {};
  const state = buildNodeMarkerDetailsPanelState(owner.userData.rvmNodeMarkerDetails, { sourceKind: diagnostics.sourceKind || viewer?.sourceKind || '', sourceSubKind: diagnostics.sourceSubKind || '', sourceFile: diagnostics.sourceFile || '' });
  viewer.nonPrimitiveNodeMarkerSelectedDetails = state;
  renderAll(viewer);
  return { status: 'selected', markerId: state.markerId, nodeNumber: state.nodeNumber, primitiveSelectionUsed: false, rvmSearchIndexed: false };
}

function bindCanvasClick(viewer) {
  if (!viewer || viewer[PICKING_FLAG]) return;
  const dom = viewer.renderer?.domElement || viewer.container;
  if (!dom?.addEventListener) return;
  const onClick = (event) => selectFromPointer(viewer, event);
  dom.addEventListener('click', onClick, false);
  viewer[PICKING_FLAG] = { dom, onClick };
}

function pickNodeMarker(viewer, roots, event) {
  const dom = viewer.renderer?.domElement || event.currentTarget || viewer.container;
  const rect = dom?.getBoundingClientRect?.();
  if (!rect || !rect.width || !rect.height) return null;
  const pointer = new THREE.Vector2(((Number(event.clientX) - rect.left) / rect.width) * 2 - 1, -(((Number(event.clientY) - rect.top) / rect.height) * 2 - 1));
  const raycaster = viewer.raycaster || new THREE.Raycaster();
  raycaster.setFromCamera(pointer, viewer.camera);
  const targets = [];
  for (const root of roots) root.traverse?.((object) => { if (object?.userData?.rvmNodeMarker) targets.push(object); });
  return raycaster.intersectObjects(targets, false)[0]?.object || null;
}

function ensurePanel(root) {
  let panel = root.querySelector(`#${PANEL_ID}`);
  if (panel) return panel;
  const rightPanel = root.querySelector('.rvm-right-panel');
  if (!rightPanel || !globalThis.document?.createElement) return null;
  const header = globalThis.document.createElement('div');
  panel = globalThis.document.createElement('div');
  header.className = 'rvm-panel-header';
  header.dataset.rvmNonPrimitiveNodeMarkerDetailsHeader = 'true';
  header.textContent = 'Node Marker Details';
  panel.id = PANEL_ID;
  panel.className = 'rvm-support-details-panel rvm-node-marker-details-panel rvm-tag-list';
  panel.dataset.rvmNonPrimitiveNodeMarkerDetails = 'true';
  const sourceToolsPanel = rightPanel.querySelector('#rvm-nonprimitive-source-tools-panel');
  if (sourceToolsPanel?.nextSibling) {
    rightPanel.insertBefore(header, sourceToolsPanel.nextSibling);
    rightPanel.insertBefore(panel, header.nextSibling);
  } else rightPanel.append(header, panel);
  return panel;
}

function bindPanel(panel, viewer) {
  if (panel.dataset.boundNodeMarkerDetailsPanel === 'true') return;
  panel.dataset.boundNodeMarkerDetailsPanel = 'true';
  panel.addEventListener('click', (event) => {
    const control = event.target?.closest?.('[data-node-marker-details-action]');
    if (!control) return;
    const activeViewer = viewer || globalThis.__3D_RVM_VIEWER__;
    const action = control.dataset.nodeMarkerDetailsAction;
    if (action === 'clear') clear(activeViewer, 'user-clear');
    if (action === 'copy-json') void copyJson(activeViewer);
    if (action === 'download-json') downloadJson(activeViewer);
    if (action === 'save-override') saveOverrideFromPanel(panel, activeViewer);
    if (action === 'clear-override') clearOverrideFromPanel(panel, activeViewer);
  });
}

export function readOverrideFromPanel(panel) {
  const read = (name) => panel.querySelector(`[data-node-marker-override-field="${name}"]`);
  const stateRoot = panel.querySelector('[data-node-marker-details-selected="true"]');
  return {
    markerId: stateRoot?.dataset?.nodeMarkerId || '',
    sourcePath: stateRoot?.dataset?.nodeMarkerSourcePath || '',
    nodeNumber: read('nodeNumber')?.value || '',
    branchName: read('branchName')?.value || '',
    componentRefNo: read('componentRefNo')?.value || '',
    componentType: read('componentType')?.value || '',
    positionSource: read('positionSource')?.value || '',
    reason: read('reason')?.value || '',
    suppressExport: Boolean(read('suppressExport')?.checked),
    locked: Boolean(read('locked')?.checked),
  };
}

function saveOverrideFromPanel(panel, viewer) {
  const override = readOverrideFromPanel(panel);
  const result = globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_NODE_MARKERS__?.saveOverride?.(viewer, override) || { status: 'skipped', reason: 'node-marker-api-missing' };
  renderAll(viewer);
  return result;
}

function clearOverrideFromPanel(panel, viewer) {
  const override = readOverrideFromPanel(panel);
  const result = globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_NODE_MARKERS__?.clearOverride?.(viewer, override) || { status: 'skipped', reason: 'node-marker-api-missing' };
  renderAll(viewer);
  return result;
}

export async function copyJson(viewer = globalThis.__3D_RVM_VIEWER__) {
  const text = JSON.stringify(buildNodeMarkerDetailsJson(viewer?.nonPrimitiveNodeMarkerSelectedDetails || emptyNodeMarkerDetailsPanelState()), null, 2);
  if (globalThis.navigator?.clipboard?.writeText) { await globalThis.navigator.clipboard.writeText(text); return { status: 'copied', bytes: text.length }; }
  return { status: 'unavailable', reason: 'clipboard-api-missing', bytes: text.length };
}

export function downloadJson(viewer = globalThis.__3D_RVM_VIEWER__) {
  const text = JSON.stringify(buildNodeMarkerDetailsJson(viewer?.nonPrimitiveNodeMarkerSelectedDetails || emptyNodeMarkerDetailsPanelState()), null, 2);
  const doc = globalThis.document;
  if (!doc?.createElement || !globalThis.Blob || !globalThis.URL?.createObjectURL) return { status: 'unavailable', reason: 'download-api-missing', bytes: text.length };
  const url = globalThis.URL.createObjectURL(new globalThis.Blob([text], { type: 'application/json' }));
  const link = doc.createElement('a');
  link.href = url;
  link.download = 'node-marker-details.json';
  doc.body?.appendChild?.(link);
  link.click?.();
  link.remove?.();
  setTimeout(() => globalThis.URL.revokeObjectURL?.(url), 0);
  return { status: 'downloaded', bytes: text.length };
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
