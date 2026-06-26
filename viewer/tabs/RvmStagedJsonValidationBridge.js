const CACHE_KEY = '20260620-rvm-stagedjson-validation-1';
const SCHEMA = 'rvm-stagedjson-validation/v1-gates';
const GLOBAL_KEY = '__PCF_GLB_RVM_STAGEDJSON_VALIDATION_DIAGNOSTICS__';
const EXPORT_API = '__PCF_GLB_RVM_STAGEDJSON_EXPORT__';

export function installRvmStagedJsonValidationBridge() {
  injectStyles();
  const api = {
    version: SCHEMA,
    validateGeometry: () => validateMode('geometry'),
    validateSupport: () => validateMode('support'),
    validateDoc,
    getDiagnostics: () => globalThis[GLOBAL_KEY] || null,
  };
  globalThis.__PCF_GLB_RVM_STAGEDJSON_VALIDATION__ = api;
  let attempts = 0;
  const attach = () => {
    attempts += 1;
    const root = document.querySelector('[data-rvm-viewer]');
    if (root) injectControls(root);
    if (!root && attempts < 160) setTimeout(attach, 350);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
  else attach();
  return api;
}

function injectControls(root) {
  const ribbon = root?.querySelector?.('.geo-top-ribbon');
  if (!ribbon || root.querySelector('[data-rvm-stagedjson-validation]')) return;
  const section = document.createElement('div');
  section.className = 'rvm-ribbon-section rvm-stagedjson-validation-section';
  section.dataset.rvmStagedjsonValidation = CACHE_KEY;
  section.innerHTML = '<span class="rvm-ribbon-label">StagedCheck</span><div class="rvm-stagedjson-validation-buttons" role="group" aria-label="RVM stagedJSON validation"><button class="rvm-btn" type="button" data-rvm-stagedjson-validation="geometry">Geometry</button><button class="rvm-btn" type="button" data-rvm-stagedjson-validation="support">Support</button><button class="rvm-btn" type="button" data-rvm-stagedjson-validation="json">JSON</button></div>';
  const staged = ribbon.querySelector('[data-rvm-stagedjson-export]');
  if (staged?.nextSibling) ribbon.insertBefore(section, staged.nextSibling);
  else ribbon.appendChild(section);
  section.addEventListener('click', async (event) => {
    const button = event.target?.closest?.('[data-rvm-stagedjson-validation]');
    if (!button) return;
    event.preventDefault(); event.stopPropagation(); button.disabled = true;
    try {
      const mode = button.dataset.rvmStagedjsonValidation;
      if (mode === 'json') downloadJson(globalThis[GLOBAL_KEY] || baseReport('last'), fileName('last'));
      else downloadJson(validateMode(mode === 'support' ? 'support' : 'geometry'), fileName(mode));
    } finally { button.disabled = false; }
  });
}

function validateMode(mode) {
  const api = globalThis[EXPORT_API];
  const doc = mode === 'support' ? api?.buildSupport?.() : api?.buildGeometry?.();
  const report = validateDoc(doc, mode);
  publish(report); renderPanel(report);
  return report;
}

function validateDoc(doc, expectedMode = 'geometry') {
  const report = baseReport(expectedMode);
  report.sourceSchema = doc?.schema || '';
  report.mode = doc?.mode || expectedMode;
  report.supportPolicy = doc?.diagnostics?.supportPolicy || null;
  const components = Array.isArray(doc?.branches?.[0]?.children) ? doc.branches[0].children : [];
  const supports = Array.isArray(doc?.supportRecords) ? doc.supportRecords : [];
  report.counts = { branchCount: Array.isArray(doc?.branches) ? doc.branches.length : 0, componentCount: components.length, supportCount: supports.length };
  report.typeCounts = countBy(components, 'TYPE');
  report.supportKindCounts = countBy(supports, 'SUPPORT_KIND');
  if (!doc || typeof doc !== 'object') report.errors.push('stagedjson-missing');
  if (!doc?.schema) report.errors.push('schema-missing');
  if (!doc?.model) report.errors.push('model-missing');
  if (!report.counts.branchCount) report.errors.push('branch-missing');
  if (!components.length) report.errors.push('component-records-missing');
  if (expectedMode === 'geometry' && supports.length) report.errors.push('geometry-mode-has-support-records');
  if (expectedMode === 'support' && report.supportPolicy?.available === false) {
    report.errors.push('support-mode-unavailable-for-current-source');
    report.warnings.push(report.supportPolicy.message || 'Support mode requires source-preview/InputXML support data.');
  } else if (expectedMode === 'support' && supports.length === 0) {
    report.warnings.push('support-mode-has-no-support-records');
  }
  validateRecords(components, 'component', report);
  validateRecords(supports, 'support', report);
  report.gates.branchExists = report.counts.branchCount > 0;
  report.gates.componentsPresent = components.length > 0;
  report.gates.supportModeAvailable = expectedMode !== 'support' || report.supportPolicy?.available !== false;
  report.gates.supportModeClean = expectedMode !== 'geometry' || supports.length === 0;
  report.gates.positionsParse = report.positionErrors.length === 0;
  report.gates.hborNumeric = report.hborErrors.length === 0;
  report.gates.idsStable = report.idErrors.length === 0;
  report.gates.sourceTracePresent = report.sourceTraceMissing.length === 0;
  report.valid = report.errors.length === 0 && Object.values(report.gates).every(Boolean);
  if (!report.valid && report.errors.length === 0) report.errors.push('stagedjson-validation-gate-failed');
  report.finishedAt = new Date().toISOString();
  return report;
}

function validateRecords(records, role, report) {
  for (const [i, rec] of records.entries()) {
    const prefix = `${role}[${i}]`;
    if (!rec.id && !rec.COMPONENT_ID) report.idErrors.push(`${prefix}:missing-id`);
    if (role === 'support' && !rec.SUPPORT_KIND) report.warnings.push(`${prefix}:support-kind-missing`);
    if (!hasSourceTrace(rec)) report.sourceTraceMissing.push(`${prefix}:source-trace-missing`);
    for (const field of ['APOS', 'LPOS', 'BPOS', 'POS']) {
      if (rec[field] && !parsePoint(rec[field])) report.positionErrors.push(`${prefix}:${field}`);
    }
    if (rec.HBOR !== '' && rec.HBOR != null && !Number.isFinite(Number(rec.HBOR))) report.hborErrors.push(`${prefix}:HBOR`);
  }
}

function hasSourceTrace(rec) { return !!(rec.SOURCE_PATH || (Array.isArray(rec.SOURCE_UUIDS) && rec.SOURCE_UUIDS.length) || rec.SOURCE_UUIDS || rec.RVM_OWNER_NAME); }
function parsePoint(v) { const nums = Array.isArray(v) ? v : String(v).split(',').map((x) => Number(String(x).trim())); return nums.length >= 3 && nums.slice(0, 3).every(Number.isFinite); }
function countBy(list, key) { const out = {}; for (const item of list || []) { const k = item?.[key] || 'UNKNOWN'; out[k] = (out[k] || 0) + 1; } return out; }
function baseReport(mode) { return { schema: SCHEMA, cacheKey: CACHE_KEY, mode, sourceSchema: '', capturedAt: new Date().toISOString(), finishedAt: '', valid: false, errors: [], warnings: [], gates: {}, counts: {}, typeCounts: {}, supportKindCounts: {}, supportPolicy: null, positionErrors: [], hborErrors: [], idErrors: [], sourceTraceMissing: [] }; }
function publish(report) { globalThis[GLOBAL_KEY] = report; try { globalThis.dispatchEvent?.(new CustomEvent('rvm-stagedjson-validation', { detail: report })); } catch (_) {} }
function fileName(mode) { const stamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '-').replace('Z', ''); return `rvm-${mode}-stagedjson-validation-${stamp}.json`; }
function downloadJson(value, name) { const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
function renderPanel(report) { const root = document.querySelector('[data-rvm-viewer]'); const panel = root?.querySelector?.('.rvm-side-panel') || root?.querySelector?.('.rvm-inspector') || root; if (!panel) return; let s = panel.querySelector('[data-rvm-stagedjson-validation-panel]'); if (!s) { s = document.createElement('section'); s.className = 'rvm-stagedjson-validation-panel'; s.dataset.rvmStagedjsonValidationPanel = CACHE_KEY; panel.appendChild(s); } const supportWarning = report.supportPolicy?.available === false ? `<div class="rvm-stagedjson-validation-warning">${escapeHtml(report.supportPolicy.message || 'Support mode unavailable for current source.')}</div>` : ''; s.innerHTML = `<h3>StagedJSON Validation</h3><div class="rvm-stagedjson-validation-state ${report.valid ? 'is-ok' : ''}">${report.valid ? 'VALID' : 'Not valid yet'}</div><div class="rvm-stagedjson-validation-grid"><span>Mode</span><b>${escapeHtml(report.mode)}</b><span>Components</span><b>${report.counts.componentCount || 0}</b><span>Supports</span><b>${report.counts.supportCount || 0}</b><span>Errors</span><b>${report.errors.length}</b><span>Warnings</span><b>${report.warnings.length}</b></div>${supportWarning}`; }
function escapeHtml(v) { return String(v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
function injectStyles() { if (document.getElementById('rvm-stagedjson-validation-style')) return; const st = document.createElement('style'); st.id = 'rvm-stagedjson-validation-style'; st.textContent = '.rvm-stagedjson-validation-section .rvm-stagedjson-validation-buttons{display:flex;gap:4px;flex-wrap:wrap}.rvm-stagedjson-validation-section .rvm-btn{padding:4px 7px;font-size:11px}.rvm-stagedjson-validation-panel{margin-top:10px;padding:10px;border:1px solid rgba(96,165,250,.28);border-radius:10px;background:rgba(15,23,42,.70)}.rvm-stagedjson-validation-panel h3{margin:0 0 8px;font-size:12px;color:#bfdbfe}.rvm-stagedjson-validation-state{font-size:11px;color:#fbbf24;margin-bottom:6px}.rvm-stagedjson-validation-state.is-ok{color:#86efac}.rvm-stagedjson-validation-grid{display:grid;grid-template-columns:auto 1fr;gap:4px 8px;font-size:11px}.rvm-stagedjson-validation-grid span{color:#94a3b8}.rvm-stagedjson-validation-grid b{color:#f8fafc}.rvm-stagedjson-validation-warning{margin-top:8px;padding:7px 8px;border:1px solid rgba(251,191,36,.36);border-radius:8px;background:rgba(113,63,18,.30);color:#fde68a;font-size:11px;line-height:1.35}'; document.head.appendChild(st); }
