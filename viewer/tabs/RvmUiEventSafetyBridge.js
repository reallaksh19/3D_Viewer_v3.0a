const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-ui-event-safety-bridge-v1');
const VERSION = '20260622-rvm-ui-event-safety-1';
const STYLE_ID = 'rvm-ui-event-safety-style';
const MENU_ID = 'rvm-navis-context-menu';
const MODE_ACTIONS = new Set(['NAV_SELECT', 'NAV_ORBIT', 'NAV_PAN', 'MARQUEE_SELECT', 'MEASURE_TOOL', 'VIEW_MARQUEE_ZOOM']);

export function installRvmUiEventSafetyBridge() {
  if (typeof document === 'undefined') return null;
  if (globalThis[INSTALL_FLAG]) return globalThis[INSTALL_FLAG];
  injectStyles();
  const state = { version: VERSION, rootsBound: 0, overlaysPurged: 0, treeEventsHandled: 0, toolbarEventsHandled: 0 };
  globalThis[INSTALL_FLAG] = state;
  globalThis.__PCF_GLB_RVM_UI_EVENT_SAFETY__ = {
    version: VERSION,
    state,
    repair: () => repairAll(state),
    purgeOverlays: () => purgeStaleInteractionOverlays(state, true),
  };

  const tick = () => repairAll(state);
  for (const delay of [0, 80, 250, 750, 1500]) setTimeout(tick, delay);
  globalThis.addEventListener?.('rvm-model-loaded', () => {
    for (const delay of [0, 80, 250, 750]) setTimeout(tick, delay);
  });
  globalThis.addEventListener?.('app:tool-changed', () => setTimeout(() => repairViewerControls(globalThis.__3D_RVM_VIEWER__), 0));
  return state;
}

function repairAll(state) {
  const root = document.querySelector('[data-rvm-viewer]');
  const viewer = globalThis.__3D_RVM_VIEWER__;
  purgeStaleInteractionOverlays(state);
  if (root) bindRoot(root, state);
  if (root) ensureTreeCheckboxes(root);
  if (viewer) repairViewerControls(viewer);
}

function bindRoot(root, state) {
  if (!root || root.dataset.rvmUiEventSafetyBound === VERSION) return;
  root.dataset.rvmUiEventSafetyBound = VERSION;
  state.rootsBound += 1;

  root.addEventListener('click', (event) => {
    const actionButton = event.target?.closest?.('[data-action]');
    if (!actionButton || !root.contains(actionButton)) return;
    const action = actionButton.dataset.action || '';
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    handleToolbarAction(root, globalThis.__3D_RVM_VIEWER__, action);
    state.toolbarEventsHandled += 1;
  }, true);

  root.addEventListener('click', (event) => {
    if (!event.target?.closest?.('#rvm-tree')) return;
    if (handleTreeClick(root, event)) state.treeEventsHandled += 1;
  }, true);

  root.addEventListener('change', (event) => {
    const checkbox = event.target?.closest?.('[data-rvm-navis-visible-checkbox]');
    if (!checkbox || !root.contains(checkbox)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    const nodeId = checkbox.closest('li[data-node-id]')?.dataset.nodeId || checkbox.dataset.rvmNavisVisibleCheckbox;
    setBranchVisible(root, nodeId, checkbox.checked);
    state.treeEventsHandled += 1;
  }, true);

  root.addEventListener('contextmenu', (event) => {
    const row = event.target?.closest?.('#rvm-tree li[data-node-id]');
    if (!row || !root.contains(row)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    showContextMenu(root, row.dataset.nodeId, event.clientX, event.clientY);
    state.treeEventsHandled += 1;
  }, true);

  document.addEventListener('pointerdown', (event) => {
    const menu = document.getElementById(MENU_ID);
    if (menu && !menu.contains(event.target)) menu.remove();
  }, true);
}

function handleToolbarAction(root, viewer, action) {
  const handled = dispatchToolbarAction(viewer, action);
  syncActiveToolbarAction(root, action);
  repairViewerControls(viewer);
  if (!handled) setStatus(root, `${labelForAction(action)} did not complete`, true);
  else setStatus(root, `${labelForAction(action)} active`);
  return handled;
}

function dispatchToolbarAction(viewer, action) {
  if (!viewer) return false;
  let handled = false;
  try {
    if (typeof viewer.dispatchAction === 'function') handled = viewer.dispatchAction(action) !== false;
  } catch (error) {
    console.warn('[RVM UI safety] dispatchAction failed', action, error);
  }
  try {
    if (MODE_ACTIONS.has(action) && typeof viewer.setToolMode === 'function') handled = viewer.setToolMode(action) !== false || handled;
  } catch (error) {
    console.warn('[RVM UI safety] setToolMode failed', action, error);
  }
  if (handled) return true;
  try {
    if (action === 'NAV_SELECT') { viewer.setNavMode?.('select'); return true; }
    if (action === 'NAV_ORBIT') { viewer.setNavMode?.('orbit'); return true; }
    if (action === 'NAV_PAN') { viewer.setNavMode?.('pan'); return true; }
    if (action === 'MARQUEE_SELECT') { viewer.setNavMode?.('marquee_select'); return true; }
    if (action === 'MEASURE_TOOL') { viewer.setNavMode?.('measure_tool'); return true; }
    if (action === 'VIEW_MARQUEE_ZOOM') { viewer.setNavMode?.('view_marquee_zoom'); return true; }
    if (action === 'VIEW_FIT_ALL') { viewer.fitAll?.(); return true; }
    if (action === 'VIEW_FIT_SELECTION') { viewer.fitSelection?.(); return true; }
    if (action === 'VIEW_TOGGLE_PROJECTION') { viewer.toggleProjection?.(); return true; }
    if (action === 'SECTION_BOX') { viewer.setSectionMode?.('BOX'); return true; }
    if (action === 'SECTION_PLANE_UP') { viewer.setSectionMode?.('PLANE_UP'); return true; }
    if (action === 'SECTION_DISABLE') { viewer.disableSection?.(); return true; }
    if (action === 'NAV_PLAN_X') { viewer.snapToPreset?.('TOP'); return true; }
    if (action === 'NAV_ROTATE_Y') { viewer.snapToPreset?.('FRONT'); return true; }
    if (action === 'NAV_ROTATE_Z') { viewer.snapToPreset?.('RIGHT'); return true; }
    if (action === 'SNAP_ISO_NW') { viewer.snapToPreset?.('ISO_NW'); return true; }
    if (action === 'SNAP_ISO_NE') { viewer.snapToPreset?.('ISO_NE'); return true; }
    if (action === 'SNAP_ISO_SW') { viewer.snapToPreset?.('ISO_SW'); return true; }
    if (action === 'SNAP_ISO_SE') { viewer.snapToPreset?.('ISO_SE'); return true; }
  } catch (error) {
    console.warn('[RVM UI safety] fallback toolbar action failed', action, error);
  }
  return false;
}

function repairViewerControls(viewer) {
  if (!viewer) return;
  const canvas = viewer.renderer?.domElement;
  if (canvas?.style) {
    canvas.style.pointerEvents = 'auto';
    canvas.style.touchAction = 'none';
  }
  if (viewer.container?.style) viewer.container.style.pointerEvents = 'auto';
  const mode = normalizeMode(viewer._rvmInteractionMode || viewer._navMode || 'orbit');
  if (!viewer.controls) return;
  const isOrbit = mode === 'orbit';
  const isPan = mode === 'pan';
  const isTransient = mode === 'marquee_select' || mode === 'view_marquee_zoom' || mode === 'zoom' || mode === 'measure' || mode === 'measure_tool';
  viewer.controls.enableRotate = true;
  viewer.controls.enablePan = true;
  viewer.controls.enableZoom = true;
  viewer.controls.enabled = isOrbit || isPan;
  if (isOrbit) viewer.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
  if (isPan) viewer.controls.mouseButtons = { LEFT: 2, MIDDLE: 1, RIGHT: 0 };
  if (isTransient) viewer.controls.enabled = false;
}

function handleTreeClick(root, event) {
  const checkbox = event.target?.closest?.('[data-rvm-navis-visible-checkbox]');
  if (checkbox) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    const nodeId = checkbox.closest('li[data-node-id]')?.dataset.nodeId || checkbox.dataset.rvmNavisVisibleCheckbox;
    setBranchVisible(root, nodeId, checkbox.checked);
    return true;
  }
  const toggle = event.target?.closest?.('[data-rvm-navis-toggle]');
  if (toggle && !toggle.disabled) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    toggleNode(root, toggle.dataset.rvmNavisToggle);
    return true;
  }
  const off = event.target?.closest?.('[data-rvm-navis-off]');
  if (off) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    setBranchVisible(root, off.dataset.rvmNavisOff, false);
    return true;
  }
  const on = event.target?.closest?.('[data-rvm-navis-on]');
  if (on) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    setBranchVisible(root, on.dataset.rvmNavisOn, true);
    return true;
  }
  const select = event.target?.closest?.('[data-rvm-navis-select]');
  if (select) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    selectNode(root, select.dataset.rvmNavisSelect);
    return true;
  }
  return false;
}

function ensureTreeCheckboxes(root) {
  const tree = root?.querySelector?.('#rvm-tree');
  if (!tree) return;
  tree.querySelectorAll('li[data-node-id]').forEach((li) => {
    const row = li.querySelector(':scope > .rvm-navis-row');
    const select = row?.querySelector?.('[data-rvm-navis-select]');
    if (!row || !select || row.querySelector('[data-rvm-navis-visible-checkbox]')) return;
    const node = getNode(root, li.dataset.nodeId);
    const allOff = node?.objectIds?.size > 0 && node?.disabledObjectIds?.size >= node?.objectIds?.size;
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !allOff;
    box.title = allOff ? 'Show this branch' : 'Hide this branch';
    box.setAttribute('aria-label', box.title);
    box.dataset.rvmNavisVisibleCheckbox = li.dataset.nodeId || '';
    box.className = 'rvm-navis-visible-checkbox';
    row.insertBefore(box, select);
  });
}

function getModel(root) {
  return root?.__rvmNavisHierarchyModel || null;
}

function getNode(root, nodeId) {
  return getModel(root)?.nodeById?.get?.(nodeId) || null;
}

function getObject(root, id) {
  return getModel(root)?.objectById?.get?.(id) || null;
}

function toggleNode(root, nodeId) {
  const model = getModel(root);
  const tree = root?.querySelector?.('#rvm-tree');
  const node = model?.nodeById?.get?.(nodeId);
  if (!tree || !node || !node.children?.size) return;
  const li = tree.querySelector(`li[data-node-id="${cssEscape(nodeId)}"]`);
  if (!li) return;
  const row = li.querySelector(':scope > .rvm-navis-row');
  const existing = li.nextElementSibling;
  const expanded = row?.classList?.contains('is-expanded');
  if (expanded) {
    row?.classList?.remove('is-expanded');
    const button = li.querySelector('[data-rvm-navis-toggle]');
    if (button) button.textContent = '+';
    if (existing?.matches?.(`[data-rvm-navis-children-of="${cssEscape(nodeId)}"]`)) existing.remove();
    return;
  }
  row?.classList?.add('is-expanded');
  const button = li.querySelector('[data-rvm-navis-toggle]');
  if (button) button.textContent = '−';
  li.insertAdjacentHTML('afterend', renderChildrenList(node));
  ensureTreeCheckboxes(root);
}

function renderChildrenList(node) {
  const children = [...(node.children?.values?.() || [])].sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true, sensitivity: 'base' }));
  return `<ul class="rvm-navis-children" data-rvm-navis-children-of="${esc(node.id)}">${children.map((child) => renderNodeRow(child)).join('')}</ul>`;
}

function renderNodeRow(node) {
  const hasChildren = Boolean(node.children?.size);
  const allOff = node.objectIds?.size > 0 && node.disabledObjectIds?.size >= node.objectIds.size;
  const depth = Math.max(0, Number(node.depth || 0));
  return `<li data-rvm-navis-node-row="true" data-node-id="${esc(node.id)}" data-rvm-navis-depth="${depth}" data-rvm-navis-label="${esc(String(node.label || '').toLowerCase())}">
    <div class="rvm-navis-row ${allOff ? 'is-branch-off' : ''}" style="--rvm-navis-depth:${depth}">
      <button type="button" class="rvm-navis-expander" data-rvm-navis-toggle="${esc(node.id)}" ${hasChildren ? '' : 'disabled'}>${hasChildren ? '+' : ''}</button>
      <input type="checkbox" class="rvm-navis-visible-checkbox" data-rvm-navis-visible-checkbox="${esc(node.id)}" ${allOff ? '' : 'checked'} aria-label="${allOff ? 'Show' : 'Hide'} ${esc(node.label)}" />
      <button type="button" class="rvm-navis-select" data-rvm-navis-select="${esc(node.id)}" title="Select / fit ${esc(node.label)}"><span class="rvm-navis-icon">${hasChildren ? '▣' : '◇'}</span><span class="rvm-kind">${esc(node.kind || 'NODE')}</span><span class="rvm-navis-label">${esc(node.label)}</span><span class="rvm-tree-count">${Number(node.count || 0)}${allOff ? ' off' : ''}</span></button>
      <button type="button" class="rvm-navis-branch-off" data-rvm-navis-off="${esc(node.id)}">Off</button>
      <button type="button" class="rvm-navis-branch-on" data-rvm-navis-on="${esc(node.id)}">On</button>
    </div>
  </li>`;
}

function selectNode(root, nodeId) {
  const node = getNode(root, nodeId);
  const viewer = globalThis.__3D_RVM_VIEWER__;
  if (!node || !viewer) return;
  const objects = [...(node.objectIds || [])].map((id) => getObject(root, id)).filter((obj) => obj && obj.visible !== false && obj.userData?.rvmBranchDisabledByUser !== true);
  if (!objects.length) {
    setStatus(root, `No visible object under ${node.label}`, true);
    return;
  }
  try {
    viewer._rvmCanvasSelectedMeshes = objects;
    viewer.selection?.selectCanonicalIds?.(objects.map((obj) => objectRenderId(obj)).filter(Boolean), { additive: false });
    viewer.fitSelection?.();
    markSelectedRow(root, nodeId);
    setStatus(root, `Selected ${objects.length} object(s) under ${node.label}`);
  } catch (error) {
    setStatus(root, `Hierarchy selection failed: ${error?.message || error}`, true);
  }
}

function setBranchVisible(root, nodeId, enabled) {
  const node = getNode(root, nodeId);
  const viewer = globalThis.__3D_RVM_VIEWER__;
  if (!node || !viewer) return;
  let count = 0;
  for (const id of node.objectIds || []) {
    const obj = getObject(root, id);
    if (!obj) continue;
    obj.userData = obj.userData || {};
    if (!enabled) {
      if (!Object.prototype.hasOwnProperty.call(obj.userData, 'rvmBranchBaseVisible')) obj.userData.rvmBranchBaseVisible = obj.visible !== false;
      if (!Object.prototype.hasOwnProperty.call(obj.userData, 'rvmBranchBasePickable')) obj.userData.rvmBranchBasePickable = obj.userData.pickable !== false;
      obj.visible = false;
      obj.userData.pickable = false;
      obj.userData.selectable = false;
      obj.userData.rvmBranchDisabledByUser = true;
      obj.userData.rvmInteractionIgnore = true;
      node.disabledObjectIds?.add?.(id);
    } else {
      obj.visible = obj.userData.rvmBranchBaseVisible !== false;
      obj.userData.pickable = obj.userData.rvmBranchBasePickable !== false;
      obj.userData.selectable = true;
      delete obj.userData.rvmBranchDisabledByUser;
      delete obj.userData.rvmInteractionIgnore;
      node.disabledObjectIds?.delete?.(id);
    }
    count += 1;
  }
  syncNodeRows(root, nodeId, enabled);
  try { viewer.requestRender?.(); } catch (_) {}
  setStatus(root, `${enabled ? 'Shown' : 'Hidden'} ${count} object(s) under ${node.label}`);
}

function syncNodeRows(root, nodeId, enabled) {
  root?.querySelectorAll?.(`li[data-node-id="${cssEscape(nodeId)}"]`)?.forEach((li) => {
    const row = li.querySelector(':scope > .rvm-navis-row');
    row?.classList?.toggle('is-branch-off', !enabled);
    const box = row?.querySelector?.('[data-rvm-navis-visible-checkbox]');
    if (box) {
      box.checked = Boolean(enabled);
      box.title = enabled ? 'Hide this branch' : 'Show this branch';
    }
  });
}

function showContextMenu(root, nodeId, x, y) {
  document.getElementById(MENU_ID)?.remove?.();
  const node = getNode(root, nodeId);
  if (!node) return;
  const menu = document.createElement('div');
  menu.id = MENU_ID;
  menu.className = 'rvm-navis-context-menu';
  menu.style.left = `${Math.max(8, x)}px`;
  menu.style.top = `${Math.max(8, y)}px`;
  menu.innerHTML = `<button data-menu-action="select">Select / Fit</button><button data-menu-action="hide">Hide branch</button><button data-menu-action="show">Show branch</button><button data-menu-action="isolate">Isolate branch</button><button data-menu-action="refresh">Refresh hierarchy</button>`;
  menu.addEventListener('click', (event) => {
    const action = event.target?.closest?.('[data-menu-action]')?.dataset.menuAction;
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === 'select') selectNode(root, nodeId);
    if (action === 'hide') setBranchVisible(root, nodeId, false);
    if (action === 'show') setBranchVisible(root, nodeId, true);
    if (action === 'isolate') isolateNode(root, nodeId);
    if (action === 'refresh') globalThis.__PCF_GLB_RVM_NAVIS_HIERARCHY__?.refresh?.();
    menu.remove();
  });
  document.body.appendChild(menu);
}

function isolateNode(root, nodeId) {
  const node = getNode(root, nodeId);
  const model = getModel(root);
  if (!node || !model) return;
  const keep = new Set(node.objectIds || []);
  for (const id of model.objectById?.keys?.() || []) {
    if (!model.objectById.has(id)) continue;
    const obj = model.objectById.get(id);
    if (!obj || !(obj.isMesh || obj.isLine || obj.isLineSegments || obj.isPoints)) continue;
    const renderId = objectRenderId(obj);
    const visible = keep.has(renderId) || keep.has(id);
    obj.visible = visible;
    obj.userData = obj.userData || {};
    obj.userData.rvmBranchDisabledByUser = !visible;
  }
  setStatus(root, `Isolated ${node.label}`);
  globalThis.__3D_RVM_VIEWER__?.requestRender?.();
}

function purgeStaleInteractionOverlays(state, force = false) {
  const root = document.querySelector('[data-rvm-viewer]');
  const modelLoaded = force || root?.dataset?.rvmModelLoaded === 'true';
  if (!modelLoaded) return 0;
  let removed = 0;
  document.querySelectorAll('.rvm-zone-density-overlay').forEach((overlay) => {
    overlay.remove();
    removed += 1;
  });
  document.querySelectorAll('.rvm-marquee-rect').forEach((rect) => {
    if (rect.style.display === 'none' || !globalThis.__3D_RVM_VIEWER__?.marqueeModeEnabled) {
      rect.style.display = 'none';
      rect.style.pointerEvents = 'none';
    }
  });
  if (state) state.overlaysPurged += removed;
  return removed;
}

function syncActiveToolbarAction(root, action) {
  if (!root) return;
  if (MODE_ACTIONS.has(action)) {
    root.querySelectorAll('[data-action]').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.action === action));
    const chip = root.querySelector('#rvm-mode-chip');
    if (chip) chip.textContent = labelForAction(action);
  }
}

function markSelectedRow(root, nodeId) {
  root?.querySelectorAll?.('.rvm-navis-row.is-selected')?.forEach((row) => row.classList.remove('is-selected'));
  const row = root?.querySelector?.(`li[data-node-id="${cssEscape(nodeId)}"] > .rvm-navis-row`);
  row?.classList?.add('is-selected');
  row?.scrollIntoView?.({ block: 'nearest' });
}

function objectRenderId(obj) {
  const data = obj?.userData || {};
  return String(data.renderObjectId || data.leafRenderObjectId || data.sourcePath || data.displayName || obj?.uuid || data.name || obj?.name || '').trim();
}

function normalizeMode(mode) {
  const text = String(mode || '').trim().toLowerCase();
  if (text === 'nav_select') return 'select';
  if (text === 'nav_orbit') return 'orbit';
  if (text === 'nav_pan') return 'pan';
  return text || 'orbit';
}

function labelForAction(action) {
  return {
    NAV_SELECT: 'Select', NAV_ORBIT: 'Orbit', NAV_PAN: 'Pan', MARQUEE_SELECT: 'Box Select', MEASURE_TOOL: 'Measure', VIEW_MARQUEE_ZOOM: 'Box Zoom', VIEW_FIT_ALL: 'Fit All', VIEW_FIT_SELECTION: 'Fit Selection', VIEW_TOGGLE_PROJECTION: 'Projection', SECTION_BOX: 'Section Box', SECTION_PLANE_UP: 'Section Plane', SECTION_DISABLE: 'Section Off',
  }[action] || action;
}

function setStatus(root, text, warning = false) {
  const el = root?.querySelector?.('#rvm-sb-msg');
  if (el) {
    el.textContent = text;
    el.style.color = warning ? '#fbbf24' : '';
  }
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    [data-rvm-viewer], [data-rvm-viewer] button, [data-rvm-viewer] input, [data-rvm-viewer] select, [data-rvm-viewer] canvas { pointer-events:auto; }
    .rvm-navis-row{grid-template-columns:16px 14px minmax(0,1fr) auto auto !important}.rvm-navis-visible-checkbox{width:12px;height:12px;margin:0;accent-color:#60a5fa;cursor:pointer}.rvm-navis-context-menu{position:fixed;z-index:2147483647;display:grid;gap:2px;min-width:150px;padding:5px;border:1px solid rgba(126,190,255,.38);border-radius:6px;background:#08111c;box-shadow:0 14px 30px rgba(0,0,0,.45);color:#dbeafe}.rvm-navis-context-menu button{display:block;width:100%;text-align:left;border:0;border-radius:4px;background:transparent;color:#dbeafe;font-size:11px;padding:5px 8px;cursor:pointer}.rvm-navis-context-menu button:hover{background:rgba(96,165,250,.22)}
  `;
  document.head.appendChild(style);
}

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) return globalThis.CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}
