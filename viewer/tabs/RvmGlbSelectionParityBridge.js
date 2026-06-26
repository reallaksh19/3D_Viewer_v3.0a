import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const VERSION = 'rvm-glb-selection-details-parity/v1-extras-selection-map';
const CACHE_KEY = '20260620-rvm-glb-selection-details-parity-1';
const GLOBAL_KEY = '__PCF_GLB_RVM_GLB_SELECTION_PARITY_DIAGNOSTICS__';
const EXPORT_API_KEY = '__PCF_GLB_RVM_NATIVE_GLB_EXPORT__';
const INTERACTION_API_KEY = '__PCF_GLB_RVM_INTERACTION__';

export function installRvmGlbSelectionParityBridge() {
  injectStyles();
  const api = {
    version: VERSION,
    scanVisible: () => exportAndScan('visible'),
    scanSelected: () => exportAndScan('selected'),
    showLast: renderPanel,
    downloadJson: () => downloadJson(globalThis[GLOBAL_KEY] || baseResult('last'), fileBase('last')),
    getDiagnostics: () => globalThis[GLOBAL_KEY] || null,
  };
  globalThis.__PCF_GLB_RVM_GLB_SELECTION_PARITY__ = api;
  let tries = 0;
  const attach = () => {
    tries += 1;
    const root = document.querySelector('[data-rvm-viewer]');
    if (root) injectControls(root);
    if (!root && tries < 160) setTimeout(attach, 350);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
  else attach();
  return api;
}

async function exportAndScan(scope) {
  const root = document.querySelector('[data-rvm-viewer]');
  const exporter = globalThis[EXPORT_API_KEY];
  const exportFn = scope === 'selected' ? exporter?.exportSelected : exporter?.exportVisible;
  const result = baseResult(scope);
  if (typeof exportFn !== 'function') {
    result.errors.push('native-glb-export-api-not-ready');
    publish(result); renderPanel(result); setStatus(root, 'GLB selection parity exporter not ready');
    return result;
  }
  setStatus(root, `Exporting and scanning ${scope} GLB metadata...`);
  try {
    const exported = await exportFn();
    result.exportAuditSummary = summarizeAudit(exported?.audit);
    if (!exported?.blob) result.errors.push('glb-export-returned-no-blob');
    else await inspectBlob(result, exported.blob);
  } catch (error) {
    result.errors.push(`glb-selection-parity-exception:${String(error?.message || error)}`);
  }
  finish(result);
  publish(result);
  renderPanel(result);
  downloadJson(result, fileBase(scope));
  setStatus(root, result.valid ? `GLB selection parity OK: ${result.detailRowCount} row(s)` : `GLB selection parity issue: ${result.errors[0] || result.warnings[0] || 'unknown'}`);
  return result;
}

async function inspectBlob(result, blob) {
  const buffer = await blob.arrayBuffer();
  result.byteLength = buffer.byteLength;
  const gltf = await parseGltf(buffer);
  result.loaderParsed = true;
  const scene = gltf?.scene || gltf?.scenes?.[0];
  if (!scene) { result.errors.push('gltf-loader-returned-no-scene'); return; }
  scene.updateMatrixWorld?.(true);
  const bounds = new THREE.Box3();
  scene.traverse((obj) => {
    result.importedObjectCount += 1;
    if (obj.isMesh || obj.isLine || obj.isPoints) {
      result.importedMeshCount += 1;
      try { bounds.expandByObject(obj); } catch (_) {}
    }
    inspectNode(result, obj);
  });
  if (!bounds.isEmpty()) {
    const size = bounds.getSize(new THREE.Vector3());
    result.importedBounds = { min: v(bounds.min), max: v(bounds.max), size: v(size) };
  }
}

function parseGltf(arrayBuffer) {
  return new Promise((resolve, reject) => new GLTFLoader().parse(arrayBuffer, '', resolve, reject));
}

function inspectNode(result, obj) {
  const data = obj?.userData || {};
  if (!data || !Object.keys(data).length) return;
  result.nodesWithExtras += 1;
  const attrs = data.browserRvmAttributes || data.attributes || {};
  const props = data.browserRvmProperties || {};
  const row = {
    id: String(data.glbExportSourceUuid || obj.uuid || ''),
    name: String(attrs.NAME || data.NAME || props.displayName || obj.name || '').slice(0, 180),
    type: String(attrs.TYPE || data.TYPE || props.type || '').slice(0, 80),
    primitiveCode: String(data.glbExportPrimitiveCode || attrs.RVM_PRIMITIVE_CODE || '').slice(0, 32),
    renderPrimitive: String(data.glbExportRenderPrimitive || attrs.RVM_BROWSER_RENDER_PRIMITIVE || '').slice(0, 80),
    sourcePath: String(props.sourcePath || attrs.RVM_OWNER_PATH || attrs.RVM_OWNER_NAME || '').slice(0, 240),
    hasSourceUuid: !!data.glbExportSourceUuid,
    hasName: !!(attrs.NAME || data.NAME || props.displayName || obj.name),
    hasType: !!(attrs.TYPE || data.TYPE || props.type),
    hasAtt: !!Object.keys(attrs || {}).length,
    hasPosition: !!(attrs.APOS || attrs.LPOS || attrs.BPOS || attrs.HBOR),
  };
  if (row.hasSourceUuid) result.nodesWithSourceUuid += 1;
  if (row.hasName) result.nodesWithName += 1;
  if (row.hasType) result.nodesWithType += 1;
  if (row.hasAtt) result.nodesWithAtt += 1;
  if (row.hasPosition) result.nodesWithPosition += 1;
  if (row.primitiveCode) bump(result.primitiveCodeCounts, row.primitiveCode);
  if (row.type) bump(result.typeCounts, row.type);
  if (result.detailRows.length < 64 && (row.hasSourceUuid || row.hasAtt || row.name || row.type)) result.detailRows.push(row);
}

function injectControls(root) {
  const ribbon = root?.querySelector?.('.geo-top-ribbon');
  if (!ribbon || root.querySelector('[data-rvm-glb-selection-parity]')) return;
  const section = document.createElement('div');
  section.className = 'rvm-ribbon-section rvm-glb-selection-parity-section';
  section.dataset.rvmGlbSelectionParity = CACHE_KEY;
  section.innerHTML = `<span class="rvm-ribbon-label">GLB Details</span><div class="rvm-glb-selection-parity-buttons" role="group" aria-label="GLB selection details parity"><button class="rvm-btn" type="button" data-rvm-glb-selection-parity="visible">Visible</button><button class="rvm-btn" type="button" data-rvm-glb-selection-parity="selected">Selected</button><button class="rvm-btn" type="button" data-rvm-glb-selection-parity="json">JSON</button></div>`;
  const roundtrip = ribbon.querySelector('[data-rvm-glb-roundtrip-validation]');
  if (roundtrip?.nextSibling) ribbon.insertBefore(section, roundtrip.nextSibling); else ribbon.appendChild(section);
  section.addEventListener('click', async (event) => {
    const button = event.target?.closest?.('[data-rvm-glb-selection-parity]');
    if (!button) return;
    event.preventDefault(); event.stopPropagation(); button.disabled = true;
    try {
      const action = button.dataset.rvmGlbSelectionParity;
      if (action === 'json') downloadJson(globalThis[GLOBAL_KEY] || baseResult('last'), fileBase('last'));
      else await exportAndScan(action === 'selected' ? 'selected' : 'visible');
    } finally { button.disabled = false; }
  });
  ensurePanel(root);
}

function ensurePanel(root) {
  let panel = root.querySelector('[data-rvm-glb-selection-parity-panel]');
  if (panel) return panel;
  const host = root.querySelector('.rvm-side-panel') || root.querySelector('.rvm-layout') || root;
  panel = document.createElement('section');
  panel.className = 'rvm-glb-selection-parity-panel';
  panel.dataset.rvmGlbSelectionParityPanel = CACHE_KEY;
  panel.innerHTML = `<div class="rvm-glb-selection-parity-title">GLB Selection Details</div><div class="rvm-glb-selection-parity-body">Run GLB Details → Visible after export validation.</div>`;
  host.appendChild(panel);
  panel.addEventListener('click', (event) => {
    const row = event.target?.closest?.('[data-rvm-glb-source-uuid]');
    if (row) selectSourceUuid(row.dataset.rvmGlbSourceUuid);
  });
  return panel;
}

function renderPanel(value = globalThis[GLOBAL_KEY]) {
  const root = document.querySelector('[data-rvm-viewer]');
  if (!root) return;
  const panel = ensurePanel(root);
  const result = value || baseResult('last');
  const rows = (result.detailRows || []).slice(0, 32).map((row) => `<button class="rvm-glb-selection-parity-row" type="button" data-rvm-glb-source-uuid="${esc(row.id)}"><strong>${esc(row.name || row.id || 'GLB node')}</strong><span>${esc(row.type || 'TYPE?')} · PRIM ${esc(row.primitiveCode || '?')} · ${esc(row.renderPrimitive || 'render?')}</span></button>`).join('');
  panel.querySelector('.rvm-glb-selection-parity-body').innerHTML = `<div class="rvm-glb-selection-parity-summary">${result.valid ? 'OK' : 'CHECK'} · meshes ${result.importedMeshCount || 0} · extras ${result.nodesWithExtras || 0} · ATT ${result.nodesWithAtt || 0} · source ids ${result.nodesWithSourceUuid || 0}</div>${rows || '<div class="rvm-glb-selection-parity-empty">No exported GLB detail rows yet.</div>'}`;
}

function selectSourceUuid(uuid) {
  if (!uuid) return false;
  const viewer = globalThis.__3D_RVM_VIEWER__;
  let match = null;
  viewer?.modelGroup?.traverse?.((obj) => { if (!match && obj.uuid === uuid) match = obj; });
  if (!match) return false;
  const api = globalThis[INTERACTION_API_KEY];
  if (typeof api?.setSelectionFromObjects === 'function') api.setSelectionFromObjects([match]);
  else viewer._rvmCanvasSelectedMeshes = [match];
  try { api?.fitSelection?.(); } catch (_) {}
  setStatus(document.querySelector('[data-rvm-viewer]'), `Selected GLB source object: ${match.name || uuid}`);
  return true;
}

function baseResult(scope) {
  return { schemaVersion: VERSION, cacheKey: CACHE_KEY, capturedAt: new Date().toISOString(), scope, valid: false, errors: [], warnings: [], byteLength: 0, loaderParsed: false, importedObjectCount: 0, importedMeshCount: 0, importedBounds: null, nodesWithExtras: 0, nodesWithSourceUuid: 0, nodesWithName: 0, nodesWithType: 0, nodesWithAtt: 0, nodesWithPosition: 0, detailRowCount: 0, primitiveCodeCounts: {}, typeCounts: {}, detailRows: [], exportAuditSummary: null };
}

function finish(result) {
  result.detailRowCount = result.detailRows.length;
  result.valid = result.errors.length === 0 && result.loaderParsed && result.importedMeshCount > 0 && result.nodesWithExtras > 0 && result.nodesWithSourceUuid > 0 && result.nodesWithAtt > 0;
  if (!result.nodesWithSourceUuid) result.warnings.push('glb-selection-source-uuid-missing');
  if (!result.nodesWithAtt) result.warnings.push('glb-att-extras-missing');
  return result;
}
function summarizeAudit(audit) { return audit ? { schemaVersion: audit.schemaVersion, scope: audit.scope, meshCount: audit.meshCount, componentCount: audit.componentCount, fallbackObjectCount: audit.fallbackObjectCount, typeCounts: audit.typeCounts || {}, primitiveKindCounts: audit.primitiveKindCounts || {} } : null; }
function publish(result) { globalThis[GLOBAL_KEY] = result; try { globalThis.dispatchEvent?.(new CustomEvent('rvm-glb-selection-parity-diagnostics', { detail: result })); } catch (_) {} }
function fileBase(scope) { const stamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '-').replace('Z', ''); return `rvm-native-scene-${scope}-${stamp}.selection-parity.json`; }
function downloadJson(value, filename) { const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
function setStatus(root, message) { const chip = root?.querySelector?.('#rvm-mode-chip'); if (chip) chip.textContent = message; }
function bump(map, key) { const name = String(key || '').trim() || 'UNKNOWN'; map[name] = (map[name] || 0) + 1; }
function v(vec) { return [round(vec.x), round(vec.y), round(vec.z)]; }
function round(value) { return Math.round(Number(value || 0) * 1e6) / 1e6; }
function esc(value) { return String(value || '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
function injectStyles() { if (document.getElementById('rvm-glb-selection-parity-style')) return; const style = document.createElement('style'); style.id = 'rvm-glb-selection-parity-style'; style.textContent = `.rvm-glb-selection-parity-section .rvm-glb-selection-parity-buttons{display:flex;flex-wrap:wrap;gap:4px}.rvm-glb-selection-parity-section .rvm-btn{padding:4px 7px;font-size:11px}.rvm-glb-selection-parity-panel{margin:8px;padding:8px;border:1px solid rgba(148,163,184,.25);border-radius:8px;background:rgba(15,23,42,.72);font-size:11px}.rvm-glb-selection-parity-title{font-weight:700;margin-bottom:6px}.rvm-glb-selection-parity-summary{margin-bottom:6px;color:#bae6fd}.rvm-glb-selection-parity-row{display:block;width:100%;margin:3px 0;padding:5px 6px;text-align:left;border:1px solid rgba(148,163,184,.22);border-radius:6px;background:rgba(30,41,59,.72);color:inherit;cursor:pointer}.rvm-glb-selection-parity-row strong,.rvm-glb-selection-parity-row span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rvm-glb-selection-parity-row span{opacity:.75}`; document.head.appendChild(style); }
