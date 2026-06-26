import * as THREE from 'three';

const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-model-health-bridge-v1');
const BRIDGE_VERSION = '20260621-rvm-model-health-1';
const MAX_HEALTH_SCAN_OBJECTS = 150000;
const MAX_KIND_ROWS = 14;
const LABEL_SOFT_LIMIT = 1200;
const LABEL_HARD_LIMIT = 5000;

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function rootEl() {
  return typeof document === 'undefined' ? null : document.querySelector('[data-rvm-viewer]');
}

function viewer() {
  return globalThis.__3D_RVM_VIEWER__ || null;
}

function state() {
  return globalThis.__PCF_GLB_APP_STATE__ || globalThis.__PCF_GLB_STATE__ || null;
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

function objectKind(obj) {
  const data = obj?.userData || {};
  const attrs = attrsFor(obj);
  return String(firstDefined(data.type, data.kind, attrs.TYPE, attrs.RVM_TYPE, data.effectiveRenderPrimitive, data.renderPrimitive, attrs.RVM_BROWSER_RENDER_PRIMITIVE, 'NODE')).toUpperCase();
}

function objectPrimitive(obj) {
  const data = obj?.userData || {};
  const attrs = attrsFor(obj);
  return String(firstDefined(data.effectiveRenderPrimitive, data.renderPrimitive, attrs.RVM_BROWSER_RENDER_PRIMITIVE, attrs.RVM_PRIMITIVE_KIND, attrs.RVM_PRIMITIVE_CODE, 'UNKNOWN')).toUpperCase();
}

function bumpCounter(map, key) {
  const safe = String(key || 'UNKNOWN').toUpperCase();
  map.set(safe, (map.get(safe) || 0) + 1);
}

function topRows(map, limit = MAX_KIND_ROWS) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function safeNumber(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function fileKey() {
  const v = viewer();
  const root = rootEl();
  return String(firstDefined(v?.loadedFileName, v?.sourceFileName, root?.dataset?.rvmFileName, 'rvm-model')).slice(0, 160);
}

function classifySeverity(summary) {
  if (!summary.renderedObjects) return { level: 'empty', label: 'No rendered model', note: 'Load an RVM model first.' };
  if (summary.capped) return { level: 'warn', label: 'Scan capped', note: `Scanned first ${summary.scanLimit.toLocaleString()} objects.` };
  if (summary.fallbackObjects > Math.max(500, summary.renderedObjects * 0.25)) return { level: 'warn', label: 'High fallback count', note: 'Many objects are diagnostic fallback geometry.' };
  if (summary.visibleObjects > LABEL_HARD_LIMIT) return { level: 'warn', label: 'Label risk high', note: 'Use scoped labels on selected hierarchy branches only.' };
  return { level: 'ok', label: 'Model health OK', note: 'Rendered-object diagnostics are within browser guardrails.' };
}

function computeModelBox(objects) {
  const box = new THREE.Box3();
  let hasBox = false;
  for (const obj of objects) {
    try {
      const childBox = new THREE.Box3().setFromObject(obj);
      if (!childBox || childBox.isEmpty()) continue;
      box.union(childBox);
      hasBox = true;
    } catch (_) {}
  }
  if (!hasBox || box.isEmpty()) return null;
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  return {
    min: { x: safeNumber(box.min.x), y: safeNumber(box.min.y), z: safeNumber(box.min.z) },
    max: { x: safeNumber(box.max.x), y: safeNumber(box.max.y), z: safeNumber(box.max.z) },
    center: { x: safeNumber(center.x), y: safeNumber(center.y), z: safeNumber(center.z) },
    size: { x: safeNumber(size.x), y: safeNumber(size.y), z: safeNumber(size.z) },
  };
}

export function collectRvmModelHealth() {
  const v = viewer();
  const primitiveCounts = new Map();
  const typeCounts = new Map();
  const lodCounts = new Map();
  const objectsForBox = [];
  let scanned = 0;
  let capped = false;
  let renderedObjects = 0;
  let visibleObjects = 0;
  let hiddenObjects = 0;
  let meshObjects = 0;
  let lineObjects = 0;
  let pointsObjects = 0;
  let nativeFacetObjects = 0;
  let fallbackObjects = 0;
  let wireframePlaceholders = 0;
  let blockedSlabPromotions = 0;
  let pcfReadyObjects = 0;

  v?.modelGroup?.traverse?.((obj) => {
    if (!isRenderable(obj)) return;
    scanned += 1;
    if (scanned > MAX_HEALTH_SCAN_OBJECTS) { capped = true; return; }
    renderedObjects += 1;
    if (obj.visible === false) hiddenObjects += 1;
    else visibleObjects += 1;
    if (obj.isMesh) meshObjects += 1;
    else if (obj.isLine) lineObjects += 1;
    else if (obj.isPoints) pointsObjects += 1;
    if (objectsForBox.length < 6000) objectsForBox.push(obj);

    const data = obj.userData || {};
    const primitive = objectPrimitive(obj);
    const kind = objectKind(obj);
    bumpCounter(primitiveCounts, primitive);
    bumpCounter(typeCounts, kind);
    const lodState = firstDefined(data.rvmHierarchyLodState, data.rvmZoneLodState, data.rvmZoneLodLevel, data.browserRvmZoneLodState, 'normal');
    bumpCounter(lodCounts, lodState || 'normal');
    if (data.browserRvmNativeFacetPrimary) nativeFacetObjects += 1;
    if (data.browserRvmBboxPlaceholderWireframe || data.bboxPromotedSolidBlocked || /BBOX_PLACEHOLDER|_BBOX$/.test(primitive)) fallbackObjects += 1;
    if (data.browserRvmBboxPlaceholderWireframe) wireframePlaceholders += 1;
    if (data.bboxPromotedSolidBlocked) blockedSlabPromotions += 1;
    if (firstDefined(data.canonicalObjectId, data.sourceObjectId, data.sourcePath, data.displayName, data.name)) pcfReadyObjects += 1;
  });

  const appState = state();
  const extractState = appState?.rvmPcfExtract || appState?.rvm?.rvmPcfExtract || {};
  const hasBundleIndex = Boolean(appState?.rvm?.index || extractState?.sourceStatus === 'ready');
  const syntheticIndexAvailable = renderedObjects > 0 && pcfReadyObjects > 0;
  const labelRisk = visibleObjects > LABEL_HARD_LIMIT ? 'high' : visibleObjects > LABEL_SOFT_LIMIT ? 'medium' : 'low';
  const summary = {
    version: BRIDGE_VERSION,
    schema: 'rvm-model-health/v1',
    generatedAt: new Date().toISOString(),
    fileKey: fileKey(),
    scanLimit: MAX_HEALTH_SCAN_OBJECTS,
    scanned,
    capped,
    renderedObjects,
    visibleObjects,
    hiddenObjects,
    meshObjects,
    lineObjects,
    pointsObjects,
    nativeFacetObjects,
    fallbackObjects,
    wireframePlaceholders,
    blockedSlabPromotions,
    pcfReadyObjects,
    labelRisk,
    labelSoftLimit: LABEL_SOFT_LIMIT,
    labelHardLimit: LABEL_HARD_LIMIT,
    pcfReadiness: hasBundleIndex ? 'bundle-index-ready' : syntheticIndexAvailable ? 'synthetic-render-index-available' : 'not-ready',
    modelBox: computeModelBox(objectsForBox),
    primitiveCounts: topRows(primitiveCounts),
    typeCounts: topRows(typeCounts),
    lodCounts: topRows(lodCounts, 8),
  };
  summary.severity = classifySeverity(summary);
  return summary;
}

function setStatus(text, warning = false) {
  const el = rootEl()?.querySelector?.('#rvm-sb-msg');
  if (!el) return;
  el.textContent = text;
  el.style.color = warning ? '#ffcf70' : '';
}

function healthBadge(summary) {
  const sev = summary.severity || classifySeverity(summary);
  return `<span class="rvm-model-health-badge is-${esc(sev.level)}">${esc(sev.label)}</span>`;
}

function rowsHtml(rows = []) {
  if (!rows.length) return '<li>None</li>';
  return rows.map((row) => `<li><span>${esc(row.name)}</span><b>${Number(row.count || 0).toLocaleString()}</b></li>`).join('');
}

function renderHealth(summary = collectRvmModelHealth()) {
  const dialog = document.getElementById('rvm-model-health-dialog');
  if (!dialog) return summary;
  const box = summary.modelBox?.size;
  const body = dialog.querySelector('[data-rvm-health-body]');
  if (body) {
    body.innerHTML = `
      <div class="rvm-model-health-status">${healthBadge(summary)}<span>${esc(summary.severity?.note || '')}</span></div>
      <div class="rvm-model-health-grid">
        <div><b>${summary.renderedObjects.toLocaleString()}</b><span>Rendered</span></div>
        <div><b>${summary.visibleObjects.toLocaleString()}</b><span>Visible</span></div>
        <div><b>${summary.hiddenObjects.toLocaleString()}</b><span>Hidden</span></div>
        <div><b>${summary.nativeFacetObjects.toLocaleString()}</b><span>Native facets</span></div>
        <div><b>${summary.fallbackObjects.toLocaleString()}</b><span>Fallbacks</span></div>
        <div><b>${summary.blockedSlabPromotions.toLocaleString()}</b><span>Slabs blocked</span></div>
      </div>
      <div class="rvm-model-health-readiness">
        <p><b>PCF readiness:</b> ${esc(summary.pcfReadiness)}</p>
        <p><b>Labels:</b> ${esc(summary.labelRisk)} risk · ${summary.visibleObjects.toLocaleString()} visible object(s)</p>
        <p><b>Scan:</b> ${summary.scanned.toLocaleString()}${summary.capped ? '+' : ''} object(s) · cap ${summary.scanLimit.toLocaleString()}</p>
        <p><b>Model size:</b> ${box ? `${box.x} × ${box.y} × ${box.z}` : 'not available'}</p>
      </div>
      <div class="rvm-model-health-columns">
        <section><h4>Primitive mix</h4><ul>${rowsHtml(summary.primitiveCounts)}</ul></section>
        <section><h4>Type mix</h4><ul>${rowsHtml(summary.typeCounts)}</ul></section>
        <section><h4>LOD / visibility state</h4><ul>${rowsHtml(summary.lodCounts)}</ul></section>
      </div>`;
  }
  const toolbarSummary = rootEl()?.querySelector?.('[data-rvm-health-toolbar-summary]');
  if (toolbarSummary) toolbarSummary.textContent = `Health: ${summary.visibleObjects.toLocaleString()} visible · ${summary.fallbackObjects.toLocaleString()} fallback · ${summary.pcfReadiness}`;
  setStatus(`Health: ${summary.severity?.label || 'ready'} · ${summary.renderedObjects.toLocaleString()} rendered object(s).`, summary.severity?.level === 'warn');
  return summary;
}

function ensureDialog() {
  let dialog = document.getElementById('rvm-model-health-dialog');
  if (dialog) return dialog;
  dialog = document.createElement('div');
  dialog.id = 'rvm-model-health-dialog';
  dialog.className = 'rvm-model-health-dialog';
  dialog.setAttribute('aria-hidden', 'true');
  dialog.innerHTML = `
    <div class="rvm-model-health-card" role="dialog" aria-modal="false" aria-label="RVM model health">
      <div class="rvm-model-health-head">
        <div><b>RVM Model Health</b><small>${esc(BRIDGE_VERSION)}</small></div>
        <button type="button" data-rvm-health-close="true" aria-label="Close health panel">×</button>
      </div>
      <div data-rvm-health-body class="rvm-model-health-body">Click refresh to inspect the current rendered RVM model.</div>
      <div class="rvm-model-health-actions">
        <button type="button" data-rvm-health-refresh="true">Refresh</button>
        <button type="button" data-rvm-health-copy="true">Copy Summary</button>
      </div>
    </div>`;
  document.body.appendChild(dialog);
  bindDialog(dialog);
  return dialog;
}

function openDialog() {
  const dialog = ensureDialog();
  dialog.classList.add('is-open');
  dialog.setAttribute('aria-hidden', 'false');
  renderHealth();
}

function closeDialog() {
  const dialog = document.getElementById('rvm-model-health-dialog');
  if (!dialog) return;
  dialog.classList.remove('is-open');
  dialog.setAttribute('aria-hidden', 'true');
}

async function copySummary() {
  const summary = collectRvmModelHealth();
  const text = `RVM health ${summary.fileKey}: ${summary.renderedObjects} rendered, ${summary.visibleObjects} visible, ${summary.fallbackObjects} fallback, PCF ${summary.pcfReadiness}, labels ${summary.labelRisk}`;
  try {
    await navigator.clipboard?.writeText?.(text);
    setStatus('Health: copied summary.');
  } catch (_) {
    setStatus('Health: clipboard unavailable.', true);
  }
  renderHealth(summary);
  return summary;
}

function bindDialog(dialog) {
  dialog.addEventListener('click', (event) => {
    if (event.target?.closest?.('[data-rvm-health-close]')) { closeDialog(); return; }
    if (event.target?.closest?.('[data-rvm-health-refresh]')) { renderHealth(); return; }
    if (event.target?.closest?.('[data-rvm-health-copy]')) copySummary();
  }, true);
}

function injectToolbar(root) {
  const ribbon = root?.querySelector?.('.geo-top-ribbon');
  if (!ribbon) return;
  let section = ribbon.querySelector('.rvm-model-health-tool-group');
  if (section?.dataset?.rvmModelHealth === BRIDGE_VERSION) return;
  if (!section) {
    section = document.createElement('div');
    section.className = 'rvm-ribbon-section rvm-tool-group rvm-model-health-tool-group';
    const report = ribbon.querySelector('.rvm-report-export-tool-group');
    ribbon.insertBefore(section, report?.nextSibling || ribbon.querySelector('.rvm-policy-info-tool-group') || null);
  }
  section.dataset.rvmModelHealth = BRIDGE_VERSION;
  section.innerHTML = `
    <span class="rvm-ribbon-label">Health</span>
    <div class="rvm-ribbon-button-row">
      <button type="button" class="rvm-tool-btn" data-rvm-health-open="true" title="Inspect RVM model health"><span aria-hidden="true">⚕</span><span>Model</span></button>
      <button type="button" class="rvm-tool-btn" data-rvm-health-refresh-toolbar="true" title="Refresh RVM model health"><span aria-hidden="true">↻</span><span>Refresh</span></button>
    </div>
    <div class="rvm-model-health-summary" data-rvm-health-toolbar-summary>Health: load model to inspect</div>`;
}

function onDocumentClick(event) {
  if (event.target?.closest?.('[data-rvm-health-open]')) {
    event.preventDefault();
    event.stopPropagation();
    openDialog();
    return;
  }
  if (event.target?.closest?.('[data-rvm-health-refresh-toolbar]')) {
    event.preventDefault();
    event.stopPropagation();
    renderHealth();
  }
}

function attach() {
  const root = rootEl();
  if (!root) return false;
  injectToolbar(root);
  return true;
}

function injectStyles() {
  if (document.getElementById('rvm-model-health-bridge-style')) return;
  const style = document.createElement('style');
  style.id = 'rvm-model-health-bridge-style';
  style.textContent = `
    .rvm-model-health-tool-group .rvm-tool-btn span:first-child{font-size:12px}.rvm-model-health-summary{margin-top:3px;color:#94a3b8;font-size:9.5px;white-space:nowrap;max-width:230px;overflow:hidden;text-overflow:ellipsis}
    .rvm-model-health-dialog{position:fixed;inset:0;display:none;align-items:flex-start;justify-content:center;padding-top:88px;background:rgba(2,6,23,.42);z-index:12020}.rvm-model-health-dialog.is-open{display:flex}
    .rvm-model-health-card{width:min(760px,calc(100vw - 44px));display:grid;gap:10px;border:1px solid rgba(126,190,255,.28);border-radius:12px;background:#0b1424;box-shadow:0 22px 70px rgba(0,0,0,.48);padding:12px;color:#dbeafe}.rvm-model-health-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.rvm-model-health-head b{font-size:14px;color:#bfdbfe}.rvm-model-health-head small{display:block;color:#7f94b7;font-size:9px}.rvm-model-health-head button{border:1px solid rgba(148,163,184,.28);background:#111827;color:#e5e7eb;border-radius:7px;width:28px;height:26px}
    .rvm-model-health-status{display:flex;align-items:center;gap:8px;border:1px solid rgba(126,190,255,.16);border-radius:8px;background:rgba(255,255,255,.035);padding:8px;font-size:12px}.rvm-model-health-badge{display:inline-flex;border-radius:999px;padding:3px 8px;font-weight:700}.rvm-model-health-badge.is-ok{background:rgba(34,197,94,.15);color:#86efac}.rvm-model-health-badge.is-warn{background:rgba(245,158,11,.17);color:#fde68a}.rvm-model-health-badge.is-empty{background:rgba(148,163,184,.18);color:#cbd5e1}
    .rvm-model-health-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}.rvm-model-health-grid div{border:1px solid rgba(126,190,255,.14);border-radius:8px;background:rgba(255,255,255,.035);padding:8px}.rvm-model-health-grid b{display:block;font-size:15px;color:#e0f2fe}.rvm-model-health-grid span{font-size:10.5px;color:#8ea8c8}.rvm-model-health-readiness{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 12px;color:#bfd7f7;font-size:12px}.rvm-model-health-readiness p{margin:0}
    .rvm-model-health-columns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.rvm-model-health-columns section{border:1px solid rgba(126,190,255,.14);border-radius:8px;background:rgba(255,255,255,.025);padding:8px}.rvm-model-health-columns h4{margin:0 0 6px;color:#bfdbfe;font-size:12px}.rvm-model-health-columns ul{list-style:none;margin:0;padding:0;display:grid;gap:3px}.rvm-model-health-columns li{display:flex;justify-content:space-between;gap:8px;color:#cbd5e1;font-size:11px}.rvm-model-health-columns li span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rvm-model-health-actions{display:flex;gap:8px;flex-wrap:wrap}.rvm-model-health-actions button{border:1px solid rgba(126,190,255,.24);border-radius:7px;background:#132238;color:#dbeafe;padding:7px 9px}
    @media(max-width:820px){.rvm-model-health-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.rvm-model-health-columns,.rvm-model-health-readiness{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

export function installRvmModelHealthBridge() {
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
    renderHealth();
  }, 420));
  globalThis.addEventListener?.('rvm-visibility-changed', () => setTimeout(() => renderHealth(), 80));
  globalThis.__PCF_GLB_RVM_MODEL_HEALTH__ = {
    version: BRIDGE_VERSION,
    collectRvmModelHealth,
    renderHealth,
    open: openDialog,
    limits: { MAX_HEALTH_SCAN_OBJECTS, LABEL_SOFT_LIMIT, LABEL_HARD_LIMIT },
  };
}
