import * as THREE from 'three';

const CACHE_KEY = '20260620-rvm-intelligent-support-engine-1';
const SCHEMA = 'rvm-intelligent-support-engine/v1-scored-mappable';
const GLOBAL_KEY = '__PCF_GLB_RVM_INTELLIGENT_SUPPORT_ENGINE_DIAGNOSTICS__';
const API_KEY = '__PCF_GLB_RVM_INTELLIGENT_SUPPORT_ENGINE__';
const SUPPORT_WORDS = /\b(SUPPORT|SUPP|REST|SHOE|GUIDE|LINE\s*STOP|LINESTOP|LIMIT\s*STOP|ANCHOR|HANGER|SPRING|CLAMP|TRUNNION|SADDLE|DUMMY|STANCHION|PEDESTAL|POST|BASE\s*PLATE|U[-_ ]?BOLT)\b/i;
const PIPE_WORDS = /\b(PIPE|ELBOW|BEND|TEE|VALVE|FLANGE|GASKET|REDUCER|TORUS|SPHERE|CYLINDER)\b/i;
const SUPPORT_KINDS = ['REST', 'GUIDE', 'LINESTOP', 'LIMIT', 'ANCHOR', 'SPRING', 'UNKNOWN_SUPPORT'];

export function installRvmIntelligentSupportEngineBridge() {
  injectStyles();
  let attempts = 0;
  const attach = () => {
    attempts += 1;
    const root = document.querySelector('[data-rvm-viewer]');
    const viewer = globalThis.__3D_RVM_VIEWER__;
    if (root && viewer) bind(root, viewer);
    if ((!root || !viewer) && attempts < 180) setTimeout(attach, 350);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
  else attach();
}

function bind(root, viewer) {
  if (!root || root.dataset.rvmIntelligentSupportEngine === CACHE_KEY) return;
  root.dataset.rvmIntelligentSupportEngine = CACHE_KEY;
  injectControls(root, viewer);
  const api = {
    scan: () => run(root, viewer, false),
    apply: () => run(root, viewer, true),
    clear: () => clearMappings(root, viewer),
    getDiagnostics: () => globalThis[GLOBAL_KEY] || null,
  };
  globalThis[API_KEY] = api;
  for (const delay of [350, 1400, 3200]) setTimeout(() => run(root, viewer, false), delay);
}

function injectControls(root, viewer) {
  const ribbon = root.querySelector('.geo-top-ribbon');
  if (!ribbon || root.querySelector('[data-rvm-support-engine]')) return;
  const section = document.createElement('div');
  section.className = 'rvm-ribbon-section rvm-support-engine-section';
  section.dataset.rvmSupportEngine = CACHE_KEY;
  section.innerHTML = '<span class="rvm-ribbon-label">SupportEngine</span><div class="rvm-support-engine-buttons" role="group" aria-label="Intelligent support engine"><button class="rvm-btn" type="button" data-rvm-support-engine-scan="1">Scan</button><button class="rvm-btn" type="button" data-rvm-support-engine-map="1">AutoMap</button><button class="rvm-btn" type="button" data-rvm-support-engine-clear="1">Clear</button><button class="rvm-btn" type="button" data-rvm-support-engine-json="1">JSON</button></div>';
  const search = ribbon.querySelector('.rvm-ribbon-search');
  ribbon.insertBefore(section, search || null);
  section.addEventListener('click', (event) => {
    const scan = event.target?.closest?.('[data-rvm-support-engine-scan]');
    const map = event.target?.closest?.('[data-rvm-support-engine-map]');
    const clear = event.target?.closest?.('[data-rvm-support-engine-clear]');
    const json = event.target?.closest?.('[data-rvm-support-engine-json]');
    if (!scan && !map && !clear && !json) return;
    event.preventDefault(); event.stopPropagation();
    if (clear) clearMappings(root, viewer);
    else {
      const diag = run(root, viewer, Boolean(map));
      if (json) downloadJson(diag, `rvm-intelligent-support-engine-${Date.now()}.json`);
    }
  });
}

function run(root, viewer, apply) {
  const diag = scanSupportModel(viewer, apply);
  renderPanel(root, viewer, diag);
  return diag;
}

function scanSupportModel(viewer, apply = false) {
  const diag = baseDiag();
  const pipes = collectPipeRefs(viewer);
  diag.pipeReferenceCount = pipes.length;
  const candidates = [];
  viewer?.modelGroup?.updateMatrixWorld?.(true);
  viewer?.modelGroup?.traverse?.((obj) => {
    if (!obj?.isMesh || skipObject(obj)) return;
    const attrs = attrsFor(obj);
    const box = worldBox(obj);
    if (!box) return;
    const text = supportText(obj, attrs);
    const pipeLike = isPipeLike(text, attrs, obj);
    const analysis = analyzeCandidate(obj, attrs, box, text, pipes, pipeLike);
    if (analysis.rejected) {
      diag.rejectedCount += 1;
      if (pipeLike) diag.rejectedPipeLikeCount += 1;
      bump(diag.rejectedReasonCounts, analysis.rejected);
      return;
    }
    candidates.push(analysis);
    bump(diag.kindCounts, analysis.kind);
    bump(diag.confidenceBuckets, bucket(analysis.confidence));
    if (analysis.mappingReady) diag.mappingReadyCount += 1;
  });
  const assemblies = groupCandidates(candidates);
  if (apply) applyMappings(candidates, assemblies, diag);
  diag.candidateCount = candidates.length;
  diag.assemblyCount = assemblies.length;
  diag.mappedCandidateCount = candidates.filter((c) => c.object.userData?.rvmSupportEngineMapped).length;
  diag.candidates = candidates.slice(0, 96).map(publicCandidate);
  diag.assemblies = assemblies.slice(0, 64).map(publicAssembly);
  diag.supportStagedJsonRecords = candidates.filter((c) => c.object.userData?.rvmSupportEngineMapped).map((c) => c.object.userData.browserRvmAttributes || {}).slice(0, 128);
  globalThis[GLOBAL_KEY] = diag;
  return diag;
}

function baseDiag() {
  return { schema: SCHEMA, cacheKey: CACHE_KEY, candidateCount: 0, assemblyCount: 0, mappingReadyCount: 0, mappedCandidateCount: 0, pipeReferenceCount: 0, rejectedCount: 0, rejectedPipeLikeCount: 0, kindCounts: {}, confidenceBuckets: {}, rejectedReasonCounts: {}, candidates: [], assemblies: [], supportStagedJsonRecords: [] };
}

function collectPipeRefs(viewer) {
  const refs = [];
  viewer?.modelGroup?.traverse?.((obj) => {
    if (!obj?.isMesh || skipObject(obj)) return;
    const attrs = attrsFor(obj);
    const text = supportText(obj, attrs);
    if (!/\b(PIPE|BRANCH|ELBOW|BEND|TEE)\b/i.test(text)) return;
    const box = worldBox(obj);
    if (box) refs.push({ obj, box, center: box.getCenter(new THREE.Vector3()) });
  });
  return refs.slice(0, 4000);
}

function analyzeCandidate(object, attrs, box, text, pipes, pipeLike) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const dims = [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)].sort((a, b) => a - b);
  if (!Number.isFinite(dims[0] + dims[1] + dims[2]) || dims[2] <= 0) return { rejected: 'bad-bounds' };
  const explicit = SUPPORT_WORDS.test(text) || attrs.TYPE === 'SUPPORT' || object.userData?.rvmSupportCandidate;
  const geom = geometryScore(dims, object, attrs);
  const nearest = nearestPipeDistance(box, pipes);
  const nearPipe = Number.isFinite(nearest.distance) && nearest.distance <= Math.max(0.45, dims[2] * 1.15);
  if (pipeLike && !explicit && geom.score < 0.28) return { rejected: 'pipe-like-not-support' };
  let confidence = 0;
  const reasons = [];
  if (explicit) { confidence += 0.46; reasons.push('metadata-keyword'); }
  if (geom.score > 0) { confidence += geom.score; reasons.push(geom.reason); }
  if (nearPipe) { confidence += 0.18; reasons.push('near-pipe'); }
  if (/\b(BASE\s*PLATE|PEDESTAL|POST|STANCHION|SHOE|REST|GUIDE|ANCHOR|STOP)\b/i.test(text)) { confidence += 0.12; reasons.push('support-vocabulary'); }
  if (!explicit && !nearPipe && geom.score < 0.32) return { rejected: 'low-confidence-geometry' };
  confidence = clamp(confidence, 0, 0.99);
  if (confidence < 0.50) return { rejected: 'below-threshold' };
  const kind = normalizeKind(kindFromText(text) || geom.kind || attrs.RVM_BROWSER_SUPPORT_KIND || object.userData?.rvmSupportCandidateKind || 'UNKNOWN_SUPPORT');
  return { object, uuid: object.uuid, name: object.name || attrs.NAME || kind, kind, confidence, reasons, mappingReady: confidence >= 0.58, box, size, center, nearestPipeDistance: nearest.distance, nearestPipeUuid: nearest.uuid, sourcePath: attrs.SOURCE_PATH || object.userData?.sourcePath || object.userData?.browserRvmProperties?.sourcePath || '' };
}

function geometryScore(dims, object, attrs) {
  const [a, b, c] = dims;
  const ratio = c / Math.max(a, 0.001);
  const primitive = `${attrs.RVM_BROWSER_RENDER_PRIMITIVE || ''} ${object.userData?.renderPrimitive || ''} ${object.userData?.effectiveRenderPrimitive || ''}`.toUpperCase();
  const boxish = primitive.includes('BOX') || primitive.includes('BBOX') || attrs.RVM_PRIMITIVE_CODE === '2' || object.geometry?.type === 'BoxGeometry';
  if (boxish && ratio >= 4 && a <= 0.35 && b <= 0.55 && c <= 8) return { score: 0.36, kind: 'REST', reason: 'slender-box-post' };
  if (boxish && c <= 0.35 && b >= a * 1.5) return { score: 0.31, kind: 'REST', reason: 'plate-like-box' };
  if (boxish && ratio >= 2.4) return { score: 0.27, kind: 'UNKNOWN_SUPPORT', reason: 'box-support-proportion' };
  return { score: 0, kind: '', reason: '' };
}

function applyMappings(candidates, assemblies, diag) {
  const assemblyByUuid = new Map();
  for (const assembly of assemblies) for (const item of assembly.items) assemblyByUuid.set(item.uuid, assembly);
  for (const candidate of candidates) {
    if (!candidate.mappingReady) continue;
    const assembly = assemblyByUuid.get(candidate.uuid);
    const mapped = supportRecord(candidate, assembly);
    const u = candidate.object.userData = candidate.object.userData || {};
    u.rvmSupportCandidate = true;
    u.rvmSupportCandidateKind = candidate.kind;
    u.rvmSupportEngineMapped = true;
    u.rvmSupportEngineConfidence = Number(candidate.confidence.toFixed(3));
    u.rvmSupportEngineSchema = SCHEMA;
    u.RVM_BROWSER_SUPPORT_HINT = 'true';
    u.RVM_BROWSER_SUPPORT_KIND = candidate.kind;
    u.browserRvmAttributes = { ...(u.browserRvmAttributes || {}), ...mapped };
    for (const [key, value] of Object.entries(mapped)) u[key] = value;
    diag.mappedCandidateCount += 1;
  }
}

function supportRecord(candidate, assembly) {
  const attrs = attrsFor(candidate.object);
  const pos = vecText(candidate.center);
  const id = `SUP-${shortId(candidate.uuid)}`;
  return {
    NAME: attrs.NAME || candidate.name || id,
    TYPE: 'SUPPORT',
    SUPPORT_KIND: candidate.kind,
    SUPPORT_ENGINE_CONFIDENCE: Number(candidate.confidence.toFixed(3)),
    SUPPORT_ENGINE_REASON: candidate.reasons.join(','),
    SUPPORT_ASSEMBLY_ID: assembly?.id || candidate.uuid,
    PS_NO: attrs.PS_NO || id,
    COMPONENT_ID: attrs.COMPONENT_ID || id,
    SOURCE_FORMAT: 'RVM_INTELLIGENT_SUPPORT_ENGINE',
    SOURCE_UUIDS: [candidate.uuid],
    SOURCE_PATH: candidate.sourcePath,
    NEAREST_PIPE_DISTANCE: Number.isFinite(candidate.nearestPipeDistance) ? Number(candidate.nearestPipeDistance.toFixed(4)) : '',
    APOS: attrs.APOS || attrs.POS || pos,
    POS: attrs.POS || attrs.APOS || pos,
    LPOS: attrs.LPOS || '',
    BPOS: attrs.BPOS || '',
    HBOR: attrs.HBOR || '',
    MATERIAL: attrs.MATERIAL || attrs.MATL || 'SUPPORT_STEEL',
    RVM_BROWSER_SUPPORT_KIND: candidate.kind,
    supportStagedJsonRole: 'support',
    supportEngineSchema: SCHEMA,
  };
}

function groupCandidates(items) {
  const groups = [], used = new Set();
  for (const item of items) {
    if (used.has(item.uuid)) continue;
    const group = [item]; used.add(item.uuid);
    for (const other of items) {
      if (used.has(other.uuid)) continue;
      if (boxDistance(item.box, other.box) <= Math.max(0.35, Math.min(item.size.length(), other.size.length()) * 0.42)) { group.push(other); used.add(other.uuid); }
    }
    groups.push(toAssembly(group));
  }
  return groups;
}

function toAssembly(items) {
  const box = new THREE.Box3();
  for (const item of items) box.union(item.box);
  const kind = bestKind(items.map((i) => i.kind));
  const confidence = items.reduce((sum, i) => sum + i.confidence, 0) / Math.max(items.length, 1);
  return { id: items.map((i) => i.uuid).sort().join('|'), items, kind, confidence, box, center: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()) };
}

function clearMappings(root, viewer) {
  let cleared = 0;
  viewer?.modelGroup?.traverse?.((obj) => {
    if (!obj?.userData?.rvmSupportEngineMapped && !obj?.userData?.rvmSupportCandidate) return;
    for (const key of ['rvmSupportCandidate', 'rvmSupportCandidateKind', 'rvmSupportEngineMapped', 'rvmSupportEngineConfidence', 'rvmSupportEngineSchema', 'RVM_BROWSER_SUPPORT_HINT', 'RVM_BROWSER_SUPPORT_KIND']) delete obj.userData[key];
    const attrs = obj.userData.browserRvmAttributes;
    if (attrs?.supportEngineSchema === SCHEMA) for (const key of ['TYPE', 'SUPPORT_KIND', 'SUPPORT_ENGINE_CONFIDENCE', 'SUPPORT_ENGINE_REASON', 'SUPPORT_ASSEMBLY_ID', 'PS_NO', 'COMPONENT_ID', 'SOURCE_UUIDS', 'NEAREST_PIPE_DISTANCE', 'supportStagedJsonRole', 'supportEngineSchema']) delete attrs[key];
    cleared += 1;
  });
  const diag = baseDiag(); diag.clearedMappingCount = cleared; globalThis[GLOBAL_KEY] = diag; renderPanel(root, viewer, diag); return diag;
}

function renderPanel(root, viewer, diag) {
  const panel = root.querySelector('.rvm-side-panel') || root.querySelector('.rvm-inspector') || root.querySelector('.rvm-details-panel') || root;
  if (!panel) return;
  let section = panel.querySelector('[data-rvm-support-engine-panel]');
  if (!section) { section = document.createElement('section'); section.className = 'rvm-support-engine-panel'; section.dataset.rvmSupportEnginePanel = CACHE_KEY; panel.appendChild(section); section.addEventListener('click', (event) => { const row = event.target?.closest?.('[data-rvm-support-engine-uuid]'); if (row) selectUuid(viewer, row.dataset.rvmSupportEngineUuid); }); }
  const kinds = Object.entries(diag.kindCounts || {}).map(([k, v]) => `${escapeHtml(k)}:${v}`).join(' · ') || 'none';
  const rows = (diag.candidates || []).slice(0, 16).map((c) => `<button type="button" class="rvm-support-engine-row" data-rvm-support-engine-uuid="${escapeHtml(c.uuid)}"><b>${escapeHtml(c.kind)}</b><span>${Math.round(c.confidence * 100)}%</span><small>${escapeHtml(c.name || c.uuid)}</small></button>`).join('');
  section.innerHTML = `<h3>Intelligent Support Engine</h3><div class="rvm-support-engine-grid"><span>Candidates</span><b>${diag.candidateCount || 0}</b><span>Assemblies</span><b>${diag.assemblyCount || 0}</b><span>Mapped</span><b>${diag.mappedCandidateCount || 0}</b><span>Kinds</span><b>${kinds}</b></div><div class="rvm-support-engine-hint">AutoMap marks candidates for SupportGeom Overlay/Replace and writes ATT/stagedJSON-style fields for GLB node extras. Default SupportGeom remains Off.</div><div class="rvm-support-engine-rows">${rows || '<em>No support candidates found.</em>'}</div>`;
}

function selectUuid(viewer, uuid) {
  let found = null;
  viewer?.modelGroup?.traverse?.((obj) => { if (!found && obj?.uuid === uuid) found = obj; });
  if (!found) return;
  const api = globalThis.__PCF_GLB_RVM_INTERACTION__;
  if (api?.setSelectionFromObjects) api.setSelectionFromObjects([found]);
  if (api?.fitSelection) api.fitSelection();
}

function publicCandidate(c) { return { uuid: c.uuid, name: c.name, kind: c.kind, confidence: Number(c.confidence.toFixed(3)), reasons: c.reasons, mappingReady: c.mappingReady, sourcePath: c.sourcePath, center: vec(c.center), size: vec(c.size), nearestPipeDistance: Number.isFinite(c.nearestPipeDistance) ? Number(c.nearestPipeDistance.toFixed(4)) : null }; }
function publicAssembly(a) { return { id: a.id, kind: a.kind, confidence: Number(a.confidence.toFixed(3)), itemCount: a.items.length, center: vec(a.center), size: vec(a.size) }; }
function nearestPipeDistance(box, pipes) { let best = Infinity, uuid = ''; for (const ref of pipes) { const d = boxDistance(box, ref.box); if (d < best) { best = d; uuid = ref.obj.uuid; } } return { distance: best, uuid }; }
function boxDistance(a, b) { const dx = Math.max(0, b.min.x - a.max.x, a.min.x - b.max.x); const dy = Math.max(0, b.min.y - a.max.y, a.min.y - b.max.y); const dz = Math.max(0, b.min.z - a.max.z, a.min.z - b.max.z); return Math.sqrt(dx * dx + dy * dy + dz * dz); }
function skipObject(obj) { return obj.userData?.rvmSupportGeometryGenerated || obj.userData?.supportSymbol || obj.userData?.rvmSupportSymbolGenerated || obj.userData?.rvmHiddenByUser || /MARKER|HELPER/i.test(`${obj.name || ''}`); }
function worldBox(obj) { try { const box = new THREE.Box3().setFromObject(obj); return box.isEmpty() ? null : box; } catch { return null; } }
function attrsFor(obj) { return obj?.userData?.browserRvmAttributes || obj?.userData?.attributes || obj?.userData || {}; }
function supportText(obj, attrs) { return [obj.name, obj.userData?.displayName, obj.userData?.sourcePath, obj.userData?.type, obj.userData?.kind, attrs.NAME, attrs.TYPE, attrs.RVM_OWNER_NAME, attrs.RVM_PRIMITIVE_KIND, attrs.SUPPORT_KIND, attrs.RVM_BROWSER_SUPPORT_KIND].filter(Boolean).join(' '); }
function isPipeLike(text, attrs, obj) { const type = `${attrs.TYPE || ''} ${obj.userData?.type || ''} ${obj.userData?.kind || ''}`; return PIPE_WORDS.test(`${type} ${text}`) && !SUPPORT_WORDS.test(text); }
function kindFromText(text) { const s = String(text || '').toUpperCase(); if (s.includes('GUIDE')) return 'GUIDE'; if (s.includes('LINE') && s.includes('STOP')) return 'LINESTOP'; if (s.includes('LIMIT')) return 'LIMIT'; if (s.includes('ANCHOR')) return 'ANCHOR'; if (s.includes('SPRING') || s.includes('HANGER')) return 'SPRING'; if (s.includes('REST') || s.includes('SHOE') || s.includes('SUPPORT') || s.includes('PEDESTAL') || s.includes('POST')) return 'REST'; return ''; }
function normalizeKind(value) { const kind = kindFromText(value) || String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_'); return SUPPORT_KINDS.includes(kind) ? kind : 'UNKNOWN_SUPPORT'; }
function bestKind(kinds) { const rank = { ANCHOR: 6, LINESTOP: 5, LIMIT: 4, GUIDE: 3, SPRING: 2, REST: 1, UNKNOWN_SUPPORT: 0 }; return kinds.sort((a, b) => (rank[b] || 0) - (rank[a] || 0))[0] || 'UNKNOWN_SUPPORT'; }
function bucket(value) { if (value >= 0.85) return 'high'; if (value >= 0.65) return 'medium'; return 'low'; }
function vec(v) { return { x: Number(v.x.toFixed(4)), y: Number(v.y.toFixed(4)), z: Number(v.z.toFixed(4)) }; }
function vecText(v) { return `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`; }
function shortId(uuid) { return String(uuid || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase() || 'AUTO'; }
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function bump(obj, key) { obj[key || 'UNKNOWN'] = (obj[key || 'UNKNOWN'] || 0) + 1; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
function downloadJson(payload, filename) { const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
function injectStyles() { if (document.getElementById('rvm-intelligent-support-engine-style')) return; const style = document.createElement('style'); style.id = 'rvm-intelligent-support-engine-style'; style.textContent = '.rvm-support-engine-panel{margin-top:10px;padding:10px;border:1px solid rgba(96,165,250,.28);border-radius:10px;background:rgba(15,23,42,.70)}.rvm-support-engine-panel h3{margin:0 0 8px;font-size:12px;color:#e0f2fe}.rvm-support-engine-grid{display:grid;grid-template-columns:auto 1fr;gap:4px 8px;font-size:11px}.rvm-support-engine-grid span{color:#94a3b8}.rvm-support-engine-grid b{color:#f8fafc}.rvm-support-engine-hint{margin-top:8px;font-size:10px;line-height:1.35;color:#93c5fd}.rvm-support-engine-rows{margin-top:8px;display:grid;gap:4px}.rvm-support-engine-row{display:grid;grid-template-columns:auto auto 1fr;gap:8px;align-items:center;text-align:left;border:1px solid rgba(148,163,184,.25);background:rgba(2,6,23,.45);color:#dbeafe;border-radius:7px;padding:5px 6px;font-size:10px;cursor:pointer}.rvm-support-engine-row:hover{border-color:#60a5fa;background:rgba(30,64,175,.32)}.rvm-support-engine-row small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#cbd5e1}'; document.head.appendChild(style); }
