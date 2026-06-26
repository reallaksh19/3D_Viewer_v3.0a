const BRIDGE_VERSION = '20260621-rvm-isolate-visibility-toolbar-1';
const MAX_SELECTION_SCAN_OBJECTS = 80000;

export function installRvmVisibilityToolbarBridge() {
  if (typeof document === 'undefined') return;
  injectStyles();
  let attempts = 0;
  const attach = () => {
    attempts += 1;
    const root = rootEl();
    const liveViewer = viewer();
    if (root) {
      injectToolbar(root);
      forceSelectUi(root);
      publishVisibilityApi(root, liveViewer);
      updateToolbarState(root, liveViewer);
    }
    if ((!root || !liveViewer) && attempts < 180) setTimeout(attach, 300);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
  else attach();
  globalThis.addEventListener?.('rvm-model-loaded', () => setTimeout(() => {
    const root = rootEl();
    injectToolbar(root);
    publishVisibilityApi(root, viewer());
    updateToolbarState(root, viewer());
  }, 120));
}

function rootEl() { return document.querySelector('[data-rvm-viewer]'); }
function viewer() { return globalThis.__3D_RVM_VIEWER__ || null; }

function injectToolbar(root) {
  const ribbon = root?.querySelector?.('.geo-top-ribbon');
  if (!ribbon) return;
  let section = ribbon.querySelector('.rvm-visibility-tool-group');
  if (section?.dataset?.rvmVisibilityToolbar === BRIDGE_VERSION) return;
  if (!section) {
    section = document.createElement('div');
    section.className = 'rvm-ribbon-section rvm-tool-group rvm-visibility-tool-group';
    const search = ribbon.querySelector('.rvm-ribbon-search');
    ribbon.insertBefore(section, search || null);
  }
  section.dataset.rvmVisibilityToolbar = BRIDGE_VERSION;
  section.setAttribute('aria-label', 'RVM visibility tools');
  section.innerHTML = `
    <span class="rvm-ribbon-label">Visibility</span>
    <div class="rvm-ribbon-button-row">
      <button class="rvm-tool-btn" data-rvm-visibility-action="isolate-selection" type="button" title="Show only selected geometry" aria-label="Isolate selected geometry"><span aria-hidden="true">◉</span><span>Isolate</span></button>
      <button class="rvm-tool-btn" data-rvm-visibility-action="hide-selection" type="button" title="Hide selected geometry" aria-label="Hide selected geometry"><span aria-hidden="true">◌</span><span>Hide</span></button>
      <button class="rvm-tool-btn" data-rvm-visibility-action="show-all" type="button" title="Restore manually hidden/isolated geometry" aria-label="Show all manually hidden or isolated geometry"><span aria-hidden="true">◎</span><span>Show All</span></button>
      <button class="rvm-tool-btn" data-rvm-visibility-action="clear-selection" type="button" title="Clear selected geometry" aria-label="Clear selected geometry"><span aria-hidden="true">×</span><span>Clear</span></button>
      <button class="rvm-tool-btn" data-rvm-visibility-action="select-mode" data-rvm-force-select="true" type="button" title="Select mode / Esc" aria-label="Select mode"><span aria-hidden="true">⌖</span><span>Select</span></button>
    </div>
    <div class="rvm-visibility-summary" data-rvm-visibility-summary>Manual hide/isolate: 0</div>`;
  section.addEventListener('click', onToolbarClick, true);
}

function onToolbarClick(event) {
  const button = event.target?.closest?.('[data-rvm-visibility-action]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const root = rootEl();
  const v = viewer();
  const action = button.dataset.rvmVisibilityAction;
  if (action === 'isolate-selection') isolateSelection(root, v);
  else if (action === 'hide-selection') hideSelection(root, v);
  else if (action === 'show-all') showAll(root, v);
  else if (action === 'clear-selection') clearSelection(root, v);
  else if (action === 'select-mode') setSelectMode(root, v);
  updateToolbarState(root, v);
}

function publishVisibilityApi(root, v) {
  globalThis.__PCF_GLB_RVM_VISIBILITY__ = {
    version: BRIDGE_VERSION,
    collectSelectedObjects: () => collectSelectedObjects(viewer()),
    isolateSelection: () => isolateSelection(rootEl(), viewer()),
    hideSelection: () => hideSelection(rootEl(), viewer()),
    showAll: () => showAll(rootEl(), viewer()),
    clearSelection: () => clearSelection(rootEl(), viewer()),
    visibleStats: () => visibleStats(viewer()),
    updateToolbarState: () => updateToolbarState(rootEl(), viewer()),
  };
  if (root && v) updateToolbarState(root, v);
}

function collectSelectedObjects(v) {
  if (!v?.modelGroup) return [];
  const direct = Array.isArray(v._rvmCanvasSelectedMeshes)
    ? v._rvmCanvasSelectedMeshes.filter((obj) => isRenderable(obj))
    : [];
  if (direct.length) return uniqueObjects(direct);

  const ids = selectedIds(v);
  if (!ids.size) return [];
  const out = [];
  let scanned = 0;
  v.modelGroup.traverse?.((obj) => {
    if (!isRenderable(obj) || out.length >= MAX_SELECTION_SCAN_OBJECTS) return;
    scanned += 1;
    if (scanned > MAX_SELECTION_SCAN_OBJECTS) return;
    const aliases = aliasesFor(obj).map(normalizeAlias).filter(Boolean);
    if (aliases.some((alias) => ids.has(alias) || [...ids].some((id) => alias.includes(id) || id.includes(alias)))) out.push(obj);
  });
  return uniqueObjects(out);
}

function selectedIds(v) {
  const ids = new Set();
  for (const value of v?.selection?.getSelectedCanonicalIds?.() || []) ids.add(normalizeAlias(value));
  for (const value of v?.selection?.getSelectionRenderIds?.() || []) ids.add(normalizeAlias(value));
  for (const mesh of v?._rvmCanvasSelectedMeshes || []) {
    for (const value of aliasesFor(mesh)) ids.add(normalizeAlias(value));
  }
  ids.delete('');
  return ids;
}

function aliasesFor(obj) {
  const data = obj?.userData || {};
  const props = data.browserRvmProperties || {};
  const attrs = data.browserRvmAttributes || data.attributes || props.attributes || {};
  return [obj?.uuid, obj?.name, data.name, data.canonicalObjectId, data.sourceObjectId, data.sourcePath, data.sourceName, data.displayName, props.sourcePath, props.sourceName, props.displayName, attrs.NAME, attrs.RVM_OWNER_PATH, attrs.RVM_OWNER_NAME, attrs.RVM_REVIEW_NAME].filter(Boolean);
}

function isolateSelection(root, v) {
  const selected = collectSelectedObjects(v).filter((obj) => obj.visible !== false);
  if (!selected.length) {
    setStatus(root, 'Visibility: select a hierarchy/canvas object before isolate.', true);
    return false;
  }
  const selectedSet = new Set(selected);
  let hidden = 0;
  let shown = 0;
  v.modelGroup?.traverse?.((obj) => {
    if (!isRenderable(obj)) return;
    preserveBaseVisibility(obj);
    if (selectedSet.has(obj)) {
      obj.visible = true;
      delete obj.userData.rvmIsolatedHiddenByVisibilityToolbar;
      delete obj.userData.rvmHiddenByVisibilityToolbar;
      shown += 1;
    } else if (obj.userData.rvmVisibilityBaseVisible !== false) {
      obj.visible = false;
      obj.userData.rvmIsolatedHiddenByVisibilityToolbar = true;
      hidden += 1;
    }
  });
  v._rvmVisibilityMode = 'isolate';
  v.requestRender?.();
  setStatus(root, `Visibility: isolated ${shown} object(s), hidden ${hidden}.`);
  refreshDetails();
  return true;
}

function hideSelection(root, v) {
  const selected = collectSelectedObjects(v).filter((obj) => obj.visible !== false);
  if (!selected.length) {
    setStatus(root, 'Visibility: no visible selected object to hide.', true);
    return false;
  }
  for (const obj of selected) {
    preserveBaseVisibility(obj);
    obj.visible = false;
    obj.userData.rvmHiddenByVisibilityToolbar = true;
  }
  clearSelection(root, v, { keepStatus: true });
  v.requestRender?.();
  setStatus(root, `Visibility: hidden ${selected.length} selected object(s).`);
  return true;
}

function showAll(root, v) {
  if (!v?.modelGroup) return false;
  let restored = 0;
  v.modelGroup.traverse?.((obj) => {
    if (!isRenderable(obj)) return;
    if (obj.userData?.rvmHiddenByVisibilityToolbar || obj.userData?.rvmIsolatedHiddenByVisibilityToolbar || obj.userData?.rvmHiddenByUser || obj.userData?.rvmHiddenBySelectionDetails) {
      const baseVisible = obj.userData.rvmVisibilityBaseVisible !== false;
      obj.visible = baseVisible;
      delete obj.userData.rvmHiddenByVisibilityToolbar;
      delete obj.userData.rvmIsolatedHiddenByVisibilityToolbar;
      delete obj.userData.rvmHiddenByUser;
      delete obj.userData.rvmHiddenBySelectionDetails;
      restored += 1;
    }
  });
  v._rvmVisibilityMode = 'normal';
  v._rvmHiddenByUser?.clear?.();
  v.requestRender?.();
  setStatus(root, restored ? `Visibility: restored ${restored} manually hidden/isolated object(s).` : 'Visibility: no manually hidden objects.');
  refreshDetails();
  return true;
}

function clearSelection(root, v, options = {}) {
  try { globalThis.__PCF_GLB_RVM_INTERACTION__?.clearSelection?.(); }
  catch (_) {}
  try { v?.selection?.clearSelection?.(); } catch (_) {}
  if (v) v._rvmCanvasSelectedMeshes = [];
  root?.querySelectorAll?.('#rvm-tree li.is-selected').forEach((row) => row.classList.remove('is-selected'));
  updateSelectedCount(root, 0);
  if (!options.keepStatus) setStatus(root, 'Selection cleared.');
  refreshDetails();
  forceSelectUi(root);
  return true;
}

function setSelectMode(root, v) {
  const api = globalThis.__PCF_GLB_RVM_INTERACTION__;
  if (!api?.setMode?.('select')) v?.dispatchAction?.('NAV_SELECT');
  forceSelectUi(root);
  setStatus(root, 'Select mode.');
  return true;
}

function preserveBaseVisibility(obj) {
  obj.userData = obj.userData || {};
  if (!Object.prototype.hasOwnProperty.call(obj.userData, 'rvmVisibilityBaseVisible')) {
    obj.userData.rvmVisibilityBaseVisible = obj.visible !== false;
  }
}

function visibleStats(v) {
  const stats = { total: 0, visible: 0, hiddenManual: 0, isolatedHidden: 0 };
  v?.modelGroup?.traverse?.((obj) => {
    if (!isRenderable(obj)) return;
    stats.total += 1;
    if (obj.visible !== false) stats.visible += 1;
    if (obj.userData?.rvmHiddenByVisibilityToolbar || obj.userData?.rvmHiddenByUser || obj.userData?.rvmHiddenBySelectionDetails) stats.hiddenManual += 1;
    if (obj.userData?.rvmIsolatedHiddenByVisibilityToolbar) stats.isolatedHidden += 1;
  });
  return stats;
}

function updateToolbarState(root, v) {
  if (!root) return;
  const stats = visibleStats(v);
  const summary = root.querySelector('[data-rvm-visibility-summary]');
  if (summary) summary.textContent = `Visible ${stats.visible}/${stats.total} · hidden ${stats.hiddenManual} · isolate-hidden ${stats.isolatedHidden}`;
  const visibleChip = root.querySelector('[data-rvm-status-chip="visible"]');
  const objectsChip = root.querySelector('[data-rvm-status-chip="objects"]');
  if (visibleChip) visibleChip.textContent = `Visible: ${stats.visible}`;
  if (objectsChip) objectsChip.textContent = `Objects: ${stats.total}`;
  root.querySelectorAll('.rvm-visibility-tool-group [data-rvm-visibility-action]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.rvmVisibilityAction === 'select-mode' && (v?._rvmInteractionMode || v?._navMode || 'select') === 'select');
  });
}

function refreshDetails() {
  try { globalThis.__PCF_GLB_RVM_SELECTION_DETAILS_INSPECTOR__?.refresh?.({}, 'visibility-change'); }
  catch (_) {}
}

function updateSelectedCount(root, count) {
  const chip = root?.querySelector?.('[data-rvm-status-chip="selected"]');
  const footer = root?.querySelector?.('#rvm-sel-count');
  if (chip) chip.textContent = `Selected: ${count || 0}`;
  if (footer) footer.textContent = String(count || 0);
}

function forceSelectUi(root) {
  if (!root) return;
  root.querySelectorAll('[data-action]').forEach((button) => button.classList.toggle('is-active', button.dataset.action === 'NAV_SELECT'));
  root.querySelectorAll('[data-rvm-visibility-action="select-mode"]').forEach((button) => button.classList.add('is-active'));
  const chip = root.querySelector('#rvm-mode-chip');
  if (chip) chip.textContent = 'Select';
}

function setStatus(root, text, warning = false) {
  const el = root?.querySelector?.('#rvm-sb-msg');
  if (!el) return;
  el.textContent = text;
  el.style.color = warning ? '#ffcf70' : '';
}

function isRenderable(obj) { return Boolean(obj && (obj.isMesh || obj.isLine || obj.isPoints)); }
function uniqueObjects(values) { return Array.from(new Set((values || []).filter(Boolean))); }
function normalizeAlias(value) { return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

function injectStyles() {
  if (document.getElementById('rvm-visibility-toolbar-bridge-style')) return;
  const style = document.createElement('style');
  style.id = 'rvm-visibility-toolbar-bridge-style';
  style.textContent = `
    .rvm-visibility-tool-group .rvm-tool-btn span:last-child { font-size: 11px; }
    .rvm-tool-btn[data-rvm-visibility-action="isolate-selection"] span:first-child { color: #93c5fd; }
    .rvm-tool-btn[data-rvm-visibility-action="hide-selection"] span:first-child { color: #fca5a5; }
    .rvm-tool-btn[data-rvm-visibility-action="show-all"] span:first-child { color: #86efac; }
    .rvm-tool-btn[data-rvm-visibility-action="clear-selection"] span:first-child { color: #fcd34d; }
    .rvm-visibility-summary { margin-top: 3px; color: #94a3b8; font-size: 9.5px; white-space: nowrap; }
  `;
  document.head.appendChild(style);
}
