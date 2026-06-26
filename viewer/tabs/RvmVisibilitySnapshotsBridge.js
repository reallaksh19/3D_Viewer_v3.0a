const BRIDGE_VERSION = '20260621-rvm-visibility-snapshots-1';
const STORAGE_PREFIX = 'rvm_visibility_snapshots_v1:';
const MAX_SNAPSHOTS = 12;
const MAX_OBJECT_STATES = 12000;
const MENU_ID = 'rvm-visibility-snapshots-menu';

export function installRvmVisibilitySnapshotsBridge() {
  if (typeof document === 'undefined') return;
  injectStyles();
  let attempts = 0;
  const attach = () => {
    attempts += 1;
    const root = rootEl();
    if (root) {
      injectToolbar(root);
      publishApi();
      updateSummary(root);
    }
    if (!root && attempts < 180) setTimeout(attach, 300);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
  else attach();
  globalThis.addEventListener?.('rvm-model-loaded', () => setTimeout(() => {
    const root = rootEl();
    injectToolbar(root);
    publishApi();
    updateSummary(root);
  }, 180));
}

function rootEl() { return document.querySelector('[data-rvm-viewer]'); }
function viewer() { return globalThis.__3D_RVM_VIEWER__ || null; }
function isRenderable(obj) { return Boolean(obj && (obj.isMesh || obj.isLine || obj.isPoints)); }

function stableHash(text = '') {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fileKey(root = rootEl()) {
  const v = viewer();
  const scene = v?.modelGroup?.children?.[0] || v?.modelGroup;
  const raw = scene?.userData?.fileName
    || scene?.userData?.browserRvmParser?.fileName
    || scene?.userData?.browserRvmAtt?.fileName
    || root?.querySelector?.('#rvm-browser-parse-diagnostics')?.textContent
    || 'current-rvm-model';
  const text = String(raw || 'current-rvm-model').replace(/\s+/g, '-').slice(0, 160);
  return `${stableHash(text)}-${text.replace(/[^A-Za-z0-9_.-]+/g, '_')}`;
}

function storageKey(root = rootEl()) { return `${STORAGE_PREFIX}${fileKey(root)}`; }

function readSnapshots(root = rootEl()) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(root)) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
  } catch {
    return [];
  }
}

function writeSnapshots(root, snapshots) {
  const normalized = (Array.isArray(snapshots) ? snapshots : []).slice(0, MAX_SNAPSHOTS);
  try { localStorage.setItem(storageKey(root), JSON.stringify(normalized)); } catch {}
  updateSummary(root);
}

function objectId(obj) {
  const data = obj?.userData || {};
  const props = data.browserRvmProperties || {};
  const attrs = data.browserRvmAttributes || data.attributes || props.attributes || {};
  return String(
    data.name
    || data.canonicalObjectId
    || data.sourceObjectId
    || data.sourcePath
    || props.sourcePath
    || attrs.RVM_REVIEW_NAME
    || attrs.RVM_OWNER_PATH
    || obj?.name
    || obj?.uuid
    || ''
  ).trim();
}

function cameraState(v = viewer()) {
  const camera = v?.camera;
  if (!camera) return null;
  const controls = v?.controls || v?.orbitControls;
  const arr = (value) => Array.isArray(value) ? value : [value?.x, value?.y, value?.z].map((n) => Number(n || 0));
  return {
    position: arr(camera.position),
    quaternion: [camera.quaternion?.x || 0, camera.quaternion?.y || 0, camera.quaternion?.z || 0, camera.quaternion?.w || 1],
    target: controls?.target ? arr(controls.target) : null,
    zoom: Number(camera.zoom || 1),
  };
}

function restoreCamera(snapshot, v = viewer()) {
  const state = snapshot?.camera;
  const camera = v?.camera;
  if (!state || !camera) return false;
  try {
    if (Array.isArray(state.position) && camera.position?.set) camera.position.set(state.position[0] || 0, state.position[1] || 0, state.position[2] || 0);
    if (Array.isArray(state.quaternion) && camera.quaternion?.set) camera.quaternion.set(state.quaternion[0] || 0, state.quaternion[1] || 0, state.quaternion[2] || 0, state.quaternion[3] || 1);
    if (Number.isFinite(state.zoom)) camera.zoom = state.zoom;
    camera.updateProjectionMatrix?.();
    const controls = v?.controls || v?.orbitControls;
    if (state.target && controls?.target?.set) controls.target.set(state.target[0] || 0, state.target[1] || 0, state.target[2] || 0);
    controls?.update?.();
    return true;
  } catch {
    return false;
  }
}

function captureSnapshot(name = '', root = rootEl(), v = viewer()) {
  const hiddenIds = [];
  const manualHiddenIds = [];
  const isolateHiddenIds = [];
  let total = 0;
  let visible = 0;
  let truncated = false;
  v?.modelGroup?.traverse?.((obj) => {
    if (!isRenderable(obj)) return;
    total += 1;
    if (obj.visible !== false) visible += 1;
    const id = objectId(obj);
    if (!id) return;
    if (obj.visible === false) {
      if (hiddenIds.length < MAX_OBJECT_STATES) hiddenIds.push(id);
      else truncated = true;
    }
    if (obj.userData?.rvmHiddenByVisibilityToolbar || obj.userData?.rvmHiddenByUser || obj.userData?.rvmHiddenBySelectionDetails || obj.userData?.rvmHiddenByVisibilitySnapshot) {
      if (manualHiddenIds.length < MAX_OBJECT_STATES) manualHiddenIds.push(id);
    }
    if (obj.userData?.rvmIsolatedHiddenByVisibilityToolbar) {
      if (isolateHiddenIds.length < MAX_OBJECT_STATES) isolateHiddenIds.push(id);
    }
  });
  return {
    schema: 'rvm-visibility-snapshot/v1',
    version: BRIDGE_VERSION,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: String(name || 'Working view').slice(0, 80),
    fileKey: fileKey(root),
    createdAt: new Date().toISOString(),
    total,
    visible,
    hidden: Math.max(0, total - visible),
    hiddenIds,
    manualHiddenIds,
    isolateHiddenIds,
    truncated,
    visibilityMode: v?._rvmVisibilityMode || 'normal',
    camera: cameraState(v),
  };
}

function saveCurrentSnapshot(root = rootEl(), name = '') {
  const v = viewer();
  if (!root || !v?.modelGroup) {
    setStatus(root, 'View snapshot: load an RVM model first.', true);
    return null;
  }
  const proposed = String(name || window.prompt?.('Save RVM view as:', 'Working view') || '').trim();
  if (!proposed) return null;
  const snapshot = captureSnapshot(proposed, root, v);
  const snapshots = readSnapshots(root).filter((item) => item?.name !== snapshot.name);
  snapshots.unshift(snapshot);
  writeSnapshots(root, snapshots.slice(0, MAX_SNAPSHOTS));
  setStatus(root, `Saved RVM view "${snapshot.name}" (${snapshot.visible}/${snapshot.total} visible${snapshot.truncated ? ', truncated' : ''}).`, snapshot.truncated);
  return snapshot;
}

function restoreSnapshot(snapshotOrId, root = rootEl()) {
  const v = viewer();
  if (!root || !v?.modelGroup) {
    setStatus(root, 'View snapshot: load an RVM model first.', true);
    return { restored: 0, hidden: 0 };
  }
  const snapshots = readSnapshots(root);
  const snapshot = typeof snapshotOrId === 'string'
    ? snapshots.find((item) => item.id === snapshotOrId)
    : snapshotOrId;
  if (!snapshot) {
    setStatus(root, 'View snapshot: no saved view to restore.', true);
    return { restored: 0, hidden: 0 };
  }
  const hidden = new Set((snapshot.hiddenIds || []).map(String));
  const manualHidden = new Set((snapshot.manualHiddenIds || []).map(String));
  const isolateHidden = new Set((snapshot.isolateHiddenIds || []).map(String));
  let restored = 0;
  let hiddenCount = 0;
  v.modelGroup.traverse?.((obj) => {
    if (!isRenderable(obj)) return;
    const id = objectId(obj);
    if (!id) return;
    obj.userData = obj.userData || {};
    const baseVisible = obj.userData.rvmZoneLodOriginalVisible !== false && obj.userData.rvmVisibilityBaseVisible !== false;
    const shouldHide = hidden.has(id);
    obj.visible = shouldHide ? false : baseVisible;
    delete obj.userData.rvmHiddenByVisibilitySnapshot;
    delete obj.userData.rvmHiddenByVisibilityToolbar;
    delete obj.userData.rvmIsolatedHiddenByVisibilityToolbar;
    if (shouldHide) {
      obj.userData.rvmHiddenByVisibilitySnapshot = true;
      if (manualHidden.has(id)) obj.userData.rvmHiddenByVisibilityToolbar = true;
      if (isolateHidden.has(id)) obj.userData.rvmIsolatedHiddenByVisibilityToolbar = true;
      hiddenCount += 1;
    }
    restored += 1;
  });
  v._rvmVisibilityMode = snapshot.visibilityMode || 'snapshot';
  const cameraRestored = restoreCamera(snapshot, v);
  v.requestRender?.();
  updateSummary(root);
  refreshDependents();
  setStatus(root, `Restored RVM view "${snapshot.name}" (${restored - hiddenCount}/${restored} visible${cameraRestored ? ', camera' : ''}${snapshot.truncated ? ', truncated source' : ''}).`, Boolean(snapshot.truncated));
  return { restored, hidden: hiddenCount, cameraRestored };
}

function restoreLastSnapshot(root = rootEl()) {
  const snapshots = readSnapshots(root);
  return restoreSnapshot(snapshots[0], root);
}

function deleteSnapshot(root, id) {
  const next = readSnapshots(root).filter((item) => item.id !== id);
  writeSnapshots(root, next);
  showManager(root);
}

function injectToolbar(root) {
  const ribbon = root?.querySelector?.('.geo-top-ribbon');
  if (!ribbon) return;
  let section = ribbon.querySelector('.rvm-view-snapshot-tool-group');
  if (section?.dataset?.rvmVisibilitySnapshots === BRIDGE_VERSION) return;
  if (!section) {
    section = document.createElement('div');
    section.className = 'rvm-ribbon-section rvm-tool-group rvm-view-snapshot-tool-group';
    const visibility = ribbon.querySelector('.rvm-visibility-tool-group');
    if (visibility?.nextSibling) ribbon.insertBefore(section, visibility.nextSibling);
    else ribbon.insertBefore(section, ribbon.querySelector('.rvm-ribbon-search') || null);
  }
  section.dataset.rvmVisibilitySnapshots = BRIDGE_VERSION;
  section.setAttribute('aria-label', 'RVM saved view states');
  section.innerHTML = `
    <span class="rvm-ribbon-label">Views</span>
    <div class="rvm-ribbon-button-row">
      <button class="rvm-tool-btn" data-rvm-view-snapshot-action="save" type="button" title="Save current visibility and camera state"><span aria-hidden="true">＋</span><span>Save View</span></button>
      <button class="rvm-tool-btn" data-rvm-view-snapshot-action="restore-last" type="button" title="Restore latest saved view"><span aria-hidden="true">↺</span><span>Restore</span></button>
      <button class="rvm-tool-btn" data-rvm-view-snapshot-action="manage" type="button" title="Manage saved RVM views"><span aria-hidden="true">▤</span><span>Manage</span></button>
    </div>
    <div class="rvm-view-snapshot-summary" data-rvm-view-snapshot-summary>Saved views: 0</div>`;
  section.addEventListener('click', onToolbarClick, true);
}

function onToolbarClick(event) {
  const button = event.target?.closest?.('[data-rvm-view-snapshot-action]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const root = rootEl();
  const action = button.dataset.rvmViewSnapshotAction;
  if (action === 'save') saveCurrentSnapshot(root);
  else if (action === 'restore-last') restoreLastSnapshot(root);
  else if (action === 'manage') showManager(root);
}

function showManager(root = rootEl()) {
  hideManager();
  if (!root) return;
  const snapshots = readSnapshots(root);
  const menu = document.createElement('div');
  menu.id = MENU_ID;
  menu.className = 'rvm-visibility-snapshot-menu';
  const anchor = root.querySelector('.rvm-view-snapshot-tool-group')?.getBoundingClientRect?.();
  menu.style.left = `${Math.max(12, Math.min(anchor?.left || 260, window.innerWidth - 360))}px`;
  menu.style.top = `${Math.max(48, Math.min((anchor?.bottom || 86) + 8, window.innerHeight - 280))}px`;
  menu.innerHTML = `
    <div class="rvm-visibility-snapshot-menu-title">Saved RVM Views <small>${snapshots.length}/${MAX_SNAPSHOTS} for current file</small></div>
    ${snapshots.length ? snapshots.map((item) => `
      <div class="rvm-visibility-snapshot-row" data-rvm-view-snapshot-id="${esc(item.id)}">
        <div><strong>${esc(item.name)}</strong><small>${esc(new Date(item.createdAt || Date.now()).toLocaleString())} · ${esc(item.visible)}/${esc(item.total)} visible${item.truncated ? ' · truncated' : ''}</small></div>
        <button type="button" data-rvm-view-snapshot-menu-action="restore">Restore</button>
        <button type="button" data-rvm-view-snapshot-menu-action="delete" class="is-danger">Delete</button>
      </div>`).join('') : '<div class="rvm-visibility-snapshot-empty">No saved views for this RVM file yet.</div>'}
    <div class="rvm-visibility-snapshot-footer"><button type="button" data-rvm-view-snapshot-menu-action="save-new">Save current view</button><button type="button" data-rvm-view-snapshot-menu-action="clear-all" class="is-danger">Clear all</button></div>`;
  document.body.appendChild(menu);
  menu.addEventListener('click', (event) => {
    const action = event.target?.closest?.('[data-rvm-view-snapshot-menu-action]')?.dataset?.rvmViewSnapshotMenuAction;
    if (!action) return;
    event.preventDefault();
    const row = event.target.closest('[data-rvm-view-snapshot-id]');
    const id = row?.dataset?.rvmViewSnapshotId;
    if (action === 'restore') { restoreSnapshot(id, root); hideManager(); }
    else if (action === 'delete') deleteSnapshot(root, id);
    else if (action === 'save-new') { hideManager(); saveCurrentSnapshot(root); }
    else if (action === 'clear-all') { writeSnapshots(root, []); hideManager(); setStatus(root, 'Cleared all saved RVM views for this file.'); }
  });
}

function hideManager() { document.getElementById(MENU_ID)?.remove(); }

function updateSummary(root = rootEl()) {
  const summary = root?.querySelector?.('[data-rvm-view-snapshot-summary]');
  if (!summary) return;
  const snapshots = readSnapshots(root);
  summary.textContent = snapshots.length ? `Saved views: ${snapshots.length} · latest ${snapshots[0]?.name || ''}` : 'Saved views: 0';
}

function refreshDependents() {
  try { globalThis.__PCF_GLB_RVM_VISIBILITY__?.updateToolbarState?.(); } catch {}
  try { globalThis.__PCF_GLB_RVM_SELECTION_DETAILS_INSPECTOR__?.refresh?.({}, 'visibility-snapshot'); } catch {}
}

function setStatus(root, text, warning = false) {
  const el = root?.querySelector?.('#rvm-sb-msg');
  if (!el) return;
  el.textContent = text;
  el.style.color = warning ? '#ffcf70' : '';
}

function publishApi() {
  globalThis.__PCF_GLB_RVM_VIEW_SNAPSHOTS__ = {
    version: BRIDGE_VERSION,
    listSnapshots: () => readSnapshots(rootEl()),
    captureSnapshot: (name) => captureSnapshot(name, rootEl(), viewer()),
    saveCurrentSnapshot: (name) => saveCurrentSnapshot(rootEl(), name),
    restoreSnapshot: (id) => restoreSnapshot(id, rootEl()),
    restoreLastSnapshot: () => restoreLastSnapshot(rootEl()),
    storageKey: () => storageKey(rootEl()),
  };
}

function injectStyles() {
  if (document.getElementById('rvm-visibility-snapshots-style')) return;
  const style = document.createElement('style');
  style.id = 'rvm-visibility-snapshots-style';
  style.textContent = `
    .rvm-view-snapshot-tool-group .rvm-tool-btn span:last-child{font-size:11px}.rvm-view-snapshot-summary{margin-top:3px;color:#94a3b8;font-size:9.5px;white-space:nowrap;max-width:210px;overflow:hidden;text-overflow:ellipsis}.rvm-visibility-snapshot-menu{position:fixed;z-index:100000;min-width:340px;max-width:420px;background:#0f172a;border:1px solid rgba(125,190,255,.35);border-radius:12px;box-shadow:0 18px 46px rgba(0,0,0,.50);padding:8px;color:#e8f3ff;font-family:system-ui,sans-serif;font-size:12px}.rvm-visibility-snapshot-menu-title{padding:7px 8px;border-bottom:1px solid rgba(125,190,255,.16);font-weight:700}.rvm-visibility-snapshot-menu-title small{display:block;color:#93a9c8;font-weight:500;margin-top:2px}.rvm-visibility-snapshot-row{display:grid;grid-template-columns:1fr auto auto;gap:6px;align-items:center;padding:7px 4px;border-bottom:1px solid rgba(125,190,255,.10)}.rvm-visibility-snapshot-row strong{display:block;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rvm-visibility-snapshot-row small{display:block;color:#93a9c8;margin-top:2px}.rvm-visibility-snapshot-empty{padding:14px 8px;color:#93a9c8}.rvm-visibility-snapshot-footer{display:flex;gap:8px;justify-content:flex-end;padding-top:8px}.rvm-visibility-snapshot-menu button{border:1px solid rgba(125,190,255,.22);border-radius:7px;background:rgba(59,130,246,.14);color:#dbeafe;cursor:pointer;padding:5px 8px}.rvm-visibility-snapshot-menu button:hover{background:rgba(59,130,246,.26)}.rvm-visibility-snapshot-menu button.is-danger{border-color:rgba(248,113,113,.30);background:rgba(239,68,68,.13);color:#fecaca}
  `;
  document.head.appendChild(style);
  document.addEventListener('click', (event) => {
    if (!event.target?.closest?.(`#${MENU_ID}, .rvm-view-snapshot-tool-group`)) hideManager();
  }, true);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hideManager(); }, true);
}
