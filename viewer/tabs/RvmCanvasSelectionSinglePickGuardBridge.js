import * as THREE from 'three';

const BRIDGE_VERSION = '20260622-rvm-canvas-single-pick-guard-1';
const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-canvas-single-pick-guard-1');
const GLOBAL_KEY = '__PCF_GLB_RVM_CANVAS_SINGLE_PICK_GUARD__';

export function installRvmCanvasSelectionSinglePickGuardBridge() {
  if (typeof document === 'undefined') return null;
  if (globalThis[INSTALL_FLAG]) return globalThis[INSTALL_FLAG];
  const state = { version: BRIDGE_VERSION, trimNow: () => trimCurrentSelection(globalThis.__3D_RVM_VIEWER__) };
  globalThis[INSTALL_FLAG] = state;
  globalThis[GLOBAL_KEY] = state;

  document.addEventListener('pointerup', (event) => {
    const viewer = globalThis.__3D_RVM_VIEWER__;
    const canvas = viewer?.renderer?.domElement;
    if (!canvas || event.target !== canvas || event.button !== 0) return;
    if (event.ctrlKey || event.shiftKey || event.metaKey) return;
    if (String(viewer?._rvmInteractionMode || viewer?._navMode || 'select').toLowerCase() !== 'select') return;
    const hit = pickLeafAt(viewer, event.clientX, event.clientY);
    setTimeout(() => trimCurrentSelection(viewer, hit), 0);
    requestAnimationFrame(() => trimCurrentSelection(viewer, hit));
  }, true);

  return state;
}

function pickLeafAt(viewer, clientX, clientY) {
  if (!viewer?.camera || !viewer?.modelGroup || !viewer?.renderer?.domElement) return null;
  const rect = viewer.renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const mouse = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  const raycaster = viewer._rvmSinglePickGuardRaycaster || (viewer._rvmSinglePickGuardRaycaster = new THREE.Raycaster());
  raycaster.params.Line = { threshold: 2 };
  raycaster.params.Points = { threshold: 2 };
  raycaster.setFromCamera(mouse, viewer.camera);
  const hits = raycaster.intersectObject(viewer.modelGroup, true);
  return hits.find((hit) => isSelectableLeaf(hit.object))?.object || null;
}

function trimCurrentSelection(viewer, preferred = null) {
  if (!viewer?.modelGroup) return { trimmed: 0, kept: null };
  const highlighted = collectHighlighted(viewer.modelGroup);
  if (highlighted.length <= 1) return { trimmed: 0, kept: highlighted[0] || null };
  const kept = preferred && highlighted.includes(preferred) ? preferred : highlighted.find((obj) => isSelectableLeaf(obj)) || highlighted[0];
  let trimmed = 0;
  for (const obj of highlighted) {
    if (obj === kept) continue;
    restoreMaterial(obj);
    trimmed += 1;
  }
  viewer._rvmCanvasSelectedMeshes = kept ? [kept] : [];
  try {
    viewer.selection?.clearSelection?.();
    if (viewer.selection && kept) {
      const id = stableId(kept);
      viewer.selection._selectedCanonicalId = id;
      viewer.selection._selectedCanonicalIds = [id].filter(Boolean);
      viewer.selection._selectedRenderIds = [kept.userData?.name || kept.name || kept.uuid].filter(Boolean);
      viewer.selection._emitSelection?.();
    }
  } catch (_) {}
  updateSelectedCount(kept ? 1 : 0);
  return { trimmed, kept };
}

function collectHighlighted(root) {
  const out = [];
  root?.traverse?.((obj) => {
    if (obj?.isMesh && obj.userData?.rvmCanvasSelectionHighlighted) out.push(obj);
  });
  return out;
}

function isSelectableLeaf(obj) {
  if (!obj?.isMesh || obj.visible === false) return false;
  const data = obj.userData || {};
  if (data.supportSymbol || data.rvmSupportAssemblyMarkerOverlay || data.rvmHiddenByUser) return false;
  if (data.pickable === false || data.selectable === false || data.nonSelectableReason) return false;
  return true;
}

function restoreMaterial(mesh) {
  if (!mesh?.userData?.rvmCanvasSelectionHighlighted) return;
  const current = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const original = mesh.userData.rvmCanvasSelectionOriginalMaterial;
  mesh.material = original || mesh.material;
  for (const mat of current) {
    const originalList = Array.isArray(original) ? original : [original];
    if (originalList.includes(mat)) continue;
    mat?.dispose?.();
  }
  delete mesh.userData.rvmCanvasSelectionHighlighted;
  delete mesh.userData.rvmCanvasSelectionOriginalMaterial;
}

function stableId(obj) {
  const data = obj?.userData || {};
  const props = data.browserRvmProperties || {};
  return String(data.leafRenderObjectId || data.renderObjectId || data.canonicalId || data.sourcePath || props.sourcePath || data.displayName || props.displayName || obj?.uuid || '').trim();
}

function updateSelectedCount(count) {
  const root = document.querySelector('[data-rvm-viewer]');
  const chip = root?.querySelector?.('[data-rvm-status-chip="selected"]');
  const footer = root?.querySelector?.('#rvm-sel-count');
  if (chip) chip.textContent = `Selected: ${count}`;
  if (footer) footer.textContent = String(count || 0);
}
