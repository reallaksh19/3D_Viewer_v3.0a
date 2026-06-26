import { buildSupportLoadPipeCsv, buildSupportLoadSupportCsv } from './GeometrySupportLoadReportExporter.js?v=20260622-support-load-result-report-1';
import { buildSupportLoadBulkPackage, downloadSupportLoadBulkPackage, SUPPORT_LOAD_BULK_PACKAGE_SCHEMA, SUPPORT_LOAD_BULK_PACKAGE_VERSION } from './GeometrySupportLoadBulkPackageExporter.js?v=20260623-support-load-bulk-package-1';

const INSTALL_FLAG = Symbol.for('pcf-glb-geometry-support-load-bulk-package-bridge-v1');
let lastPackage = null;

function esc(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function state() { return globalThis.__PCF_GLB_GEOMETRY_EXPORT_WORKSPACE__?.state?.() || {}; }
function dialog() { return document.getElementById('geometry-support-load-bulk-package-dialog'); }
function reportApi() { return globalThis.__PCF_GLB_GEOMETRY_SUPPORT_LOAD_REPORTS__ || null; }
function stagedApi() { return globalThis.__PCF_GLB_GEOMETRY_ENRICHED_STAGEDJSON__ || null; }
function qaApi() { return globalThis.__PCF_GLB_GEOMETRY_SUPPORT_LOAD_QA__ || null; }
function conflictApi() { return globalThis.__PCF_GLB_GEOMETRY_SUPPORT_LOAD_CONFLICTS__ || null; }

function currentReport() { return reportApi()?.build?.() || state().supportLoadReport || null; }
function currentStagedJson() { return stagedApi()?.build?.() || state().enrichedStagedJson || null; }
function currentQa() { return qaApi()?.build?.() || state().supportLoadQaDashboard || null; }
function currentConflicts() { return conflictApi()?.build?.() || state().supportLoadConflictModel || null; }

function build() {
  const s = state();
  const report = currentReport();
  const stagedJson = currentStagedJson();
  const qaDashboard = currentQa();
  const conflictModel = currentConflicts();
  const pipeCsv = report ? buildSupportLoadPipeCsv(report) : '';
  const supportCsv = report ? buildSupportLoadSupportCsv(report) : '';
  lastPackage = buildSupportLoadBulkPackage({
    stagedJson,
    report,
    pipeCsv,
    supportCsv,
    qaDashboard,
    conflictModel,
    formulaResults: s.supportLoadFormulaResults,
    inputModel: s.supportLoadInputModel,
    masterData: s.supportLoadMasterData,
    writebackAudit: s.supportLoadFormulaResults?.writebackAudit,
  });
  if (s && typeof s === 'object') s.supportLoadBulkPackage = lastPackage;
  render();
  return lastPackage;
}

function summary(pkg) {
  if (!pkg) return '<div class="gslp-empty">Build the package after LOAD inputs, calc, report, and stagedJSON export are available.</div>';
  const s = pkg.summary || {};
  return `<div class="gslp-summary"><div><b>${esc(pkg.status)}</b><span>status</span></div><div><b>${esc(pkg.files?.length || 0)}</b><span>files</span></div><div><b>${esc(s.pipeReportRows || 0)}</b><span>pipe rows</span></div><div><b>${esc(s.supportReportRows || 0)}</b><span>support rows</span></div><div><b>${esc(s.stagedJsonElements || 0)}</b><span>staged elems</span></div><div><b>${esc(s.conflictCount || 0)}</b><span>conflicts</span></div></div>`;
}

function fileRows(pkg) {
  const rows = Array.isArray(pkg?.packageIndex) ? pkg.packageIndex : [];
  if (!rows.length) return '<div class="gslp-empty">No package file index yet.</div>';
  return `<h4>Package Files</h4><div class="gslp-table-wrap"><table><thead><tr><th>Path</th><th>Kind</th><th>Media type</th><th>Bytes</th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(row.path)}</td><td>${esc(row.kind)}</td><td>${esc(row.mediaType)}</td><td>${esc(row.sizeBytes)}</td></tr>`).join('')}</tbody></table></div>`;
}

function render() {
  const d = dialog();
  if (!d) return;
  d.querySelector('[data-gslp-body]').innerHTML = `<div class="gslp-toolbar"><button type="button" data-gslp-build="true">Build Package</button><button type="button" data-gslp-download="true">Download Package JSON</button><button type="button" data-gslp-report="true">Open Report</button><button type="button" data-gslp-staged="true">Rebuild StagedJSON</button><button type="button" data-gslp-qa="true">Open QA</button></div><p class="gslp-note">Bulk package is export-only. It bundles stagedJSON, support-load report JSON, pipe/support CSV, QA/conflict/master/input audit data. It does not hydrate, calculate, top-up, or mutate support-load fields.</p>${summary(lastPackage)}${fileRows(lastPackage)}`;
}

function download() {
  if (!lastPackage) build();
  if (lastPackage) downloadSupportLoadBulkPackage(lastPackage);
}

function ensure() {
  let d = dialog();
  if (d) return d;
  d = document.createElement('div');
  d.id = 'geometry-support-load-bulk-package-dialog';
  d.className = 'geometry-support-load-bulk-package-dialog';
  d.innerHTML = `<div class="gslp-card" role="dialog"><div class="gslp-head"><div><b>Support Load Bulk Export Package</b><small>${SUPPORT_LOAD_BULK_PACKAGE_VERSION} · ${SUPPORT_LOAD_BULK_PACKAGE_SCHEMA}</small></div><button type="button" data-gslp-close="true">x</button></div><div data-gslp-body></div></div>`;
  document.body.appendChild(d);
  d.addEventListener('click', e => {
    if (e.target?.closest?.('[data-gslp-close]')) { d.classList.remove('is-open'); return; }
    if (e.target?.closest?.('[data-gslp-build]')) { build(); return; }
    if (e.target?.closest?.('[data-gslp-download]')) { download(); return; }
    if (e.target?.closest?.('[data-gslp-report]')) { reportApi()?.open?.(); return; }
    if (e.target?.closest?.('[data-gslp-staged]')) { stagedApi()?.build?.(); build(); return; }
    if (e.target?.closest?.('[data-gslp-qa]')) { qaApi()?.open?.(); return; }
  }, true);
  return d;
}

function open() {
  const d = ensure();
  d.classList.add('is-open');
  if (!lastPackage) build();
  else render();
}

function injectToolbar(root) {
  const section = root?.querySelector?.('.geometry-export-workspace-tool-group');
  if (!section || section.querySelector('[data-geometry-support-load-package-open]')) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'rvm-tool-btn';
  b.dataset.geometrySupportLoadPackageOpen = 'true';
  b.title = 'Build support-load calculation package export';
  b.innerHTML = '<span aria-hidden="true">LOAD</span><span>Package</span>';
  section.querySelector('.rvm-ribbon-button-row')?.appendChild(b);
}

function styles() {
  if (document.getElementById('geometry-support-load-bulk-package-style')) return;
  const s = document.createElement('style');
  s.id = 'geometry-support-load-bulk-package-style';
  s.textContent = '.geometry-support-load-bulk-package-dialog{position:fixed;inset:0;display:none;align-items:flex-start;justify-content:center;padding:74px 20px;background:rgba(2,6,23,.56);z-index:12430}.geometry-support-load-bulk-package-dialog.is-open{display:flex}.gslp-card{width:min(1280px,calc(100vw - 44px));max-height:calc(100vh - 92px);overflow:auto;background:#0b1424;border:1px solid rgba(168,85,247,.34);border-radius:14px;padding:12px;color:#dbeafe}.gslp-toolbar,.gslp-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:space-between}.gslp-toolbar{justify-content:flex-start}.gslp-head b,.gslp-card h4{color:#ddd6fe}.gslp-head small,.gslp-note{color:#9fb3cc;font-size:11px}.gslp-head button,.gslp-toolbar button{border:1px solid rgba(168,85,247,.28);border-radius:8px;background:#211333;color:#ddd6fe;padding:7px 10px}.gslp-summary{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin:8px 0}.gslp-summary div{border:1px solid rgba(168,85,247,.18);border-radius:9px;padding:8px;background:rgba(255,255,255,.04)}.gslp-summary b{display:block;font-size:17px;color:#fff}.gslp-summary span{font-size:11px;color:#9fb3cc}.gslp-table-wrap table{border-collapse:collapse;width:100%;font-size:12px}.gslp-table-wrap th,.gslp-table-wrap td{border:1px solid rgba(255,255,255,.08);padding:7px;text-align:left}.gslp-table-wrap th{background:rgba(255,255,255,.06);color:#ddd6fe}.gslp-empty{padding:16px;border:1px dashed rgba(148,163,184,.22);border-radius:10px;color:#9fb3cc}';
  document.head.appendChild(s);
}

export function installGeometrySupportLoadBulkPackageBridge() {
  if (globalThis[INSTALL_FLAG]) return globalThis.__PCF_GLB_GEOMETRY_SUPPORT_LOAD_PACKAGE__;
  globalThis[INSTALL_FLAG] = true;
  styles();
  globalThis.__PCF_GLB_GEOMETRY_SUPPORT_LOAD_PACKAGE__ = Object.freeze({
    version: SUPPORT_LOAD_BULK_PACKAGE_VERSION,
    schema: SUPPORT_LOAD_BULK_PACKAGE_SCHEMA,
    open,
    build: () => build(),
    current: () => lastPackage,
    download,
  });
  document.addEventListener('click', e => { if (e.target?.closest?.('[data-geometry-support-load-package-open]')) open(); }, true);
  const mo = new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes || []) if (node?.querySelector) injectToolbar(node); });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  injectToolbar(document);
  return globalThis.__PCF_GLB_GEOMETRY_SUPPORT_LOAD_PACKAGE__;
}
