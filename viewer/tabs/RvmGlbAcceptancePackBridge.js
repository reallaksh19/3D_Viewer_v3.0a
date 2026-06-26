const CACHE_KEY = '20260620-rvm-stagedjson-validation-1';
const SCHEMA = 'rvm-glb-acceptance-pack/v3-stagedjson-validation';
const GLOBAL_KEY = '__PCF_GLB_RVM_GLB_ACCEPTANCE_PACK_DIAGNOSTICS__';
const EXPORT_API = '__PCF_GLB_RVM_NATIVE_GLB_EXPORT__';
const VALIDATE_API = '__PCF_GLB_RVM_GLB_EXPORT_VALIDATION__';
const ROUNDTRIP_API = '__PCF_GLB_RVM_GLB_ROUNDTRIP_VALIDATION__';
const SUPPORT_API = '__PCF_GLB_RVM_INTELLIGENT_SUPPORT_ENGINE__';
const STAGEDJSON_API = '__PCF_GLB_RVM_STAGEDJSON_EXPORT__';
const STAGEDJSON_VALIDATE_API = '__PCF_GLB_RVM_STAGEDJSON_VALIDATION__';

export function installRvmGlbAcceptancePackBridge() {
  injectStyles();
  const api = { version: SCHEMA, runGeometry: () => runPack('geometry'), runSupport: () => runPack('support'), getDiagnostics: () => globalThis[GLOBAL_KEY] || null };
  globalThis.__PCF_GLB_RVM_GLB_ACCEPTANCE_PACK__ = api;
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
  if (!ribbon || root.querySelector('[data-rvm-glb-acceptance-pack]')) return;
  const section = document.createElement('div');
  section.className = 'rvm-ribbon-section rvm-glb-acceptance-section';
  section.dataset.rvmGlbAcceptancePack = CACHE_KEY;
  section.innerHTML = '<span class="rvm-ribbon-label">Accept</span><div class="rvm-glb-acceptance-buttons" role="group" aria-label="RVM GLB acceptance pack"><button class="rvm-btn" type="button" data-rvm-glb-acceptance="geometry">Geometry</button><button class="rvm-btn" type="button" data-rvm-glb-acceptance="support">Support</button><button class="rvm-btn" type="button" data-rvm-glb-acceptance="json">JSON</button></div>';
  const roundTrip = ribbon.querySelector('[data-rvm-glb-roundtrip-validation]');
  if (roundTrip?.nextSibling) ribbon.insertBefore(section, roundTrip.nextSibling);
  else ribbon.appendChild(section);
  section.addEventListener('click', async (event) => {
    const button = event.target?.closest?.('[data-rvm-glb-acceptance]');
    if (!button) return;
    event.preventDefault(); event.stopPropagation();
    const mode = button.dataset.rvmGlbAcceptance;
    button.disabled = true;
    try {
      if (mode === 'json') downloadJson(globalThis[GLOBAL_KEY] || baseReport('last'), fileName('last'));
      else await runPack(mode === 'support' ? 'support' : 'geometry');
    } finally { button.disabled = false; }
  });
  renderPanel(root, globalThis[GLOBAL_KEY] || baseReport('idle'));
}

async function runPack(mode) {
  const root = document.querySelector('[data-rvm-viewer]');
  const report = baseReport(mode);
  setStatus(root, `Running RVM GLB ${mode} acceptance pack...`);
  try {
    if (mode === 'support') await prepareSupport(root, report);
    else setSupportMode(root, 'off');
    await wait(250);
    const stagedDoc = buildStagedJson(mode, report);
    report.stagedJson = summarizeStagedJson(stagedDoc);
    report.stagedJsonValidation = validateStagedJson(stagedDoc, mode, report);
    const exported = await exportVisible(report);
    report.exportAudit = summarizeAudit(exported?.audit);
    if (!exported?.blob) report.errors.push('glb-export-returned-no-blob');
    else {
      report.validation = await validate(exported.blob, exported.audit, report);
      report.roundTrip = await roundTrip(exported.blob, exported.audit, report.validation, report);
    }
    evaluate(report);
  } catch (error) { report.errors.push(`exception:${String(error?.message || error)}`); }
  report.finishedAt = new Date().toISOString();
  publish(report); renderPanel(root, report); downloadJson(report, fileName(mode));
  setStatus(root, report.accepted ? `RVM GLB ${mode} acceptance passed` : `RVM GLB ${mode} acceptance failed: ${report.errors[0] || report.warnings[0] || 'check report'}`);
  return report;
}

async function prepareSupport(root, report) {
  const engine = globalThis[SUPPORT_API];
  if (engine?.apply) report.supportEngine = summarizeSupport(engine.apply());
  else report.warnings.push('support-engine-api-not-ready');
  setSupportMode(root, 'replace');
  await wait(1700);
  try { root?._rvmSupportAttMappingRun?.(); } catch (error) { report.warnings.push(`support-att-run-failed:${String(error?.message || error)}`); }
  await wait(350);
  report.supportGeometry = summarize(globalThis.__PCF_GLB_RVM_SUPPORT_GEOMETRY_DIAGNOSTICS__);
  report.supportAtt = summarizeSupportAtt(globalThis.__PCF_GLB_RVM_SUPPORT_ATT_MAPPING_DIAGNOSTICS__);
}

function buildStagedJson(mode, report) {
  const api = globalThis[STAGEDJSON_API];
  try {
    const doc = mode === 'support' ? api?.buildSupport?.() : api?.buildGeometry?.();
    if (!doc) report.warnings.push('stagedjson-export-api-not-ready');
    return doc || null;
  } catch (error) {
    report.errors.push(`stagedjson-export-failed:${String(error?.message || error)}`);
    return null;
  }
}

function validateStagedJson(doc, mode, report) {
  const validator = globalThis[STAGEDJSON_VALIDATE_API];
  try {
    const result = validator?.validateDoc?.(doc, mode) || null;
    if (!result) report.warnings.push('stagedjson-validation-api-not-ready');
    return summarize(result);
  } catch (error) {
    report.errors.push(`stagedjson-validation-failed:${String(error?.message || error)}`);
    return null;
  }
}

function setSupportMode(root, mode) {
  const value = mode === 'replace' || mode === 'overlay' ? mode : 'off';
  if (root?.dataset) root.dataset.rvmSupportGeometryMode = value;
  try { localStorage.setItem('rvm_support_geometry_mode_v1', value); } catch (_) {}
}

async function exportVisible(report) {
  const exporter = globalThis[EXPORT_API];
  if (typeof exporter?.exportVisible !== 'function') { report.errors.push('native-scene-glb-export-api-not-ready'); return null; }
  return exporter.exportVisible();
}

async function validate(blob, audit, report) {
  const validator = globalThis[VALIDATE_API];
  if (typeof validator?.validateBlob !== 'function') { report.errors.push('glb-validation-api-not-ready'); return null; }
  return validator.validateBlob(blob, audit, report.mode);
}

async function roundTrip(blob, audit, structural, report) {
  const rt = globalThis[ROUNDTRIP_API];
  if (typeof rt?.validateBlobRoundTrip !== 'function') { report.errors.push('glb-roundtrip-api-not-ready'); return null; }
  return rt.validateBlobRoundTrip(blob, audit, structural, report.mode);
}

function evaluate(report) {
  const v = report.validation || {};
  const r = report.roundTrip || {};
  const sj = report.stagedJsonValidation || {};
  report.gates.glbHeaderValid = !!v.valid;
  report.gates.glbJsonChunkValid = !!v.sceneCount && !!v.nodeCount && !!v.meshCount;
  report.gates.nodeExtrasPresent = (v.nodesWithExtras || r.nodesWithExtras || 0) > 0;
  report.gates.roundTripParsed = !!r.loaderParsed;
  report.gates.meshCountMatched = !!r.meshCountMatched;
  report.gates.boundsWithinTolerance = !!r.boundsWithinTolerance;
  report.gates.metadataRoundTripPassed = !!r.metadataRoundTripPassed;
  report.gates.fallbackCountAcceptable = Number(v.fallbackObjectCount || 0) === Number(r.fallbackObjectCount || 0);
  report.gates.stagedJsonExported = !!report.stagedJson && (Number(report.stagedJson.componentCount || 0) + Number(report.stagedJson.supportCount || 0)) > 0;
  report.gates.stagedJsonValidated = !!sj.valid;
  if (report.mode === 'support') report.gates.supportMetadataMapped = Number(report.supportAtt?.supportMetadataMappedCount || 0) > 0 || Number(report.supportEngine?.candidateCount || 0) === 0;
  else report.gates.supportGeometryOff = report.supportGeometryMode === 'off';
  if (!v.valid) report.errors.push('glb-structural-validation-failed');
  if (!r.valid) report.errors.push('glb-roundtrip-validation-failed');
  if (!sj.valid) report.errors.push('stagedjson-validation-failed');
  if (!report.gates.nodeExtrasPresent) report.warnings.push('node-extras-not-detected');
  if (!report.gates.stagedJsonExported) report.warnings.push('stagedjson-export-empty-or-missing');
  if (!report.gates.metadataRoundTripPassed) report.warnings.push('metadata-roundtrip-not-fully-proven');
  report.accepted = report.errors.length === 0 && report.gates.glbHeaderValid && report.gates.glbJsonChunkValid && report.gates.roundTripParsed && report.gates.boundsWithinTolerance && report.gates.stagedJsonValidated;
}

function baseReport(mode) { return { schema: SCHEMA, cacheKey: CACHE_KEY, mode, capturedAt: new Date().toISOString(), finishedAt: '', accepted: false, errors: [], warnings: [], gates: {}, supportGeometryMode: mode === 'support' ? 'replace' : 'off', stagedJson: null, stagedJsonValidation: null, exportAudit: null, validation: null, roundTrip: null, supportEngine: null, supportGeometry: null, supportAtt: null }; }
function summarizeAudit(a) { return a ? { componentCount: a.componentCount || 0, meshCount: a.meshCount || 0, fallbackObjectCount: a.fallbackObjectCount || 0, primitiveKindCounts: a.primitiveKindCounts || {}, typeCounts: a.typeCounts || {} } : null; }
function summarizeSupport(d) { return d ? { candidateCount: d.candidateCount || 0, assemblyCount: d.assemblyCount || 0, mappedCandidateCount: d.mappedCandidateCount || 0, kindCounts: d.kindCounts || {}, confidenceBuckets: d.confidenceBuckets || {} } : null; }
function summarizeSupportAtt(d) { return d ? { supportGeometryScannedCount: d.supportGeometryScannedCount || 0, supportMetadataMappedCount: d.supportMetadataMappedCount || 0, supportKindCounts: d.supportKindCounts || {}, missingSourceUuidCount: d.missingSourceUuidCount || 0, missingSourcePathCount: d.missingSourcePathCount || 0 } : null; }
function summarizeStagedJson(d) { return d ? { schema: d.schema, mode: d.mode, componentCount: d.model?.componentCount || 0, supportCount: d.model?.supportCount || 0, primitiveCount: d.model?.primitiveCount || 0, componentTypeCounts: d.diagnostics?.componentTypeCounts || {}, supportKindCounts: d.diagnostics?.supportKindCounts || {} } : null; }
function summarize(d) { return d ? JSON.parse(JSON.stringify(d)) : null; }
function publish(report) { globalThis[GLOBAL_KEY] = report; try { globalThis.dispatchEvent?.(new CustomEvent('rvm-glb-acceptance-pack-diagnostics', { detail: report })); } catch (_) {} }
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function fileName(mode) { const stamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '-').replace('Z', ''); return `rvm-glb-${mode}-acceptance-${stamp}.json`; }
function downloadJson(value, name) { const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
function setStatus(root, msg) { const chip = root?.querySelector?.('#rvm-mode-chip'); if (chip) chip.textContent = msg; }
function renderPanel(root, report) { const panel = root?.querySelector?.('.rvm-side-panel') || root?.querySelector?.('.rvm-inspector') || root; if (!panel) return; let s = panel.querySelector('[data-rvm-glb-acceptance-panel]'); if (!s) { s = document.createElement('section'); s.className = 'rvm-glb-acceptance-panel'; s.dataset.rvmGlbAcceptancePanel = CACHE_KEY; panel.appendChild(s); } const gates = Object.entries(report.gates || {}).map(([k, v]) => `<span>${k}</span><b>${v ? 'PASS' : '—'}</b>`).join(''); s.innerHTML = `<h3>RVM GLB Acceptance Pack</h3><div class="rvm-glb-acceptance-state ${report.accepted ? 'is-ok' : ''}">${report.accepted ? 'ACCEPTED' : 'Ready / Not accepted yet'}</div><div class="rvm-glb-acceptance-grid"><span>Mode</span><b>${escapeHtml(report.mode)}</b><span>StagedJSON</span><b>${report.stagedJson ? 'yes' : '—'}</b><span>StagedCheck</span><b>${report.stagedJsonValidation?.valid ? 'PASS' : '—'}</b><span>Errors</span><b>${report.errors.length}</b><span>Warnings</span><b>${report.warnings.length}</b>${gates}</div>`; }
function escapeHtml(v) { return String(v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
function injectStyles() { if (document.getElementById('rvm-glb-acceptance-pack-style')) return; const st = document.createElement('style'); st.id = 'rvm-glb-acceptance-pack-style'; st.textContent = '.rvm-glb-acceptance-section .rvm-glb-acceptance-buttons{display:flex;gap:4px;flex-wrap:wrap}.rvm-glb-acceptance-section .rvm-btn{padding:4px 7px;font-size:11px}.rvm-glb-acceptance-panel{margin-top:10px;padding:10px;border:1px solid rgba(74,222,128,.28);border-radius:10px;background:rgba(15,23,42,.70)}.rvm-glb-acceptance-panel h3{margin:0 0 8px;font-size:12px;color:#dcfce7}.rvm-glb-acceptance-state{font-size:11px;color:#fbbf24;margin-bottom:6px}.rvm-glb-acceptance-state.is-ok{color:#86efac}.rvm-glb-acceptance-grid{display:grid;grid-template-columns:auto 1fr;gap:4px 8px;font-size:11px}.rvm-glb-acceptance-grid span{color:#94a3b8}.rvm-glb-acceptance-grid b{color:#f8fafc}'; document.head.appendChild(st); }
