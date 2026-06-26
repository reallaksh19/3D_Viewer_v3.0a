import { RuntimeEvents } from '../contracts/runtime-events.js';
import { on } from '../core/event-bus.js';

const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-navis-hierarchy-bridge-v2');
const TREE_ROOT_ATTR = 'data-rvm-navis-tree-root';
const TREE_ROW_ATTR = 'data-rvm-navis-node-row';
const MAX_CHILDREN_PER_BRANCH = 350;
const MAX_SEARCH_RESULTS = 450;
const MAX_BRANCH_SELECTION_IDS = 750;

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function normalizePathPart(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^\/+|\/+$/g, '')
    .trim();
}

function cleanPathParts(path = '', displayName = '') {
  const rawParts = String(path || '')
    .replace(/\\/g, '/')
    .split('/')
    .map(normalizePathPart)
    .filter(Boolean)
    .filter((part) => !/^RVM\s+RVM_PRIM_CODE/i.test(part));

  const leaf = normalizePathPart(displayName);
  if (leaf && !rawParts.includes(leaf)) rawParts.push(leaf);
  return rawParts.length ? rawParts : [leaf || 'Unassigned'];
}

function objectRenderId(obj) {
  const data = obj?.userData || {};
  return String(data.renderObjectId || data.leafRenderObjectId || obj?.uuid || data.name || obj?.name || '').trim();
}

function objectCanonicalId(obj) {
  const data = obj?.userData || {};
  return String(data.canonicalId || data.sourcePath || data.browserRvmProperties?.sourcePath || objectRenderId(obj)).trim();
}

function objectPath(obj) {
  const data = obj?.userData || {};
  const props = data.browserRvmProperties || {};
  const attrs = data.browserRvmAttributes || data.attributes || {};
  return data.sourcePath || props.sourcePath || props.SourcePath || attrs.RVM_OWNER_PATH || attrs.RVM_OWNER_NAME || data.sourceName || data.displayName || obj?.name || '';
}

function objectLabel(obj) {
  const data = obj?.userData || {};
  return data.displayName || data.sourceName || obj?.name || data.renderPrimitive || 'RVM object';
}

function objectKind(obj) {
  const data = obj?.userData || {};
  const attrs = data.browserRvmAttributes || data.attributes || {};
  return String(data.type || data.kind || attrs.TYPE || data.effectiveRenderPrimitive || data.renderPrimitive || 'NODE').toUpperCase();
}

function classifyLabel(label, kind = '') {
  const text = `${label} ${kind}`.toUpperCase();
  if (/\.RVM$|\.REV$|GAS_?\d|ROOT/.test(text)) return 'FILE';
  if (/BRANCH|\/BTRM|BTRM-|PIPE|PIPING|ZONE|AREA|SITE|CU-/.test(text)) return 'BRANCH';
  if (/STRUCT|FRAME|FRMW|PANEL|FLOOR|GRAD|GRID|ROAD|GENSEC|TMPLATE|EQUIPMENT/.test(text)) return 'STRUCTURE';
  if (/CYLINDER|BOX|DISH|TORUS|CONE|FACET|PRIM/.test(text)) return 'PRIM';
  return kind || 'NODE';
}

function makeNode(id, label, depth, kind = '') {
  return {
    id,
    label,
    depth,
    kind: classifyLabel(label, kind),
    count: 0,
    objectIds: new Set(),
    canonicalIds: new Set(),
    disabledObjectIds: new Set(),
    children: new Map(),
    parent: null,
  };
}

function addObjectToTree(rootNode, nodeById, objectById, obj) {
  const renderId = objectRenderId(obj);
  if (!renderId) return;
  objectById.set(renderId, obj);
  const canonicalId = objectCanonicalId(obj);
  if (canonicalId) objectById.set(canonicalId, obj);
  const parts = cleanPathParts(objectPath(obj), objectLabel(obj));
  const disabled = obj?.userData?.rvmBranchDisabledByUser === true;
  let current = rootNode;
  current.count += 1;
  current.objectIds.add(renderId);
  if (disabled) current.disabledObjectIds.add(renderId);
  if (canonicalId) current.canonicalIds.add(canonicalId);
  let key = rootNode.id;

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    key = `${key}/${part}`;
    let child = current.children.get(part);
    if (!child) {
      child = makeNode(key, part, current.depth + 1, i === parts.length - 1 ? objectKind(obj) : 'BRANCH');
      child.parent = current;
      current.children.set(part, child);
      nodeById.set(key, child);
    }
    child.count += 1;
    child.objectIds.add(renderId);
    if (disabled) child.disabledObjectIds.add(renderId);
    if (canonicalId) child.canonicalIds.add(canonicalId);
    current = child;
  }
}

function buildHierarchyModel(viewer) {
  const rootNode = makeNode('rvm-root', 'Loaded RVM model', -1, 'FILE');
  const nodeById = new Map([[rootNode.id, rootNode]]);
  const objectById = new Map();
  let objectCount = 0;
  viewer?.modelGroup?.traverse?.((obj) => {
    if (!(obj?.isMesh || obj?.isLine || obj?.isLineSegments || obj?.isPoints)) return;
    if (obj.userData?.pickable === false && obj.userData?.rvmBranchDisabledByUser !== true) return;
    objectCount += 1;
    addObjectToTree(rootNode, nodeById, objectById, obj);
  });
  return { rootNode, nodeById, objectById, objectCount, builtAt: new Date().toISOString() };
}

function sortedChildren(node) {
  return [...(node?.children?.values?.() || [])].sort((a, b) => {
    const aBranch = a.children.size > 0 ? 0 : 1;
    const bBranch = b.children.size > 0 ? 0 : 1;
    return aBranch - bBranch || a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
  });
}

function nodeIcon(node) {
  if (node.children.size) return '▣';
  if (node.kind === 'STRUCTURE') return '▤';
  if (node.kind === 'PRIM') return '◇';
  return '◻';
}

function nodeRowHtml(node, expanded = false) {
  const hasChildren = node.children.size > 0;
  const depth = Math.max(0, node.depth);
  const allOff = node.objectIds.size > 0 && node.disabledObjectIds.size >= node.objectIds.size;
  return `
    <li ${TREE_ROW_ATTR}="true" data-node-id="${esc(node.id)}" data-rvm-navis-depth="${depth}" data-rvm-navis-label="${esc(node.label.toLowerCase())}">
      <div class="rvm-navis-row ${expanded ? 'is-expanded' : ''} ${allOff ? 'is-branch-off' : ''}" style="--rvm-navis-depth:${depth}">
        <button type="button" class="rvm-navis-expander" data-rvm-navis-toggle="${esc(node.id)}" ${hasChildren ? '' : 'disabled'} aria-label="${expanded ? 'Collapse' : 'Expand'} ${esc(node.label)}">${hasChildren ? (expanded ? '−' : '+') : ''}</button>
        <button type="button" class="rvm-navis-select" data-rvm-navis-select="${esc(node.id)}" title="Select / fit ${esc(node.label)}">
          <span class="rvm-navis-icon" aria-hidden="true">${nodeIcon(node)}</span>
          <span class="rvm-kind">${esc(node.kind)}</span>
          <span class="rvm-navis-label">${esc(node.label)}</span>
          <span class="rvm-tree-count">${node.count}${allOff ? ' off' : ''}</span>
        </button>
        <button type="button" class="rvm-navis-branch-off" data-rvm-navis-off="${esc(node.id)}" title="Turn off this branch: remove from render, picking and selection">Off</button>
        <button type="button" class="rvm-navis-branch-on" data-rvm-navis-on="${esc(node.id)}" title="Turn branch back on">On</button>
      </div>
    </li>`;
}

function renderChildrenList(node) {
  const children = sortedChildren(node).slice(0, MAX_CHILDREN_PER_BRANCH);
  const more = node.children.size > MAX_CHILDREN_PER_BRANCH
    ? `<li class="rvm-empty-state">Showing ${MAX_CHILDREN_PER_BRANCH} of ${node.children.size} child nodes. Use search to narrow.</li>`
    : '';
  return `<ul class="rvm-navis-children" data-rvm-navis-children-of="${esc(node.id)}">${children.map((child) => nodeRowHtml(child, false)).join('')}${more}</ul>`;
}

function renderInitialTree(root, model) {
  root.innerHTML = '';
  const status = document.createElement('li');
  status.className = 'rvm-navis-summary';
  status.innerHTML = `<span>Navis hierarchy</span><b>${model.objectCount}</b><small>rendered objects</small>`;
  root.appendChild(status);
  const shell = document.createElement('li');
  shell.setAttribute(TREE_ROOT_ATTR, 'true');
  shell.innerHTML = nodeRowHtml(model.rootNode, true) + renderChildrenList(model.rootNode);
  root.appendChild(shell);
}

function findMatches(model, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out = [];
  for (const node of model.nodeById.values()) {
    if (node === model.rootNode) continue;
    const path = node.id.toLowerCase();
    if (node.label.toLowerCase().includes(q) || path.includes(q)) out.push(node);
    if (out.length >= MAX_SEARCH_RESULTS) break;
  }
  return out;
}

function renderSearchResults(tree, model, query) {
  const matches = findMatches(model, query);
  tree.innerHTML = `
    <li class="rvm-navis-summary"><span>Search</span><b>${matches.length}</b><small>match(es)</small></li>
    ${matches.map((node) => nodeRowHtml(node, false)).join('') || '<li class="rvm-empty-state">No matching hierarchy items.</li>'}
  `;
}

function setStatus(root, text, warning = false) {
  const el = root?.querySelector?.('#rvm-sb-msg');
  if (!el) return;
  el.textContent = text;
  el.style.color = warning ? '#ffcf70' : '';
}

function selectNode(root, node) {
  const viewer = globalThis.__3D_RVM_VIEWER__;
  const model = root?.__rvmNavisHierarchyModel;
  if (!viewer || !node || !model) return;
  const ids = [...node.objectIds].slice(0, MAX_BRANCH_SELECTION_IDS);
  const objects = ids.map((id) => model.objectById.get(id)).filter((obj) => obj && obj.userData?.rvmBranchDisabledByUser !== true);
  if (!ids.length || !objects.length) {
    setStatus(root, `No active rendered objects under ${node.label}.`, true);
    return;
  }
  try {
    viewer._rvmCanvasSelectedMeshes = objects;
    viewer.selection?.selectCanonicalIds?.(objects.map(objectRenderId).filter(Boolean), { additive: false });
    viewer.fitSelection?.();
    setStatus(root, `Selected ${objects.length}${node.objectIds.size > objects.length ? '+' : ''} active object(s) under ${node.label}.`);
    syncTreeSelection(root, { renderObjectIds: objects.map(objectRenderId).filter(Boolean), canonicalIds: [...node.canonicalIds] });
  } catch (error) {
    setStatus(root, `Hierarchy selection failed: ${error?.message || error}`, true);
    console.warn('[RVM hierarchy] selection failed', error);
  }
}

function setNodeRenderEnabled(root, node, enabled) {
  const viewer = globalThis.__3D_RVM_VIEWER__;
  const model = root?.__rvmNavisHierarchyModel;
  if (!viewer || !model || !node) return;
  let count = 0;
  for (const id of node.objectIds) {
    const obj = model.objectById.get(id);
    if (!obj) continue;
    obj.userData = obj.userData || {};
    if (!enabled) {
      if (!Object.prototype.hasOwnProperty.call(obj.userData, 'rvmBranchBaseVisible')) obj.userData.rvmBranchBaseVisible = obj.visible !== false;
      if (!Object.prototype.hasOwnProperty.call(obj.userData, 'rvmBranchBasePickable')) obj.userData.rvmBranchBasePickable = obj.userData.pickable !== false;
      if (!Object.prototype.hasOwnProperty.call(obj.userData, 'rvmBranchBaseSelectable')) obj.userData.rvmBranchBaseSelectable = obj.userData.selectable !== false;
      obj.visible = false;
      obj.userData.pickable = false;
      obj.userData.selectable = false;
      obj.userData.rvmBranchDisabledByUser = true;
      obj.userData.rvmInteractionIgnore = true;
      obj.userData.nonSelectableReason = obj.userData.nonSelectableReason || 'hierarchy-branch-turned-off';
    } else {
      obj.visible = obj.userData.rvmBranchBaseVisible !== false;
      obj.userData.pickable = obj.userData.rvmBranchBasePickable !== false;
      obj.userData.selectable = obj.userData.rvmBranchBaseSelectable !== false;
      delete obj.userData.rvmBranchDisabledByUser;
      delete obj.userData.rvmInteractionIgnore;
      if (obj.userData.nonSelectableReason === 'hierarchy-branch-turned-off') delete obj.userData.nonSelectableReason;
    }
    count += 1;
  }
  viewer.requestRender?.();
  try { globalThis.__PCF_GLB_RVM_OBJECT_SEARCH__?.rebuildIndex?.(); } catch (_) {}
  try { globalThis.__PCF_GLB_RVM_VISIBILITY__?.updateToolbarState?.(); } catch (_) {}
  setStatus(root, `${enabled ? 'Turned on' : 'Turned off'} ${count} object(s) under ${node.label}.`);
  refreshHierarchy();
}

function toggleNode(tree, model, nodeId) {
  const node = model.nodeById.get(nodeId);
  if (!node || !node.children.size) return;
  const row = tree.querySelector(`[data-node-id="${CSS.escape(nodeId)}"]`);
  if (!row) return;
  const next = row.nextElementSibling;
  const expanded = row.querySelector('.rvm-navis-row')?.classList.contains('is-expanded');
  if (expanded) {
    row.querySelector('.rvm-navis-row')?.classList.remove('is-expanded');
    const btn = row.querySelector('[data-rvm-navis-toggle]');
    if (btn) btn.textContent = '+';
    if (next?.matches?.(`[data-rvm-navis-children-of="${CSS.escape(nodeId)}"]`)) next.remove();
    return;
  }
  row.querySelector('.rvm-navis-row')?.classList.add('is-expanded');
  const btn = row.querySelector('[data-rvm-navis-toggle]');
  if (btn) btn.textContent = '−';
  row.insertAdjacentHTML('afterend', renderChildrenList(node));
}

function bindTree(root, tree, model) {
  root.__rvmNavisHierarchyModel = model;
  if (root.dataset.rvmNavisHierarchyBound !== 'true') {
    root.dataset.rvmNavisHierarchyBound = 'true';
    tree.addEventListener('click', (event) => {
      const modelNow = root.__rvmNavisHierarchyModel;
      if (!modelNow) return;
      const toggle = event.target?.closest?.('[data-rvm-navis-toggle]');
      if (toggle && !toggle.disabled) {
        event.preventDefault();
        event.stopPropagation();
        toggleNode(tree, modelNow, toggle.dataset.rvmNavisToggle);
        return;
      }
      const off = event.target?.closest?.('[data-rvm-navis-off]');
      if (off) {
        event.preventDefault();
        event.stopPropagation();
        setNodeRenderEnabled(root, modelNow.nodeById.get(off.dataset.rvmNavisOff), false);
        return;
      }
      const onBtn = event.target?.closest?.('[data-rvm-navis-on]');
      if (onBtn) {
        event.preventDefault();
        event.stopPropagation();
        setNodeRenderEnabled(root, modelNow.nodeById.get(onBtn.dataset.rvmNavisOn), true);
        return;
      }
      const select = event.target?.closest?.('[data-rvm-navis-select]');
      if (select) {
        event.preventDefault();
        event.stopPropagation();
        selectNode(root, modelNow.nodeById.get(select.dataset.rvmNavisSelect));
      }
    });
    const filter = root.querySelector('#rvm-tree-filter');
    filter?.addEventListener('input', (event) => {
      const modelNow = root.__rvmNavisHierarchyModel;
      if (!modelNow) return;
      const q = event.target.value.trim();
      if (q) renderSearchResults(tree, modelNow, q);
      else renderInitialTree(tree, modelNow);
    }, true);
    root.__rvmNavisSelectionOff = on(RuntimeEvents.RVM_NODE_SELECTED, (payload) => syncTreeSelection(root, payload));
  }
}

function idsFromPayload(payload = {}) {
  return new Set([
    ...(Array.isArray(payload.renderObjectIds) ? payload.renderObjectIds : []),
    ...(Array.isArray(payload.canonicalIds) ? payload.canonicalIds : []),
    payload.renderObjectId,
    payload.canonicalId,
  ].filter(Boolean).map(String));
}

function findBestNodeForSelection(model, ids) {
  if (!model || !ids?.size) return null;
  let best = null;
  for (const node of model.nodeById.values()) {
    if (node === model.rootNode) continue;
    const has = [...ids].some((id) => node.objectIds.has(id) || node.canonicalIds.has(id));
    if (!has) continue;
    if (!best || node.depth > best.depth) best = node;
  }
  return best;
}

function syncTreeSelection(root, payload = {}) {
  const model = root?.__rvmNavisHierarchyModel;
  const tree = root?.querySelector?.('#rvm-tree');
  if (!model || !tree) return;
  const ids = idsFromPayload(payload);
  const node = findBestNodeForSelection(model, ids);
  if (!node) return;
  expandAncestors(tree, model, node);
  tree.querySelectorAll('.rvm-navis-row.is-selected').forEach((row) => row.classList.remove('is-selected'));
  const row = tree.querySelector(`[data-node-id="${CSS.escape(node.id)}"] .rvm-navis-row`);
  if (row) {
    row.classList.add('is-selected');
    row.scrollIntoView?.({ block: 'nearest' });
  }
}

function expandAncestors(tree, model, node) {
  const chain = [];
  let cur = node?.parent;
  while (cur && cur.parent) {
    chain.unshift(cur);
    cur = cur.parent;
  }
  for (const ancestor of chain) {
    const row = tree.querySelector(`[data-node-id="${CSS.escape(ancestor.id)}"]`);
    if (!row) continue;
    const expanded = row.querySelector('.rvm-navis-row')?.classList.contains('is-expanded');
    if (!expanded) toggleNode(tree, model, ancestor.id);
  }
}

function installStyles() {
  if (typeof document === 'undefined' || document.getElementById('rvm-navis-hierarchy-style')) return;
  const style = document.createElement('style');
  style.id = 'rvm-navis-hierarchy-style';
  style.textContent = `
    .rvm-tree .rvm-navis-summary{display:flex;align-items:center;gap:6px;padding:6px 8px;margin:2px 4px 6px;border:1px solid rgba(126,190,255,.18);border-radius:6px;background:rgba(59,130,246,.08);font-size:10px;color:#bcd8ff}.rvm-tree .rvm-navis-summary b{color:#fff}.rvm-tree .rvm-navis-summary small{color:#7f94b7}
    .rvm-tree .rvm-navis-children{list-style:none;margin:0;padding:0}.rvm-tree [data-rvm-navis-node-row]{list-style:none;margin:1px 0;padding:0}.rvm-navis-row{display:grid;grid-template-columns:16px minmax(0,1fr) auto auto;align-items:center;gap:2px;min-width:0;padding-left:calc(var(--rvm-navis-depth,0) * 12px)}
    .rvm-navis-row.is-selected{background:rgba(96,165,250,.18);outline:1px solid rgba(96,165,250,.55);border-radius:4px}.rvm-navis-row.is-branch-off{opacity:.58}.rvm-navis-expander{width:16px;height:18px;line-height:14px;display:inline-grid;place-items:center;border:1px solid rgba(126,190,255,.30);border-radius:3px;background:#101a2b;color:#bcd8ff;font-size:11px;padding:0}.rvm-navis-expander:disabled{opacity:.35;border-color:transparent;background:transparent}
    .rvm-navis-select{min-width:0;display:grid;grid-template-columns:auto auto minmax(0,1fr) auto;align-items:center;gap:4px;height:20px;border:1px solid rgba(126,190,255,.13);border-radius:4px;background:rgba(255,255,255,.035);color:#d9e9ff;text-align:left;font-size:9px;padding:2px 5px}.rvm-navis-select:hover{border-color:#60a5fa;background:rgba(59,130,246,.18)}
    .rvm-navis-branch-off,.rvm-navis-branch-on{height:18px;border:1px solid rgba(148,163,184,.22);border-radius:4px;background:#111827;color:#dbeafe;font-size:8px;padding:1px 4px}.rvm-navis-branch-off{color:#fecaca}.rvm-navis-branch-on{color:#bbf7d0}
    .rvm-navis-icon{color:#83b7ff;font-size:10px}.rvm-navis-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rvm-tree .rvm-kind{font-size:8px;line-height:1;padding:2px 4px;border-radius:999px;background:#20324c;color:#bcd8ff}.rvm-tree .rvm-tree-count{font-size:8px;color:#94a3b8;margin-left:auto}
  `;
  document.head.appendChild(style);
}

function refreshHierarchy() {
  if (typeof document === 'undefined') return;
  const root = document.querySelector('[data-rvm-viewer]');
  const tree = root?.querySelector?.('#rvm-tree');
  const viewer = globalThis.__3D_RVM_VIEWER__;
  if (!root || !tree || !viewer?.modelGroup) return;
  const model = buildHierarchyModel(viewer);
  if (!model.objectCount) return;
  installStyles();
  bindTree(root, tree, model);
  renderInitialTree(tree, model);
  setStatus(root, `Navis hierarchy indexed ${model.objectCount} rendered object(s).`);
}

export function installRvmNavisHierarchyBridge() {
  if (typeof document === 'undefined') return;
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;
  globalThis.__PCF_GLB_RVM_NAVIS_HIERARCHY__ = {
    version: '20260622-rvm-navis-hierarchy-selection-sync-2',
    refresh: refreshHierarchy,
  };
  globalThis.addEventListener?.('rvm-model-loaded', () => {
    setTimeout(refreshHierarchy, 80);
    setTimeout(refreshHierarchy, 500);
  });
}
