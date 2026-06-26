import * as THREE from 'three';
import { emit } from '../core/event-bus.js';
import { RuntimeEvents } from '../contracts/runtime-events.js';

const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-leaf-canvas-pick-v2-navigation-safe');
const VERSION = '20260622-rvm-leaf-canvas-pick-orbit-guard-2';
const CLICK_TOLERANCE = 5;
const SELECTED_COLOR = 0x60a5fa;
const SELECTED_EMISSIVE = 0x2563eb;

export function installRvmLeafCanvasPickBridge() {
  if (typeof document === 'undefined') return null;
  if (globalThis[INSTALL_FLAG]) return globalThis[INSTALL_FLAG];
  const state = { version: VERSION, runs: 0, bind: bindActiveViewer };
  globalThis[INSTALL_FLAG] = state;
  const attempt = () => {
    state.runs += 1;
    bindActiveViewer(state);
    if (!globalThis.__3D_RVM_VIEWER__ && state.runs < 180) setTimeout(attempt, 300);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attempt, { once: true });
  else attempt();
  try { globalThis.addEventListener?.('rvm-model-loaded', () => setTimeout(() => bindActiveViewer(state), 0)); } catch (_) {}
  return state;
}

function bindActiveViewer(state = globalThis[INSTALL_FLAG]) {
  const viewer = globalThis.__3D_RVM_VIEWER__;
  const root = document.querySelector('[data-rvm-viewer]');
  const canvas = viewer?.renderer?.domElement;
  if (!viewer || !canvas || canvas.dataset.rvmLeafCanvasPickBridge === VERSION) return viewer || null;
  canvas.dataset.rvmLeafCanvasPickBridge = VERSION;
  viewer._rvmLeafCanvasPickVersion = VERSION;
  patchSelectionAdapter(viewer.selection);
  let down = null;

  canvas.addEventListener('pointerdown', (event) => {
    const mode = currentMode(viewer);
    if (event.button !== 0) return;
    if (mode === 'select') {
      down = { x: event.clientX, y: event.clientY, time: now(), additive: event.ctrlKey || event.shiftKey || event.metaKey };
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    } else {
      down = null;
    }
  }, true);

  canvas.addEventListener('pointerup', (event) => {
    const mode = currentMode(viewer);
    if (event.button !== 0) return;
    if (mode !== 'select') {
      // Selection must not run in orbit/pan/marquee/measure modes, but those tools
      // need pointerup to continue to OrbitControls, RvmViewer3D marquee/measure handlers,
      // and document-level listeners.  Do not stop propagation here.
      down = null;
      return;
    }
    if (!down) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    const additive = down.additive || event.ctrlKey || event.shiftKey || event.metaKey;
    down = null;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    if (moved > CLICK_TOLERANCE) return;
    const hit = pickLeafObject(viewer, event.clientX, event.clientY);
    if (!hit) {
      if (!additive) clearLeafSelection(viewer, root);
      return;
    }
    selectLeafObject(viewer, root, hit.object, hit.point, { additive });
  }, true);

  return viewer;
}

function patchSelectionAdapter(selection) {
  if (!selection || selection.__rvmLeafCanvasPickVersion === VERSION) return;
  selection.__rvmLeafCanvasPickVersion = VERSION;
  selection.selectByRenderObjectId = function selectByRenderObjectId(renderId, canonicalId = renderId, options = {}) {
    if (!options.additive) this.clearSelection?.();
    this._selectedCanonicalId = canonicalId || renderId;
    this._selectedCanonicalIds = [this._selectedCanonicalId];
    this._selectedRenderIds = [renderId].filter(Boolean);
    this._highlight?.(this._selectedRenderIds, 0x2244cc);
    this._emitSelection?.();
  };
}

function pickLeafObject(viewer, clientX, clientY) {
  if (!viewer?.camera || !viewer?.modelGroup || !viewer?.renderer?.domElement) return null;
  const rect = viewer.renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const mouse = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  const raycaster = viewer._rvmLeafCanvasRaycaster || (viewer._rvmLeafCanvasRaycaster = new THREE.Raycaster());
  raycaster.params.Line = { threshold: 2 };
  raycaster.params.Points = { threshold: 2 };
  raycaster.setFromCamera(mouse, viewer.camera);
  const hits = raycaster.intersectObject(viewer.modelGroup, true);
  return hits.find((hit) => isSelectableLeaf(hit.object)) || null;
}

function selectLeafObject(viewer, root, object, point, options = {}) {
  if (!object) return false;
  if (!options.additive) clearLeafSelection(viewer, root, { keepPanel: true });
  applySelectedMaterial(object);
  viewer._rvmCanvasSelectedMeshes = unique([...(viewer._rvmCanvasSelectedMeshes || []), object]);
  const renderId = renderIdFor(object);
  const canonicalId = canonicalIdFor(viewer, object, renderId);
  try { viewer.selection?.selectByRenderObjectId?.(renderId, canonicalId, { additive: options.additive }); } catch (_) {}
  emit(RuntimeEvents.RVM_NODE_SELECTED, { canonicalId, canonicalIds: [canonicalId].filter(Boolean), renderObjectIds: [renderId].filter(Boolean), leafObjectOnly: true });
  renderDetails(root, object, point);
  updateSelectedCount(root, viewer._rvmCanvasSelectedMeshes.length);
  return true;
}

function clearLeafSelection(viewer, root = null, options = {}) {
  const selected = Array.isArray(viewer?._rvmCanvasSelectedMeshes) ? viewer._rvmCanvasSelectedMeshes : [];
  for (const object of selected) restoreMaterial(object);
  viewer._rvmCanvasSelectedMeshes = [];
  try { viewer.selection?.clearSelection?.(); } catch (_) {}
  if (root) updateSelectedCount(root, 0);
  if (!options.keepPanel) {
    const panel = root?.querySelector?.('#rvm-attributes-panel');
    if (panel) panel.innerHTML = '<div class="rvm-empty-state">No object selected.</div>';
  }
}

function renderDetails(root, object, point) {
  const panel = root?.querySelector?.('#rvm-attributes-panel');
  if (!panel) return;
  const data = object?.userData || {};
  const props = data.browserRvmProperties || {};
  const attrs = data.browserRvmAttributes || props.attributes || data.attributes || {};
  const box = safeBox(object);
  const size = box ? box.getSize(new THREE.Vector3()) : null;
  const rows = [
    ['Picked', props.displayName || data.displayName || object?.name || object?.uuid || '-'],
    ['Source path', props.sourcePath || data.sourcePath || '-'],
    ['Type', props.type || data.type || attrs.TYPE || '-'],
    ['Kind', props.kind || data.kind || attrs.RVM_PRIMITIVE_KIND || '-'],
    ['Render primitive', props.effectiveRenderPrimitive || data.effectiveRenderPrimitive || data.renderKind || data.renderPrimitive || '-'],
    ['Matched meshes', 1],
    ['Selection mode', 'Leaf object'],
    ['Size', size ? `${fmt(size.x)} × ${fmt(size.y)} × ${fmt(size.z)}` : '-'],
    ['Pick point', point ? `${fmt(point.x)}, ${fmt(point.y)}, ${fmt(point.z)}` : '-'],
  ];
  const attrRows = Object.entries(attrs || {}).slice(0, 28).map(([key, value]) => [key, value]);
  panel.innerHTML = `
    <div class="rvm-canvas-selection-card">
      <div class="rvm-tree-selection-title">Canvas selection</div>
      <div class="rvm-browser-diag-grid">${rows.map(([key, value]) => row(key, value)).join('')}</div>
      <div class="rvm-tree-selection-title">Attributes</div>
      <div class="rvm-browser-diag-grid">${attrRows.length ? attrRows.map(([key, value]) => row(key, value)).join('') : row('Attributes', 'No attributes on picked mesh')}</div>
    </div>`;
}

function isSelectableLeaf(obj) {
  if (!(obj?.isMesh || obj?.isLine || obj?.isLineSegments || obj?.isPoints)) return false;
  const data = obj.userData || {};
  return obj.visible !== false
    && data.supportSymbol !== true
    && data.rvmHiddenByUser !== true
    && data.rvmInteractionIgnore !== true
    && data.pickable !== false
    && data.selectable !== false
    && !data.nonSelectableReason;
}

function applySelectedMaterial(object) {
  if (!object?.material || object.userData?.rvmCanvasSelectionHighlighted) return;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  object.userData.rvmCanvasSelectionOriginalMaterial = object.material;
  const cloned = materials.map((mat) => {
    const copy = mat?.clone ? mat.clone() : mat;
    if (copy?.emissive) copy.emissive.setHex(SELECTED_EMISSIVE);
    if (copy?.color) copy.color.lerp(new THREE.Color(SELECTED_COLOR), 0.45);
    if (copy) copy.needsUpdate = true;
    return copy;
  });
  object.material = Array.isArray(object.material) ? cloned : cloned[0];
  object.userData.rvmCanvasSelectionHighlighted = true;
}

function restoreMaterial(object) {
  if (!object?.userData?.rvmCanvasSelectionHighlighted) return;
  const current = Array.isArray(object.material) ? object.material : [object.material];
  const original = object.userData.rvmCanvasSelectionOriginalMaterial;
  object.material = original || object.material;
  for (const mat of current) {
    const originalList = Array.isArray(original) ? original : [original];
    if (originalList.includes(mat)) continue;
    mat?.dispose?.();
  }
  delete object.userData.rvmCanvasSelectionHighlighted;
  delete object.userData.rvmCanvasSelectionOriginalMaterial;
}

function renderIdFor(object) {
  const data = object?.userData || {};
  return String(data.renderObjectId || data.leafRenderObjectId || object?.uuid || data.name || object?.name || '').trim();
}

function canonicalIdFor(viewer, object, renderId) {
  const data = object?.userData || {};
  return viewer?.selection?.identityMap?.canonicalFromRender?.(renderId)
    || data.canonicalId
    || data.sourcePath
    || data.browserRvmProperties?.sourcePath
    || renderId;
}

function currentMode(viewer) {
  return String(viewer?._rvmInteractionMode || viewer?._navMode || 'select').trim().toLowerCase();
}

function safeBox(object) {
  try {
    const box = new THREE.Box3().setFromObject(object);
    return box && !box.isEmpty() ? box : null;
  } catch (_) {
    return null;
  }
}

function updateSelectedCount(root, count) {
  const chip = root?.querySelector?.('[data-rvm-status-chip="selected"]');
  const footer = root?.querySelector?.('#rvm-sel-count');
  if (chip) chip.textContent = `Selected: ${count || 0}`;
  if (footer) footer.textContent = String(count || 0);
}

function row(key, value) { return `<div class="rvm-browser-diag-row"><span>${escapeHtml(key)}</span><b>${escapeHtml(value === undefined || value === null || value === '' ? '-' : String(value))}</b></div>`; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
function fmt(value) { const n = Number(value); return Number.isFinite(n) ? n.toFixed(3) : '-'; }
function unique(values) { return Array.from(new Set((values || []).filter(Boolean))); }
function now() { return (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now(); }
