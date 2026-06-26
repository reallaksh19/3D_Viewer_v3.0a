const CACHE_KEY = '20260621-rvm-button-hardening-1';
const SCHEMA = 'rvm-stagedjson-export/v2-no-hidden-support-replace';
const GLOBAL_KEY = '__PCF_GLB_RVM_STAGEDJSON_EXPORT_DIAGNOSTICS__';
const SUPPORT_API = '__PCF_GLB_RVM_INTELLIGENT_SUPPORT_ENGINE__';
const SUPPORT_UNAVAILABLE_REASON = 'Support StagedJSON is source-preview/InputXML only. Binary RVM support tools are retired by policy.';

export function installRvmStagedJsonExportBridge() {
  injectStyles();
  const api = {
    version: SCHEMA,
    buildGeometry: () => buildStagedJson('geometry'),
    buildSupport: () => buildStagedJson('support'),
    exportGeometry: () => exportStagedJson('geometry'),
    exportSupport: () => exportStagedJson('support'),
    getDiagnostics: () => globalThis[GLOBAL_KEY] || null,
  };
  globalThis.__PCF_GLB_RVM_STAGEDJSON_EXPORT__ = api;
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
  if (!ribbon || root.querySelector('[data-rvm-stagedjson-export]')) return;
  const section = document.createElement('div');
  section.className = 'rvm-ribbon-section rvm-stagedjson-export-section';
  section.dataset.rvmStagedjsonExport = CACHE_KEY;
  section.innerHTML = '<span class="rvm-ribbon-label">StagedJSON</span><div class="rvm-stagedjson-buttons" role="group" aria-label="RVM stagedJSON export"><button class="rvm-btn" type="button" data-rvm-stagedjson-export="geometry">Geometry</button><button class="rvm-btn" type="button" data-rvm-stagedjson-export="support">Support</button><button class="rvm-btn" type="button" data-rvm-stagedjson-export="json">JSON</button></div>';
  const accept = ribbon.querySelector('[data-rvm-glb-acceptance-pack]');
  if (accept?.nextSibling) ribbon.insertBefore(section, accept.nextSibling);
  else ribbon.appendChild(section);
  section.addEventListener('click', async (event) => {
    const button = event.target?.closest?.('[data-rvm-stagedjson-export]');
    if (!button) return;
    event.preventDefault(); event.stopPropagation();
    const mode = button.dataset.rvmStagedjsonExport;
    button.disabled = true;
    try {
      if (mode === 'json') downloadJson(globalThis[GLOBAL_KEY] || buildStagedJson('last'), fileName('last'));
      else await exportStagedJson(mode === 'support' ? 'support' : 'geometry');
    } catch (error) {
      reportActionError(error, { action: 'stagedjson-export', mode });
    } finally { button.disabled = false; }
  });
}

async function exportStagedJson(mode) {
  const staged = buildStagedJson(mode);
  publish(staged);
  renderPanel(staged);
  if (mode === 'support' && staged?.diagnostics?.supportPolicy?.available === false) {
    setStatusMessage(staged.diagnostics.supportPolicy.message || SUPPORT_UNAVAILABLE_REASON);
    throw new Error(staged.diagnostics.supportPolicy.message || SUPPORT_UNAVAILABLE_REASON);
  }
  downloadJson(staged, fileName(mode));
  return staged;
}

function buildStagedJson(mode = 'geometry') {
  const viewer = globalThis.__3D_RVM_VIEWER__;
  const root = document.querySelector('[data-rvm-viewer]');
  const supportPolicy = mode === 'support' ? evaluateSupportPolicy(root) : { available: true, mode: 'geometry' };
  const supportPreparation = mode === 'support' && supportPolicy.available ? prepareSupport(root, viewer) : supportPolicy;
  viewer?.modelGroup?.updateMatrixWorld?.(true);
  const components = collectComponents(viewer, mode);
  const supports = supportPolicy.available ? collectSupports(viewer, mode) : [];
  const modelName = modelLabel(viewer);
  const doc = {
    schema: SCHEMA,
    cacheKey: CACHE_KEY,
    mode,
    generatedAt: new Date().toISOString(),
    sourceFormat: 'RVM_BINARY_BROWSER_ATT_SIDE_CAR',
    exportUnits: 'metre',
    coordinateSystem: { basis: 'rendered-threejs-world', axisRemap: 'none', unitScaleToMeters: 1 },
    model: {
      id: safeId(modelName || 'RVM_MODEL'),
      name: modelName,
      componentCount: components.length,
      supportCount: supports.length,
      primitiveCount: components.reduce((n, c) => n + c.primitiveCount, 0),
      bounds: computeBounds(viewer?.modelGroup),
    },
    branches: [{ id: 'BRANCH-1', name: modelName || 'RVM BRANCH', type: 'BRANCH', children: components }],
    supportRecords: supports,
    diagnostics: {
      componentTypeCounts: countBy(components, 'TYPE'),
      supportKindCounts: countBy(supports, 'SUPPORT_KIND'),
      componentPrimitiveCodeCounts: mergeCounts(components.map((c) => c.RVM_PRIMITIVE_CODE_COUNTS || {})),
      metadataFieldCounts: fieldCounts([...components, ...supports]),
      supportPolicy,
      supportPreparation,
      supportEngine: slim(globalThis.__PCF_GLB_RVM_INTELLIGENT_SUPPORT_ENGINE_DIAGNOSTICS__),
      supportAtt: slim(globalThis.__PCF_GLB_RVM_SUPPORT_ATT_MAPPING_DIAGNOSTICS__),
    },
  };
  if (mode === 'support' && supportPolicy.available === false) {
    doc.diagnostics.errors = ['support-mode-unavailable-for-binary-rvm'];
    setStatusMessage(supportPolicy.message || SUPPORT_UNAVAILABLE_REASON);
  }
  publish(doc);
  renderPanel(doc);
  return doc;
}

function evaluateSupportPolicy(root) {
  const sourceKind = String(root?.dataset?.rvmLoadedSourceKind || '').toLowerCase();
  const primitiveMode = String(root?.dataset?.rvmModelPrimitiveMode || '').toLowerCase();
  const isSourcePreview = primitiveMode === 'source-preview' || ['json', 'jscon', 'inputxml', 'uxml'].includes(sourceKind);
  const attRecords = globalThis.__PCF_GLB_RVM_SUPPORT_ATT_MAPPING_DIAGNOSTICS__?.supportStagedJsonRecords;
  const hasSupportRecords = Array.isArray(attRecords) && attRecords.length > 0;
  const hasSupportApi = Boolean(globalThis[SUPPORT_API]);
  if (isSourcePreview || hasSupportRecords || hasSupportApi) {
    return { available: true, sourceKind, primitiveMode, reason: 'source-preview-support-flow' };
  }
  return {
    available: false,
    sourceKind: sourceKind || 'unknown',
    primitiveMode: primitiveMode || 'unknown',
    reason: 'binary-rvm-support-tools-retired',
    message: SUPPORT_UNAVAILABLE_REASON,
  };
}

function prepareSupport(root, viewer) {
  const beforeMode = root?.dataset?.rvmSupportGeometryMode || 'off';
  const generatedBefore = countGeneratedSupportGeometry(viewer);
  try { globalThis[SUPPORT_API]?.apply?.(); } catch (error) { reportActionError(error, { action: 'support-engine-apply' }); }
  if (beforeMode !== 'off') {
    try { root?._rvmSupportGeometryRebuildNow?.(); } catch (error) { reportActionError(error, { action: 'support-geometry-rebuild' }); }
  }
  try { root?._rvmSupportAttMappingRun?.(); } catch (error) { reportActionError(error, { action: 'support-att-run' }); }
  const generatedAfter = countGeneratedSupportGeometry(viewer);
  const status = root?.querySelector?.('#rvm-sb-msg');
  if (!generatedAfter && status) status.textContent = 'StagedJSON Support: no generated support geometry found; exporting raw support metadata where available.';
  return { geometryMode: beforeMode, generatedBefore, generatedAfter, hiddenReplaceSideEffect: false };
}

function countGeneratedSupportGeometry(viewer) {
  let count = 0;
  viewer?.modelGroup?.traverse?.((obj) => { if (obj?.isMesh && obj.userData?.rvmSupportGeometryGenerated) count += 1; });
  return count;
}

function collectComponents(viewer, mode) {
  const groups = new Map();
  viewer?.modelGroup?.traverse?.((obj) => {
    if (!obj?.isMesh || !isRenderable(obj)) return;
    const u = obj.userData || {};
    const a = attrs(u);
    if (isSupport(u, a)) return;
    if (mode === 'support' && u.rvmSupportGeometryGenerated) return;
    const key = componentKey(obj, a);
    const rec = groups.get(key) || newComponentRecord(key, obj, a);
    rec.primitiveCount += 1;
    rec.SOURCE_UUIDS.push(obj.uuid);
    const code = String(a.RVM_PRIMITIVE_CODE || u.RVM_PRIMITIVE_CODE || 'UNKNOWN');
    rec.RVM_PRIMITIVE_CODE_COUNTS[code] = (rec.RVM_PRIMITIVE_CODE_COUNTS[code] || 0) + 1;
    mergeAttrs(rec.ATTRIBUTES, a);
    groups.set(key, rec);
  });
  return [...groups.values()].map(finalizeRecord);
}

function collectSupports(viewer, mode) {
  const fromAtt = globalThis.__PCF_GLB_RVM_SUPPORT_ATT_MAPPING_DIAGNOSTICS__?.supportStagedJsonRecords;
  const records = Array.isArray(fromAtt) ? fromAtt.map((r, i) => normalizeSupportRecord(r, i)) : [];
  if (records.length || mode !== 'support') return records;
  viewer?.modelGroup?.traverse?.((obj) => {
    const u = obj?.userData || {}; const a = attrs(u);
    if (!obj?.isMesh || !isSupport(u, a)) return;
    records.push(normalizeSupportRecord({ ...a, ...u, POS: a.POS || a.APOS || worldPos(obj), SOURCE_UUIDS: [obj.uuid] }, records.length));
  });
  return records;
}

function newComponentRecord(key, obj, a) {
  const name = a.NAME || a.RVM_OWNER_NAME || obj.name || key;
  const type = normalizeType(a.TYPE || a.RVM_PRIMITIVE_KIND || obj.userData?.TYPE || 'COMPONENT');
  return {
    id: key,
    COMPONENT_ID: a.COMPONENT_ID || key,
    NAME: name,
    TYPE: type,
    SOURCE_FORMAT: 'RVM_STAGEDJSON_EXPORT',
    SOURCE_PATH: a.SOURCE_PATH || obj.userData?.sourcePath || '',
    APOS: a.APOS || '', LPOS: a.LPOS || '', BPOS: a.BPOS || '', POS: a.POS || '', HBOR: a.HBOR || '',
    MATERIAL: a.MATERIAL || a.MATL || '', RATING: a.RATING || '', SPEC: a.SPEC || '',
    primitiveCount: 0, SOURCE_UUIDS: [], RVM_PRIMITIVE_CODE_COUNTS: {}, ATTRIBUTES: {},
    stagedJsonRole: 'component',
  };
}

function normalizeSupportRecord(r, i) {
  const kind = normalizeSupportKind(r.SUPPORT_KIND || r.RVM_BROWSER_SUPPORT_KIND || r.supportKind || r.TYPE);
  const id = r.COMPONENT_ID || r.PS_NO || `SUPPORT-${String(i + 1).padStart(3, '0')}`;
  return {
    id, COMPONENT_ID: id, NAME: r.NAME || id, TYPE: 'SUPPORT', SUPPORT_KIND: kind,
    SUPPORT_PART: r.SUPPORT_PART || r.supportGeometryPart || '', PS_NO: r.PS_NO || '',
    SOURCE_FORMAT: 'RVM_SUPPORT_STAGEDJSON_EXPORT', SOURCE_PATH: r.SOURCE_PATH || r.sourcePath || '',
    SOURCE_UUIDS: arrayOf(r.SOURCE_UUIDS || r.sourceUuids), APOS: r.APOS || r.POS || '', POS: r.POS || r.APOS || '', LPOS: r.LPOS || '', BPOS: r.BPOS || '', HBOR: r.HBOR || '',
    MATERIAL: r.MATERIAL || 'SUPPORT_STEEL', RVM_BROWSER_SUPPORT_KIND: kind, stagedJsonRole: 'support',
  };
}

function finalizeRecord(r) {
  if (!r.APOS && r.ATTRIBUTES.APOS) r.APOS = r.ATTRIBUTES.APOS;
  if (!r.POS && r.ATTRIBUTES.POS) r.POS = r.ATTRIBUTES.POS;
  r.SOURCE_UUIDS = [...new Set(r.SOURCE_UUIDS)].filter(Boolean);
  return r;
}

function attrs(u) { return { ...(u?.attributes || {}), ...(u?.browserRvmAttributes || {}), ...pickUserAttrs(u || {}) }; }
function pickUserAttrs(u) { const out = {}; for (const k of ['TYPE','NAME','COMPONENT_ID','SOURCE_PATH','RVM_OWNER_NAME','RVM_PRIMITIVE_CODE','RVM_PRIMITIVE_KIND','APOS','LPOS','BPOS','POS','HBOR','MATERIAL','MATL','RATING','SPEC','PS_NO','SUPPORT_KIND','RVM_BROWSER_SUPPORT_KIND']) if (u[k] != null) out[k] = u[k]; return out; }
function mergeAttrs(t, s) { for (const [k, v] of Object.entries(s || {})) if (v != null && v !== '' && t[k] == null) t[k] = v; }
function componentKey(obj, a) { return safeId(a.COMPONENT_ID || a.RVM_OWNER_NAME || a.NAME || obj.userData?.sourcePath || obj.name || obj.uuid); }
function isRenderable(obj) { return !obj.userData?.rvmHiddenByUser && !obj.userData?.rvmHelper && !obj.name?.includes?.('marker'); }
function isSupport(u, a) { return u.rvmSupportGeometryGenerated || u.rvmSupportCandidate || String(a.TYPE || u.TYPE || '').toUpperCase() === 'SUPPORT' || !!a.SUPPORT_KIND || !!u.supportKind; }
function normalizeType(v) { const s = String(v || '').toUpperCase(); if (s.includes('PIPE')) return 'PIPE'; if (s.includes('ELBOW') || s.includes('BEND')) return 'ELBOW'; if (s.includes('TEE')) return 'TEE'; if (s.includes('VALVE')) return 'VALVE'; if (s.includes('FLANGE')) return 'FLANGE'; return s || 'COMPONENT'; }
function normalizeSupportKind(v) { const s = String(v || '').toUpperCase(); if (s.includes('GUIDE')) return 'GUIDE'; if (s.includes('LINE') && s.includes('STOP')) return 'LINESTOP'; if (s.includes('LIMIT')) return 'LIMIT'; if (s.includes('ANCHOR')) return 'ANCHOR'; if (s.includes('SPRING') || s.includes('HANGER')) return 'SPRING'; if (s.includes('REST') || s.includes('SHOE') || s.includes('SUPPORT')) return 'REST'; return 'UNKNOWN_SUPPORT'; }
function arrayOf(v) { return Array.isArray(v) ? v : (typeof v === 'string' && v ? v.split(',').map((x) => x.trim()) : []); }
function worldPos(obj) { const e = obj?.matrixWorld?.elements || []; return [e[12] || 0, e[13] || 0, e[14] || 0].map((n) => Number(n).toFixed(4)).join(','); }
function modelLabel(viewer) { return viewer?.modelGroup?.name || viewer?.currentFileName || 'RVM_MODEL'; }
function safeId(v) { return String(v || 'ID').trim().replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 96) || 'ID'; }
function countBy(list, key) { const out = {}; for (const item of list) out[item[key] || 'UNKNOWN'] = (out[item[key] || 'UNKNOWN'] || 0) + 1; return out; }
function mergeCounts(list) { const out = {}; for (const m of list) for (const [k, v] of Object.entries(m)) out[k] = (out[k] || 0) + Number(v || 0); return out; }
function fieldCounts(list) { const out = {}; for (const item of list) for (const [k, v] of Object.entries(item)) if (v != null && v !== '' && !Array.isArray(v)) out[k] = (out[k] || 0) + 1; return out; }
function computeBounds(group) { const b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; group?.traverse?.((o) => { if (!o?.isMesh || !isRenderable(o)) return; const e = o.matrixWorld?.elements || []; const p = [e[12] || 0, e[13] || 0, e[14] || 0]; for (let i = 0; i < 3; i++) { b.min[i] = Math.min(b.min[i], p[i]); b.max[i] = Math.max(b.max[i], p[i]); } }); return b.min[0] === Infinity ? null : b; }
function slim(d) { if (!d) return null; try { return JSON.parse(JSON.stringify(d)); } catch { return null; } }
function publish(doc) { globalThis[GLOBAL_KEY] = doc; try { globalThis.dispatchEvent?.(new CustomEvent('rvm-stagedjson-export', { detail: doc })); } catch (_) {} }
function fileName(mode) { const stamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '-').replace('Z', ''); return `rvm-${mode}-stagedjson-${stamp}.json`; }
function reportActionError(error, context) { try { globalThis.__PCF_GLB_RVM_REPORT_ACTION_ERROR__?.(error, context); } catch (_) {} console.warn('[RVM StagedJSON] action failed', context, error); }
function setStatusMessage(text) { const root = document.querySelector('[data-rvm-viewer]'); const el = root?.querySelector?.('#rvm-sb-msg'); if (el) el.textContent = text; }
function downloadJson(payload, filename) { const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
function renderPanel(doc) { const root = document.querySelector('[data-rvm-viewer]'); const panel = root?.querySelector?.('.rvm-side-panel') || root?.querySelector?.('.rvm-inspector') || root; if (!panel) return; let s = panel.querySelector('[data-rvm-stagedjson-panel]'); if (!s) { s = document.createElement('section'); s.className = 'rvm-stagedjson-panel'; s.dataset.rvmStagedjsonPanel = CACHE_KEY; panel.appendChild(s); } const policy = doc.diagnostics?.supportPolicy; const policyHtml = policy?.available === false ? `<div class="rvm-stagedjson-warning">${escapeHtml(policy.message || SUPPORT_UNAVAILABLE_REASON)}</div>` : ''; s.innerHTML = `<h3>StagedJSON Export</h3><div class="rvm-stagedjson-grid"><span>Mode</span><b>${escapeHtml(doc.mode)}</b><span>Components</span><b>${doc.model?.componentCount || 0}</b><span>Supports</span><b>${doc.model?.supportCount || 0}</b><span>Schema</span><b>${escapeHtml(doc.schema)}</b></div>${policyHtml}`; }
function escapeHtml(v) { return String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function injectStyles() { if (document.getElementById('rvm-stagedjson-export-style')) return; const s = document.createElement('style'); s.id = 'rvm-stagedjson-export-style'; s.textContent = '.rvm-stagedjson-export-section .rvm-stagedjson-buttons{display:flex;gap:4px;flex-wrap:wrap}.rvm-stagedjson-panel{margin-top:10px;padding:10px;border:1px solid rgba(125,211,252,.28);border-radius:10px;background:rgba(15,23,42,.72)}.rvm-stagedjson-panel h3{margin:0 0 8px;font-size:12px;color:#bae6fd}.rvm-stagedjson-grid{display:grid;grid-template-columns:auto 1fr;gap:4px 8px;font-size:11px}.rvm-stagedjson-grid span{color:#94a3b8}.rvm-stagedjson-grid b{color:#f8fafc}.rvm-stagedjson-warning{margin-top:8px;padding:7px 8px;border:1px solid rgba(251,191,36,.36);border-radius:8px;background:rgba(113,63,18,.30);color:#fde68a;font-size:11px;line-height:1.35}'; document.head.appendChild(s); }
