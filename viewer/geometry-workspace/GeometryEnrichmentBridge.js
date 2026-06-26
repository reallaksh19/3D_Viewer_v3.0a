import { exampleGeometryEnrichmentPackage, resolveGeometryEnrichment, GEOMETRY_ENRICHMENT_RESOLVER_SCHEMA, GEOMETRY_ENRICHMENT_VERSION } from './GeometryEnrichmentResolver.js?v=20260622-geometry-enrichment-1';

const INSTALL_FLAG = Symbol.for('pcf-glb-geometry-enrichment-bridge-v1');
const BRIDGE_VERSION = GEOMETRY_ENRICHMENT_VERSION;
let lastResolution = null;

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function workspaceApi() {
  return globalThis.__PCF_GLB_GEOMETRY_EXPORT_WORKSPACE__ || null;
}

function workspaceState() {
  return workspaceApi()?.state?.() || {};
}

function activeMappedObjects() {
  const state = workspaceState();
  const active = state.activeObjectIds instanceof Set ? state.activeObjectIds : new Set(state.activeObjectIds || []);
  const source = Array.isArray(state.calculationResolvedObjects) && state.calculationResolvedObjects.length
    ? state.calculationResolvedObjects
    : state.mapping?.mappedObjects;
  const objects = Array.isArray(source) ? source : [];
  return active.size ? objects.filter((object) => active.has(object.sourceId || object.id)) : objects;
}

function currentDialog() {
  return document.getElementById('geometry-enrichment-dialog');
}

function inputTextArea() {
  return currentDialog()?.querySelector?.('[data-gen-input]') || null;
}

function parseInputPackage() {
  const text = inputTextArea()?.value?.trim() || '{}';
  return JSON.parse(text);
}

function renderSummary(resolution) {
  if (!resolution) return '<div class="gen-empty">No enrichment has been resolved yet.</div>';
  const master = resolution.masterSummary || {};
  return `<div class="gen-summary">
    <div><b>${esc(resolution.objectCount)}</b><span>active mapped objects</span></div>
    <div><b>${esc(resolution.enrichedCount)}</b><span>clean enriched</span></div>
    <div><b>${esc(resolution.reviewCount)}</b><span>needs review</span></div>
    <div><b>${esc(master.lineListRows || 0)}</b><span>line-list rows</span></div>
    <div><b>${esc(master.pipingClassRows || 0)}</b><span>class rows</span></div>
    <div><b>${esc(master.materialRows || 0)}</b><span>material rows</span></div>
    <div><b>${esc(master.weightRows || 0)}</b><span>weight rows</span></div>
    <div><b>${esc(Object.keys(master.lineListFieldMap || {}).length)}</b><span>line-list mappings</span></div>
  </div>`;
}

function renderRows(resolution) {
  const rows = Array.isArray(resolution?.enrichedObjects) ? resolution.enrichedObjects.slice(0, 160) : [];
  if (!rows.length) return '<div class="gen-empty">No enriched rows to show.</div>';
  return `<div class="gen-table-wrap"><table><thead><tr><th>Object</th><th>Family</th><th>Line Key</th><th>Class</th><th>Rating</th><th>WT</th><th>CA</th><th>P</th><th>Hydro</th><th>T1/T2/T3</th><th>Material</th><th>Weight</th><th>Review</th></tr></thead><tbody>${rows.map((object) => {
    const e = object.geometryEnrichment || {};
    const warnings = e.review?.warnings || [];
    return `<tr>
      <td title="${esc(object.sourceId || object.id)}">${esc(object.displayName || object.id)}</td>
      <td>${esc(object.family || '')}</td>
      <td>${esc(e.branch?.lineKey || '')}</td>
      <td>${esc(e.piping?.resolvedPipingClass || e.piping?.requestedPipingClass || '')}</td>
      <td>${esc(e.piping?.rating || '')}</td>
      <td>${esc(e.piping?.wallThicknessMm ?? '')}</td>
      <td>${esc(e.piping?.corrosionAllowanceMm ?? '')}</td>
      <td>${esc(e.process?.pressureKPa ?? '')}</td>
      <td>${esc(e.process?.hydroPressureKPa ?? '')}</td>
      <td>${esc([e.process?.temperature1C, e.process?.temperature2C, e.process?.temperature3C].filter((v) => v !== null && v !== undefined && v !== '').join(' / '))}</td>
      <td>${esc(e.piping?.materialName || e.piping?.materialCode || '')}</td>
      <td>${esc(e.weight?.componentWeightKg ?? '')}</td>
      <td title="${esc(warnings.join(', '))}">${warnings.length ? 'REVIEW' : 'OK'}</td>
    </tr>`;
  }).join('')}</tbody></table></div>`;
}

function renderDialog() {
  const dialog = currentDialog();
  if (!dialog) return;
  dialog.querySelector('[data-gen-body]').innerHTML = `
    <div class="gen-toolbar">
      <button type="button" data-gen-sample="true">Load Sample</button>
      <button type="button" data-gen-resolve="true">Resolve Enrichment</button>
      <button type="button" data-gen-writeback="true">Write Back to Canvas</button>
      <button type="button" data-gen-open-workspace="true">Open Workspace</button>
      <button type="button" data-gen-export="true">Export Enrichment JSON</button>
      <span>${activeMappedObjects().length} active mapped object(s)</span>
    </div>
    <p class="gen-note">Paste Rich XML→CII-style master package JSON. Branch name is treated as the primary identity; line list, piping class, material, and weight masters are resolved into per-element geometryEnrichment fields. No load formula is run here.</p>
    <textarea data-gen-input spellcheck="false" placeholder='{"lineListRows":[],"pipingClassRows":[],"materialRows":[],"weightRows":[],"config":{}}'></textarea>
    ${renderSummary(lastResolution)}
    ${renderRows(lastResolution)}`;
}

function ensureDialog() {
  let dialog = currentDialog();
  if (dialog) return dialog;
  dialog = document.createElement('div');
  dialog.id = 'geometry-enrichment-dialog';
  dialog.className = 'geometry-enrichment-dialog';
  dialog.innerHTML = `<div class="gen-card" role="dialog" aria-label="Geometry Enrichment Resolver"><div class="gen-head"><div><b>Geometry Enrichment Resolver</b><small>${BRIDGE_VERSION} · Rich XML→CII masters → canvas fields</small></div><button type="button" data-gen-close="true">x</button></div><div data-gen-body></div></div>`;
  document.body.appendChild(dialog);
  dialog.addEventListener('click', (event) => {
    if (event.target?.closest?.('[data-gen-close]')) { dialog.classList.remove('is-open'); return; }
    if (event.target?.closest?.('[data-gen-sample]')) { inputTextArea().value = JSON.stringify(exampleGeometryEnrichmentPackage(), null, 2); return; }
    if (event.target?.closest?.('[data-gen-resolve]')) { resolveFromUi(); return; }
    if (event.target?.closest?.('[data-gen-writeback]')) { writeBackToCanvas(); return; }
    if (event.target?.closest?.('[data-gen-open-workspace]')) { workspaceApi()?.open?.(); return; }
    if (event.target?.closest?.('[data-gen-export]')) { exportResolution(); }
  }, true);
  return dialog;
}

function openDialog() {
  const dialog = ensureDialog();
  dialog.classList.add('is-open');
  renderDialog();
}

function resolveFromUi() {
  let inputPackage;
  try { inputPackage = parseInputPackage(); }
  catch (error) { alert(`Invalid enrichment JSON package: ${error.message}`); return null; }
  lastResolution = resolveGeometryEnrichment(activeMappedObjects(), inputPackage);
  const state = workspaceState();
  if (state && typeof state === 'object') {
    state.enrichment = { package: inputPackage, resolution: lastResolution };
    state.geometryEnrichedObjects = lastResolution.enrichedObjects;
    state.calculationResolvedObjects = lastResolution.enrichedObjects;
  }
  renderDialog();
  return lastResolution;
}

function objectIdFromUserData(obj) {
  const data = obj?.userData || {};
  return String(data.canonicalObjectId || data.rvmCanonicalId || data.sourceObjectId || data.objectId || obj?.name || obj?.uuid || '').trim();
}

function writeBackToCanvas() {
  if (!lastResolution) resolveFromUi();
  if (!lastResolution) return { updated: 0, total: 0 };
  const byId = new Map((lastResolution.enrichedObjects || []).map((object) => [String(object.sourceId || object.id), object.geometryEnrichment]));
  const viewer = globalThis.__3D_RVM_VIEWER__ || null;
  let updated = 0;
  let total = 0;
  viewer?.modelGroup?.traverse?.((obj) => {
    const id = objectIdFromUserData(obj);
    if (!id || !byId.has(id)) return;
    total += 1;
    obj.userData = obj.userData || {};
    obj.userData.geometryEnrichment = byId.get(id);
    obj.userData.enrichedFields = lastResolution.enrichedObjects.find((entry) => String(entry.sourceId || entry.id) === id)?.enrichedFields || {};
    updated += 1;
  });
  const state = workspaceState();
  if (state && typeof state === 'object') state.enrichmentWriteBack = { updated, total, writtenAt: new Date().toISOString() };
  renderDialog();
  alert(`Geometry enrichment written back to ${updated} rendered canvas object(s).`);
  return { updated, total };
}

function exportResolution() {
  if (!lastResolution) resolveFromUi();
  if (!lastResolution) return;
  const blob = new Blob([JSON.stringify(lastResolution, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'geometry-enrichment-resolution.json';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function injectToolbar(root) {
  const section = root?.querySelector?.('.geometry-export-workspace-tool-group');
  if (!section || section.querySelector('[data-geometry-enrichment-open]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'rvm-tool-btn';
  button.dataset.geometryEnrichmentOpen = 'true';
  button.title = 'Resolve process, piping class, material, wall, corrosion, hydro pressure, and weights onto canvas geometry';
  button.innerHTML = '<span aria-hidden="true">ENRICH</span><span>Resolve</span>';
  section.querySelector('.rvm-ribbon-button-row')?.appendChild(button);
}

function injectStyles() {
  if (document.getElementById('geometry-enrichment-style')) return;
  const style = document.createElement('style');
  style.id = 'geometry-enrichment-style';
  style.textContent = `.geometry-enrichment-dialog{position:fixed;inset:0;display:none;align-items:flex-start;justify-content:center;padding:74px 20px;background:rgba(2,6,23,.55);z-index:12370}.geometry-enrichment-dialog.is-open{display:flex}.gen-card{width:min(1240px,calc(100vw - 44px));max-height:calc(100vh - 92px);overflow:auto;background:#0b1424;border:1px solid rgba(126,190,255,.30);border-radius:14px;padding:12px;color:#dbeafe;box-shadow:0 24px 80px rgba(0,0,0,.58)}.gen-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.gen-head b{color:#bfdbfe}.gen-head small{display:block;color:#8ea8c8;font-size:10px}.gen-head button,.gen-toolbar button{border:1px solid rgba(126,190,255,.24);border-radius:8px;background:#132238;color:#dbeafe;padding:7px 10px}.gen-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}.gen-toolbar span,.gen-note{color:#9fb3cc;font-size:11px}.gen-card textarea{width:100%;min-height:190px;border:1px solid rgba(126,190,255,.18);border-radius:10px;background:#07111f;color:#dbeafe;padding:10px;font-family:ui-monospace,monospace;font-size:11px}.gen-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:8px 0}.gen-summary div{border:1px solid rgba(126,190,255,.15);border-radius:9px;padding:8px;background:rgba(255,255,255,.035)}.gen-summary b{display:block}.gen-summary span{display:block;color:#8ea8c8;font-size:11px}.gen-table-wrap{overflow:auto;max-height:430px}.gen-table-wrap table{border-collapse:collapse;min-width:100%;font-size:11px}.gen-table-wrap th,.gen-table-wrap td{border:1px solid rgba(126,190,255,.13);padding:5px 7px;text-align:left;white-space:nowrap}.gen-table-wrap th{position:sticky;top:0;background:#132238;color:#bfdbfe;z-index:1}.gen-empty{padding:16px;border:1px dashed rgba(148,163,184,.22);border-radius:10px;color:#9fb3cc;text-align:center}`;
  document.head.appendChild(style);
}

function attach() {
  const root = document.querySelector('[data-rvm-viewer]');
  if (!root) return false;
  injectToolbar(root);
  return true;
}

function onDocumentClick(event) {
  if (!event.target?.closest?.('[data-geometry-enrichment-open]')) return;
  event.preventDefault();
  event.stopPropagation();
  openDialog();
}

export function installGeometryEnrichmentBridge() {
  if (typeof document === 'undefined') return;
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;
  injectStyles();
  document.addEventListener('click', onDocumentClick, true);
  let attempts = 0;
  const waitAttach = () => { attempts += 1; if (!attach() && attempts < 180) setTimeout(waitAttach, 300); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitAttach, { once: true });
  else waitAttach();
  globalThis.addEventListener?.('rvm-model-loaded', () => setTimeout(waitAttach, 320));
  globalThis.__PCF_GLB_GEOMETRY_ENRICHMENT__ = {
    version: BRIDGE_VERSION,
    schema: GEOMETRY_ENRICHMENT_RESOLVER_SCHEMA,
    open: openDialog,
    resolve: resolveFromUi,
    writeBackToCanvas,
    lastResolution: () => lastResolution,
  };
}
