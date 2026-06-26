const BRIDGE_VERSION = '20260626-rvm-hierarchy-selection-sync-2';
const PREVIOUS_VERSION = '20260620-rvm-large-box-support-sync-1';
const TREE_SYNC_INTERVAL_MS = 140;

export function installRvmSelectionTreeSyncBridge() {
  injectStyles();
  let attempts = 0;
  const attach = () => {
    attempts += 1;
    const root = document.querySelector('[data-rvm-viewer]');
    const viewer = globalThis.__3D_RVM_VIEWER__;
    if (root && viewer) bind(root, viewer);
    if ((!root || !viewer) && attempts < 180) setTimeout(attach, 350);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
  else attach();
}

function bind(root, viewer) {
  if (!root || root.dataset.rvmSelectionTreeSync === BRIDGE_VERSION) return;
  root.dataset.rvmSelectionTreeSync = BRIDGE_VERSION;
  root.dataset.rvmSelectionTreeSyncPrevious = PREVIOUS_VERSION;
  let lastKey = '';
  const tick = (reason = 'interval') => {
    const key = selectionKey(viewer);
    if (key !== lastKey || reason !== 'interval') {
      lastKey = key;
      syncTreeToSelection(root, viewer, reason);
    }
  };
  const timer = setInterval(() => tick('interval'), TREE_SYNC_INTERVAL_MS);
  const onHierarchySelection = () => tick('hierarchy-selection');
  const onCanvasSelection = () => tick('canvas-selection');
  root.addEventListener('rvm-hierarchy-selection', onHierarchySelection);
  root.addEventListener('rvm-canvas-selection', onCanvasSelection);
  root._rvmSelectionTreeSyncCleanup = () => {
    clearInterval(timer);
    root.removeEventListener('rvm-hierarchy-selection', onHierarchySelection);
    root.removeEventListener('rvm-canvas-selection', onCanvasSelection);
  };
  tick('bind');
}

function selectionKey(viewer) {
  const meshes = Array.isArray(viewer?._rvmCanvasSelectedMeshes) ? viewer._rvmCanvasSelectedMeshes.filter(Boolean) : [];
  if (meshes.length) return meshes.map((mesh) => stableObjectId(mesh) || mesh.uuid).sort().join('|');
  const ids = [
    ...(viewer?.selection?.getSelectionRenderIds?.() || []),
    ...(viewer?.selection?.getSelectedCanonicalIds?.() || []),
  ];
  return ids.map(String).sort().join('|');
}

function syncTreeToSelection(root, viewer, reason = 'sync') {
  const tree = root.querySelector('#rvm-tree');
  if (!tree) return;
  const aliases = selectedAliases(viewer).map(normalize).filter(Boolean);
  tree.querySelectorAll('li.is-selected, li.is-canvas-selected').forEach((row) => row.classList.remove('is-selected', 'is-canvas-selected'));
  if (!aliases.length) return;
  const rows = Array.from(tree.querySelectorAll('li[data-node-id]'));
  const ranked = rows.map((row) => ({ row, score: rowMatchScore(row, aliases) })).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
  const match = ranked[0]?.row || null;
  if (!match) return;
  match.classList.add('is-selected', 'is-canvas-selected');
  match.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  if (root.dataset) {
    root.dataset.rvmSelectionTreeSyncLastReason = reason;
    root.dataset.rvmSelectionTreeSyncLastNode = match.dataset.nodeId || '';
  }
  try { root.dispatchEvent(new CustomEvent('rvm-selection-synced-to-tree', { bubbles: true, detail: { reason, nodeId: match.dataset.nodeId || '', version: BRIDGE_VERSION } })); } catch (_) {}
}

function selectedAliases(viewer) {
  const out = [];
  const meshes = Array.isArray(viewer?._rvmCanvasSelectedMeshes) ? viewer._rvmCanvasSelectedMeshes.filter(Boolean) : [];
  for (const mesh of meshes) out.push(...aliasesForObject(mesh));
  for (const id of viewer?.selection?.getSelectionRenderIds?.() || []) out.push(id);
  for (const id of viewer?.selection?.getSelectedCanonicalIds?.() || []) out.push(id);
  return unique(out);
}

function aliasesForObject(obj) {
  const data = obj?.userData || {};
  const props = data.browserRvmProperties || {};
  const attrs = data.browserRvmAttributes || data.attributes || props.attributes || {};
  return [
    obj?.name,
    obj?.uuid,
    data.name,
    data.sourcePath,
    data.sourceName,
    data.displayName,
    stableObjectId(obj),
    props.sourcePath,
    props.displayName,
    props.name,
    attrs.NAME,
    attrs.TAG,
    attrs.RVM_OWNER_NAME,
    attrs.RVM_OWNER_PATH,
    attrs.TYPE,
    attrs.RVM_PRIMITIVE_KIND,
    attrs.RVM_PRIMITIVE_CODE ? `RVM_PRIM_CODE_${attrs.RVM_PRIMITIVE_CODE}` : '',
  ].filter(Boolean);
}

function rowMatchScore(row, aliases) {
  const rowId = normalize(row.dataset.nodeId || '');
  const label = normalize(labelForRow(row));
  const last = normalize(lastSegment(rowId || label));
  if (!rowId && !label) return 0;
  let score = 0;
  for (const alias of aliases) {
    if (!alias || alias.length < 2) continue;
    if (rowId && alias === rowId) score = Math.max(score, 100);
    if (label && alias === label) score = Math.max(score, 90);
    if (rowId && alias.endsWith(`/${rowId}`)) score = Math.max(score, 88);
    if (rowId && alias.includes(`/${rowId}/`)) score = Math.max(score, 82);
    if (last && last.length >= 4 && alias.includes(last)) score = Math.max(score, 70);
    if (rowId && rowId.length >= 4 && alias.includes(rowId)) score = Math.max(score, 60);
    if (label && label.length >= 4 && alias.includes(label)) score = Math.max(score, 55);
    if (rowId && alias.length >= 4 && rowId.includes(alias)) score = Math.max(score, 40);
  }
  return score;
}

function labelForRow(row) {
  const direct = row?.querySelector?.(':scope > .rvm-tree-node [data-rvm-tree-label], :scope > .rvm-tree-node .rvm-tree-label');
  if (direct?.textContent) return cleanLabel(direct.textContent);
  const node = row?.querySelector?.(':scope > .rvm-tree-node');
  if (!node) return row?.dataset?.nodeId || '';
  const clone = node.cloneNode?.(true);
  clone?.querySelectorAll?.('.rvm-kind,.rvm-tree-count,[data-rvm-row-toggle],[data-rvm-visibility-toggle],button,select,input').forEach((el) => el.remove?.());
  return cleanLabel(clone?.textContent || node.textContent || row?.dataset?.nodeId || '');
}

function stableObjectId(obj) {
  const data = obj?.userData || {};
  const props = data.browserRvmProperties || {};
  const attrs = data.browserRvmAttributes || data.attributes || props.attributes || {};
  return String(data.sourcePath || props.sourcePath || data.displayName || props.displayName || data.sourceName || attrs.RVM_OWNER_PATH || attrs.RVM_OWNER_NAME || attrs.NAME || data.name || obj?.name || obj?.uuid || '').trim();
}

function normalize(value) { return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function cleanLabel(value) { return String(value || '').replace(/\b(On|Off)\b/g, ' ').replace(/\s+/g, ' ').trim(); }
function lastSegment(value) { const parts = String(value || '').split('/').map((part) => part.trim()).filter(Boolean); return parts[parts.length - 1] || String(value || ''); }
function unique(values) { return Array.from(new Set((values || []).filter(Boolean))); }

function injectStyles() {
  let style = document.getElementById('rvm-selection-tree-sync-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'rvm-selection-tree-sync-style';
    document.head.appendChild(style);
  }
  style.dataset.rvmSelectionTreeSync = BRIDGE_VERSION;
  style.textContent = `
    [data-rvm-viewer] #rvm-tree li.is-canvas-selected > .rvm-tree-node { border-color: rgba(52,211,153,.95); box-shadow: inset 3px 0 0 rgba(52,211,153,.95), 0 0 0 1px rgba(52,211,153,.18); }
  `;
}
