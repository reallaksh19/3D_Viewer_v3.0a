import * as THREE from 'three';

const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-section-box-bridge-v1');
const BRIDGE_VERSION = '20260621-rvm-section-box-1';
const MAX_SECTION_OBJECTS = 10000;
const MAX_SECTION_SCAN_OBJECTS = 100000;
const PAD_STEP_FACTOR = 0.035;

let activeBaseBox = null;
let activePadding = 0;
let activeMode = 'OFF';

function rootEl() {
  return typeof document === 'undefined' ? null : document.querySelector('[data-rvm-viewer]');
}

function viewer() {
  return globalThis.__3D_RVM_VIEWER__ || null;
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

function updateSummary(root, text) {
  const summary = root?.querySelector?.('[data-rvm-section-summary]');
  if (summary) summary.textContent = text || 'Clip: off';
}

function normalizeAlias(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function isRenderable(obj) {
  return Boolean(
    obj &&
    (obj.isMesh || obj.isLine || obj.isPoints) &&
    obj.userData?.pickable !== false &&
    !obj.userData?.rvmMeasureOverlay &&
    !obj.userData?.rvmSectionBoxOverlay
  );
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
    obj?.uuid,
    obj?.name,
    data.name,
    data.canonicalObjectId,
    data.sourceObjectId,
    data.sourcePath,
    data.sourceName,
    data.displayName,
    props.sourcePath,
    props.sourceName,
    props.displayName,
    attrs.NAME,
    attrs.RVM_OWNER_PATH,
    attrs.RVM_OWNER_NAME,
    attrs.RVM_REVIEW_NAME,
  ].filter(Boolean);
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

function uniqueObjects(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function collectSelectedObjects(v = viewer()) {
  const fromVisibility = globalThis.__PCF_GLB_RVM_VISIBILITY__?.collectSelectedObjects?.();
  if (Array.isArray(fromVisibility) && fromVisibility.length) {
    return uniqueObjects(fromVisibility.filter(isRenderable)).slice(0, MAX_SECTION_OBJECTS);
  }

  const direct = Array.isArray(v?._rvmCanvasSelectedMeshes) ? v._rvmCanvasSelectedMeshes.filter(isRenderable) : [];
  if (direct.length) return uniqueObjects(direct).slice(0, MAX_SECTION_OBJECTS);

  const ids = selectedIds(v);
  if (!ids.size || !v?.modelGroup) return [];
  const out = [];
  let scanned = 0;
  const idList = [...ids];
  v.modelGroup.traverse?.((obj) => {
    if (!isRenderable(obj) || out.length >= MAX_SECTION_OBJECTS) return;
    scanned += 1;
    if (scanned > MAX_SECTION_SCAN_OBJECTS) return;
    const aliases = aliasesFor(obj).map(normalizeAlias).filter(Boolean);
    if (aliases.some((alias) => ids.has(alias) || idList.some((id) => alias.includes(id) || id.includes(alias)))) out.push(obj);
  });
  return uniqueObjects(out);
}

function collectVisibleModelObjects(v = viewer()) {
  if (!v?.modelGroup) return [];
  const out = [];
  let scanned = 0;
  v.modelGroup.traverse?.((obj) => {
    if (!isRenderable(obj) || out.length >= MAX_SECTION_OBJECTS) return;
    scanned += 1;
    if (scanned > MAX_SECTION_SCAN_OBJECTS) return;
    if (obj.visible !== false) out.push(obj);
  });
  return out;
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

function fmt(value) {
  if (!Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 1 : abs >= 100 ? 2 : 3;
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function sectionPadStep(box = activeBaseBox) {
  if (!box || box.isEmpty()) return 10;
  const size = box.getSize(new THREE.Vector3());
  return Math.max(size.length() * PAD_STEP_FACTOR, 1);
}

function applySectionBox(box, mode = 'selection') {
  const root = rootEl();
  const v = viewer();
  if (!v?.sectioning || !box || box.isEmpty()) {
    setStatus(root, 'Clip: no valid section box available.', true);
    return null;
  }
  activeBaseBox = box.clone();
  activeMode = mode;
  const appliedBox = v.sectioning.applyBoxSection
    ? v.sectioning.applyBoxSection(activeBaseBox.clone(), activePadding)
    : fallbackApplyBoxSection(v, activeBaseBox.clone(), activePadding);
  const finalBox = appliedBox && !appliedBox.isEmpty ? appliedBox : activeBaseBox.clone().expandByScalar(activePadding);
  const size = finalBox.getSize(new THREE.Vector3());
  updateSummary(root, `Clip: ${mode} · ${fmt(size.x)} × ${fmt(size.y)} × ${fmt(size.z)} · pad ${fmt(activePadding)}`);
  setStatus(root, `Clip: ${mode} section box applied.`);
  v.requestRender?.();
  return { version: BRIDGE_VERSION, mode, box: finalBox, padding: activePadding };
}

function fallbackApplyBoxSection(v, box, padding = 0) {
  const padded = box.clone().expandByScalar(Math.max(0, Number(padding) || 0));
  const sectioning = v.sectioning;
  sectioning._sectionMode = 'BOX';
  sectioning._sectionBounds = padded.clone();
  sectioning._applyBoxPlanes?.(padded);
  sectioning._renderSectionBoxVisual?.(padded);
  return padded;
}

function applySelectionSectionBox() {
  const root = rootEl();
  const objects = collectSelectedObjects(viewer()).filter((obj) => obj?.visible !== false);
  if (!objects.length) {
    setStatus(root, 'Clip: select a hierarchy/canvas object or branch first.', true);
    updateSummary(root, 'Clip: no selection');
    return null;
  }
  activePadding = 0;
  const box = boxForObjects(objects);
  if (!box) {
    setStatus(root, 'Clip: selected object has no valid bbox.', true);
    return null;
  }
  return applySectionBox(box, `selection ${objects.length}${objects.length >= MAX_SECTION_OBJECTS ? '+' : ''}`);
}

function applyModelSectionBox() {
  const root = rootEl();
  const objects = collectVisibleModelObjects(viewer());
  if (!objects.length) {
    setStatus(root, 'Clip: no visible RVM geometry loaded.', true);
    updateSummary(root, 'Clip: no model');
    return null;
  }
  activePadding = 0;
  const box = boxForObjects(objects);
  return applySectionBox(box, `visible model ${objects.length}${objects.length >= MAX_SECTION_OBJECTS ? '+' : ''}`);
}

function adjustPadding(direction = 1) {
  const root = rootEl();
  if (!activeBaseBox || activeMode === 'OFF') {
    setStatus(root, 'Clip: apply a section box before changing padding.', true);
    return null;
  }
  activePadding = Math.max(0, activePadding + Math.sign(direction || 1) * sectionPadStep(activeBaseBox));
  return applySectionBox(activeBaseBox, activeMode);
}

function clearSectionBox(options = {}) {
  const v = viewer();
  v?.disableSection?.();
  activeBaseBox = null;
  activePadding = 0;
  activeMode = 'OFF';
  updateSummary(rootEl(), 'Clip: off');
  if (!options.silent) setStatus(rootEl(), 'Clip: section off.');
  v?.requestRender?.();
}

function injectToolbar(root) {
  const ribbon = root?.querySelector?.('.geo-top-ribbon');
  if (!ribbon) return;
  let section = ribbon.querySelector('.rvm-section-box-tool-group');
  if (section?.dataset?.rvmSectionBoxToolbar === BRIDGE_VERSION) return;
  if (!section) {
    section = document.createElement('div');
    section.className = 'rvm-ribbon-section rvm-tool-group rvm-section-box-tool-group';
    const measure = ribbon.querySelector('.rvm-measure-tool-group');
    const search = ribbon.querySelector('.rvm-object-search-tool-group');
    const before = measure?.nextSibling || search || ribbon.querySelector('.rvm-ribbon-search') || null;
    ribbon.insertBefore(section, before);
  }
  section.dataset.rvmSectionBoxToolbar = BRIDGE_VERSION;
  section.innerHTML = `
    <span class="rvm-ribbon-label">Clip</span>
    <div class="rvm-ribbon-button-row">
      <button type="button" class="rvm-tool-btn" data-rvm-section-box-action="selection" title="Apply a section box around selected RVM object or hierarchy branch"><span aria-hidden="true">▧</span><span>Sel Box</span></button>
      <button type="button" class="rvm-tool-btn" data-rvm-section-box-action="model" title="Apply a section box around currently visible RVM geometry"><span aria-hidden="true">□</span><span>Model</span></button>
      <button type="button" class="rvm-tool-btn" data-rvm-section-box-action="expand" title="Expand active section box padding"><span aria-hidden="true">＋</span><span>Pad</span></button>
      <button type="button" class="rvm-tool-btn" data-rvm-section-box-action="shrink" title="Shrink active section box padding"><span aria-hidden="true">－</span><span>Pad</span></button>
      <button type="button" class="rvm-tool-btn" data-rvm-section-box-action="off" title="Turn section box clipping off"><span aria-hidden="true">⊘</span><span>Off</span></button>
    </div>
    <div class="rvm-section-summary" data-rvm-section-summary>Clip: off</div>`;
}

function onDocumentClick(event) {
  const actionEl = event.target?.closest?.('[data-rvm-section-box-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.rvmSectionBoxAction;
  if (!action) return;
  event.preventDefault();
  event.stopPropagation();
  if (action === 'selection') applySelectionSectionBox();
  else if (action === 'model') applyModelSectionBox();
  else if (action === 'expand') adjustPadding(1);
  else if (action === 'shrink') adjustPadding(-1);
  else if (action === 'off') clearSectionBox();
}

function attach() {
  const root = rootEl();
  if (!root) return false;
  injectToolbar(root);
  return true;
}

function injectStyles() {
  if (typeof document === 'undefined' || document.getElementById('rvm-section-box-bridge-style')) return;
  const style = document.createElement('style');
  style.id = 'rvm-section-box-bridge-style';
  style.textContent = `
    .rvm-section-box-tool-group .rvm-tool-btn span:last-child{font-size:11px}.rvm-section-summary{margin-top:3px;color:#94a3b8;font-size:9.5px;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis}
    .rvm-section-box-tool-group .rvm-tool-btn[data-rvm-section-box-action="off"]{border-color:rgba(248,113,113,.35)}
  `;
  document.head.appendChild(style);
}

export function installRvmSectionBoxBridge() {
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
    clearSectionBox({ silent: true });
    attach();
  }, 180));
  globalThis.__PCF_GLB_RVM_SECTION_BOX__ = {
    version: BRIDGE_VERSION,
    applySelectionSectionBox,
    applyModelSectionBox,
    expandPadding: () => adjustPadding(1),
    shrinkPadding: () => adjustPadding(-1),
    clear: clearSectionBox,
    collectSelectedObjects: () => collectSelectedObjects(viewer()),
    getState: () => ({ version: BRIDGE_VERSION, mode: activeMode, padding: activePadding, hasBox: Boolean(activeBaseBox) }),
  };
}
