import { exampleCalculationInputPackage, resolveCalculationInputs, GEOMETRY_CALCULATION_INPUT_SCHEMA, GEOMETRY_CALCULATION_INPUT_VERSION } from './GeometryCalculationInputResolver.js?v=20260622-geometry-input-resolver-1';

const INSTALL_FLAG = Symbol.for('pcf-glb-geometry-calculation-input-bridge-v1');
const BRIDGE_VERSION = GEOMETRY_CALCULATION_INPUT_VERSION;
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

function mappedObjects() {
  const state = workspaceState();
  const active = state.activeObjectIds instanceof Set ? state.activeObjectIds : new Set(state.activeObjectIds || []);
  const objects = Array.isArray(state.mapping?.mappedObjects) ? state.mapping.mappedObjects : [];
  return active.size ? objects.filter((object) => active.has(object.sourceId || object.id)) : objects;
}

function currentDialog() {
  return document.getElementById('geometry-calculation-input-dialog');
}

function inputTextArea() {
  return currentDialog()?.querySelector?.('[data-gci-input]') || null;
}

function parseInputPackage() {
  const textarea = inputTextArea();
  const text = textarea?.value?.trim() || '{}';
  return JSON.parse(text);
}

function renderResolutionSummary(resolution) {
  if (!resolution) return '<div class="gci-empty">No input package resolved yet.</div>';
  const summary = resolution.inputSummary || {};
  return `<div class="gci-summary">
    <div><b>${esc(resolution.objectCount)}</b><span>mapped objects</span></div>
    <div><b>${esc(resolution.resolvedCount)}</b><span>resolved</span></div>
    <div><b>${esc(resolution.unresolvedCount)}</b><span>unresolved</span></div>
    <div><b>${esc(summary.pipeRows || 0)}</b><span>pipe rows</span></div>
    <div><b>${esc(summary.processRows || 0)}</b><span>process rows</span></div>
    <div><b>${esc(summary.materialRows || 0)}</b><span>material rows</span></div>
  </div>`;
}

function renderResolvedRows(resolution) {
  const rows = Array.isArray(resolution?.resolvedObjects) ? resolution.resolvedObjects.slice(0, 120) : [];
  if (!rows.length) return '<div class="gci-empty">No resolved rows to show.</div>';
  return `<div class="gci-table-wrap"><table><thead><tr><th>Object</th><th>Family</th><th>Support</th><th>OD</th><th>WT</th><th>Material</th><th>Density</th><th>Audit</th></tr></thead><tbody>${rows.map((object) => `<tr>
    <td title="${esc(object.sourceId || object.id)}">${esc(object.displayName || object.id)}</td>
    <td>${esc(object.family || '')}</td>
    <td>${esc(object.support?.supportType || '')}</td>
    <td>${esc(object.pipe?.odMm ?? '')}</td>
    <td>${esc(object.pipe?.wallThicknessMm ?? '')}</td>
    <td>${esc(object.pipe?.material || '')}</td>
    <td>${esc(object.process?.fluidDensityKgM3 ?? '')}</td>
    <td>${esc((object.mappingAudit || []).filter((item) => item.source === 'CALCULATION_INPUT_RESOLVER').length)}</td>
  </tr>`).join('')}</tbody></table></div>`;
}

function renderDialog() {
  const dialog = currentDialog();
  if (!dialog) return;
  dialog.querySelector('[data-gci-body]').innerHTML = `
    <div class="gci-toolbar"><button type="button" data-gci-sample="true">Load Sample</button><button type="button" data-gci-apply="true">Apply Inputs</button><button type="button" data-gci-open-calc="true">Open Calc</button><button type="button" data-gci-export="true">Export Resolved JSON</button><span>${mappedObjects().length} active mapped object(s)</span></div>
    <p class="gci-note">Paste JSON input rows for pipe schedule, process, material, or weight data. Resolver only maps supplied values with audit trails; it does not fabricate missing calculation data.</p>
    <textarea data-gci-input spellcheck="false" placeholder='{"pipeRows":[],"processRows":[],"materialRows":[],"weightRows":[]}'></textarea>
    ${renderResolutionSummary(lastResolution)}
    ${renderResolvedRows(lastResolution)}`;
}

function ensureDialog() {
  let dialog = currentDialog();
  if (dialog) return dialog;
  dialog = document.createElement('div');
  dialog.id = 'geometry-calculation-input-dialog';
  dialog.className = 'geometry-calculation-input-dialog';
  dialog.innerHTML = `<div class="gci-card" role="dialog" aria-label="Geometry Calculation Inputs"><div class="gci-head"><div><b>Geometry Calculation Inputs</b><small>${BRIDGE_VERSION} · external data resolver</small></div><button type="button" data-gci-close="true">x</button></div><div data-gci-body></div></div>`;
  document.body.appendChild(dialog);
  dialog.addEventListener('click', (event) => {
    if (event.target?.closest?.('[data-gci-close]')) { dialog.classList.remove('is-open'); return; }
    if (event.target?.closest?.('[data-gci-sample]')) { inputTextArea().value = JSON.stringify(exampleCalculationInputPackage(), null, 2); return; }
    if (event.target?.closest?.('[data-gci-apply]')) { applyInputs(); return; }
    if (event.target?.closest?.('[data-gci-open-calc]')) { globalThis.__PCF_GLB_GEOMETRY_CALCULATION_CANVAS__?.open?.(); return; }
    if (event.target?.closest?.('[data-gci-export]')) { exportResolution(); }
  }, true);
  return dialog;
}

function applyInputs() {
  let inputPackage;
  try { inputPackage = parseInputPackage(); }
  catch (error) { alert(`Invalid JSON input package: ${error.message}`); return null; }
  lastResolution = resolveCalculationInputs(mappedObjects(), inputPackage);
  const state = workspaceState();
  if (state && typeof state === 'object') {
    state.calculationInputs = { package: inputPackage, resolution: lastResolution };
    state.calculationResolvedObjects = lastResolution.resolvedObjects;
  }
  renderDialog();
  return lastResolution;
}

function exportResolution() {
  if (!lastResolution) applyInputs();
  if (!lastResolution) return;
  const blob = new Blob([JSON.stringify(lastResolution, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'geometry-calculation-input-resolution.json';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openInputDialog() {
  const dialog = ensureDialog();
  dialog.classList.add('is-open');
  renderDialog();
}

function injectToolbar(root) {
  const section = root?.querySelector?.('.geometry-export-workspace-tool-group');
  if (!section || section.querySelector('[data-geometry-calculation-input-open]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'rvm-tool-btn';
  button.dataset.geometryCalculationInputOpen = 'true';
  button.title = 'Resolve schedule/material/process/weight data onto mapped geometry';
  button.innerHTML = '<span aria-hidden="true">INPUT</span><span>Data</span>';
  section.querySelector('.rvm-ribbon-button-row')?.appendChild(button);
}

function injectStyles() {
  if (document.getElementById('geometry-calculation-input-style')) return;
  const style = document.createElement('style');
  style.id = 'geometry-calculation-input-style';
  style.textContent = `.geometry-calculation-input-dialog{position:fixed;inset:0;display:none;align-items:flex-start;justify-content:center;padding:74px 20px;background:rgba(2,6,23,.50);z-index:12345}.geometry-calculation-input-dialog.is-open{display:flex}.gci-card{width:min(1180px,calc(100vw - 44px));max-height:calc(100vh - 92px);overflow:auto;background:#0b1424;border:1px solid rgba(126,190,255,.30);border-radius:14px;padding:12px;color:#dbeafe;box-shadow:0 24px 80px rgba(0,0,0,.55)}.gci-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.gci-head b{color:#bfdbfe}.gci-head small{display:block;color:#8ea8c8;font-size:10px}.gci-head button,.gci-toolbar button{border:1px solid rgba(126,190,255,.24);border-radius:8px;background:#132238;color:#dbeafe;padding:7px 10px}.gci-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}.gci-toolbar span,.gci-note{color:#9fb3cc;font-size:11px}.gci-card textarea{width:100%;min-height:170px;border:1px solid rgba(126,190,255,.18);border-radius:10px;background:#07111f;color:#dbeafe;padding:10px;font-family:ui-monospace,monospace;font-size:11px}.gci-summary{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin:8px 0}.gci-summary div{border:1px solid rgba(126,190,255,.15);border-radius:9px;padding:8px;background:rgba(255,255,255,.035)}.gci-summary b{display:block}.gci-summary span{display:block;color:#8ea8c8;font-size:11px}.gci-table-wrap{overflow:auto;max-height:430px}.gci-table-wrap table{border-collapse:collapse;min-width:100%;font-size:11px}.gci-table-wrap th,.gci-table-wrap td{border:1px solid rgba(126,190,255,.13);padding:5px 7px;text-align:left;white-space:nowrap}.gci-table-wrap th{position:sticky;top:0;background:#132238;color:#bfdbfe;z-index:1}.gci-empty{padding:16px;border:1px dashed rgba(148,163,184,.22);border-radius:10px;color:#9fb3cc;text-align:center}`;
  document.head.appendChild(style);
}

function attach() {
  const root = document.querySelector('[data-rvm-viewer]');
  if (!root) return false;
  injectToolbar(root);
  return true;
}

function onDocumentClick(event) {
  if (!event.target?.closest?.('[data-geometry-calculation-input-open]')) return;
  event.preventDefault();
  event.stopPropagation();
  openInputDialog();
}

export function installGeometryCalculationInputBridge() {
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
  globalThis.__PCF_GLB_GEOMETRY_CALCULATION_INPUTS__ = {
    version: BRIDGE_VERSION,
    schema: GEOMETRY_CALCULATION_INPUT_SCHEMA,
    open: openInputDialog,
    apply: applyInputs,
    lastResolution: () => lastResolution
  };
}
