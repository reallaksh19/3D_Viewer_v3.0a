import { buildSupportLoadReport, buildSupportLoadPipeCsv, buildSupportLoadSupportCsv, SUPPORT_LOAD_REPORT_SCHEMA, SUPPORT_LOAD_REPORT_VERSION } from './GeometrySupportLoadReportExporter.js?v=20260622-support-load-result-report-1';

const INSTALL_FLAG = Symbol.for('pcf-glb-geometry-support-load-report-bridge-v1');
let lastReport = null;

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function cell(v) { return v === undefined || v === null || v === '' ? '' : esc(v); }
function workspaceApi() { return globalThis.__PCF_GLB_GEOMETRY_EXPORT_WORKSPACE__ || null; }
function workspaceState() { return workspaceApi()?.state?.() || {}; }
function formulaApi() { return globalThis.__PCF_GLB_GEOMETRY_SUPPORT_LOAD_FORMULAS__ || null; }
function inputModel() { return workspaceState().supportLoadInputModel || null; }
function formulaResults() { return workspaceState().supportLoadFormulaResults || formulaApi()?.lastResults?.() || null; }
function dialog() { return document.getElementById('geometry-support-load-report-dialog'); }

function store(report) {
  const s = workspaceState();
  if (s && typeof s === 'object') s.supportLoadReport = report;
  lastReport = report;
  return report;
}

function buildReport() {
  let results = formulaResults();
  if (!results && formulaApi()?.run) results = formulaApi().run();
  if (!results) {
    lastReport = null;
    return null;
  }
  return store(buildSupportLoadReport(results, inputModel()));
}

function summary(report) {
  if (!report) return '<div class="gslr-empty">Run LOAD → Calc first, then build the report.</div>';
  const s = report.summary || {};
  return `<div class="gslr-summary"><div><b>${esc(s.pipeRowCount || 0)}</b><span>pipe rows</span></div><div><b>${esc(s.calculatedPipeRowCount || 0)}</b><span>calculated</span></div><div><b>${esc(s.blockedPipeRowCount || 0)}</b><span>blocked</span></div><div><b>${esc(s.supportRowCount || 0)}</b><span>support rows</span></div><div><b>${esc(report.status)}</b><span>report status</span></div></div>`;
}

function pipeRows(report) {
  const rows = Array.isArray(report?.pipeRows) ? report.pipeRows.slice(0, 180) : [];
  if (!rows.length) return '<div class="gslr-empty">No pipe result rows available.</div>';
  return `<h4>Pipe Input + Calculated Result Rows</h4><div class="gslr-table-wrap"><table><thead><tr><th>Line</th><th>NPS</th><th>OD</th><th>WT</th><th>T1</th><th>Pipe kg/m</th><th>Fluid OPE kg/m</th><th>AutoSpan</th><th>DEPSpan</th><th>Status</th><th>OPE_A</th><th>HYD_A</th><th>OPE_DEP</th><th>HYD_DEP</th><th>Guide A</th><th>Guide DEP</th><th>LineStop</th></tr></thead><tbody>${rows.map(row => `<tr class="${row.status === 'CALCULATED' ? 'is-calculated' : 'is-blocked'}"><td>${esc(row.lineNo || row.sourceObjectId)}</td><td>${cell(row.nps)}</td><td>${cell(row.pipeOdMm)}</td><td>${cell(row.wallThicknessMm)}</td><td>${cell(row.tempExpC1)}</td><td>${cell(row.unitPipeWtKgPerM)}</td><td>${cell(row.fluidWtOpeKgPerM)}</td><td>${cell(row.autoSpanMm)}</td><td>${cell(row.depSpanMm)}</td><td>${esc(row.status)}</td><td>${cell(row.opeVA)}</td><td>${cell(row.hydVA)}</td><td>${cell(row.opeVDep)}</td><td>${cell(row.hydVDep)}</td><td>${cell(row.guideHA)}</td><td>${cell(row.guideHDep)}</td><td>${cell(row.lineStopH)}</td></tr>`).join('')}</tbody></table></div>`;
}

function supportRows(report) {
  const rows = Array.isArray(report?.supportRows) ? report.supportRows.slice(0, 180) : [];
  if (!rows.length) return '<div class="gslr-empty">No support result rows available.</div>';
  return `<h4>Support Load Report Rows</h4><div class="gslr-table-wrap"><table><thead><tr><th>Support</th><th>Type</th><th>Line</th><th>NPS</th><th>Status</th><th>OPE_A</th><th>OPE_DEP</th><th>Guide A</th><th>Guide DEP</th><th>LineStop</th><th>Applies</th></tr></thead><tbody>${rows.map(row => `<tr class="${row.status === 'CALCULATED' ? 'is-calculated' : 'is-blocked'}"><td>${esc(row.supportTag || row.supportId)}</td><td>${esc(row.supportType)}</td><td>${esc(row.lineNo)}</td><td>${cell(row.nps)}</td><td>${esc(row.status)}</td><td>${cell(row.opeVA)}</td><td>${cell(row.opeVDep)}</td><td>${cell(row.guideHA)}</td><td>${cell(row.guideHDep)}</td><td>${cell(row.lineStopH)}</td><td>${esc(['vertical','guide','lineStop'].filter(k => row[`applies${k[0].toUpperCase()}${k.slice(1)}`]).join(', '))}</td></tr>`).join('')}</tbody></table></div>`;
}

function render() {
  const d = dialog();
  if (!d) return;
  d.querySelector('[data-gslr-body]').innerHTML = `<div class="gslr-toolbar"><button type="button" data-gslr-build="true">Build Report</button><button type="button" data-gslr-open-calc="true">Open LOAD Calc</button><button type="button" data-gslr-json="true">Export JSON</button><button type="button" data-gslr-pipe-csv="true">Export Pipe CSV</button><button type="button" data-gslr-support-csv="true">Export Support CSV</button><span>${esc(SUPPORT_LOAD_REPORT_VERSION)} · ${esc(SUPPORT_LOAD_REPORT_SCHEMA)}</span></div><p class="gslr-note">Report rows combine locked input fields and calculated output fields without mutating inputs. Blocked rows are exported with status and reason instead of being completed by addendum data.</p>${summary(lastReport)}${pipeRows(lastReport)}${supportRows(lastReport)}`;
}

function open() {
  ensure().classList.add('is-open');
  if (!lastReport) buildReport();
  render();
}

function download(name, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJson() {
  if (!lastReport) buildReport();
  if (lastReport) download('geometry-support-load-report.json', JSON.stringify(lastReport, null, 2), 'application/json;charset=utf-8');
}
function exportPipeCsv() {
  if (!lastReport) buildReport();
  if (lastReport) download('geometry-support-load-pipe-report.csv', buildSupportLoadPipeCsv(lastReport), 'text/csv;charset=utf-8');
}
function exportSupportCsv() {
  if (!lastReport) buildReport();
  if (lastReport) download('geometry-support-load-support-report.csv', buildSupportLoadSupportCsv(lastReport), 'text/csv;charset=utf-8');
}

function ensure() {
  let d = dialog();
  if (d) return d;
  d = document.createElement('div');
  d.id = 'geometry-support-load-report-dialog';
  d.className = 'geometry-support-load-report-dialog';
  d.innerHTML = `<div class="gslr-card" role="dialog"><div class="gslr-head"><div><b>Support Load Report / Export</b><small>${SUPPORT_LOAD_REPORT_VERSION}</small></div><button type="button" data-gslr-close="true">x</button></div><div data-gslr-body></div></div>`;
  document.body.appendChild(d);
  d.addEventListener('click', e => {
    if (e.target?.closest?.('[data-gslr-close]')) { d.classList.remove('is-open'); return; }
    if (e.target?.closest?.('[data-gslr-build]')) { buildReport(); render(); return; }
    if (e.target?.closest?.('[data-gslr-open-calc]')) { formulaApi()?.open?.(); return; }
    if (e.target?.closest?.('[data-gslr-json]')) { exportJson(); return; }
    if (e.target?.closest?.('[data-gslr-pipe-csv]')) { exportPipeCsv(); return; }
    if (e.target?.closest?.('[data-gslr-support-csv]')) { exportSupportCsv(); return; }
  }, true);
  return d;
}

function styles() {
  if (document.getElementById('geometry-support-load-report-style')) return;
  const s = document.createElement('style');
  s.id = 'geometry-support-load-report-style';
  s.textContent = '.geometry-support-load-report-dialog{position:fixed;inset:0;display:none;align-items:flex-start;justify-content:center;padding:74px 20px;background:rgba(2,6,23,.56);z-index:12420}.geometry-support-load-report-dialog.is-open{display:flex}.gslr-card{width:min(1400px,calc(100vw - 44px));max-height:calc(100vh - 92px);overflow:auto;background:#0b1424;border:1px solid rgba(126,190,255,.30);border-radius:14px;padding:12px;color:#dbeafe}.gslr-head,.gslr-toolbar{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}.gslr-toolbar{justify-content:flex-start}.gslr-head b,.gslr-card h4{color:#bfdbfe}.gslr-head small,.gslr-toolbar span,.gslr-note{color:#9fb3cc;font-size:11px}.gslr-head button,.gslr-toolbar button{border:1px solid rgba(126,190,255,.24);border-radius:8px;background:#132238;color:#dbeafe;padding:7px 10px}.gslr-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:8px 0}.gslr-summary div{border:1px solid rgba(126,190,255,.15);border-radius:9px;padding:8px;background:rgba(255,255,255,.035)}.gslr-table-wrap{overflow:auto;max-height:520px}.gslr-table-wrap table{border-collapse:collapse;min-width:100%;font-size:11px}.gslr-table-wrap th,.gslr-table-wrap td{border:1px solid rgba(126,190,255,.13);padding:5px 7px;text-align:left;white-space:nowrap}.gslr-table-wrap th{position:sticky;top:0;background:#132238;color:#bfdbfe}.gslr-table-wrap tr.is-calculated td{background:rgba(34,197,94,.06)}.gslr-table-wrap tr.is-blocked td{background:rgba(239,68,68,.06)}.gslr-empty{padding:16px;border:1px dashed rgba(148,163,184,.22);border-radius:10px;color:#9fb3cc;text-align:center}';
  document.head.appendChild(s);
}

function injectToolbar(root) {
  const section = root?.querySelector?.('.geometry-export-workspace-tool-group');
  if (!section || section.querySelector('[data-geometry-support-load-report-open]')) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'rvm-tool-btn';
  b.dataset.geometrySupportLoadReportOpen = 'true';
  b.title = 'Review and export calculated support-load results';
  b.innerHTML = '<span aria-hidden="true">LOAD</span><span>Report</span>';
  section.querySelector('.rvm-ribbon-button-row')?.appendChild(b);
}

function attach() {
  const root = document.querySelector('[data-rvm-viewer]');
  if (!root) return false;
  injectToolbar(root);
  return true;
}

function click(e) {
  if (!e.target?.closest?.('[data-geometry-support-load-report-open]')) return;
  e.preventDefault();
  e.stopPropagation();
  open();
}

export function installGeometrySupportLoadReportBridge() {
  if (typeof document === 'undefined') return;
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;
  styles();
  document.addEventListener('click', click, true);
  let attempts = 0;
  const wait = () => { attempts += 1; if (!attach() && attempts < 180) setTimeout(wait, 300); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wait, { once: true });
  else wait();
  globalThis.addEventListener?.('rvm-model-loaded', () => setTimeout(wait, 320));
  globalThis.__PCF_GLB_GEOMETRY_SUPPORT_LOAD_REPORTS__ = {
    version: SUPPORT_LOAD_REPORT_VERSION,
    schema: SUPPORT_LOAD_REPORT_SCHEMA,
    open,
    build: buildReport,
    lastReport: () => lastReport,
    exportPipeCsv,
    exportSupportCsv,
    exportJson
  };
}
