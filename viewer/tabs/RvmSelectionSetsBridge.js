import * as THREE from 'three';

import { RuntimeEvents } from '../contracts/runtime-events.js';
import { emit } from '../core/event-bus.js';

const BRIDGE_VERSION = '20260621-rvm-selection-sets-1';
const STORAGE_PREFIX = 'rvm_selection_sets_v1:';
const MAX_SELECTION_SETS = 24;
const MAX_SET_OBJECT_IDS = 5000;
const MAX_SCAN_OBJECTS = 100000;
const MENU_ID = 'rvm-selection-sets-menu';

export function installRvmSelectionSetsBridge() {
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
  }, 160));
}

function rootEl() { return document.querySelector('[data-rvm-viewer]'); }
function viewer() { return globalThis.__3D_RVM_VIEWER__ || null; }
function isRenderable(obj) { return Boolean(obj && (obj.isMesh || obj.isLine || obj.isPoints)); }
function unique(values) { return Array.from(new Set((values || []).filter(Boolean))); }
function norm(value) { return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function stableHash(text = '') {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
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

function readSets(root = rootEl()) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(root)) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
  } catch {
    return [];
  }
}

function writeSets(root, sets) {
  const normalized = (Array.isArray(sets) ? sets : []).slice(0, MAX_SELECTION_SETS);
  try { localStorage.setItem(storageKey(root), JSON.stringify(normalized)); } catch {}
  updateSummary(root);
}

function attrsFor(obj) {
  const data = obj?.userData || {};
  const props = data.browserRvmProperties || {};
  return data.browserRvmAttributes || data.attributes || props.attributes || data.rawAttributes || {};
}

function propsFor(obj) { return obj?.userData?.browserRvmProperties || {}; }

function objectId(obj) {
  const data = obj?.userData || {};
  const props = propsFor(obj);
  const attrs = attrsFor(obj);
  return String(
    data.canonicalObjectId
    || data.sourceObjectId
    || data.sourcePath
    || props.sourcePath
    || attrs.RVM_OWNER_PATH
    || attrs.RVM_REVIEW_NAME
    || data.name
    || obj?.name
    || obj?.uuid
    || ''
  ).trim();
}

function displayNameFor(obj) {
  const data = obj?.userData || {};
  const props = propsFor(obj);
  const attrs = attrsFor(obj);
  return String(data.displayName || data.sourceName || props.displayName || attrs.RVM_REVIEW_NAME || attrs.NAME || obj?.name || objectId(obj) || '-').trim();
}

function sourcePathFor(obj) {
  const data = obj?.userData || {};
  const props = propsFor(obj);
  const attrs = attrsFor(obj);
  return String(data.sourcePath || props.sourcePath || attrs.RVM_OWNER_PATH || attrs.RVM_OWNER_NAME || data.displayName || obj?.name || '').trim();
}

function aliasesFor(obj) {
  const data = obj?.userData || {};
  const props = propsFor(obj);
  const attrs = attrsFor(obj);
  return [
    objectId(obj), obj?.uuid, obj?.name, data.name, data.canonicalObjectId, data.sourceObjectId,
    data.sourcePath, data.sourceName, data.displayName, props.sourcePath, props.sourceName,
    props.displayName, attrs.NAME, attrs.RVM_OWNER_PATH, attrs.RVM_OWNER_NAME, attrs.RVM_REVIEW_NAME,
  ].filter(Boolean);
}

function collectSelectedObjects() {
  const fromVisibility = globalThis.__PCF_GLB_RVM_VISIBILITY__?.collectSelectedObjects?.();
  if (Array.isArray(fromVisibility) && fromVisibility.length) return unique(fromVisibility.filter(isRenderable));
  const v = viewer();
  const direct = Array.isArray(v?._rvmCanvasSelectedMeshes) ? v._rvmCanvasSelectedMeshes.filter(isRenderable) : [];
  return unique(direct);
}

function commonPrefix(values = []) {
  const clean = values.map((value) => String(value || '').replace(/\\/g, '/').split('/').filter(Boolean)).filter((parts) => parts.length);
  if (!clean.length) return '';
  const out = [];
  for (let i = 0; i < clean[0].length; i += 1) {
    const part = clean[0][i];
    if (clean.every((parts) => parts[i] === part)) out.push(part);
    else break;
  }
  return out.length ? `/${out.join('/')}` : '';
}

function captureSelectionSet(name = '', root = rootEl()) {
  const selected = collectSelectedObjects();
  if (!selected.length) {
    setStatus(root, 'Selection set: select hierarchy/search/canvas objects before saving.', true);
    return null;
  }
  const proposed = String(name || window.prompt?.('Save selected RVM objects as:', 'Selection set') || '').trim();
  if (!proposed) return null;
  const ids = unique(selected.map(objectId)).slice(0, MAX_SET_OBJECT_IDS);
  const paths = unique(selected.map(sourcePathFor).filter(Boolean)).slice(0, 40);
  const set = {
    schema: 'rvm-selection-set/v1',
    version: BRIDGE_VERSION,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: proposed.slice(0, 80),
    fileKey: fileKey(root),
    createdAt: new Date().toISOString(),
    count: selected.length,
    savedIds: ids,
    truncated: selected.length > ids.length,
    firstName: displayNameFor(selected[0]),
    sourcePrefix: commonPrefix(paths) || paths[0] || '',
  };
  const sets = readSets(root).filter((item) => item?.name !== set.name);
  sets.unshift(set);
  writeSets(root, sets.slice(0, MAX_SELECTION_SETS));
  setStatus(root, `Saved RVM selection set "${set.name}" (${ids.length}${set.truncated ? '+ truncated' : ''}).`, set.truncated);
  return set;
}

function matchObjectsForSet(setOrId, root = rootEl()) {
  const v = viewer();
  if (!v?.modelGroup) return [];
  const sets = readSets(root);
  const set = typeof setOrId === 'string' ? sets.find((item) => item.id === setOrId) : setOrId;
  const wanted = new Set((set?.savedIds || []).map(norm).filter(Boolean));
  if (!wanted.size) return [];
  const matches = [];
  let scanned = 0;
  v.modelGroup.traverse?.((obj) => {
    if (!isRenderable(obj) || matches.length >= MAX_SET_OBJECT_IDS) return;
    scanned += 1;
    if (scanned > MAX_SCAN_OBJECTS) return;
    const aliases = aliasesFor(obj).map(norm).filter(Boolean);
    if (aliases.some((alias) => wanted.has(alias))) matches.push(obj);
  });
  return unique(matches);
}

function selectObjects(objects = [], root = rootEl(), reason = 'selection-set') {
  const v = viewer();
  const selected = unique(objects.filter(isRenderable)).slice(0, MAX_SET_OBJECT_IDS);
  if (!v || !selected.length) {
    setStatus(root, 'Selection set: no matching rendered objects found.', true);
    return [];
  }
  try { v.selection?.clearSelection?.(); } catch {}
  v._rvmCanvasSelectedMeshes = selected;
  const ids = selected.map(objectId).filter(Boolean);
  emit(RuntimeEvents.RVM_NODE_SELECTED, {
    source: 'rvm-selection-set',
    reason,
    canonicalIds: ids,
    renderObjectIds: ids,
  });
  updateSelectedCount(root, selected.length);
  globalThis.__PCF_GLB_RVM_SELECTION_DETAILS_INSPECTOR__?.refresh?.({ canonicalIds: ids, renderObjectIds: ids }, reason);
  v.requestRender?.();
  return selected;
}

function boxForObjects(objects = []) {
  const box = new THREE.Box3();
  let any = false;
  for (const obj of objects) {
    try {
      const itemBox = new THREE.Box3().setFromObject(obj);
      if (itemBox && !itemBox.isEmpty()) {
        box.union(itemBox);
        any = true;
      }
    } catch {}
  }
  return any ? box : null;
}

function fitObjects(objects = []) {
  const v = viewer();
  const box = boxForObjects(objects.filter((obj) => obj?.visible !== false));
  if (box && !box.isEmpty()) {
    try {
      if (typeof v?._fitBox === 'function') {
        v._fitBox(box);
        return true;
      }
    } catch {}
  }
  try { v?.fitSelection?.(); return true; } catch {}
  return false;
}

function applySetAction(setOrId, action = 'select', root = rootEl()) {
  const objects = matchObjectsForSet(setOrId, root);
  const selected = selectObjects(objects, root, `selection-set-${action}`);
  if (!selected.length) return { selected: 0 };
  if (action === 'fit') fitObjects(selected);
  else if (action === 'isolate') globalThis.__PCF_GLB_RVM_VISIBILITY__?.isolateSelection?.();
  else if (action === 'hide') globalThis.__PCF_GLB_RVM_VISIBILITY__?.hideSelection?.();
  setStatus(root, `Selection set: ${action} ${selected.length} object(s).`);
  return { selected: selected.length, action };
}

function restoreLastSet(root = rootEl()) {
  const sets = readSets(root);
  return applySetAction(sets[0], 'select', root);
}

function deleteSet(root, id) {
  const next = readSets(root).filter((item) => item.id !== id);
  writeSets(root, next);
  showManager(root);
}

function injectToolbar(root) {
  const ribbon = root?.querySelector?.('.geo-top-ribbon');
  if (!ribbon) return;
  let section = ribbon.querySelector('.rvm-selection-set-tool-group');
  if (section?.dataset?.rvmSelectionSets === BRIDGE_VERSION) return;
  if (!section) {
    section = document.createElement('div');
    section.className = 'rvm-ribbon-section rvm-tool-group rvm-selection-set-tool-group';
    const views = ribbon.querySelector('.rvm-view-snapshot-tool-group');
    if (views?.nextSibling) ribbon.insertBefore(section, views.nextSibling);
    else ribbon.insertBefore(section, ribbon.querySelector('.rvm-ribbon-search') || null);
  }
  section.dataset.rvmSelectionSets = BRIDGE_VERSION;
  section.setAttribute('aria-label', 'RVM selection sets');
  section.innerHTML = `
    <span class="rvm-ribbon-label">Sets</span>
    <div class="rvm-ribbon-button-row">
      <button class="rvm-tool-btn" data-rvm-selection-set-action="save" type="button" title="Save current RVM selection as a named set"><span aria-hidden="true">＋</span><span>Save Set</span></button>
      <button class="rvm-tool-btn" data-rvm-selection-set-action="restore-last" type="button" title="Restore latest saved selection set"><span aria-hidden="true">↺</span><span>Restore</span></button>
      <button class="rvm-tool-btn" data-rvm-selection-set-action="manage" type="button" title="Manage saved selection sets"><span aria-hidden="true">☑</span><span>Manage</span></button>
    </div>
    <div class="rvm-selection-set-summary" data-rvm-selection-set-summary>Selection sets: 0</div>`;
  section.addEventListener('click', onToolbarClick, true);
}

function onToolbarClick(event) {
  const button = event.target?.closest?.('[data-rvm-selection-set-action]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const root = rootEl();
  const action = button.dataset.rvmSelectionSetAction;
  if (action === 'save') captureSelectionSet('', root);
  else if (action === 'restore-last') restoreLastSet(root);
  else if (action === 'manage') showManager(root);
}

function showManager(root = rootEl()) {
  hideManager();
  if (!root) return;
  const sets = readSets(root);
  const menu = document.createElement('div');
  menu.id = MENU_ID;
  menu.className = 'rvm-selection-set-menu';
  const anchor = root.querySelector('.rvm-selection-set-tool-group')?.getBoundingClientRect?.();
  menu.style.left = `${Math.max(12, Math.min(anchor?.left || 260, window.innerWidth - 420))}px`;
  menu.style.top = `${Math.max(48, Math.min((anchor?.bottom || 86) + 8, window.innerHeight - 320))}px`;
  menu.innerHTML = `
    <div class="rvm-selection-set-menu-title">RVM Selection Sets <small>${sets.length}/${MAX_SELECTION_SETS} for current file</small></div>
    ${sets.length ? sets.map((item) => `
      <div class="rvm-selection-set-row" data-rvm-selection-set-id="${esc(item.id)}">
        <div><strong>${esc(item.name)}</strong><small>${esc(item.count || item.savedIds?.length || 0)} saved · ${esc(item.firstName || '')}${item.sourcePrefix ? ` · ${esc(item.sourcePrefix)}` : ''}${item.truncated ? ' · truncated' : ''}</small></div>
        <button type="button" data-rvm-selection-set-menu-action="select">Select</button>
        <button type="button" data-rvm-selection-set-menu-action="fit">Fit</button>
        <button type="button" data-rvm-selection-set-menu-action="isolate">Isolate</button>
        <button type="button" data-rvm-selection-set-menu-action="hide">Hide</button>
        <button type="button" data-rvm-selection-set-menu-action="delete" class="is-danger">Delete</button>
      </div>`).join('') : '<div class="rvm-selection-set-empty">No saved selection sets for this RVM file yet.</div>'}
    <div class="rvm-selection-set-footer"><button type="button" data-rvm-selection-set-menu-action="save-new">Save current selection</button><button type="button" data-rvm-selection-set-menu-action="clear-all" class="is-danger">Clear all</button></div>`;
  document.body.appendChild(menu);
  menu.addEventListener('click', (event) => {
    const action = event.target?.closest?.('[data-rvm-selection-set-menu-action]')?.dataset?.rvmSelectionSetMenuAction;
    if (!action) return;
    event.preventDefault();
    const row = event.target.closest('[data-rvm-selection-set-id]');
    const id = row?.dataset?.rvmSelectionSetId;
    if (['select', 'fit', 'isolate', 'hide'].includes(action)) applySetAction(id, action, root);
    else if (action === 'delete') deleteSet(root, id);
    else if (action === 'save-new') { hideManager(); captureSelectionSet('', root); }
    else if (action === 'clear-all') { writeSets(root, []); hideManager(); setStatus(root, 'Cleared all RVM selection sets for this file.'); }
  });
}

function hideManager() { document.getElementById(MENU_ID)?.remove(); }

function updateSummary(root = rootEl()) {
  const summary = root?.querySelector?.('[data-rvm-selection-set-summary]');
  if (!summary) return;
  const sets = readSets(root);
  summary.textContent = sets.length ? `Selection sets: ${sets.length} · latest ${sets[0]?.name || ''}` : 'Selection sets: 0';
}

function updateSelectedCount(root, count) {
  const chip = root?.querySelector?.('[data-rvm-status-chip="selected"]');
  const footer = root?.querySelector?.('#rvm-sel-count');
  if (chip) chip.textContent = `Selected: ${count || 0}`;
  if (footer) footer.textContent = String(count || 0);
}

function setStatus(root, text, warning = false) {
  const el = root?.querySelector?.('#rvm-sb-msg');
  if (!el) return;
  el.textContent = text;
  el.style.color = warning ? '#ffcf70' : '';
}

function publishApi() {
  globalThis.__PCF_GLB_RVM_SELECTION_SETS__ = {
    version: BRIDGE_VERSION,
    listSets: () => readSets(rootEl()),
    captureSelectionSet: (name) => captureSelectionSet(name, rootEl()),
    selectSet: (id) => applySetAction(id, 'select', rootEl()),
    fitSet: (id) => applySetAction(id, 'fit', rootEl()),
    isolateSet: (id) => applySetAction(id, 'isolate', rootEl()),
    hideSet: (id) => applySetAction(id, 'hide', rootEl()),
    matchObjectsForSet: (id) => matchObjectsForSet(id, rootEl()),
    storageKey: () => storageKey(rootEl()),
  };
}

function injectStyles() {
  if (document.getElementById('rvm-selection-sets-style')) return;
  const style = document.createElement('style');
  style.id = 'rvm-selection-sets-style';
  style.textContent = `
    .rvm-selection-set-tool-group .rvm-tool-btn span:last-child{font-size:11px}.rvm-selection-set-summary{margin-top:3px;color:#94a3b8;font-size:9.5px;white-space:nowrap;max-width:210px;overflow:hidden;text-overflow:ellipsis}.rvm-selection-set-menu{position:fixed;z-index:100000;min-width:420px;max-width:min(720px,calc(100vw - 24px));background:#0f172a;border:1px solid rgba(125,190,255,.35);border-radius:12px;box-shadow:0 18px 46px rgba(0,0,0,.50);padding:8px;color:#e8f3ff;font-family:system-ui,sans-serif;font-size:12px}.rvm-selection-set-menu-title{padding:7px 8px;border-bottom:1px solid rgba(125,190,255,.16);font-weight:700}.rvm-selection-set-menu-title small{display:block;color:#93a9c8;font-weight:500;margin-top:2px}.rvm-selection-set-row{display:grid;grid-template-columns:minmax(170px,1fr) auto auto auto auto auto;gap:6px;align-items:center;padding:7px 4px;border-bottom:1px solid rgba(125,190,255,.10)}.rvm-selection-set-row strong{display:block;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rvm-selection-set-row small{display:block;color:#93a9c8;margin-top:2px;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rvm-selection-set-empty{padding:14px 8px;color:#93a9c8}.rvm-selection-set-footer{display:flex;gap:8px;justify-content:flex-end;padding-top:8px}.rvm-selection-set-menu button{border:1px solid rgba(125,190,255,.22);border-radius:7px;background:rgba(59,130,246,.14);color:#dbeafe;cursor:pointer;padding:5px 8px}.rvm-selection-set-menu button:hover{background:rgba(59,130,246,.26)}.rvm-selection-set-menu button.is-danger{border-color:rgba(248,113,113,.30);background:rgba(239,68,68,.13);color:#fecaca}
  `;
  document.head.appendChild(style);
  document.addEventListener('click', (event) => {
    if (!event.target?.closest?.(`#${MENU_ID}, .rvm-selection-set-tool-group`)) hideManager();
  }, true);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hideManager(); }, true);
}
