import * as THREE from 'three';

const PATCH_FLAG = Symbol.for('pcf-glb-rvm-toolbar-canvas-selection-patch-v4-hierarchy-sync');
const BRIDGE_VERSION = '20260626-rvm-canvas-hierarchy-selection-sync-1';
const PREVIOUS_BRIDGE_VERSION = '20260624-rvm-interaction-state-contract-1';
const CLICK_DRAG_TOLERANCE_PX = 5;
const SELECTED_COLOR = 0x60a5fa;
const SELECTED_EMISSIVE = 0x2563eb;
const MODE_ACTIONS = new Set(['NAV_SELECT', 'NAV_ORBIT', 'NAV_PAN', 'MARQUEE_SELECT', 'MEASURE_TOOL', 'VIEW_MARQUEE_ZOOM']);

export function installRvmViewerInteractionPatch(RvmViewer3D) {
  const proto = RvmViewer3D?.prototype;
  if (!proto || proto[PATCH_FLAG]) return;

  proto.dispatchAction = function dispatchRvmToolbarAction(action) {
    return executeToolbarAction(this, action, { source: 'toolbar', user: MODE_ACTIONS.has(normalizeAction(action)) });
  };

  proto.setToolMode = function setRvmToolMode(action) {
    const mode = modeForAction(action);
    if (!mode) return false;
    return setMode(this, mode, { source: 'setToolMode', action: normalizeAction(action), user: true });
  };

  const originalSetNavMode = proto.setNavMode;
  if (typeof originalSetNavMode === 'function') {
    proto.setNavMode = function patchedSetNavMode(mode) {
      const normalized = normalizeMode(mode || 'select');
      const result = originalSetNavMode.call(this, normalized);
      applyInteractionMode(this, normalized);
      publishInteractionState(this, normalized, { source: 'viewer.setNavMode', action: actionForMode(normalized), user: false });
      return result;
    };
  }

  proto[PATCH_FLAG] = true;
}

export function installRvmCanvasSelectionBridge() {
  injectStyles();
  let attempts = 0;
  const attach = () => {
    attempts += 1;
    const viewer = globalThis.__3D_RVM_VIEWER__;
    const root = document.querySelector('[data-rvm-viewer]');
    if (viewer && root && viewer.renderer?.domElement) bindInteraction(root, viewer);
    if ((!viewer || !root) && attempts < 180) setTimeout(attach, 300);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
  else attach();
}

function bindInteraction(root, viewer) {
  bindCanvasSelection(root, viewer);
  bindKeyboardEsc(root, viewer);
  publishInteractionApi(root, viewer);
  if (!viewer._rvmInteractionMode) setMode(viewer, 'select', { source: 'bind-default', user: false });
  updateModeUi(root, normalizeMode(viewer._rvmInteractionMode || 'select'));
  if (root?.dataset) {
    root.dataset.rvmCanvasSelectionBridge = BRIDGE_VERSION;
    root.dataset.rvmCanvasSelectionPreviousBridge = PREVIOUS_BRIDGE_VERSION;
  }
}

function executeToolbarAction(viewer, action, options = {}) {
  const key = normalizeAction(action);
  try {
    switch (key) {
      case 'NAV_SELECT': return setMode(viewer, 'select', { ...options, action: key });
      case 'NAV_ORBIT': return setMode(viewer, 'orbit', { ...options, action: key });
      case 'NAV_PAN': return setMode(viewer, 'pan', { ...options, action: key });
      case 'MARQUEE_SELECT': return setMode(viewer, 'marquee_select', { ...options, action: key });
      case 'MEASURE_TOOL': return setMode(viewer, 'measure_tool', { ...options, action: key });
      case 'VIEW_MARQUEE_ZOOM': return setMode(viewer, 'view_marquee_zoom', { ...options, action: key });
      case 'VIEW_FIT_ALL': return fitAllRvm(viewer);
      case 'VIEW_FIT_SELECTION': return fitCurrentSelection(viewer) || fitAllRvm(viewer);
      case 'VIEW_HIDE_SELECTION': return hideCurrentSelection(viewer);
      case 'VIEW_SHOW_HIDDEN': return showHiddenObjects(viewer);
      case 'VIEW_TOGGLE_PROJECTION': viewer.toggleProjection?.(); return true;
      case 'SECTION_BOX': viewer.setSectionMode?.('BOX'); return true;
      case 'SECTION_PLANE_UP': viewer.setSectionMode?.('PLANE_UP'); return true;
      case 'SECTION_DISABLE': viewer.disableSection?.(); return true;
      case 'NAV_PLAN_X': viewer.snapToPreset?.('TOP'); return true;
      case 'NAV_ROTATE_Y': viewer.snapToPreset?.('FRONT'); return true;
      case 'NAV_ROTATE_Z': viewer.snapToPreset?.('RIGHT'); return true;
      case 'SNAP_ISO_NW': viewer.snapToPreset?.('ISO_NW'); return true;
      case 'SNAP_ISO_NE': viewer.snapToPreset?.('ISO_NE'); return true;
      case 'SNAP_ISO_SW': viewer.snapToPreset?.('ISO_SW'); return true;
      case 'SNAP_ISO_SE': viewer.snapToPreset?.('ISO_SE'); return true;
      default: return false;
    }
  } catch (error) {
    console.warn('[RVM interaction] toolbar action failed', action, error);
    return false;
  }
}

function modeForAction(action) {
  const key = normalizeAction(action);
  if (key === 'NAV_SELECT') return 'select';
  if (key === 'NAV_ORBIT') return 'orbit';
  if (key === 'NAV_PAN') return 'pan';
  if (key === 'MARQUEE_SELECT') return 'marquee_select';
  if (key === 'MEASURE_TOOL') return 'measure_tool';
  if (key === 'VIEW_MARQUEE_ZOOM') return 'view_marquee_zoom';
  return '';
}

function setMode(viewer, mode, options = {}) {
  const normalized = normalizeMode(mode);
  prepareModeTransition(viewer, normalized);
  if (typeof viewer?.setNavMode === 'function') viewer.setNavMode(normalized);
  else applyInteractionMode(viewer, normalized);
  publishInteractionState(viewer, normalized, { ...options, action: options.action || actionForMode(normalized) });
  updateModeUi(document.querySelector('[data-rvm-viewer]'), normalized);
  return true;
}

function normalizeMode(mode) {
  const text = String(mode || 'select').trim().toLowerCase();
  if (text === 'nav_select') return 'select';
  if (text === 'nav_orbit') return 'orbit';
  if (text === 'nav_pan') return 'pan';
  if (text === 'measure') return 'measure_tool';
  if (text === 'zoom') return 'view_marquee_zoom';
  return text || 'select';
}

function prepareModeTransition(viewer, mode) {
  if (!viewer) return;
  const normalized = normalizeMode(mode);
  const enteringMeasure = normalized === 'measure_tool';
  const enteringMarqueeSelect = normalized === 'marquee_select';
  const enteringMarqueeZoom = normalized === 'view_marquee_zoom';
  if (!enteringMeasure) {
    try { viewer.clearMeasurement?.(); } catch (_) {}
    try { globalThis.__PCF_GLB_RVM_MEASURE__?.clear?.({ silent: true }); } catch (_) {}
    viewer.measureModeEnabled = false;
    viewer._measureStart = null;
  }
  if (!enteringMarqueeSelect && !enteringMarqueeZoom) {
    viewer.marqueeModeEnabled = false;
    viewer.marqueeMode = '';
    viewer._marqueeStart = null;
    if (viewer.marqueeElement) viewer.marqueeElement.style.display = 'none';
  }
  if (enteringMeasure) {
    viewer.measureModeEnabled = true;
    viewer.marqueeModeEnabled = false;
    viewer.marqueeMode = '';
  } else if (enteringMarqueeSelect || enteringMarqueeZoom) {
    viewer.measureModeEnabled = false;
    viewer.marqueeModeEnabled = true;
    viewer.marqueeMode = enteringMarqueeSelect ? 'select' : 'zoom';
  }
}

function applyInteractionMode(viewer, mode) {
  if (!viewer) return;
  const normalized = normalizeMode(mode);
  viewer._rvmInteractionMode = normalized;
  viewer._navMode = normalized;
  if (viewer.controls) {
    if (normalized === 'select') {
      viewer.controls.enabled = false;
      viewer.controls.enableRotate = false;
      viewer.controls.enablePan = false;
      viewer.controls.enableZoom = true;
    } else if (normalized === 'orbit') {
      viewer.controls.enabled = true;
      viewer.controls.enableRotate = true;
      viewer.controls.enablePan = true;
      viewer.controls.enableZoom = true;
      viewer.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    } else if (normalized === 'pan') {
      viewer.controls.enabled = true;
      viewer.controls.enableRotate = true;
      viewer.controls.enablePan = true;
      viewer.controls.enableZoom = true;
      viewer.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    } else {
      viewer.controls.enabled = false;
      viewer.controls.enableRotate = false;
      viewer.controls.enablePan = false;
      viewer.controls.enableZoom = true;
    }
  }
  if (viewer.container?.style) {
    if (normalized === 'select') viewer.container.style.cursor = 'crosshair';
    else if (normalized === 'pan') viewer.container.style.cursor = 'grab';
    else if (normalized === 'measure_tool' || normalized === 'measure') viewer.container.style.cursor = 'crosshair';
    else if (normalized === 'marquee_select') viewer.container.style.cursor = 'crosshair';
    else if (normalized === 'view_marquee_zoom') viewer.container.style.cursor = 'zoom-in';
    else viewer.container.style.cursor = 'default';
  }
  const canvas = viewer.renderer?.domElement;
  if (canvas?.dataset) canvas.dataset.rvmInteractionMode = normalized;
}

function publishInteractionState(viewer, mode, options = {}) {
  if (!viewer) return null;
  const normalized = normalizeMode(mode);
  const action = options.action || actionForMode(normalized);
  const payload = { version: BRIDGE_VERSION, previousVersion: PREVIOUS_BRIDGE_VERSION, mode: normalized, action, source: options.source || 'interaction', userIntent: options.user !== false, at: Date.now(), controlsEnabled: viewer.controls?.enabled === true, measureModeEnabled: viewer.measureModeEnabled === true, marqueeModeEnabled: viewer.marqueeModeEnabled === true, marqueeMode: viewer.marqueeMode || '' };
  viewer.__rvmInteractionCurrentMode = normalized;
  viewer.__rvmInteractionCurrentAction = action;
  viewer.__rvmInteractionState = payload;
  if (options.user !== false) {
    viewer.__rvmNavigationUserMode = normalized;
    viewer.__rvmNavigationUserModeAction = action;
    viewer.__rvmNavigationUserModeAt = payload.at;
  }
  globalThis.__PCF_GLB_RVM_INTERACTION_STATE__ = payload;
  try { globalThis.__PCF_GLB_RVM_NAVIGATION_ARBITER__?.ensure?.(viewer, `interaction-${normalized}`); } catch (_) {}
  return payload;
}

function bindCanvasSelection(root, viewer) {
  const canvas = viewer?.renderer?.domElement;
  if (!canvas || canvas.dataset.rvmCanvasSelectionBridge === BRIDGE_VERSION) return;
  canvas.dataset.rvmCanvasSelectionBridge = BRIDGE_VERSION;
  canvas.dataset.rvmCanvasSelectionPreviousBridge = PREVIOUS_BRIDGE_VERSION;
  let down = null;
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    down = { x: event.clientX, y: event.clientY, time: performanceNow(), mode: normalizeMode(viewer._rvmInteractionMode || viewer._navMode || 'select') };
    if (down.mode === 'select' && !viewer.measureModeEnabled && !viewer.marqueeModeEnabled) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    }
  }, true);
  canvas.addEventListener('pointerup', (event) => {
    if (event.button !== 0 || !down) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    const elapsed = performanceNow() - down.time;
    const modeAtUp = normalizeMode(viewer._rvmInteractionMode || viewer._navMode || down.mode || 'select');
    down = null;
    if (moved > CLICK_DRAG_TOLERANCE_PX || elapsed > 900) return;
    if (modeAtUp !== 'select') return;
    if (viewer.measureModeEnabled || viewer.marqueeModeEnabled) return;
    const selected = selectGeometryAtClientPoint(root, viewer, event.clientX, event.clientY, { additive: event.ctrlKey || event.shiftKey || event.metaKey });
    if (selected || modeAtUp === 'select') {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    }
  }, true);
}

function bindKeyboardEsc(root, viewer) {
  if (!root || root.dataset.rvmEscBridge === BRIDGE_VERSION) return;
  root.dataset.rvmEscBridge = BRIDGE_VERSION;
  const onKeyDown = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    handleEscape(root, viewer);
  };
  document.addEventListener('keydown', onKeyDown, true);
  root._rvmEscKeyCleanup = () => document.removeEventListener('keydown', onKeyDown, true);
}

function handleEscape(root, viewer) {
  cancelTransientModes(viewer);
  clearCanvasSelection(viewer, root);
  setMode(viewer, 'select', { source: 'escape', action: 'NAV_SELECT', user: true });
  const panel = root?.querySelector?.('#rvm-attributes-panel');
  if (panel) panel.innerHTML = '<div class="rvm-empty-state">No object selected.</div>';
  setStatusMessage(root, 'Esc: selection cleared, Select mode');
  return true;
}

function cancelTransientModes(viewer) {
  try { viewer?.clearMeasurement?.(); } catch (_) {}
  try { globalThis.__PCF_GLB_RVM_MEASURE__?.clear?.({ silent: true }); } catch (_) {}
  viewer.measureModeEnabled = false;
  viewer.marqueeModeEnabled = false;
  viewer.marqueeMode = '';
  viewer._measureStart = null;
  viewer._marqueeStart = null;
  if (viewer.marqueeElement) viewer.marqueeElement.style.display = 'none';
  if (viewer.controls) {
    viewer.controls.enabled = false;
    viewer.controls.update?.();
  }
}

function selectGeometryAtClientPoint(root, viewer, clientX, clientY, options = {}) {
  if (!viewer?.camera || !viewer?.modelGroup || !viewer?.renderer?.domElement) return null;
  const rect = viewer.renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const mouse = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  const raycaster = viewer._rvmCanvasRaycaster || (viewer._rvmCanvasRaycaster = new THREE.Raycaster());
  raycaster.params.Line = { threshold: 2 };
  raycaster.params.Points = { threshold: 2 };
  raycaster.setFromCamera(mouse, viewer.camera);
  const hits = raycaster.intersectObject(viewer.modelGroup, true);
  const hit = hits.find((item) => item?.object?.visible !== false && isPickableMesh(item.object));
  if (!hit) {
    if (!options.additive && viewer._rvmInteractionMode === 'select') clearCanvasSelection(viewer, root);
    return null;
  }
  const pickRoot = resolvePickRoot(hit.object);
  const meshes = collectPickMeshes(pickRoot || hit.object).filter((mesh) => mesh.visible !== false);
  const id = stableObjectId(pickRoot || hit.object);
  if (!id || !meshes.length) return null;
  setSelectionFromObjects(root, viewer, meshes, { additive: options.additive, sourceObject: pickRoot || hit.object, source: 'canvas' });
  renderCanvasSelectionDetails(root, viewer, pickRoot || hit.object, meshes, hit.point);
  return { id, object: pickRoot || hit.object, meshes, point: hit.point };
}

function isPickableMesh(obj) { return Boolean(obj?.isMesh && obj.visible !== false && obj.userData?.supportSymbol !== true && obj.userData?.rvmHiddenByUser !== true); }
function resolvePickRoot(obj) { let current = obj; let best = obj; while (current && current.parent) { if (hasPickIdentity(current)) best = current; if (hasPickIdentity(current.parent)) best = current.parent; if (current.parent?.type === 'Scene') break; current = current.parent; } return best || obj; }
function hasPickIdentity(obj) { const data = obj?.userData || {}; return Boolean(data.browserRvmProperties || data.sourcePath || data.displayName || data.pickable || data.browserRvmAttributes); }
function collectPickMeshes(root) { const meshes = []; root?.traverse?.((obj) => { if (isPickableMesh(obj)) meshes.push(obj); }); if (!meshes.length && isPickableMesh(root)) meshes.push(root); return meshes; }
function stableObjectId(obj) { const data = obj?.userData || {}; const props = data.browserRvmProperties || {}; const attrs = data.browserRvmAttributes || data.attributes || props.attributes || {}; return String(data.sourcePath || props.sourcePath || data.displayName || props.displayName || data.sourceName || attrs.RVM_OWNER_PATH || attrs.RVM_OWNER_NAME || attrs.NAME || data.name || obj?.name || obj?.uuid || '').trim(); }

function setSelectionFromObjects(root, viewer, meshes = [], options = {}) {
  const visibleMeshes = uniqueObjects(meshes).filter((mesh) => isPickableMesh(mesh));
  if (!visibleMeshes.length) {
    if (!options.additive) clearCanvasSelection(viewer, root);
    return false;
  }
  if (!options.additive) clearCanvasSelection(viewer, root, { keepPanel: true, silent: true });
  highlightMeshes(viewer, visibleMeshes);
  const sourceObject = options.sourceObject || visibleMeshes[0];
  const id = stableObjectId(sourceObject);
  writeSelectionState(viewer, id, visibleMeshes);
  updateSelectedCount(root, (viewer._rvmCanvasSelectedMeshes || []).filter((mesh) => mesh.visible !== false).length);
  publishCanvasSelection(root, { id, meshes: visibleMeshes, source: options.source || 'canvas', sourceObject });
  return true;
}

function clearCanvasSelection(viewer, root = null, options = {}) {
  const selected = Array.isArray(viewer?._rvmCanvasSelectedMeshes) ? viewer._rvmCanvasSelectedMeshes : [];
  for (const mesh of selected) restoreMeshMaterial(mesh);
  viewer._rvmCanvasSelectedMeshes = [];
  try { viewer.selection?.clearSelection?.(); } catch (_) {}
  root?.querySelectorAll?.('#rvm-tree li.is-selected, #rvm-tree li.is-canvas-selected').forEach((row) => row.classList.remove('is-selected', 'is-canvas-selected'));
  if (root) updateSelectedCount(root, 0);
  if (!options.keepPanel) {
    const panel = root?.querySelector?.('#rvm-attributes-panel');
    if (panel) panel.innerHTML = '<div class="rvm-empty-state">No object selected.</div>';
  }
  if (!options.silent) publishCanvasSelection(root, { id: '', meshes: [], source: 'clear' });
}

function highlightMeshes(viewer, meshes = []) { viewer._rvmCanvasSelectedMeshes = uniqueObjects([...(viewer._rvmCanvasSelectedMeshes || []), ...meshes]); for (const mesh of meshes) applySelectedMaterial(mesh); }
function applySelectedMaterial(mesh) { if (!mesh?.material || mesh.userData?.rvmCanvasSelectionHighlighted) return; const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]; mesh.userData.rvmCanvasSelectionOriginalMaterial = mesh.material; const cloned = materials.map((mat) => { const copy = mat?.clone ? mat.clone() : mat; if (copy?.emissive) copy.emissive.setHex(SELECTED_EMISSIVE); if (copy?.color) copy.color.lerp(new THREE.Color(SELECTED_COLOR), 0.45); if (copy) copy.needsUpdate = true; return copy; }); mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0]; mesh.userData.rvmCanvasSelectionHighlighted = true; }
function restoreMeshMaterial(mesh) { if (!mesh?.userData?.rvmCanvasSelectionHighlighted) return; const current = Array.isArray(mesh.material) ? mesh.material : [mesh.material]; const original = mesh.userData.rvmCanvasSelectionOriginalMaterial; mesh.material = original || mesh.material; for (const mat of current) { const originalList = Array.isArray(original) ? original : [original]; if (originalList.includes(mat)) continue; mat?.dispose?.(); } delete mesh.userData.rvmCanvasSelectionHighlighted; delete mesh.userData.rvmCanvasSelectionOriginalMaterial; }
function writeSelectionState(viewer, id, meshes) { try { viewer.selection?.clearSelection?.(); } catch (_) {} const ids = meshes.map((mesh) => mesh.userData?.name || mesh.name || mesh.uuid).filter(Boolean); if (viewer.selection) { viewer.selection._selectedCanonicalId = id; viewer.selection._selectedCanonicalIds = [id, ...ids].filter(Boolean); viewer.selection._selectedRenderIds = ids; viewer.selection._emitSelection?.(); } }

function fitCurrentSelection(viewer) { const meshes = selectedMeshes(viewer); const box = boxForMeshes(meshes); if (!box || box.isEmpty()) return false; viewer._fitBox?.(box); viewer.controls?.update?.(); return true; }
function selectedMeshes(viewer) { const direct = Array.isArray(viewer?._rvmCanvasSelectedMeshes) ? viewer._rvmCanvasSelectedMeshes.filter((mesh) => mesh?.visible !== false) : []; if (direct.length) return uniqueObjects(direct); return collectMeshesForSelectionAdapter(viewer); }
function collectMeshesForSelectionAdapter(viewer) { const ids = new Set([...(viewer?.selection?.getSelectionRenderIds?.() || []), ...(viewer?.selection?.getSelectedCanonicalIds?.() || [])].map((id) => normalizeAlias(id))); const meshes = []; if (!ids.size) return meshes; viewer?.modelGroup?.traverse?.((obj) => { if (!isPickableMesh(obj)) return; const aliases = aliasesForMesh(obj).map(normalizeAlias).filter(Boolean); if (aliases.some((alias) => ids.has(alias) || Array.from(ids).some((id) => alias.includes(id) || id.includes(alias)))) meshes.push(obj); }); return uniqueObjects(meshes); }
function aliasesForMesh(obj) { const data = obj?.userData || {}; const props = data.browserRvmProperties || {}; const attrs = data.browserRvmAttributes || data.attributes || props.attributes || {}; return [obj?.name, obj?.uuid, data.name, data.sourcePath, data.sourceName, data.displayName, props.sourcePath, props.displayName, attrs.NAME, attrs.RVM_OWNER_NAME, attrs.RVM_OWNER_PATH, attrs.TYPE, attrs.RVM_PRIMITIVE_KIND].filter(Boolean); }
function hideCurrentSelection(viewer) { const meshes = selectedMeshes(viewer); if (!meshes.length) return false; viewer._rvmHiddenByUser = viewer._rvmHiddenByUser || new Set(); for (const mesh of meshes) { restoreMeshMaterial(mesh); mesh.visible = false; mesh.userData.rvmHiddenByUser = true; viewer._rvmHiddenByUser.add(mesh.uuid); } clearCanvasSelection(viewer, document.querySelector('[data-rvm-viewer]')); updateVisibleCount(document.querySelector('[data-rvm-viewer]'), viewer); setStatusMessage(document.querySelector('[data-rvm-viewer]'), `Hidden ${meshes.length} selected mesh${meshes.length === 1 ? '' : 'es'}`); return true; }
function showHiddenObjects(viewer) { let count = 0; viewer?.modelGroup?.traverse?.((obj) => { if (obj?.userData?.rvmHiddenByUser) { obj.visible = true; delete obj.userData.rvmHiddenByUser; count += 1; } }); viewer._rvmHiddenByUser?.clear?.(); updateVisibleCount(document.querySelector('[data-rvm-viewer]'), viewer); setStatusMessage(document.querySelector('[data-rvm-viewer]'), count ? `Shown ${count} hidden mesh${count === 1 ? '' : 'es'}` : 'No hidden meshes'); return true; }
function fitAllRvm(viewer) { try { const bounds = viewer?._progressiveModelBounds || viewer?.modelGroup?.children?.[0]?.userData?.bounds || null; if (bounds && viewer?.fitProgressiveBounds?.(bounds, { force: true })) return true; } catch (_) {} viewer?.fitAll?.(); return true; }
function boxForMeshes(meshes = []) { const box = new THREE.Box3(); let any = false; for (const mesh of meshes) { if (!mesh || mesh.visible === false) continue; try { const itemBox = new THREE.Box3().setFromObject(mesh); if (itemBox && !itemBox.isEmpty()) { box.union(itemBox); any = true; } } catch (_) {} } return any ? box : null; }

function renderCanvasSelectionDetails(root, viewer, object, meshes, point) {
  const panel = root?.querySelector?.('#rvm-attributes-panel');
  if (!panel) return;
  const data = object?.userData || {};
  const props = data.browserRvmProperties || {};
  const attrs = data.browserRvmAttributes || props.attributes || data.attributes || {};
  const box = boxForMeshes(meshes);
  const size = box ? box.getSize(new THREE.Vector3()) : null;
  const rows = [['Picked', props.displayName || data.displayName || object?.name || object?.uuid || '-'], ['Source path', props.sourcePath || data.sourcePath || '-'], ['Type', props.type || data.type || attrs.TYPE || '-'], ['Kind', props.kind || data.kind || attrs.RVM_PRIMITIVE_KIND || '-'], ['Render primitive', props.effectiveRenderPrimitive || data.effectiveRenderPrimitive || data.renderPrimitive || '-'], ['Matched meshes', meshes.length], ['Size', size ? `${fmt(size.x)} × ${fmt(size.y)} × ${fmt(size.z)}` : '-'], ['Pick point', point ? `${fmt(point.x)}, ${fmt(point.y)}, ${fmt(point.z)}` : '-']];
  const attrRows = Object.entries(attrs || {}).slice(0, 28).map(([key, value]) => [key, value]);
  panel.innerHTML = `<div class="rvm-canvas-selection-card"><div class="rvm-tree-selection-title">Canvas selection</div><div class="rvm-tree-action-row"><button type="button" class="rvm-btn" data-rvm-canvas-action="fit-selection">Fit Selection</button><button type="button" class="rvm-btn" data-rvm-canvas-action="hide-selection">Hide</button><button type="button" class="rvm-btn" data-rvm-canvas-action="show-hidden">Show Hidden</button><button type="button" class="rvm-btn" data-rvm-canvas-action="clear-selection">Clear</button></div><div class="rvm-browser-diag-grid">${rows.map(([key, value]) => row(key, value)).join('')}</div><div class="rvm-tree-selection-title">Attributes</div><div class="rvm-browser-diag-grid">${attrRows.length ? attrRows.map(([key, value]) => row(key, value)).join('') : row('Attributes', 'No attributes on picked mesh')}</div></div>`;
  panel.querySelector('[data-rvm-canvas-action="fit-selection"]')?.addEventListener('click', () => fitCurrentSelection(viewer));
  panel.querySelector('[data-rvm-canvas-action="hide-selection"]')?.addEventListener('click', () => hideCurrentSelection(viewer));
  panel.querySelector('[data-rvm-canvas-action="show-hidden"]')?.addEventListener('click', () => showHiddenObjects(viewer));
  panel.querySelector('[data-rvm-canvas-action="clear-selection"]')?.addEventListener('click', () => clearCanvasSelection(viewer, root));
}

function publishInteractionApi(root, viewer) { globalThis.__PCF_GLB_RVM_INTERACTION__ = { version: BRIDGE_VERSION, previousVersion: PREVIOUS_BRIDGE_VERSION, getMode: () => normalizeMode(viewer?._rvmInteractionMode || viewer?._navMode || 'select'), getState: () => viewer?.__rvmInteractionState || globalThis.__PCF_GLB_RVM_INTERACTION_STATE__ || null, setMode: (mode) => setMode(viewer, mode, { source: 'api.setMode', user: true }), escape: () => handleEscape(root, viewer), fitSelection: () => fitCurrentSelection(viewer), hideSelection: () => hideCurrentSelection(viewer), showHidden: () => showHiddenObjects(viewer), clearSelection: () => clearCanvasSelection(viewer, root), setSelectionFromObjects: (objects, options = {}) => setSelectionFromObjects(root, viewer, Array.from(objects || []), options) }; }
function publishCanvasSelection(root, detail = {}) { try { root?.dispatchEvent?.(new CustomEvent('rvm-canvas-selection', { bubbles: true, detail: { ...detail, version: BRIDGE_VERSION } })); } catch (_) {} }
function updateModeUi(root, mode) { if (!root) return; const normalized = normalizeMode(mode); const action = actionForMode(normalized); root.querySelectorAll('[data-action]').forEach((button) => { button.classList.toggle('is-active', button.dataset.action === action); }); const chip = root.querySelector('#rvm-mode-chip'); if (chip) chip.textContent = labelForMode(normalized); }
function actionForMode(mode) { if (mode === 'orbit') return 'NAV_ORBIT'; if (mode === 'pan') return 'NAV_PAN'; if (mode === 'marquee_select') return 'MARQUEE_SELECT'; if (mode === 'measure_tool' || mode === 'measure') return 'MEASURE_TOOL'; if (mode === 'view_marquee_zoom') return 'VIEW_MARQUEE_ZOOM'; return 'NAV_SELECT'; }
function labelForMode(mode) { if (mode === 'orbit') return 'Orbit'; if (mode === 'pan') return 'Pan'; if (mode === 'marquee_select') return 'Box Select'; if (mode === 'measure_tool' || mode === 'measure') return 'Measure'; if (mode === 'view_marquee_zoom') return 'Zoom'; return 'Select'; }
function updateSelectedCount(root, count) { const chip = root?.querySelector?.('[data-rvm-status-chip="selected"]'); const footer = root?.querySelector?.('#rvm-sel-count'); if (chip) chip.textContent = `Selected: ${count}`; if (footer) footer.textContent = String(count || 0); }
function updateVisibleCount(root, viewer) { if (!root || !viewer?.modelGroup) return; let total = 0; let visible = 0; viewer.modelGroup.traverse((obj) => { if (!obj?.isMesh) return; total += 1; if (obj.visible !== false) visible += 1; }); const objects = root.querySelector('[data-rvm-status-chip="objects"]'); const visibleChip = root.querySelector('[data-rvm-status-chip="visible"]'); if (objects) objects.textContent = `Objects: ${total}`; if (visibleChip) visibleChip.textContent = `Visible: ${visible}`; }
function setStatusMessage(root, message) { const el = root?.querySelector?.('#rvm-sb-msg'); if (el) el.textContent = message; }
function normalizeAction(action) { return String(action || '').trim().toUpperCase(); }
function normalizeAlias(value) { return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function uniqueObjects(values) { return Array.from(new Set(values.filter(Boolean))); }
function fmt(value) { const n = Number(value); return Number.isFinite(n) ? n.toFixed(3) : '-'; }
function row(key, value) { return `<div class="rvm-browser-diag-row"><span>${escapeHtml(key)}</span><b>${escapeHtml(value === undefined || value === null || value === '' ? '-' : String(value))}</b></div>`; }
function escapeHtml(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
function performanceNow() { return globalThis.performance?.now?.() || Date.now(); }
function injectStyles() { if (document.getElementById('rvm-canvas-selection-bridge-style')) return; const style = document.createElement('style'); style.id = 'rvm-canvas-selection-bridge-style'; style.textContent = `.rvm-canvas-selection-card{display:grid;gap:8px}.rvm-canvas-selection-card .rvm-tree-action-row{display:flex;flex-wrap:wrap;gap:6px}`; document.head.appendChild(style); }
