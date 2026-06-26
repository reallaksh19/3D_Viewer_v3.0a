import * as THREE from 'three';

import { RuntimeEvents } from '../contracts/runtime-events.js';
import { on } from '../core/event-bus.js';

const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-selection-details-inspector-v1');
const BRIDGE_VERSION = '20260621-rvm-selection-details-inspector-1';
const MAX_ATTRIBUTE_ROWS = 42;
const MAX_SELECTED_OBJECTS = 1500;
const MAX_ALIAS_SCAN_OBJECTS = 20000;

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function rootEl() {
  return typeof document === 'undefined' ? null : document.querySelector('[data-rvm-viewer]');
}

function viewer() {
  return globalThis.__3D_RVM_VIEWER__ || null;
}

function status(root, message, warning = false) {
  const el = root?.querySelector?.('#rvm-sb-msg');
  if (!el) return;
  el.textContent = message;
  el.style.color = warning ? '#ffcf70' : '';
}

function renderIdFor(obj) {
  return String(obj?.userData?.name || obj?.name || obj?.uuid || '').trim();
}

function attrsFor(obj) {
  const data = obj?.userData || {};
  const props = data.browserRvmProperties || {};
  return data.browserRvmAttributes || data.attributes || props.attributes || data.rawAttributes || {};
}

function propsFor(obj) {
  return obj?.userData?.browserRvmProperties || {};
}

function aliasesFor(obj) {
  const data = obj?.userData || {};
  const props = propsFor(obj);
  const attrs = attrsFor(obj);
  return [
    renderIdFor(obj),
    obj?.uuid,
    obj?.name,
    data.canonicalObjectId,
    data.sourceObjectId,
    data.sourcePath,
    data.sourceName,
    data.displayName,
    props.sourcePath,
    props.displayName,
    props.sourceName,
    attrs.RVM_OWNER_PATH,
    attrs.RVM_OWNER_NAME,
    attrs.RVM_REVIEW_NAME,
    attrs.NAME,
  ].map((value) => String(value ?? '').trim()).filter(Boolean);
}

function selectedIdsFromPayload(payload = {}) {
  const selected = new Set();
  for (const value of [payload.canonicalId, payload.renderObjectId]) {
    if (value) selected.add(String(value));
  }
  for (const value of payload.canonicalIds || []) {
    if (value) selected.add(String(value));
  }
  for (const value of payload.renderObjectIds || []) {
    if (value) selected.add(String(value));
  }
  const v = viewer();
  for (const value of v?.selection?.getSelectedCanonicalIds?.() || []) {
    if (value) selected.add(String(value));
  }
  for (const value of v?.selection?.getSelectionRenderIds?.() || []) {
    if (value) selected.add(String(value));
  }
  return selected;
}

function collectSelectedObjects(payload = {}) {
  const v = viewer();
  if (!v?.modelGroup) return [];

  const direct = Array.isArray(v._rvmCanvasSelectedMeshes)
    ? v._rvmCanvasSelectedMeshes.filter((obj) => obj && (obj.isMesh || obj.isLine || obj.isPoints))
    : [];
  if (direct.length) return direct.slice(0, MAX_SELECTED_OBJECTS);

  const ids = selectedIdsFromPayload(payload);
  if (!ids.size) return [];

  const matches = [];
  let scanned = 0;
  v.modelGroup.traverse?.((obj) => {
    if (matches.length >= MAX_SELECTED_OBJECTS) return;
    if (!(obj?.isMesh || obj?.isLine || obj?.isPoints)) return;
    scanned += 1;
    if (scanned > MAX_ALIAS_SCAN_OBJECTS) return;
    const aliases = aliasesFor(obj);
    if (aliases.some((alias) => ids.has(alias))) matches.push(obj);
  });
  return matches;
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

function fmt(value, digits = 3) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : '-';
}

function fmtVec(vec) {
  return vec ? `${fmt(vec.x)} , ${fmt(vec.y)} , ${fmt(vec.z)}` : '-';
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

function primitiveFor(obj) {
  const data = obj?.userData || {};
  const attrs = attrsFor(obj);
  return data.effectiveRenderPrimitive || data.renderPrimitive || attrs.RVM_BROWSER_RENDER_PRIMITIVE || attrs.RVM_PRIMITIVE_KIND || '-';
}

function typeFor(obj) {
  const data = obj?.userData || {};
  const attrs = attrsFor(obj);
  return data.type || data.kind || attrs.TYPE || attrs.RVM_TYPE || '-';
}

function sourcePathFor(obj) {
  const data = obj?.userData || {};
  const props = propsFor(obj);
  const attrs = attrsFor(obj);
  return data.sourcePath || props.sourcePath || attrs.RVM_OWNER_PATH || attrs.RVM_OWNER_NAME || data.displayName || obj?.name || '-';
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '-';
}

function attributeRows(objects = []) {
  const first = objects[0] || null;
  const attrs = attrsFor(first);
  const rows = Object.entries(attrs || {}).slice(0, MAX_ATTRIBUTE_ROWS);
  return rows.length ? rows : [['Attributes', 'No attributes attached to selected object']];
}

function summaryRows(objects = []) {
  const first = objects[0] || null;
  const visible = objects.filter((obj) => obj?.visible !== false).length;
  const hidden = objects.length - visible;
  const box = boxForObjects(objects);
  const size = box ? box.getSize(new THREE.Vector3()) : null;
  const center = box ? box.getCenter(new THREE.Vector3()) : null;
  const paths = objects.map(sourcePathFor).filter((path) => path && path !== '-');
  const sourcePrefix = commonPrefix(paths);
  const attrs = attrsFor(first);
  const data = first?.userData || {};
  const props = propsFor(first);
  const primitiveKinds = new Set(objects.map(primitiveFor).filter(Boolean));
  const types = new Set(objects.map(typeFor).filter(Boolean));
  const lodModes = new Set(objects.map((obj) => obj?.userData?.rvmZoneLodDetail).filter(Boolean));

  return [
    ['Selection objects', objects.length],
    ['Visible / hidden', `${visible} / ${hidden}`],
    ['First object', firstDefined(data.displayName, data.sourceName, props.displayName, attrs.NAME, first?.name)],
    ['Source path', sourcePrefix || sourcePathFor(first)],
    ['Type(s)', [...types].slice(0, 6).join(', ') || '-'],
    ['Primitive(s)', [...primitiveKinds].slice(0, 6).join(', ') || '-'],
    ['RVM primitive code', firstDefined(attrs.RVM_PRIMITIVE_CODE, attrs.RVM_CODE, data.primitiveCode)],
    ['Native facet primary', yesNo(objects.some((obj) => obj?.userData?.browserRvmNativeFacetGroupPrimary))],
    ['Bbox placeholder wireframe', yesNo(objects.some((obj) => obj?.userData?.browserRvmBboxPlaceholderWireframe))],
    ['Blocked bbox slab promotion', yesNo(objects.some((obj) => obj?.userData?.bboxPromotedSolidBlocked))],
    ['Hierarchy LOD', lodModes.size ? [...lodModes].join(', ') : '100/default'],
    ['PCF extraction scope', objects.length ? 'selection-ready' : 'no-selection'],
    ['Size XYZ', size ? `${fmt(size.x)} × ${fmt(size.y)} × ${fmt(size.z)}` : '-'],
    ['Center XYZ', fmtVec(center)],
    ['Bbox min', box ? fmtVec(box.min) : '-'],
    ['Bbox max', box ? fmtVec(box.max) : '-'],
  ];
}

function row(key, value) {
  return `<div class="rvm-selection-detail-row"><span>${esc(key)}</span><b title="${esc(value)}">${esc(value === undefined || value === null || value === '' ? '-' : String(value))}</b></div>`;
}

function renderPanel(objects = [], reason = '') {
  const root = rootEl();
  const panel = root?.querySelector?.('#rvm-attributes-panel');
  if (!root || !panel) return;
  if (!objects.length) {
    panel.innerHTML = '<div class="rvm-empty-state">No object selected.</div>';
    updateSelectionCount(root, 0);
    return;
  }
  const summary = summaryRows(objects);
  const attrs = attributeRows(objects);
  panel.innerHTML = `
    <div class="rvm-selection-details-card" data-rvm-selection-details-inspector="true">
      <div class="rvm-selection-details-title"><span>RVM selection details</span><small>${esc(BRIDGE_VERSION)}</small></div>
      <div class="rvm-tree-action-row rvm-selection-details-actions">
        <button type="button" class="rvm-btn" data-rvm-selection-detail-action="fit-selection">Fit</button>
        <button type="button" class="rvm-btn" data-rvm-selection-detail-action="hide-selection">Hide</button>
        <button type="button" class="rvm-btn" data-rvm-selection-detail-action="show-hidden">Show Hidden</button>
        <button type="button" class="rvm-btn" data-rvm-selection-detail-action="copy-path">Copy Path</button>
        <button type="button" class="rvm-btn" data-rvm-selection-detail-action="clear-selection">Clear</button>
      </div>
      <div class="rvm-selection-detail-grid">${summary.map(([key, value]) => row(key, value)).join('')}</div>
      <div class="rvm-selection-details-title"><span>Attributes</span><small>${esc(reason || 'selected object')}</small></div>
      <div class="rvm-selection-detail-grid">${attrs.map(([key, value]) => row(key, value)).join('')}</div>
    </div>`;
  updateSelectionCount(root, objects.length);
}

function updateSelectionCount(root, count) {
  const chip = root?.querySelector?.('[data-rvm-status-chip="selected"]');
  const footer = root?.querySelector?.('#rvm-sel-count');
  if (chip) chip.textContent = `Selected: ${count}`;
  if (footer) footer.textContent = String(count || 0);
}

function currentSelectionObjects() {
  return collectSelectedObjects({});
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
    } catch (error) {
      console.warn('[RVM details inspector] fit failed', error);
    }
  }
  try {
    v?.fitSelection?.();
    return true;
  } catch (_) {}
  return false;
}

function hideObjects(objects = []) {
  let count = 0;
  for (const obj of objects) {
    if (!obj || obj.visible === false) continue;
    obj.visible = false;
    obj.userData = obj.userData || {};
    obj.userData.rvmHiddenBySelectionDetails = true;
    count += 1;
  }
  viewer()?.requestRender?.();
  return count;
}

function showHiddenObjects() {
  const v = viewer();
  let count = 0;
  v?.modelGroup?.traverse?.((obj) => {
    if (obj?.userData?.rvmHiddenBySelectionDetails || obj?.userData?.rvmHiddenByUser) {
      obj.visible = obj.userData.rvmZoneLodOriginalVisible === false ? false : true;
      delete obj.userData.rvmHiddenBySelectionDetails;
      delete obj.userData.rvmHiddenByUser;
      count += 1;
    }
  });
  v?.requestRender?.();
  return count;
}

function clearSelection() {
  const root = rootEl();
  const v = viewer();
  try { v?.selection?.clearSelection?.(); } catch (_) {}
  if (v) v._rvmCanvasSelectedMeshes = [];
  root?.querySelectorAll?.('#rvm-tree li.is-selected').forEach((rowEl) => rowEl.classList.remove('is-selected'));
  renderPanel([], 'clear-selection');
}

async function copySelectionPath(objects = []) {
  const path = sourcePathFor(objects[0] || null);
  if (!path || path === '-') return false;
  try {
    await navigator.clipboard?.writeText?.(path);
    return true;
  } catch (_) {
    return false;
  }
}

function handleAction(event) {
  const action = event.target?.closest?.('[data-rvm-selection-detail-action]')?.dataset?.rvmSelectionDetailAction;
  if (!action) return;
  const root = rootEl();
  const objects = currentSelectionObjects();
  if (action === 'fit-selection') {
    if (fitObjects(objects)) status(root, `Fit ${objects.length} selected object(s).`);
    return;
  }
  if (action === 'hide-selection') {
    const count = hideObjects(objects);
    renderPanel([], 'hide-selection');
    status(root, count ? `Hidden ${count} selected object(s).` : 'No visible selected objects to hide.', !count);
    return;
  }
  if (action === 'show-hidden') {
    const count = showHiddenObjects();
    renderPanel(currentSelectionObjects(), 'show-hidden');
    status(root, count ? `Shown ${count} hidden object(s).` : 'No selection-hidden objects found.', !count);
    return;
  }
  if (action === 'clear-selection') {
    clearSelection();
    status(root, 'Selection cleared.');
    return;
  }
  if (action === 'copy-path') {
    copySelectionPath(objects).then((ok) => status(root, ok ? 'Copied selected RVM source path.' : 'No path available to copy.', !ok));
  }
}

function refresh(payload = {}, reason = 'selection-event') {
  const objects = collectSelectedObjects(payload);
  renderPanel(objects, reason);
}

function installStyles() {
  if (typeof document === 'undefined' || document.getElementById('rvm-selection-details-inspector-style')) return;
  const style = document.createElement('style');
  style.id = 'rvm-selection-details-inspector-style';
  style.textContent = `
    .rvm-selection-details-card{display:grid;gap:8px;min-width:0}.rvm-selection-details-title{display:flex;align-items:center;justify-content:space-between;gap:8px;color:#93c5fd;font-weight:700;font-size:12px;letter-spacing:.04em;text-transform:uppercase}.rvm-selection-details-title small{font-size:8px;color:#7f94b7;text-transform:none;font-weight:500;letter-spacing:0}.rvm-selection-detail-grid{display:grid;gap:3px}.rvm-selection-detail-row{display:grid;grid-template-columns:minmax(88px,.75fr) minmax(0,1.25fr);gap:6px;align-items:start;padding:4px 6px;border:1px solid rgba(126,190,255,.12);border-radius:5px;background:rgba(255,255,255,.026);font-size:10px}.rvm-selection-detail-row span{color:#9eb7d8}.rvm-selection-detail-row b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#edf6ff;font-weight:600}.rvm-selection-details-actions{display:flex;flex-wrap:wrap;gap:5px}.rvm-selection-details-actions .rvm-btn{padding:4px 7px;font-size:11px}
  `;
  document.head.appendChild(style);
}

export function installRvmSelectionDetailsInspectorBridge() {
  if (typeof document === 'undefined') return;
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;
  installStyles();
  document.addEventListener('click', handleAction, true);
  on(RuntimeEvents.RVM_NODE_SELECTED, (payload) => setTimeout(() => refresh(payload, 'rvm-node-selected'), 0));
  globalThis.addEventListener?.('rvm-model-loaded', () => setTimeout(() => refresh({}, 'model-loaded'), 180));
  globalThis.__PCF_GLB_RVM_SELECTION_DETAILS_INSPECTOR__ = {
    version: BRIDGE_VERSION,
    refresh,
    collectSelectedObjects,
  };
}
