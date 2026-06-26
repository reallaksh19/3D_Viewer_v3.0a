import * as THREE from 'three';

const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-leaf-selection-identity-v1');
const VERSION = '20260622-rvm-leaf-selection-identity-1';

export function installRvmLeafSelectionIdentityBridge() {
  if (typeof globalThis === 'undefined') return null;
  if (globalThis[INSTALL_FLAG]) return globalThis[INSTALL_FLAG];
  const state = { version: VERSION, runs: 0, apply: patchActiveViewer };
  globalThis[INSTALL_FLAG] = state;
  const schedule = () => setTimeout(() => patchActiveViewer(state), 0);
  try { globalThis.addEventListener?.('rvm-model-loaded', schedule); } catch (_) {}
  for (const delay of [120, 600, 1400, 3000]) setTimeout(schedule, delay);
  return state;
}

function patchActiveViewer(state = globalThis[INSTALL_FLAG]) {
  const viewer = globalThis.__3D_RVM_VIEWER__;
  if (!viewer || viewer.__rvmLeafSelectionIdentityVersion === VERSION) return viewer || null;
  viewer.__rvmLeafSelectionIdentityVersion = VERSION;
  state.runs += 1;
  patchSelectionAdapter(viewer.selection);
  patchFitSelection(viewer);
  patchSelectionAnchor(viewer);
  patchSectionBoxSelection(viewer);
  return viewer;
}

function patchSelectionAdapter(selection) {
  if (!selection || selection.__rvmLeafSelectionIdentityVersion === VERSION) return;
  selection.__rvmLeafSelectionIdentityVersion = VERSION;
  selection._renderIdFor = renderIdFor;
  selection._isRenderableObject = isRenderable;
  const originalHighlight = selection._highlight?.bind(selection);
  selection._highlight = function highlightLeafRenderIds(renderIds, color) {
    const set = new Set(renderIds || []);
    this.modelGroup?.traverse?.((obj) => {
      if (!isRenderable(obj) || (this._isSelectableObject && !this._isSelectableObject(obj)) || !set.has(renderIdFor(obj))) return;
      this._setEmissive?.(obj, color);
    });
    if (!set.size && originalHighlight) originalHighlight(renderIds, color);
  };
}

function patchFitSelection(viewer) {
  viewer.fitSelection = function fitLeafSelection() {
    const selectionIds = this.selection?.getSelectionRenderIds?.() || [];
    if (!selectionIds.length) return this.fitAll?.();
    const set = new Set(selectionIds);
    const box = new THREE.Box3();
    let found = false;
    this.modelGroup?.traverse?.((obj) => {
      if (!isRenderable(obj) || obj.visible === false || !set.has(renderIdFor(obj))) return;
      box.expandByObject(obj);
      found = true;
    });
    if (found && !box.isEmpty()) this._fitBox?.(box);
  };
}

function patchSelectionAnchor(viewer) {
  viewer.getSelectionAnchor = function getLeafSelectionAnchor() {
    const selectionIds = this.selection?.getSelectionRenderIds?.() || [];
    if (!selectionIds.length) return null;
    const set = new Set(selectionIds);
    const box = new THREE.Box3();
    let found = false;
    this.modelGroup?.traverse?.((obj) => {
      if (!isRenderable(obj) || !set.has(renderIdFor(obj))) return;
      box.expandByObject(obj);
      found = true;
    });
    return found && !box.isEmpty() ? box.getCenter(new THREE.Vector3()) : null;
  };
}

function patchSectionBoxSelection(viewer) {
  const original = viewer.setSectionMode?.bind(viewer);
  viewer.setSectionMode = function setSectionModeLeaf(mode) {
    if (mode === 'BOX' && this.selection?.getSelectionRenderIds?.().length > 0) {
      const set = new Set(this.selection.getSelectionRenderIds());
      const box = new THREE.Box3();
      let found = false;
      this.modelGroup?.traverse?.((obj) => {
        if (!isRenderable(obj) || !set.has(renderIdFor(obj))) return;
        box.expandByObject(obj);
        found = true;
      });
      if (found && !box.isEmpty()) {
        this.sectioning?.buildBoxSection?.(this.modelGroup, box);
        if (this.sectioning) this.sectioning._sectionMode = 'BOX';
        return;
      }
    }
    return original?.(mode);
  };
}

function isRenderable(obj) { return Boolean(obj?.isMesh || obj?.isLine || obj?.isLineSegments || obj?.isPoints); }
function renderIdFor(obj) {
  const data = obj?.userData || {};
  return String(data.renderObjectId || data.leafRenderObjectId || obj?.uuid || data.canonicalId || data.name || obj?.name || '').trim();
}
