import * as THREE from 'three';
import { NODE_MARKER_ROOT_NAME, collectNodeMarkerRoots } from '../overlays/nodes/NodeMarkerGlyphGeometry.js';
import { buildNodeMarkerHoverPreview, emptyNodeMarkerHoverState, renderNodeMarkerHoverHtml } from '../overlays/nodes/NodeMarkerHover.js';

export const RVM_NON_PRIMITIVE_NODE_MARKER_HOVER_SCHEMA = 'rvm-non-primitive-node-marker-hover-bridge/v1';

const GLOBAL_KEY = '__PCF_GLB_RVM_NON_PRIMITIVE_NODE_MARKER_HOVER__';
const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-node-marker-hover-v1');
const POINTER_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-node-marker-hover-pointer-v1');
const STYLE_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-node-marker-hover-style-v1');
const ROOT_SELECTOR = '[data-rvm-viewer]';

export function installRvmNonPrimitiveNodeMarkerHoverBridge() {
  if (globalThis[INSTALL_FLAG] && globalThis[GLOBAL_KEY]) return globalThis[GLOBAL_KEY];
  globalThis[INSTALL_FLAG] = true;
  const api = { schema: RVM_NON_PRIMITIVE_NODE_MARKER_HOVER_SCHEMA, ensure: ensureNodeMarkerHover, previewFromPointer, clear: clearNodeMarkerHover };
  globalThis[GLOBAL_KEY] = api;
  installStyles();
  return api;
}

export function ensureNodeMarkerHover(viewer = globalThis.__3D_RVM_VIEWER__) {
  installRvmNonPrimitiveNodeMarkerHoverBridge();
  if (!viewer || viewer[POINTER_FLAG]) return { status: viewer ? 'already-installed' : 'skipped', reason: viewer ? '' : 'viewer-missing' };
  const dom = viewer.renderer?.domElement || viewer.container;
  if (!dom?.addEventListener) return { status: 'skipped', reason: 'dom-missing' };
  const onMove = (event) => previewFromPointer(viewer, event);
  const onLeave = () => clearNodeMarkerHover(viewer, 'pointer-leave');
  const onDown = () => clearNodeMarkerHover(viewer, 'navigation-pointer-down');
  dom.addEventListener('pointermove', onMove, false);
  dom.addEventListener('pointerleave', onLeave, false);
  dom.addEventListener('pointerdown', onDown, false);
  viewer[POINTER_FLAG] = { dom, onMove, onLeave, onDown };
  return { status: 'installed' };
}

export function previewFromPointer(viewer = globalThis.__3D_RVM_VIEWER__, event = {}) {
  if (!viewer?.camera || !viewer?.scene) return writeHoverDiagnostics(viewer, { status: 'skipped', reason: 'viewer-missing' });
  if (Number(event.buttons || 0) !== 0) return clearNodeMarkerHover(viewer, 'navigation-drag');
  const roots = collectNodeMarkerRoots(viewer);
  if (!roots.length) return clearNodeMarkerHover(viewer, 'node-marker-root-missing');
  const dom = viewer.renderer?.domElement || event.currentTarget || viewer.container;
  const rect = dom?.getBoundingClientRect?.();
  if (!rect || !rect.width || !rect.height) return writeHoverDiagnostics(viewer, { status: 'skipped', reason: 'invalid-dom-rect' });
  const owner = findMarkerOwner(viewer, roots, rect, event);
  if (!owner?.userData?.rvmNodeMarkerDetails) return clearNodeMarkerHover(viewer, 'pointer-miss');
  const preview = buildNodeMarkerHoverPreview(owner.userData.rvmNodeMarkerDetails);
  viewer.nonPrimitiveNodeMarkerHoverPreview = preview;
  renderTooltip(preview, event);
  return writeHoverDiagnostics(viewer, { schema: RVM_NON_PRIMITIVE_NODE_MARKER_HOVER_SCHEMA, status: 'preview', markerId: preview.markerId, nodeNumber: preview.nodeNumber, primitiveExcluded: true, rvmSearchIndexed: false, rvmSelectionUsed: false });
}

export function clearNodeMarkerHover(viewer = globalThis.__3D_RVM_VIEWER__, reason = 'clear') {
  if (viewer) {
    viewer.nonPrimitiveNodeMarkerHoverPreview = emptyNodeMarkerHoverState(reason);
    writeHoverDiagnostics(viewer, { status: 'cleared', reason, primitiveExcluded: true, rvmSearchIndexed: false, rvmSelectionUsed: false });
  }
  hideTooltip(reason);
  return viewer?.nonPrimitiveNodeMarkerHoverDiagnostics || emptyNodeMarkerHoverState(reason);
}

function findMarkerOwner(viewer, roots, rect, event) {
  const pointer = new THREE.Vector2(((Number(event.clientX) - rect.left) / rect.width) * 2 - 1, -(((Number(event.clientY) - rect.top) / rect.height) * 2 - 1));
  const raycaster = viewer.raycaster || new THREE.Raycaster();
  raycaster.setFromCamera(pointer, viewer.camera);
  const targets = [];
  for (const root of roots) root.traverse?.((object) => { if (object?.userData?.rvmNodeMarker) targets.push(object); });
  const hits = raycaster.intersectObjects(targets, false);
  return hits[0]?.object || null;
}

function renderTooltip(preview, event) {
  const root = event?.currentTarget?.closest?.(ROOT_SELECTOR) || globalThis.document?.querySelector?.(ROOT_SELECTOR);
  const tooltip = ensureTooltip(root);
  if (!tooltip) return null;
  tooltip.hidden = false;
  tooltip.dataset.nodeMarkerHoverActive = 'true';
  tooltip.innerHTML = renderNodeMarkerHoverHtml(preview, { escapeHtml });
  tooltip.style.left = `${Math.max(0, Number(event.clientX || 0) + 14)}px`;
  tooltip.style.top = `${Math.max(0, Number(event.clientY || 0) + 14)}px`;
  return tooltip;
}

function ensureTooltip(root) {
  const doc = globalThis.document;
  if (!doc?.createElement) return null;
  let tooltip = root?.querySelector?.('[data-rvm-node-marker-hover-preview="true"]') || doc.querySelector?.('[data-rvm-node-marker-hover-preview="true"]');
  if (tooltip) return tooltip;
  tooltip = doc.createElement('div');
  tooltip.className = 'rvm-node-marker-hover-preview';
  tooltip.dataset.rvmNodeMarkerHoverPreview = 'true';
  tooltip.hidden = true;
  tooltip.style.pointerEvents = 'none';
  tooltip.style.userSelect = 'none';
  (root || doc.body || doc.documentElement)?.appendChild?.(tooltip);
  return tooltip;
}

function hideTooltip(reason) {
  const tips = globalThis.document?.querySelectorAll?.('[data-rvm-node-marker-hover-preview="true"]') || [];
  for (const tip of tips) {
    tip.hidden = true;
    tip.dataset.nodeMarkerHoverActive = 'false';
    tip.dataset.nodeMarkerHoverCleared = reason;
    tip.innerHTML = '';
  }
}

function installStyles() {
  if (globalThis[STYLE_FLAG]) return;
  globalThis[STYLE_FLAG] = true;
  const doc = globalThis.document;
  if (!doc?.createElement) return;
  const style = doc.createElement('style');
  style.dataset.rvmNodeMarkerHoverStyle = 'v1';
  style.textContent = `.rvm-node-marker-hover-preview{position:fixed;z-index:2147482500;min-width:170px;max-width:290px;padding:7px 9px;border:1px solid rgba(80,214,255,.72);border-radius:8px;background:rgba(11,15,23,.92);color:#eef6ff;box-shadow:0 8px 22px rgba(0,0,0,.32);pointer-events:none;user-select:none;font-size:11px;line-height:1.35}.rvm-node-marker-hover__title{font-weight:800;color:#b9efff}.rvm-node-marker-hover__row{opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rvm-node-marker-hover__status{margin-top:3px;color:#b9efff;font-weight:700}`;
  doc.head?.appendChild?.(style);
}

function writeHoverDiagnostics(viewer, state) {
  if (viewer) viewer.nonPrimitiveNodeMarkerHoverDiagnostics = { schema: RVM_NON_PRIMITIVE_NODE_MARKER_HOVER_SCHEMA, rootName: NODE_MARKER_ROOT_NAME, ...state };
  return viewer?.nonPrimitiveNodeMarkerHoverDiagnostics || state;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
