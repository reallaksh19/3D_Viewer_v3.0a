import * as THREE from 'three';

const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-report-export-bridge-v1');
const BRIDGE_VERSION = '20260621-rvm-report-export-1';
const MAX_EXPORT_ROWS = 50000;
const MAX_SCAN_OBJECTS = 120000;
const REPORT_SCOPES = ['selected', 'visible', 'hidden', 'all'];

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

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

function attrsFor(obj) {
  const data = obj?.userData || {};
  const props = data.browserRvmProperties || {};
  return data.browserRvmAttributes || data.attributes || props.attributes || data.rawAttributes || {};
}

function propsFor(obj) {
  return obj?.userData?.browserRvmProperties || {};
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

function safeNumber(value) {
  return Number.isFinite(value) ? Number(value.toFixed(6)) : '';
}

function bboxForObject(obj) {
  try {
    const box = new THREE.Box3().setFromObject(obj);
    if (!box || box.isEmpty()) return null;
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    return { box, center, size };
  } catch (_) {
    return null;
  }
}

function selectedIds() {
  const ids = new Set();
  const v = viewer();
  try {
    const selected = v?.selection?.getSelectedCanonicalIds?.();
    if (Array.isArray(selected)) selected.forEach((id) => { if (id) ids.add(String(id)); });
  } catch (_) {}
  try {
    const meshes = Array.isArray(v?._rvmCanvasSelectedMeshes) ? v._rvmCanvasSelectedMeshes : [];
    meshes.forEach((obj) => { const id = objectId(obj); if (id) ids.add(id); });
  } catch (_) {}
  return ids;
}

function selectedObjectsFromViewer() {
  const v = viewer();
  const direct = Array.isArray(v?._rvmCanvasSelectedMeshes) ? v._rvmCanvasSelectedMeshes.filter(isRenderable) : [];
  if (direct.length) return direct;
  const ids = selectedIds();
  if (!ids.size) return [];
  const objects = [];
  v?.modelGroup?.traverse?.((obj) => {
    if (objects.length >= MAX_EXPORT_ROWS || !isRenderable(obj)) return;
    const id = objectId(obj);
    if (id && ids.has(id)) objects.push(obj);
  });
  return objects;
}

function rowForObject(obj, index) {
  const data = obj?.userData || {};
  const attrs = attrsFor(obj);
  const bbox = bboxForObject(obj);
  return {
    index,
    id: objectId(obj),
    name: objectLabel(obj),
    sourcePath: objectPath(obj),
    type: objectKind(obj),
    primitive: objectPrimitive(obj),
    rvmPrimitiveCode: firstDefined(data.rvmPrimitiveCode, attrs.RVM_PRIMITIVE_CODE, attrs.RVM_PRIM_CODE, ''),
    visible: obj?.visible !== false,
    nativeFacetPrimary: Boolean(data.browserRvmNativeFacetPrimary),
    bboxPlaceholder: Boolean(data.browserRvmBboxPlaceholderWireframe || data.bboxPromotedSolidBlocked),
    lodState: firstDefined(data.rvmHierarchyLodState, data.rvmZoneLodState, data.rvmZoneLodLevel, ''),
    xMin: safeNumber(bbox?.box?.min?.x),
    yMin: safeNumber(bbox?.box?.min?.y),
    zMin: safeNumber(bbox?.box?.min?.z),
    xMax: safeNumber(bbox?.box?.max?.x),
    yMax: safeNumber(bbox?.box?.max?.y),
    zMax: safeNumber(bbox?.box?.max?.z),
    xSize: safeNumber(bbox?.size?.x),
    ySize: safeNumber(bbox?.size?.y),
    zSize: safeNumber(bbox?.size?.z),
    xCenter: safeNumber(bbox?.center?.x),
    yCenter: safeNumber(bbox?.center?.y),
    zCenter: safeNumber(bbox?.center?.z),
  };
}

function collectObjects(scope = 'visible') {
  const safeScope = REPORT_SCOPES.includes(scope) ? scope : 'visible';
  if (safeScope === 'selected') return { objects: selectedObjectsFromViewer().slice(0, MAX_EXPORT_ROWS), scanned: 0, capped: false, scope: safeScope };
  const objects = [];
  let scanned = 0;
  let capped = false;
  viewer()?.modelGroup?.traverse?.((obj) => {
    if (!isRenderable(obj)) return;
    scanned += 1;
    if (scanned > MAX_SCAN_OBJECTS) { capped = true; return; }
    if (objects.length >= MAX_EXPORT_ROWS) { capped = true; return; }
    const visible = obj.visible !== false;
    if (safeScope === 'visible' && !visible) return;
    if (safeScope === 'hidden' && visible) return;
    objects.push(obj);
  });
  return { objects, scanned, capped, scope: safeScope };
}

function collectReportRows(scope = 'visible') {
  const collected = collectObjects(scope);
  const rows = collected.objects.map((obj, index) => rowForObject(obj, index + 1));
  return {
    version: BRIDGE_VERSION,
    schema: 'rvm-rendered-object-report/v1',
    scope: collected.scope,
    generatedAt: new Date().toISOString(),
    rowCount: rows.length,
    scanned: collected.scanned,
    capped: collected.capped || rows.length >= MAX_EXPORT_ROWS,
    rows,
  };
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(rows = []) {
  const columns = [
    'index', 'id', 'name', 'sourcePath', 'type', 'primitive', 'rvmPrimitiveCode', 'visible', 'nativeFacetPrimary', 'bboxPlaceholder', 'lodState',
    'xMin', 'yMin', 'zMin', 'xMax', 'yMax', 'zMax', 'xSize', 'ySize', 'zSize', 'xCenter', 'yCenter', 'zCenter',
  ];
  return [columns.join(','), ...rows.map((row) => columns.map((col) => csvEscape(row[col])).join(','))].join('\n');
}

function filenameBase(scope) {
  const raw = firstDefined(viewer()?.loadedFileName, viewer()?.sourceFileName, rootEl()?.dataset?.rvmFileName, 'rvm-render-report');
  return String(raw).replace(/\.[^.]+$/, '').replace(/[^a-z0-9._-]+/gi, '_').slice(0, 80) || 'rvm-render-report';
}

function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setStatus(root, text, warning = false) {
  const el = root?.querySelector?.('#rvm-sb-msg');
  if (!el) return;
  el.textContent = text;
  el.style.color = warning ? '#ffcf70' : '';
}

function currentScope(dialog = document.getElementById('rvm-report-export-dialog')) {
  return dialog?.querySelector?.('[data-rvm-report-scope]')?.value || 'visible';
}

function renderSummary(dialog = document.getElementById('rvm-report-export-dialog')) {
  if (!dialog) return null;
  const scope = currentScope(dialog);
  const report = collectReportRows(scope);
  const summary = dialog.querySelector('[data-rvm-report-summary]');
  if (summary) summary.innerHTML = `Scope <b>${esc(scope)}</b> · ${report.rowCount}${report.capped ? '+' : ''} row(s)${report.scanned ? ` · scanned ${report.scanned}${report.capped ? '+' : ''}` : ''}`;
  return report;
}

function exportReport(format = 'csv', scope = 'visible') {
  const root = rootEl();
  const report = collectReportRows(scope);
  if (!report.rowCount) {
    setStatus(root, `Report: no ${scope} object rows to export.`, true);
    return report;
  }
  const base = filenameBase(scope);
  if (format === 'json') {
    downloadText(`${base}-${scope}-objects.json`, JSON.stringify(report, null, 2), 'application/json;charset=utf-8');
  } else {
    downloadText(`${base}-${scope}-objects.csv`, rowsToCsv(report.rows), 'text/csv;charset=utf-8');
  }
  setStatus(root, `Report: exported ${report.rowCount}${report.capped ? '+' : ''} ${scope} object row(s) as ${format.toUpperCase()}.`, report.capped);
  renderSummary();
  return report;
}

async function copySummary(scope = 'visible') {
  const report = collectReportRows(scope);
  const text = `RVM report ${scope}: ${report.rowCount}${report.capped ? '+' : ''} rows, generated ${report.generatedAt}`;
  try {
    await navigator.clipboard?.writeText?.(text);
    setStatus(rootEl(), 'Report: copied summary.');
  } catch (_) {
    setStatus(rootEl(), 'Report: clipboard unavailable.', true);
  }
  renderSummary();
  return report;
}

function injectToolbar(root) {
  const ribbon = root?.querySelector?.('.geo-top-ribbon');
  if (!ribbon) return;
  let section = ribbon.querySelector('.rvm-report-export-tool-group');
  if (section?.dataset?.rvmReportExport === BRIDGE_VERSION) return;
  if (!section) {
    section = document.createElement('div');
    section.className = 'rvm-ribbon-section rvm-tool-group rvm-report-export-tool-group';
    const sets = ribbon.querySelector('.rvm-selection-sets-tool-group');
    ribbon.insertBefore(section, sets?.nextSibling || ribbon.querySelector('.rvm-measure-tool-group') || null);
  }
  section.dataset.rvmReportExport = BRIDGE_VERSION;
  section.innerHTML = `
    <span class="rvm-ribbon-label">Report</span>
    <div class="rvm-ribbon-button-row">
      <button type="button" class="rvm-tool-btn" data-rvm-report-open="true" title="Export RVM rendered-object report"><span aria-hidden="true">▤</span><span>Objects</span></button>
      <button type="button" class="rvm-tool-btn" data-rvm-report-quick-csv="true" title="Export visible objects as CSV"><span aria-hidden="true">CSV</span><span>Visible</span></button>
    </div>
    <div class="rvm-report-export-summary" data-rvm-report-toolbar-summary>Report: selected / visible / hidden / full</div>`;
}

function ensureDialog() {
  let dialog = document.getElementById('rvm-report-export-dialog');
  if (dialog) return dialog;
  dialog = document.createElement('div');
  dialog.id = 'rvm-report-export-dialog';
  dialog.className = 'rvm-report-export-dialog';
  dialog.setAttribute('aria-hidden', 'true');
  dialog.innerHTML = `
    <div class="rvm-report-export-card" role="dialog" aria-modal="false" aria-label="Export RVM object report">
      <div class="rvm-report-export-head">
        <div><b>RVM Object Report Export</b><small>${esc(BRIDGE_VERSION)}</small></div>
        <button type="button" data-rvm-report-close="true" aria-label="Close report export">×</button>
      </div>
      <div class="rvm-report-export-controls">
        <label>Scope <select data-rvm-report-scope>
          <option value="selected">Selected objects</option>
          <option value="visible" selected>Visible objects</option>
          <option value="hidden">Hidden objects</option>
          <option value="all">Full rendered model</option>
        </select></label>
        <button type="button" data-rvm-report-refresh="true">Refresh Count</button>
      </div>
      <div class="rvm-report-export-summary-box" data-rvm-report-summary>Choose a scope and refresh.</div>
      <div class="rvm-report-export-actions">
        <button type="button" data-rvm-report-export="csv">Export CSV</button>
        <button type="button" data-rvm-report-export="json">Export JSON</button>
        <button type="button" data-rvm-report-copy-summary="true">Copy Summary</button>
      </div>
      <p class="rvm-report-export-note">Exports rendered-object metadata only. Bounded to ${MAX_EXPORT_ROWS.toLocaleString()} rows and ${MAX_SCAN_OBJECTS.toLocaleString()} scanned objects for browser safety.</p>
    </div>`;
  document.body.appendChild(dialog);
  bindDialog(dialog);
  return dialog;
}

function openDialog() {
  const dialog = ensureDialog();
  dialog.classList.add('is-open');
  dialog.setAttribute('aria-hidden', 'false');
  renderSummary(dialog);
}

function closeDialog() {
  const dialog = document.getElementById('rvm-report-export-dialog');
  if (!dialog) return;
  dialog.classList.remove('is-open');
  dialog.setAttribute('aria-hidden', 'true');
}

function bindDialog(dialog) {
  dialog.addEventListener('change', (event) => {
    if (event.target?.matches?.('[data-rvm-report-scope]')) renderSummary(dialog);
  }, true);
  dialog.addEventListener('click', (event) => {
    if (event.target?.closest?.('[data-rvm-report-close]')) { closeDialog(); return; }
    if (event.target?.closest?.('[data-rvm-report-refresh]')) { renderSummary(dialog); return; }
    const exportEl = event.target?.closest?.('[data-rvm-report-export]');
    if (exportEl) { exportReport(exportEl.dataset.rvmReportExport || 'csv', currentScope(dialog)); return; }
    if (event.target?.closest?.('[data-rvm-report-copy-summary]')) copySummary(currentScope(dialog));
  }, true);
}

function onDocumentClick(event) {
  if (event.target?.closest?.('[data-rvm-report-open]')) {
    event.preventDefault();
    event.stopPropagation();
    openDialog();
    return;
  }
  if (event.target?.closest?.('[data-rvm-report-quick-csv]')) {
    event.preventDefault();
    event.stopPropagation();
    exportReport('csv', 'visible');
  }
}

function attach() {
  const root = rootEl();
  if (!root) return false;
  injectToolbar(root);
  return true;
}

function injectStyles() {
  if (document.getElementById('rvm-report-export-bridge-style')) return;
  const style = document.createElement('style');
  style.id = 'rvm-report-export-bridge-style';
  style.textContent = `
    .rvm-report-export-tool-group .rvm-tool-btn span:first-child{font-size:10px}.rvm-report-export-summary{margin-top:3px;color:#94a3b8;font-size:9.5px;white-space:nowrap}
    .rvm-report-export-dialog{position:fixed;inset:0;display:none;align-items:flex-start;justify-content:center;padding-top:92px;background:rgba(2,6,23,.42);z-index:12010}.rvm-report-export-dialog.is-open{display:flex}
    .rvm-report-export-card{width:min(520px,calc(100vw - 44px));display:grid;gap:10px;border:1px solid rgba(126,190,255,.28);border-radius:12px;background:#0b1424;box-shadow:0 22px 70px rgba(0,0,0,.48);padding:12px;color:#dbeafe}
    .rvm-report-export-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.rvm-report-export-head b{font-size:14px;color:#bfdbfe}.rvm-report-export-head small{display:block;color:#7f94b7;font-size:9px}.rvm-report-export-head button{border:1px solid rgba(148,163,184,.28);background:#111827;color:#e5e7eb;border-radius:7px;width:28px;height:26px}
    .rvm-report-export-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.rvm-report-export-controls label{display:flex;align-items:center;gap:6px;color:#bcd8ff;font-size:12px}.rvm-report-export-controls select{border:1px solid rgba(126,190,255,.24);border-radius:7px;background:#111827;color:#e5e7eb;padding:7px 8px}.rvm-report-export-controls button,.rvm-report-export-actions button{border:1px solid rgba(126,190,255,.24);border-radius:7px;background:#132238;color:#dbeafe;padding:7px 9px}
    .rvm-report-export-summary-box{border:1px solid rgba(126,190,255,.15);border-radius:8px;background:rgba(255,255,255,.035);padding:8px;color:#dbeafe;font-size:12px}.rvm-report-export-actions{display:flex;gap:8px;flex-wrap:wrap}.rvm-report-export-note{margin:0;color:#8ea8c8;font-size:10.5px;line-height:1.35}
  `;
  document.head.appendChild(style);
}

export function installRvmReportExportBridge() {
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
    attach();
    const toolbarSummary = rootEl()?.querySelector?.('[data-rvm-report-toolbar-summary]');
    if (toolbarSummary) toolbarSummary.textContent = 'Report: ready for selected / visible / hidden / full';
  }, 320));
  globalThis.__PCF_GLB_RVM_REPORT_EXPORT__ = {
    version: BRIDGE_VERSION,
    collectReportRows,
    exportReport,
    rowsToCsv,
    open: openDialog,
    limits: { MAX_EXPORT_ROWS, MAX_SCAN_OBJECTS },
  };
}
