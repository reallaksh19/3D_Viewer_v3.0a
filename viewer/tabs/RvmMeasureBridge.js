import * as THREE from 'three';

const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-measure-bridge-v1');
const BRIDGE_VERSION = '20260621-rvm-measure-tools-1';
const MAX_MEASURE_OBJECTS = 5000;
const MAX_SELECTION_SCAN_OBJECTS = 80000;

function rootEl() {
  return typeof document === 'undefined' ? null : document.querySelector('[data-rvm-viewer]');
}

function viewer() {
  return globalThis.__3D_RVM_VIEWER__ || null;
}

function isRenderable(obj) {
  return Boolean(obj && (obj.isMesh || obj.isLine || obj.isPoints) && obj.userData?.pickable !== false);
}

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setStatus(root, text, warning = false) {
  const el = root?.querySelector?.('#rvm-sb-msg');
  if (!el) return;
  el.textContent = text;
  el.style.color = warning ? '#ffcf70' : '';
}

function normalizeAlias(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
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

function objectLabel(obj) {
  const data = obj?.userData || {};
  const props = propsFor(obj);
  const attrs = attrsFor(obj);
  return String(firstDefined(data.displayName, data.sourceName, props.displayName, props.sourceName, attrs.RVM_REVIEW_NAME, attrs.NAME, obj?.name, obj?.uuid, 'RVM object')).trim();
}

function objectPath(obj) {
  const data = obj?.userData || {};
  const props = propsFor(obj);
  const attrs = attrsFor(obj);
  return String(firstDefined(data.sourcePath, props.sourcePath, props.SourcePath, attrs.RVM_OWNER_PATH, attrs.RVM_OWNER_NAME, data.sourceName, data.displayName, obj?.name)).trim();
}

function aliasesFor(obj) {
  const data = obj?.userData || {};
  const props = data.browserRvmProperties || {};
  const attrs = attrsFor(obj);
  return [obj?.uuid, obj?.name, data.name, data.canonicalObjectId, data.sourceObjectId, data.sourcePath, data.sourceName, data.displayName, props.sourcePath, props.sourceName, props.displayName, attrs.NAME, attrs.RVM_OWNER_PATH, attrs.RVM_OWNER_NAME, attrs.RVM_REVIEW_NAME].filter(Boolean);
}

function uniqueObjects(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
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

function collectSelectedObjects(v = viewer()) {
  const fromVisibility = globalThis.__PCF_GLB_RVM_VISIBILITY__?.collectSelectedObjects?.();
  if (Array.isArray(fromVisibility) && fromVisibility.length) return uniqueObjects(fromVisibility.filter(isRenderable)).slice(0, MAX_MEASURE_OBJECTS);

  const direct = Array.isArray(v?._rvmCanvasSelectedMeshes) ? v._rvmCanvasSelectedMeshes.filter(isRenderable) : [];
  if (direct.length) return uniqueObjects(direct).slice(0, MAX_MEASURE_OBJECTS);

  const ids = selectedIds(v);
  if (!ids.size || !v?.modelGroup) return [];
  const out = [];
  let scanned = 0;
  v.modelGroup.traverse?.((obj) => {
    if (!isRenderable(obj) || out.length >= MAX_MEASURE_OBJECTS) return;
    scanned += 1;
    if (scanned > MAX_SELECTION_SCAN_OBJECTS) return;
    const aliases = aliasesFor(obj).map(normalizeAlias).filter(Boolean);
    if (aliases.some((alias) => ids.has(alias) || [...ids].some((id) => alias.includes(id) || id.includes(alias)))) out.push(obj);
  });
  return uniqueObjects(out);
}

function boxForObjects(objects = []) {
  const box = new THREE.Box3();
  let any = false;
  for (const obj of objects) {
    if (!obj || obj.visible === false) continue;
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

function centerForObject(obj) {
  const box = boxForObjects([obj]);
  if (!box) return null;
  return box.getCenter(new THREE.Vector3());
}

function fmt(value) {
  if (!Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 1 : abs >= 100 ? 2 : 3;
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function vectorRow(label, vector) {
  if (!vector) return `<div><span>${esc(label)}</span><b>-</b></div>`;
  return `<div><span>${esc(label)}</span><b>${fmt(vector.x)} × ${fmt(vector.y)} × ${fmt(vector.z)}</b></div>`;
}

function ensureCard() {
  let card = typeof document === 'undefined' ? null : document.getElementById('rvm-measure-card');
  if (card) return card;
  card = document.createElement('div');
  card.id = 'rvm-measure-card';
  card.className = 'rvm-measure-card';
  card.setAttribute('aria-live', 'polite');
  document.body.appendChild(card);
  return card;
}

function renderCard(html) {
  const card = ensureCard();
  if (!card) return;
  card.innerHTML = html;
  card.classList.add('is-open');
}

function updateSummary(root, text) {
  const summary = root?.querySelector?.('[data-rvm-measure-summary]');
  if (summary) summary.textContent = text || 'Measure: no result';
}

function measureSelectionExtents() {
  const root = rootEl();
  const v = viewer();
  const selected = collectSelectedObjects(v).filter((obj) => obj?.visible !== false).slice(0, MAX_MEASURE_OBJECTS);
  if (!selected.length) {
    setStatus(root, 'Measure: select a hierarchy/canvas object or branch first.', true);
    updateSummary(root, 'Measure: no selection');
    return null;
  }
  const box = boxForObjects(selected);
  if (!box || box.isEmpty()) {
    setStatus(root, 'Measure: selected object has no measurable bbox.', true);
    updateSummary(root, 'Measure: no bbox');
    return null;
  }
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const diagonal = size.length();
  const capped = collectSelectedObjects(v).length > selected.length;
  const result = {
    version: BRIDGE_VERSION,
    mode: 'selection-extents',
    count: selected.length,
    capped,
    min: box.min.clone(),
    max: box.max.clone(),
    size,
    center,
    diagonal,
  };
  updateSummary(root, `Measure: ${selected.length}${capped ? '+' : ''} obj · size ${fmt(size.x)} × ${fmt(size.y)} × ${fmt(size.z)}`);
  setStatus(root, `Measure: selection extents ${fmt(size.x)} × ${fmt(size.y)} × ${fmt(size.z)}.`);
  renderCard(`
    <div class="rvm-measure-card-head"><b>Selection extents</b><button type="button" data-rvm-measure-action="close">×</button></div>
    <div class="rvm-measure-card-body">
      <div><span>Objects</span><b>${selected.length}${capped ? '+' : ''}</b></div>
      ${vectorRow('Size XYZ', size)}
      ${vectorRow('Center', center)}
      ${vectorRow('Bbox min', box.min)}
      ${vectorRow('Bbox max', box.max)}
      <div><span>Diagonal</span><b>${fmt(diagonal)}</b></div>
      <small>${esc(objectPath(selected[0]) || objectLabel(selected[0]))}</small>
    </div>`);
  return result;
}

function measureCenterDistance() {
  const root = rootEl();
  const selected = collectSelectedObjects(viewer()).filter((obj) => obj?.visible !== false).slice(0, MAX_MEASURE_OBJECTS);
  if (selected.length < 2) {
    setStatus(root, 'Measure: select two objects to measure center-to-center distance.', true);
    updateSummary(root, 'Measure: need two objects');
    return null;
  }
  const a = selected[0];
  const b = selected[1];
  const ca = centerForObject(a);
  const cb = centerForObject(b);
  if (!ca || !cb) {
    setStatus(root, 'Measure: unable to compute centers for selected objects.', true);
    return null;
  }
  const delta = new THREE.Vector3().subVectors(cb, ca);
  const distance = delta.length();
  drawMeasureLine(ca, cb);
  updateSummary(root, `Measure: distance ${fmt(distance)} · Δ ${fmt(delta.x)}, ${fmt(delta.y)}, ${fmt(delta.z)}`);
  setStatus(root, `Measure: center distance ${fmt(distance)}.`);
  renderCard(`
    <div class="rvm-measure-card-head"><b>Center distance</b><button type="button" data-rvm-measure-action="close">×</button></div>
    <div class="rvm-measure-card-body">
      <div><span>Distance</span><b>${fmt(distance)}</b></div>
      ${vectorRow('Delta XYZ', delta)}
      ${vectorRow('From center', ca)}
      ${vectorRow('To center', cb)}
      <small>From: ${esc(objectLabel(a))}</small>
      <small>To: ${esc(objectLabel(b))}</small>
    </div>`);
  return { version: BRIDGE_VERSION, mode: 'center-distance', distance, delta, from: ca, to: cb, count: selected.length };
}

function clearMeasure(options = {}) {
  clearMeasureLine();
  const card = typeof document === 'undefined' ? null : document.getElementById('rvm-measure-card');
  if (card) card.classList.remove('is-open');
  updateSummary(rootEl(), 'Measure: cleared');
  if (!options.silent) setStatus(rootEl(), 'Measure: cleared.');
}

function measureOverlay(v = viewer()) {
  if (!v) return null;
  if (v._rvmMeasureOverlay) return v._rvmMeasureOverlay;
  const group = new THREE.Group();
  group.name = 'RVM measurement overlay';
  group.userData = { pickable: false, rvmMeasureOverlay: true };
  if (v.scene?.add) v.scene.add(group);
  else if (v.modelGroup?.parent?.add) v.modelGroup.parent.add(group);
  else return null;
  v._rvmMeasureOverlay = group;
  return group;
}

function clearMeasureLine() {
  const group = viewer()?._rvmMeasureOverlay;
  if (!group) return;
  for (const child of [...group.children]) {
    group.remove(child);
    try { child.geometry?.dispose?.(); } catch (_) {}
    try { child.material?.dispose?.(); } catch (_) {}
  }
  viewer()?.requestRender?.();
}

function drawMeasureLine(a, b) {
  const group = measureOverlay();
  if (!group) return false;
  clearMeasureLine();
  const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
  const material = new THREE.LineBasicMaterial({ color: 0xfbbf24, depthTest: false, transparent: true, opacity: 0.95 });
  const line = new THREE.Line(geometry, material);
  line.name = 'RVM center distance measure';
  line.renderOrder = 999;
  line.userData = { pickable: false, rvmMeasureLine: true };
  group.add(line);
  viewer()?.requestRender?.();
  return true;
}

function injectToolbar(root) {
  const ribbon = root?.querySelector?.('.geo-top-ribbon');
  if (!ribbon) return;
  let section = ribbon.querySelector('.rvm-measure-tool-group');
  if (section?.dataset?.rvmMeasureToolbar === BRIDGE_VERSION) return;
  if (!section) {
    section = document.createElement('div');
    section.className = 'rvm-ribbon-section rvm-tool-group rvm-measure-tool-group';
    const find = ribbon.querySelector('.rvm-object-search-tool-group');
    const visibility = ribbon.querySelector('.rvm-visibility-tool-group');
    ribbon.insertBefore(section, find || visibility || ribbon.querySelector('.rvm-ribbon-search') || null);
  }
  section.dataset.rvmMeasureToolbar = BRIDGE_VERSION;
  section.innerHTML = `
    <span class="rvm-ribbon-label">Measure</span>
    <div class="rvm-ribbon-button-row">
      <button type="button" class="rvm-tool-btn" data-rvm-measure-action="extents" title="Measure bbox extents of selected RVM object or branch"><span aria-hidden="true">□</span><span>Extents</span></button>
      <button type="button" class="rvm-tool-btn" data-rvm-measure-action="distance" title="Measure center-to-center distance between two selected objects"><span aria-hidden="true">↔</span><span>Distance</span></button>
      <button type="button" class="rvm-tool-btn" data-rvm-measure-action="clear" title="Clear measurement overlay"><span aria-hidden="true">×</span><span>Clear</span></button>
    </div>
    <div class="rvm-measure-summary" data-rvm-measure-summary>Measure: no result</div>`;
}

function onDocumentClick(event) {
  const actionEl = event.target?.closest?.('[data-rvm-measure-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.rvmMeasureAction;
  if (!action) return;
  event.preventDefault();
  event.stopPropagation();
  if (action === 'extents') measureSelectionExtents();
  else if (action === 'distance') measureCenterDistance();
  else if (action === 'clear' || action === 'close') clearMeasure();
}

function attach() {
  const root = rootEl();
  if (!root) return false;
  injectToolbar(root);
  return true;
}

function injectStyles() {
  if (document.getElementById('rvm-measure-bridge-style')) return;
  const style = document.createElement('style');
  style.id = 'rvm-measure-bridge-style';
  style.textContent = `
    .rvm-measure-tool-group .rvm-tool-btn span:last-child{font-size:11px}.rvm-measure-summary{margin-top:3px;color:#94a3b8;font-size:9.5px;white-space:nowrap;max-width:210px;overflow:hidden;text-overflow:ellipsis}
    .rvm-measure-card{position:fixed;right:18px;bottom:18px;display:none;width:min(360px,calc(100vw - 36px));z-index:12010;border:1px solid rgba(251,191,36,.34);border-radius:12px;background:#0b1424;color:#dbeafe;box-shadow:0 18px 55px rgba(0,0,0,.45);padding:10px}.rvm-measure-card.is-open{display:block}
    .rvm-measure-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.rvm-measure-card-head b{color:#fde68a;font-size:13px}.rvm-measure-card-head button{border:1px solid rgba(148,163,184,.28);background:#111827;color:#e5e7eb;border-radius:7px;width:26px;height:24px}
    .rvm-measure-card-body{display:grid;gap:5px}.rvm-measure-card-body div{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(148,163,184,.10);padding-bottom:4px}.rvm-measure-card-body span{color:#93a4bd;font-size:11px}.rvm-measure-card-body b{font-size:11px;color:#f8fafc;text-align:right}.rvm-measure-card-body small{display:block;color:#9eb7d8;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  `;
  document.head.appendChild(style);
}

export function installRvmMeasureBridge() {
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
    clearMeasure({ silent: true });
    attach();
  }, 180));
  globalThis.__PCF_GLB_RVM_MEASURE__ = {
    version: BRIDGE_VERSION,
    measureSelectionExtents,
    measureCenterDistance,
    clear: clearMeasure,
    collectSelectedObjects: () => collectSelectedObjects(viewer()),
  };
}
