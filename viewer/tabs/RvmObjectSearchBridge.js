import * as THREE from 'three';

import { RuntimeEvents } from '../contracts/runtime-events.js';
import { emit } from '../core/event-bus.js';

const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-object-search-bridge-v1');
const BRIDGE_VERSION = '20260621-rvm-object-search-1';
const MAX_INDEX_OBJECTS = 80000;
const MAX_RESULTS = 500;
const MAX_SELECT_OBJECTS = 1500;

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function rootEl() {
  return typeof document === 'undefined' ? null : document.querySelector('[data-rvm-viewer]');
}

function viewer() {
  return globalThis.__3D_RVM_VIEWER__ || null;
}

function isRenderable(obj) {
  return Boolean(obj && (obj.isMesh || obj.isLine || obj.isPoints) && obj.userData?.pickable !== false);
}

function attrsFor(obj) {
  const data = obj?.userData || {};
  const props = data.browserRvmProperties || {};
  return data.browserRvmAttributes || data.attributes || props.attributes || data.rawAttributes || {};
}

function propsFor(obj) {
  return obj?.userData?.browserRvmProperties || {};
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

function objectId(obj) {
  const data = obj?.userData || {};
  return String(firstDefined(data.canonicalObjectId, data.name, data.sourceObjectId, obj?.name, obj?.uuid)).trim();
}

function objectLabel(obj) {
  const data = obj?.userData || {};
  const props = propsFor(obj);
  const attrs = attrsFor(obj);
  return String(firstDefined(data.displayName, data.sourceName, props.displayName, props.sourceName, attrs.RVM_REVIEW_NAME, attrs.NAME, obj?.name, objectId(obj), 'RVM object')).trim();
}

function objectPath(obj) {
  const data = obj?.userData || {};
  const props = propsFor(obj);
  const attrs = attrsFor(obj);
  return String(firstDefined(data.sourcePath, props.sourcePath, props.SourcePath, attrs.RVM_OWNER_PATH, attrs.RVM_OWNER_NAME, data.sourceName, data.displayName, obj?.name)).trim();
}

function objectKind(obj) {
  const data = obj?.userData || {};
  const attrs = attrsFor(obj);
  return String(firstDefined(data.type, data.kind, attrs.TYPE, attrs.RVM_TYPE, data.effectiveRenderPrimitive, data.renderPrimitive, attrs.RVM_BROWSER_RENDER_PRIMITIVE, 'NODE')).toUpperCase();
}

function objectPrimitive(obj) {
  const data = obj?.userData || {};
  const attrs = attrsFor(obj);
  return String(firstDefined(data.effectiveRenderPrimitive, data.renderPrimitive, attrs.RVM_BROWSER_RENDER_PRIMITIVE, attrs.RVM_PRIMITIVE_KIND, attrs.RVM_PRIMITIVE_CODE, '')).toUpperCase();
}

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function boxForObjects(objects = []) {
  const box = new THREE.Box3();
  let any = false;
  for (const obj of objects) {
    if (!obj) continue;
    try {
      const itemBox = new THREE.Box3().setFromObject(obj);
      if (itemBox && !itemBox.isEmpty()) {
        box.union(itemBox);
        any = true;
      }
    } catch (_) {}
  }
  return any ? box : null;
}

function setStatus(root, text, warning = false) {
  const el = root?.querySelector?.('#rvm-sb-msg');
  if (!el) return;
  el.textContent = text;
  el.style.color = warning ? '#ffcf70' : '';
}

function buildObjectSearchIndex(v = viewer()) {
  const entries = [];
  let scanned = 0;
  v?.modelGroup?.traverse?.((obj) => {
    if (!isRenderable(obj)) return;
    scanned += 1;
    if (entries.length >= MAX_INDEX_OBJECTS) return;
    const label = objectLabel(obj);
    const path = objectPath(obj);
    const kind = objectKind(obj);
    const primitive = objectPrimitive(obj);
    const id = objectId(obj);
    const text = normalize(`${id} ${label} ${path} ${kind} ${primitive}`);
    entries.push({ id, label, path, kind, primitive, text, object: obj });
  });
  return {
    version: BRIDGE_VERSION,
    entries,
    indexed: entries.length,
    scanned,
    capped: scanned > entries.length,
    builtAt: new Date().toISOString(),
  };
}

function ensureIndex(root = rootEl()) {
  if (!root) return buildObjectSearchIndex(viewer());
  const v = viewer();
  const currentCount = countRenderableObjects(v);
  const existing = root.__rvmObjectSearchIndex;
  if (existing && existing.renderableCount === currentCount) return existing;
  const next = buildObjectSearchIndex(v);
  next.renderableCount = currentCount;
  root.__rvmObjectSearchIndex = next;
  updateSummary(root, next);
  return next;
}

function countRenderableObjects(v = viewer()) {
  let count = 0;
  v?.modelGroup?.traverse?.((obj) => { if (isRenderable(obj)) count += 1; });
  return count;
}

function searchEntries(query = '', options = {}) {
  const root = rootEl();
  const q = normalize(query);
  const index = ensureIndex(root);
  const visibleOnly = options.visibleOnly !== false;
  const kindFilter = normalize(options.kind || '');
  const out = [];
  for (const entry of index.entries) {
    if (visibleOnly && entry.object?.visible === false) continue;
    if (kindFilter && kindFilter !== 'all' && !normalize(`${entry.kind} ${entry.primitive}`).includes(kindFilter)) continue;
    if (q && !entry.text.includes(q)) continue;
    out.push(entry);
    if (out.length >= MAX_RESULTS) break;
  }
  return { entries: out, index, capped: out.length >= MAX_RESULTS };
}

function selectedPayload(objects = []) {
  const ids = objects.map(objectId).filter(Boolean);
  return {
    canonicalIds: ids,
    renderObjectIds: ids,
    source: 'rvm-object-search',
    reason: 'object-search-selection',
  };
}

function selectObjects(objects = [], options = {}) {
  const root = rootEl();
  const v = viewer();
  const selected = objects.filter(Boolean).slice(0, MAX_SELECT_OBJECTS);
  if (!v || !selected.length) {
    setStatus(root, 'Find: no object result selected.', true);
    return false;
  }
  const ids = selected.map(objectId).filter(Boolean);
  v._rvmCanvasSelectedMeshes = selected;
  try { v.selection?.selectCanonicalIds?.(ids, { additive: false }); } catch (_) {}
  emit(RuntimeEvents.RVM_NODE_SELECTED, selectedPayload(selected));
  try { globalThis.__PCF_GLB_RVM_SELECTION_DETAILS_INSPECTOR__?.refresh?.(selectedPayload(selected), 'object-search'); } catch (_) {}
  if (options.fit) fitObjects(selected);
  updateSelectedCount(root, selected.length);
  setStatus(root, `Find: selected ${selected.length}${objects.length > selected.length ? '+' : ''} object(s).`);
  return true;
}

function fitObjects(objects = []) {
  const v = viewer();
  const box = boxForObjects(objects.filter((obj) => obj?.visible !== false));
  if (box && !box.isEmpty()) {
    try {
      if (typeof v?._fitBox === 'function') {
        v._fitBox(box);
        v.requestRender?.();
        return true;
      }
    } catch (_) {}
  }
  try { v?.fitSelection?.(); v?.requestRender?.(); return true; } catch (_) {}
  return false;
}

function updateSelectedCount(root, count) {
  const chip = root?.querySelector?.('[data-rvm-status-chip="selected"]');
  const footer = root?.querySelector?.('#rvm-sel-count');
  if (chip) chip.textContent = `Selected: ${count || 0}`;
  if (footer) footer.textContent = String(count || 0);
}

function hideObjects(objects = []) {
  const selected = objects.filter((obj) => obj?.visible !== false);
  for (const obj of selected) {
    obj.userData = obj.userData || {};
    if (!Object.prototype.hasOwnProperty.call(obj.userData, 'rvmVisibilityBaseVisible')) obj.userData.rvmVisibilityBaseVisible = obj.visible !== false;
    obj.visible = false;
    obj.userData.rvmHiddenByObjectSearch = true;
    obj.userData.rvmHiddenByUser = true;
  }
  viewer()?.requestRender?.();
  try { globalThis.__PCF_GLB_RVM_VISIBILITY__?.updateToolbarState?.(); } catch (_) {}
  return selected.length;
}

function copyText(text) {
  try { navigator.clipboard?.writeText?.(String(text || '')); return true; } catch (_) { return false; }
}

function injectToolbar(root) {
  const ribbon = root?.querySelector?.('.geo-top-ribbon');
  if (!ribbon) return;
  let section = ribbon.querySelector('.rvm-object-search-tool-group');
  if (section?.dataset?.rvmObjectSearch === BRIDGE_VERSION) return;
  if (!section) {
    section = document.createElement('div');
    section.className = 'rvm-ribbon-section rvm-tool-group rvm-object-search-tool-group';
    const visibility = ribbon.querySelector('.rvm-visibility-tool-group');
    ribbon.insertBefore(section, visibility || ribbon.querySelector('.rvm-ribbon-search') || null);
  }
  section.dataset.rvmObjectSearch = BRIDGE_VERSION;
  section.innerHTML = `
    <span class="rvm-ribbon-label">Find</span>
    <div class="rvm-ribbon-button-row">
      <button type="button" class="rvm-tool-btn" data-rvm-object-search-open="true" title="Search rendered RVM object names, hierarchy paths and primitive types"><span aria-hidden="true">⌕</span><span>Objects</span></button>
      <button type="button" class="rvm-tool-btn" data-rvm-object-search-reindex="true" title="Rebuild object search index"><span aria-hidden="true">↻</span><span>Index</span></button>
    </div>
    <div class="rvm-object-search-summary" data-rvm-object-search-summary>Find index: pending</div>`;
}

function ensureDialog() {
  let dialog = document.getElementById('rvm-object-search-dialog');
  if (dialog) return dialog;
  dialog = document.createElement('div');
  dialog.id = 'rvm-object-search-dialog';
  dialog.className = 'rvm-object-search-dialog';
  dialog.setAttribute('aria-hidden', 'true');
  dialog.innerHTML = `
    <div class="rvm-object-search-card" role="dialog" aria-modal="false" aria-label="Find RVM objects">
      <div class="rvm-object-search-head">
        <div><b>Find RVM Objects</b><small>${esc(BRIDGE_VERSION)}</small></div>
        <button type="button" data-rvm-object-search-close="true" aria-label="Close object search">×</button>
      </div>
      <div class="rvm-object-search-controls">
        <input type="search" data-rvm-object-search-query placeholder="Search review name, hierarchy path, type, primitive…" autocomplete="off">
        <select data-rvm-object-search-kind title="Filter result kind">
          <option value="all">All kinds</option>
          <option value="branch">Branch/path</option>
          <option value="structure">Structure</option>
          <option value="pipe">Pipe/cylinder</option>
          <option value="facet">Facet/native</option>
          <option value="bbox">Fallback/bbox</option>
        </select>
        <label><input type="checkbox" data-rvm-object-search-visible checked> Visible only</label>
      </div>
      <div class="rvm-object-search-result-summary" data-rvm-object-search-result-summary>Type to search the loaded RVM model.</div>
      <div class="rvm-object-search-results" data-rvm-object-search-results></div>
    </div>`;
  document.body.appendChild(dialog);
  bindDialog(dialog);
  return dialog;
}

function openDialog() {
  const root = rootEl();
  const dialog = ensureDialog();
  ensureIndex(root);
  dialog.classList.add('is-open');
  dialog.setAttribute('aria-hidden', 'false');
  setTimeout(() => dialog.querySelector('[data-rvm-object-search-query]')?.focus(), 0);
  renderResults(dialog);
}

function closeDialog() {
  const dialog = document.getElementById('rvm-object-search-dialog');
  if (!dialog) return;
  dialog.classList.remove('is-open');
  dialog.setAttribute('aria-hidden', 'true');
}

function renderResults(dialog = ensureDialog()) {
  const query = dialog.querySelector('[data-rvm-object-search-query]')?.value || '';
  const visibleOnly = dialog.querySelector('[data-rvm-object-search-visible]')?.checked !== false;
  const kind = dialog.querySelector('[data-rvm-object-search-kind]')?.value || 'all';
  const { entries, index, capped } = searchEntries(query, { visibleOnly, kind });
  const resultsEl = dialog.querySelector('[data-rvm-object-search-results]');
  const summary = dialog.querySelector('[data-rvm-object-search-result-summary]');
  if (summary) summary.textContent = `${entries.length}${capped ? '+' : ''} result(s) · ${index.indexed}${index.capped ? '+' : ''} indexed object(s)${visibleOnly ? ' · visible only' : ''}`;
  if (!resultsEl) return;
  resultsEl.innerHTML = entries.map((entry, index) => resultRowHtml(entry, index)).join('') || '<div class="rvm-empty-state">No matching rendered object.</div>';
}

function resultRowHtml(entry, index) {
  const visible = entry.object?.visible !== false;
  return `
    <div class="rvm-object-search-result ${visible ? '' : 'is-hidden'}" data-rvm-object-search-result-index="${index}">
      <button type="button" data-rvm-object-search-action="select" title="Select result">
        <span class="rvm-object-search-kind">${esc(entry.kind || '-')}</span>
        <b>${esc(entry.label || entry.id || 'RVM object')}</b>
        <small>${esc(entry.path || '-')}</small>
      </button>
      <div class="rvm-object-search-actions">
        <button type="button" data-rvm-object-search-action="fit">Fit</button>
        <button type="button" data-rvm-object-search-action="isolate">Isolate</button>
        <button type="button" data-rvm-object-search-action="hide">Hide</button>
        <button type="button" data-rvm-object-search-action="copy-path">Copy</button>
      </div>
    </div>`;
}

function currentResults(dialog) {
  const query = dialog.querySelector('[data-rvm-object-search-query]')?.value || '';
  const visibleOnly = dialog.querySelector('[data-rvm-object-search-visible]')?.checked !== false;
  const kind = dialog.querySelector('[data-rvm-object-search-kind]')?.value || 'all';
  return searchEntries(query, { visibleOnly, kind }).entries;
}

function bindDialog(dialog) {
  dialog.addEventListener('input', (event) => {
    if (event.target?.matches?.('[data-rvm-object-search-query], [data-rvm-object-search-visible]')) renderResults(dialog);
  }, true);
  dialog.addEventListener('change', (event) => {
    if (event.target?.matches?.('[data-rvm-object-search-kind], [data-rvm-object-search-visible]')) renderResults(dialog);
  }, true);
  dialog.addEventListener('click', (event) => {
    if (event.target?.closest?.('[data-rvm-object-search-close]')) {
      closeDialog();
      return;
    }
    const actionEl = event.target?.closest?.('[data-rvm-object-search-action]');
    if (!actionEl) return;
    const row = actionEl.closest('[data-rvm-object-search-result-index]');
    const index = Number(row?.dataset?.rvmObjectSearchResultIndex);
    const entry = currentResults(dialog)[index];
    if (!entry) return;
    const root = rootEl();
    const action = actionEl.dataset.rvmObjectSearchAction;
    if (action === 'select') selectObjects([entry.object]);
    else if (action === 'fit') selectObjects([entry.object], { fit: true });
    else if (action === 'isolate') {
      selectObjects([entry.object]);
      globalThis.__PCF_GLB_RVM_VISIBILITY__?.isolateSelection?.();
    } else if (action === 'hide') {
      const count = hideObjects([entry.object]);
      setStatus(root, count ? `Find: hidden ${count} object.` : 'Find: result already hidden.', !count);
      ensureIndex(root);
      renderResults(dialog);
    } else if (action === 'copy-path') {
      setStatus(root, copyText(entry.path) ? 'Find: copied object path.' : 'Find: copy path unavailable.', !entry.path);
    }
  }, true);
}

function updateSummary(root, index = root?.__rvmObjectSearchIndex) {
  const summary = root?.querySelector?.('[data-rvm-object-search-summary]');
  if (!summary) return;
  if (!index) summary.textContent = 'Find index: pending';
  else summary.textContent = `Find index: ${index.indexed}${index.capped ? '+' : ''} objects`;
}

function onDocumentClick(event) {
  const root = rootEl();
  if (event.target?.closest?.('[data-rvm-object-search-open]')) {
    event.preventDefault();
    event.stopPropagation();
    openDialog();
    return;
  }
  if (event.target?.closest?.('[data-rvm-object-search-reindex]')) {
    event.preventDefault();
    event.stopPropagation();
    root.__rvmObjectSearchIndex = null;
    const index = ensureIndex(root);
    setStatus(root, `Find: indexed ${index.indexed}${index.capped ? '+' : ''} rendered object(s).`);
  }
}

function attach() {
  const root = rootEl();
  if (!root) return false;
  injectToolbar(root);
  updateSummary(root, root.__rvmObjectSearchIndex);
  return true;
}

function injectStyles() {
  if (document.getElementById('rvm-object-search-bridge-style')) return;
  const style = document.createElement('style');
  style.id = 'rvm-object-search-bridge-style';
  style.textContent = `
    .rvm-object-search-tool-group .rvm-tool-btn span:last-child{font-size:11px}.rvm-object-search-summary{margin-top:3px;color:#94a3b8;font-size:9.5px;white-space:nowrap}
    .rvm-object-search-dialog{position:fixed;inset:0;display:none;align-items:flex-start;justify-content:center;padding-top:82px;background:rgba(2,6,23,.40);z-index:12000}.rvm-object-search-dialog.is-open{display:flex}
    .rvm-object-search-card{width:min(760px,calc(100vw - 44px));max-height:min(720px,calc(100vh - 120px));display:grid;grid-template-rows:auto auto auto minmax(0,1fr);gap:8px;border:1px solid rgba(126,190,255,.28);border-radius:12px;background:#0b1424;box-shadow:0 22px 70px rgba(0,0,0,.48);padding:12px;color:#dbeafe}
    .rvm-object-search-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.rvm-object-search-head b{font-size:14px;color:#bfdbfe}.rvm-object-search-head small{display:block;color:#7f94b7;font-size:9px}.rvm-object-search-head button{border:1px solid rgba(148,163,184,.28);background:#111827;color:#e5e7eb;border-radius:7px;width:28px;height:26px}
    .rvm-object-search-controls{display:grid;grid-template-columns:minmax(0,1fr) 132px auto;gap:8px;align-items:center}.rvm-object-search-controls input,.rvm-object-search-controls select{min-width:0;border:1px solid rgba(126,190,255,.24);border-radius:7px;background:#111827;color:#e5e7eb;padding:7px 8px}.rvm-object-search-controls label{font-size:11px;color:#bcd8ff;white-space:nowrap}
    .rvm-object-search-result-summary{color:#9eb7d8;font-size:11px}.rvm-object-search-results{overflow:auto;display:grid;gap:5px;padding-right:2px}.rvm-object-search-result{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:center;border:1px solid rgba(126,190,255,.14);border-radius:8px;background:rgba(255,255,255,.035);padding:5px}.rvm-object-search-result.is-hidden{opacity:.58}.rvm-object-search-result>button{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 6px;align-items:center;border:0;background:transparent;color:#e2e8f0;text-align:left;padding:0}.rvm-object-search-result b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.rvm-object-search-result small{grid-column:1/-1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#8ea8c8;font-size:10px}.rvm-object-search-kind{font-size:8px;border-radius:999px;padding:2px 5px;background:#20324c;color:#bfdbfe}.rvm-object-search-actions{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}.rvm-object-search-actions button{border:1px solid rgba(148,163,184,.24);background:#111827;color:#dbeafe;border-radius:5px;padding:4px 6px;font-size:10px}
  `;
  document.head.appendChild(style);
}

export function installRvmObjectSearchBridge() {
  if (typeof document === 'undefined') return;
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;
  injectStyles();
  document.addEventListener('click', onDocumentClick, true);
  let attempts = 0;
  const waitAttach = () => {
    attempts += 1;
    const ok = attach();
    if (!ok && attempts < 180) setTimeout(waitAttach, 300);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitAttach, { once: true });
  else waitAttach();
  globalThis.addEventListener?.('rvm-model-loaded', () => setTimeout(() => {
    const root = rootEl();
    if (!root) return;
    root.__rvmObjectSearchIndex = buildObjectSearchIndex(viewer());
    root.__rvmObjectSearchIndex.renderableCount = countRenderableObjects(viewer());
    attach();
    updateSummary(root, root.__rvmObjectSearchIndex);
  }, 260));
  globalThis.__PCF_GLB_RVM_OBJECT_SEARCH__ = {
    version: BRIDGE_VERSION,
    open: openDialog,
    rebuildIndex: () => {
      const root = rootEl();
      if (root) root.__rvmObjectSearchIndex = null;
      return ensureIndex(root);
    },
    search: (query, options) => searchEntries(query, options),
    selectObjects,
  };
}
