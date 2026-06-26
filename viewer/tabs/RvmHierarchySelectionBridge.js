import * as THREE from 'three';

const BRIDGE_VERSION = 'rvm-hierarchy-selection-bridge/v3-text-hit-target-sync';
const PREVIOUS_BRIDGE_VERSION = 'rvm-hierarchy-selection-bridge/v2-fit-hide-css';
const ATTACH_FLAG = 'rvmHierarchySelectionBridge';
const TREE_ROW_SELECTOR = '#rvm-tree li[data-node-id]';
const TREE_CLICK_SELECTOR = 'li[data-node-id], .rvm-tree-node, .rvm-tree-label, [data-rvm-tree-label]';
const TREE_MATCH_SCAN_LIMIT = 20000;

export function installRvmHierarchySelectionBridge() {
  injectStyles();
  let attempts = 0;
  const attach = () => {
    attempts += 1;
    const root = document.querySelector('[data-rvm-viewer]');
    if (root) bindRoot(root);
    if (!root && attempts < 120) setTimeout(attach, 500);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
  else attach();
}

function bindRoot(root) {
  if (!root || root.dataset[ATTACH_FLAG] === BRIDGE_VERSION) return;
  root.dataset[ATTACH_FLAG] = BRIDGE_VERSION;
  root.dataset.rvmHierarchySelectionPreviousBridge = PREVIOUS_BRIDGE_VERSION;
  const tree = root.querySelector('#rvm-tree');
  const props = root.querySelector('#rvm-attributes-panel');
  if (!tree || !props) return;

  upgradeTreeRows(root, 'bind-root');
  root.addEventListener('rvm-tree-rendered', () => upgradeTreeRows(root, 'tree-rendered'));
  root.addEventListener('rvm-selection-synced-to-tree', () => upgradeTreeRows(root, 'selection-sync'));

  tree.addEventListener('click', (event) => {
    const target = event.target?.closest?.(TREE_CLICK_SELECTOR);
    const li = target?.closest?.('li[data-node-id]') || event.target?.closest?.('li[data-node-id]');
    if (!li || !tree.contains(li)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    handleTreeSelection(root, li, { reason: 'tree-click', originalTarget: event.target });
  }, true);

  tree.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const li = event.target?.closest?.('li[data-node-id]');
    if (!li || !tree.contains(li)) return;
    event.preventDefault();
    event.stopPropagation();
    handleTreeSelection(root, li, { reason: 'tree-keyboard' });
  }, true);

  props.addEventListener('click', (event) => {
    const action = event.target?.closest?.('[data-rvm-tree-action]')?.dataset?.rvmTreeAction;
    if (!action) return;
    const viewer = globalThis.__3D_RVM_VIEWER__;
    if (!viewer) return;
    const api = globalThis.__PCF_GLB_RVM_INTERACTION__;
    if (action === 'fit-selection') {
      if (!api?.fitSelection?.()) fitCurrentSelection(viewer);
    }
    if (action === 'hide-selection') {
      if (!api?.hideSelection?.()) hideCurrentSelection(viewer, root);
    }
    if (action === 'show-hidden') {
      if (!api?.showHidden?.()) showHiddenObjects(viewer, root);
    }
    if (action === 'fit-all') viewer.fitProgressiveBounds?.(viewer._progressiveModelBounds || viewer.modelGroup?.children?.[0]?.userData?.bounds || null, { force: true });
    if (action === 'clear-selection') {
      api?.clearSelection?.();
      viewer.selection?.clearSelection?.();
      viewer._rvmCanvasSelectedMeshes = [];
      root.querySelectorAll('#rvm-tree li.is-selected').forEach((row) => row.classList.remove('is-selected', 'is-canvas-selected'));
      props.innerHTML = '<div class="rvm-empty-state">No object selected.</div>';
      updateSelectionChip(root, 0);
    }
  });
}

function upgradeTreeRows(root, reason = 'manual') {
  const tree = root?.querySelector?.('#rvm-tree');
  if (!tree) return 0;
  let count = 0;
  for (const li of tree.querySelectorAll('li[data-node-id]')) {
    const button = li.querySelector(':scope > .rvm-tree-node') || li.querySelector('.rvm-tree-node');
    if (!button) continue;
    button.type = 'button';
    button.dataset.rvmHierarchyHitTarget = 'true';
    button.setAttribute('tabindex', '0');
    button.setAttribute('title', cleanLabel(labelForRow(li)) || li.dataset.nodeId || 'Hierarchy node');
    let label = button.querySelector('[data-rvm-tree-label]') || button.querySelector('.rvm-tree-label');
    if (!label) {
      const spans = [...button.querySelectorAll('span')].filter((span) => !span.classList.contains('rvm-kind') && !span.classList.contains('rvm-tree-count'));
      label = spans[0] || null;
    }
    if (label) {
      label.classList.add('rvm-tree-label');
      label.dataset.rvmTreeLabel = 'true';
      label.setAttribute('title', cleanLabel(label.textContent || li.dataset.nodeId || ''));
    }
    const kind = button.querySelector('.rvm-kind');
    if (kind) kind.dataset.rvmTreeKind = 'true';
    li.dataset.rvmHierarchyRowReady = BRIDGE_VERSION;
    count += 1;
  }
  if (root.dataset) {
    root.dataset.rvmHierarchyRowsReady = String(count);
    root.dataset.rvmHierarchyRowsReadyReason = reason;
  }
  return count;
}

function handleTreeSelection(root, li, options = {}) {
  const viewer = globalThis.__3D_RVM_VIEWER__;
  const id = li.dataset.nodeId || '';
  const label = labelForRow(li) || id;
  markTreeRowSelected(root, li, { source: 'tree', scroll: false });
  if (!viewer) {
    renderDetails(root, { id, label, matches: [], message: 'Viewer is not ready yet.' });
    return;
  }
  const matches = collectMatches(viewer, id, label);
  const api = globalThis.__PCF_GLB_RVM_INTERACTION__;
  let selected = false;
  if (matches.length && api?.setSelectionFromObjects) {
    selected = api.setSelectionFromObjects(matches, { sourceObject: matches[0], source: 'hierarchy-tree', hierarchyNodeId: id }) !== false;
  } else if (matches.length) {
    const renderIds = unique(matches.map((obj) => renderIdFor(obj)).filter(Boolean));
    try {
      viewer.selection?.clearSelection?.();
      viewer._rvmCanvasSelectedMeshes = matches;
      if (renderIds.length) viewer.selection?.selectCanonicalIds?.(renderIds);
      selected = true;
    } catch (error) {
      console.warn('[RVM hierarchy bridge] selection failed', error);
    }
  }
  if (matches.length) fitObjects(viewer, matches);
  renderDetails(root, { id, label, matches, message: matches.length ? '' : 'No visible render object matched this hierarchy row.' });
  updateSelectionChip(root, matches.length);
  setStatusMessage(root, matches.length ? `Selected ${cleanLabel(label)} (${matches.length} mesh${matches.length === 1 ? '' : 'es'})` : `Hierarchy row selected: ${cleanLabel(label)} — no visible mesh match`);
  publishHierarchySelection(root, { id, label, matches, selected, reason: options.reason || 'tree-selection' });
}

function markTreeRowSelected(root, li, options = {}) {
  root.querySelectorAll('#rvm-tree li.is-selected').forEach((row) => row.classList.remove('is-selected', 'is-canvas-selected'));
  li.classList.add('is-selected');
  if (options.source === 'canvas') li.classList.add('is-canvas-selected');
  if (options.scroll !== false) li.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

function collectMatches(viewer, id, label) {
  const tokens = selectionTokens(id, label);
  const matches = [];
  let scanned = 0;
  viewer?.modelGroup?.traverse?.((obj) => {
    scanned += 1;
    if (scanned > TREE_MATCH_SCAN_LIMIT) return;
    if (!obj?.isMesh || obj.visible === false) return;
    const aliases = aliasesFor(obj).map(normalize).filter(Boolean);
    if (aliases.some((alias) => aliasesMatch(alias, tokens))) matches.push(obj);
  });
  return uniqueObjects(matches);
}

function selectionTokens(id, label) {
  const values = unique([
    id,
    label,
    cleanLabel(label),
    lastSegment(id),
    lastSegment(label),
    String(id || '').replace(/^\/+/, ''),
  ].map(normalize).filter((value) => value.length >= 2));
  return values.filter((value) => !['on', 'off', 'node', 'kind', 'count', 'act'].includes(value));
}

function aliasesMatch(alias, tokens) {
  return tokens.some((token) => {
    if (!token || token.length < 2) return false;
    if (alias === token) return true;
    if (alias.endsWith(`/${token}`) || alias.includes(`/${token}/`)) return true;
    if (token.length >= 4 && (alias.includes(token) || token.includes(alias))) return true;
    return false;
  });
}

function aliasesFor(obj) {
  const data = obj.userData || {};
  const props = data.browserRvmProperties || {};
  const attrs = data.browserRvmAttributes || data.attributes || props.attributes || {};
  return [
    data.sourcePath,
    data.sourceName,
    data.displayName,
    data.name,
    props.sourcePath,
    props.displayName,
    props.name,
    data.type,
    data.kind,
    obj.name,
    obj.uuid,
    attrs.RVM_OWNER_NAME,
    attrs.RVM_OWNER_PATH,
    attrs.NAME,
    attrs.TAG,
    attrs.TYPE,
    attrs.RVM_PRIMITIVE_KIND,
    attrs.RVM_BROWSER_RENDER_PRIMITIVE,
  ].filter((value) => value !== undefined && value !== null && value !== '');
}

function fitObjects(viewer, objects = []) {
  const box = boxForObjects(objects.filter((obj) => obj?.visible !== false));
  if (box && !box.isEmpty()) {
    try { viewer._fitBox?.(box); return true; }
    catch (error) { console.warn('[RVM hierarchy bridge] fit selected failed', error); }
  }
  try { viewer.fitProgressiveBounds?.(viewer._progressiveModelBounds || null, { force: true }); }
  catch (_) {}
  return false;
}

function fitCurrentSelection(viewer) {
  const direct = Array.isArray(viewer?._rvmCanvasSelectedMeshes) ? viewer._rvmCanvasSelectedMeshes.filter((obj) => obj?.visible !== false) : [];
  if (direct.length) return fitObjects(viewer, direct);
  const ids = new Set([...(viewer?.selection?.getSelectionRenderIds?.() || []), ...(viewer?.selection?.getSelectedCanonicalIds?.() || [])]);
  const objects = [];
  viewer?.modelGroup?.traverse?.((obj) => {
    if (!obj?.isMesh || obj.visible === false) return;
    const aliases = aliasesFor(obj);
    if (aliases.some((alias) => ids.has(alias))) objects.push(obj);
  });
  return fitObjects(viewer, objects);
}

function hideCurrentSelection(viewer, root) {
  const meshes = Array.isArray(viewer?._rvmCanvasSelectedMeshes) ? viewer._rvmCanvasSelectedMeshes.filter((obj) => obj?.visible !== false) : [];
  if (!meshes.length) return false;
  for (const mesh of meshes) {
    mesh.visible = false;
    mesh.userData.rvmHiddenByUser = true;
  }
  viewer._rvmCanvasSelectedMeshes = [];
  viewer.selection?.clearSelection?.();
  root.querySelector('#rvm-attributes-panel').innerHTML = '<div class="rvm-empty-state">No object selected.</div>';
  updateSelectionChip(root, 0);
  return true;
}

function showHiddenObjects(viewer, root) {
  let count = 0;
  viewer?.modelGroup?.traverse?.((obj) => {
    if (obj?.userData?.rvmHiddenByUser) {
      obj.visible = true;
      delete obj.userData.rvmHiddenByUser;
      count += 1;
    }
  });
  const status = root?.querySelector?.('#rvm-sb-msg');
  if (status) status.textContent = count ? `Shown ${count} hidden mesh${count === 1 ? '' : 'es'}` : 'No hidden meshes';
  return true;
}

function boxForObjects(objects = []) {
  const box = new THREE.Box3();
  let any = false;
  for (const obj of objects) {
    try {
      const itemBox = new THREE.Box3().setFromObject(obj);
      if (itemBox && !itemBox.isEmpty()) { box.union(itemBox); any = true; }
    } catch (_) {}
  }
  return any ? box : null;
}

function renderDetails(root, { id, label, matches, message = '' }) {
  const panel = root.querySelector('#rvm-attributes-panel');
  if (!panel) return;
  const first = matches?.[0] || null;
  const attrs = first?.userData?.browserRvmAttributes || first?.userData?.attributes || first?.userData?.browserRvmProperties?.attributes || {};
  const fitBox = boxForObjects(matches || []);
  const size = fitBox ? fitBox.getSize(new THREE.Vector3()) : null;
  const rows = [
    ['Node', id],
    ['Label', cleanLabel(label)],
    ['Matched meshes', matches?.length || 0],
    ['Type', first?.userData?.type || attrs.TYPE || '-'],
    ['Kind', first?.userData?.kind || attrs.RVM_PRIMITIVE_KIND || '-'],
    ['Render primitive', first?.userData?.effectiveRenderPrimitive || first?.userData?.renderPrimitive || attrs.RVM_BROWSER_RENDER_PRIMITIVE || '-'],
    ['Source path', first?.userData?.sourcePath || first?.userData?.browserRvmProperties?.sourcePath || '-'],
    ['Size', size ? `${fmt(size.x)} × ${fmt(size.y)} × ${fmt(size.z)}` : '-'],
  ];
  const attrRows = Object.entries(attrs || {}).slice(0, 24).map(([key, value]) => [key, value]);
  panel.innerHTML = `
    <div class="rvm-tree-selection-card" data-rvm-tree-selection-card="true">
      <div class="rvm-tree-selection-title">Hierarchy selection</div>
      ${message ? `<div class="rvm-browser-diag-warning">${escapeHtml(message)}</div>` : ''}
      <div class="rvm-tree-action-row">
        <button type="button" class="rvm-btn" data-rvm-tree-action="fit-selection">Fit Selection</button>
        <button type="button" class="rvm-btn" data-rvm-tree-action="hide-selection">Hide</button>
        <button type="button" class="rvm-btn" data-rvm-tree-action="show-hidden">Show Hidden</button>
        <button type="button" class="rvm-btn" data-rvm-tree-action="fit-all">Fit All</button>
        <button type="button" class="rvm-btn" data-rvm-tree-action="clear-selection">Clear</button>
      </div>
      <div class="rvm-browser-diag-grid">${rows.map(([key, value]) => row(key, value)).join('')}</div>
      <div class="rvm-tree-selection-title">Attributes</div>
      <div class="rvm-browser-diag-grid">${attrRows.length ? attrRows.map(([key, value]) => row(key, value)).join('') : row('Attributes', 'No attributes on matched mesh')}</div>
    </div>`;
}

function publishHierarchySelection(root, detail = {}) {
  try { root.dispatchEvent(new CustomEvent('rvm-hierarchy-selection', { bubbles: true, detail: { ...detail, version: BRIDGE_VERSION } })); } catch (_) {}
}

function updateSelectionChip(root, count) {
  const chip = root.querySelector('[data-rvm-status-chip="selected"]');
  const footer = root.querySelector('#rvm-sel-count');
  if (chip) chip.textContent = `Selected: ${count}`;
  if (footer) footer.textContent = String(count || 0);
}

function setStatusMessage(root, message) {
  const status = root?.querySelector?.('#rvm-sb-msg');
  if (status) status.textContent = message;
}

function labelForRow(li) {
  const direct = li?.querySelector?.(':scope > .rvm-tree-node [data-rvm-tree-label], :scope > .rvm-tree-node .rvm-tree-label');
  if (direct?.textContent) return direct.textContent;
  const button = li?.querySelector?.(':scope > .rvm-tree-node');
  if (!button) return li?.dataset?.nodeId || '';
  const clone = button.cloneNode?.(true);
  clone?.querySelectorAll?.('.rvm-kind,.rvm-tree-count,[data-rvm-row-toggle],[data-rvm-visibility-toggle],button,select,input').forEach((node) => node.remove?.());
  return clone?.textContent || button.textContent || li?.dataset?.nodeId || '';
}

function renderIdFor(obj) { return obj?.userData?.name || obj?.name || obj?.uuid || ''; }
function unique(values) { return Array.from(new Set(values)); }
function uniqueObjects(values = []) { return Array.from(new Set(values.filter(Boolean))); }
function normalize(value) { return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function lastSegment(value) { const parts = String(value || '').split('/').map((part) => part.trim()).filter(Boolean); return parts[parts.length - 1] || String(value || ''); }
function cleanLabel(value) { return String(value || '').replace(/\b(On|Off)\b/g, ' ').replace(/\s+/g, ' ').trim(); }
function fmt(value) { const n = Number(value); return Number.isFinite(n) ? n.toFixed(3) : '-'; }
function row(key, value) { return `<div class="rvm-browser-diag-row"><span>${escapeHtml(key)}</span><b>${escapeHtml(value === undefined || value === null || value === '' ? '-' : String(value))}</b></div>`; }
function escapeHtml(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }

function injectStyles() {
  let style = document.getElementById('rvm-hierarchy-selection-bridge-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'rvm-hierarchy-selection-bridge-style';
    document.head.appendChild(style);
  }
  style.dataset.rvmHierarchySelectionBridge = BRIDGE_VERSION;
  style.textContent = `
    [data-rvm-viewer] .rvm-left-panel { width: clamp(300px, 24vw, 430px); min-width: 260px; max-width: 520px; resize: horizontal; }
    [data-rvm-viewer] #rvm-tree { padding: 3px 4px 8px; overflow: auto; }
    [data-rvm-viewer] #rvm-tree li[data-node-id] { padding: 1px 2px; white-space: normal; overflow: visible; text-overflow: clip; }
    [data-rvm-viewer] #rvm-tree li[data-node-id] > ul { margin: 2px 0 0 12px; padding-left: 9px; border-left: 1px solid rgba(96,165,250,.18); }
    [data-rvm-viewer] #rvm-tree .rvm-tree-node { width: 100%; min-height: 24px; display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 6px; text-align: left; border: 1px solid rgba(90,120,160,.35); border-radius: 5px; background: rgba(7,14,25,.55); color: inherit; padding: 2px 5px; cursor: pointer; }
    [data-rvm-viewer] #rvm-tree .rvm-tree-node:hover { border-color: rgba(96,165,250,.85); background: rgba(37,99,235,.16); }
    [data-rvm-viewer] #rvm-tree .rvm-tree-node:focus { outline: 1px solid rgba(96,165,250,.95); outline-offset: 1px; }
    [data-rvm-viewer] #rvm-tree .rvm-tree-label, [data-rvm-viewer] #rvm-tree [data-rvm-tree-label] { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #dbeafe; }
    [data-rvm-viewer] #rvm-tree .rvm-kind { flex: 0 0 auto; max-width: 64px; overflow: hidden; text-overflow: ellipsis; border: 1px solid rgba(96,165,250,.28); border-radius: 999px; padding: 1px 5px; color: #93c5fd; font-size: 9px; }
    [data-rvm-viewer] #rvm-tree .rvm-tree-count { color: #bfdbfe; font-size: 10px; opacity: .9; }
    [data-rvm-viewer] #rvm-tree li.is-selected > .rvm-tree-node { outline: 1px solid rgba(96,165,250,.95); border-color: rgba(96,165,250,.95); background: rgba(37,99,235,.30); box-shadow: inset 3px 0 0 rgba(96,165,250,.95); }
    [data-rvm-viewer] #rvm-tree li.is-canvas-selected > .rvm-tree-node { border-color: rgba(52,211,153,.9); box-shadow: inset 3px 0 0 rgba(52,211,153,.9); }
    [data-rvm-viewer] .rvm-tree-selection-card { display: grid; gap: 8px; }
    [data-rvm-viewer] .rvm-tree-selection-title { color: #93c5fd; font-weight: 700; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; }
    [data-rvm-viewer] .rvm-tree-action-row { display: flex; flex-wrap: wrap; gap: 6px; }
    [data-rvm-viewer] .rvm-tree-action-row .rvm-btn { padding: 4px 8px; font-size: 12px; }
  `;
}
