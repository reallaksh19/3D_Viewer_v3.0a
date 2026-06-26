import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const VERSION = 'rvm-glb-roundtrip-validation/v1-loader-extras-bounds';
const CACHE_KEY = '20260620-rvm-glb-roundtrip-validation-1';
const GLOBAL_KEY = '__PCF_GLB_RVM_GLB_ROUNDTRIP_VALIDATION_DIAGNOSTICS__';
const EXPORT_API_KEY = '__PCF_GLB_RVM_NATIVE_GLB_EXPORT__';
const STRUCTURAL_API_KEY = '__PCF_GLB_RVM_GLB_EXPORT_VALIDATION__';

export function installRvmGlbRoundTripValidationBridge() {
  injectStyles();
  const api = {
    version: VERSION,
    validateVisible: () => exportAndRoundTrip('visible'),
    validateSelected: () => exportAndRoundTrip('selected'),
    validateBlobRoundTrip,
    getDiagnostics: () => globalThis[GLOBAL_KEY] || null,
  };
  globalThis.__PCF_GLB_RVM_GLB_ROUNDTRIP_VALIDATION__ = api;
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
  if (!ribbon || root.querySelector('[data-rvm-glb-roundtrip-validation]')) return;
  const section = document.createElement('div');
  section.className = 'rvm-ribbon-section rvm-glb-roundtrip-validation-section';
  section.dataset.rvmGlbRoundtripValidation = CACHE_KEY;
  section.innerHTML = `
    <span class="rvm-ribbon-label">RoundTrip</span>
    <div class="rvm-glb-roundtrip-validation-buttons" role="group" aria-label="RVM GLB round-trip validation">
      <button class="rvm-btn" type="button" data-rvm-glb-roundtrip-action="visible">Visible</button>
      <button class="rvm-btn" type="button" data-rvm-glb-roundtrip-action="selected">Selected</button>
      <button class="rvm-btn" type="button" data-rvm-glb-roundtrip-action="json">JSON</button>
    </div>`;
  const validateSection = ribbon.querySelector('[data-rvm-glb-export-validation]');
  if (validateSection?.nextSibling) ribbon.insertBefore(section, validateSection.nextSibling);
  else ribbon.appendChild(section);
  section.addEventListener('click', async (event) => {
    const button = event.target?.closest?.('[data-rvm-glb-roundtrip-action]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    button.disabled = true;
    try {
      const action = button.dataset.rvmGlbRoundtripAction;
      if (action === 'json') downloadRoundTripJson();
      else await exportAndRoundTrip(action === 'selected' ? 'selected' : 'visible');
    } finally {
      button.disabled = false;
    }
  });
  setStatus(root, 'RVM GLB round-trip validation ready');
}

async function exportAndRoundTrip(scope) {
  const root = document.querySelector('[data-rvm-viewer]');
  const exporter = globalThis[EXPORT_API_KEY];
  const exportFn = scope === 'selected' ? exporter?.exportSelected : exporter?.exportVisible;
  if (typeof exportFn !== 'function') {
    const result = baseResult(scope, null, null);
    result.errors.push('native-scene-glb-export-api-not-ready');
    publish(finish(result));
    setStatus(root, 'RVM GLB exporter is not ready yet');
    return result;
  }
  setStatus(root, `Exporting and round-trip validating ${scope} RVM GLB...`);
  const exported = await exportFn();
  const structural = await validateStructure(exported?.blob, exported?.audit, scope);
  const result = await validateBlobRoundTrip(exported?.blob, exported?.audit || null, structural || null, scope);
  publish(result);
  downloadJson(result, fileBase(scope));
  setStatus(root, result.valid ? `Round-trip OK: ${result.importedMeshCount} mesh(es), ${result.nodesWithExtras} node extras` : `Round-trip failed: ${result.errors[0] || 'unknown error'}`);
  return result;
}

async function validateStructure(blob, audit, scope) {
  const validator = globalThis[STRUCTURAL_API_KEY];
  if (!blob || typeof validator?.validateBlob !== 'function') return null;
  try { return await validator.validateBlob(blob, audit, scope); }
  catch (error) { return { valid: false, errors: [`structural-validator-exception:${String(error?.message || error)}`] }; }
}

export async function validateBlobRoundTrip(blob, audit = null, structural = null, scope = 'unknown') {
  const result = baseResult(scope, audit, structural);
  if (!blob) {
    result.errors.push('glb-export-returned-no-blob');
    return finish(result);
  }
  try {
    const buffer = await blob.arrayBuffer();
    result.byteLength = buffer.byteLength;
    const gltf = await parseGltf(buffer);
    result.loaderParsed = true;
    inspectImportedScene(result, gltf?.scene || gltf?.scenes?.[0] || null);
    compareWithExportAudit(result, audit);
    if (structural && structural.valid === false) result.errors.push('structural-validation-failed');
  } catch (error) {
    result.errors.push(`gltf-loader-exception:${String(error?.message || error)}`);
  }
  return finish(result);
}

function parseGltf(arrayBuffer) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.parse(arrayBuffer, '', resolve, reject);
  });
}

function inspectImportedScene(result, scene) {
  if (!scene) {
    result.errors.push('gltf-loader-returned-no-scene');
    return;
  }
  scene.updateMatrixWorld?.(true);
  const box = new THREE.Box3();
  scene.traverse((obj) => {
    result.importedObjectCount += 1;
    if (obj.isMesh || obj.isLine || obj.isPoints) {
      result.importedMeshCount += 1;
      try { box.expandByObject(obj); } catch (_) {}
    }
    inspectExtras(result, obj);
  });
  if (box.isEmpty()) result.warnings.push('imported-scene-bounds-empty');
  else {
    const size = box.getSize(new THREE.Vector3());
    const min = box.min;
    const max = box.max;
    result.importedBounds = {
      min: [round(min.x), round(min.y), round(min.z)],
      max: [round(max.x), round(max.y), round(max.z)],
      size: [round(size.x), round(size.y), round(size.z)],
    };
  }
  if (result.importedMeshCount < 1) result.errors.push('roundtrip-imported-no-meshes');
  if (result.nodesWithExtras < 1) result.warnings.push('roundtrip-no-node-extras-found');
}

function inspectExtras(result, obj) {
  const extras = obj?.userData || {};
  if (!extras || !Object.keys(extras).length) return;
  result.nodesWithExtras += 1;
  if (extras.glbExportSchema) result.nodesWithGlbExportSchema += 1;
  const attrs = extras.browserRvmAttributes || extras.attributes || {};
  const props = extras.browserRvmProperties || {};
  const code = String(extras.glbExportPrimitiveCode || attrs.RVM_PRIMITIVE_CODE || '').trim();
  const type = String(attrs.TYPE || extras.TYPE || props.type || '').trim();
  const name = String(attrs.NAME || extras.NAME || props.displayName || obj.name || '').trim();
  const render = String(extras.glbExportRenderPrimitive || attrs.RVM_BROWSER_RENDER_PRIMITIVE || '').toUpperCase();
  if (code) bump(result.primitiveCodeCounts, code);
  if (type) bump(result.typeCounts, type);
  if (name) result.namedNodeCount += 1;
  if (attrs.RVM_OWNER_NAME || attrs.RVM_OWNER_PATH || props.sourcePath) result.sourceMetadataNodeCount += 1;
  if (attrs.APOS || attrs.LPOS || attrs.BPOS || attrs.HBOR) result.positionMetadataNodeCount += 1;
  if (/BBOX|PLACEHOLDER|BOX_SOLID|FALLBACK|UNKNOWN/.test(render)) {
    result.fallbackObjectCount += 1;
    bump(result.fallbackReasonCounts, render.includes('BOX_SOLID') ? 'box-solid-fallback' : render.includes('BBOX') ? 'bbox-placeholder' : render.includes('PLACEHOLDER') ? 'placeholder' : 'non-native-rendered');
  }
}

function compareWithExportAudit(result, audit) {
  const exportedMeshCount = Number(audit?.meshCount || 0);
  result.exportedMeshCount = exportedMeshCount;
  result.exportedComponentCount = Number(audit?.componentCount || 0);
  result.exportedFallbackObjectCount = Number(audit?.fallbackObjectCount || 0);
  result.meshCountMatched = exportedMeshCount > 0 && result.importedMeshCount === exportedMeshCount;
  result.nodeExtrasPresent = result.nodesWithExtras > 0;
  result.metadataRoundTripPassed = result.nodesWithGlbExportSchema > 0 && result.sourceMetadataNodeCount > 0;
  result.fallbackCountAcceptable = result.fallbackObjectCount === result.exportedFallbackObjectCount;
  result.boundsWithinTolerance = boundsLooksFinite(result.importedBounds);
  if (exportedMeshCount > 0 && !result.meshCountMatched) result.warnings.push('roundtrip-mesh-count-mismatch');
  if (!result.metadataRoundTripPassed) result.warnings.push('roundtrip-metadata-not-fully-preserved');
}

function boundsLooksFinite(bounds) {
  const values = [...(bounds?.min || []), ...(bounds?.max || []), ...(bounds?.size || [])];
  if (!values.length || values.some((value) => !Number.isFinite(Number(value)))) return false;
  const maxSize = Math.max(...(bounds?.size || [0]).map(Number));
  return maxSize > 0 && maxSize < 10000;
}

function baseResult(scope, audit, structural) {
  return {
    schemaVersion: VERSION,
    cacheKey: CACHE_KEY,
    capturedAt: new Date().toISOString(),
    scope,
    valid: false,
    loaderParsed: false,
    errors: [],
    warnings: [],
    byteLength: 0,
    importedObjectCount: 0,
    importedMeshCount: 0,
    importedBounds: null,
    nodesWithExtras: 0,
    nodesWithGlbExportSchema: 0,
    namedNodeCount: 0,
    sourceMetadataNodeCount: 0,
    positionMetadataNodeCount: 0,
    primitiveCodeCounts: {},
    typeCounts: {},
    fallbackObjectCount: 0,
    fallbackReasonCounts: {},
    exportedMeshCount: Number(audit?.meshCount || 0),
    exportedComponentCount: Number(audit?.componentCount || 0),
    exportedFallbackObjectCount: Number(audit?.fallbackObjectCount || 0),
    meshCountMatched: false,
    nodeExtrasPresent: false,
    boundsWithinTolerance: false,
    fallbackCountAcceptable: false,
    metadataRoundTripPassed: false,
    structuralValidationSummary: summarizeStructural(structural),
    exportAuditSummary: summarizeAudit(audit),
  };
}

function summarizeStructural(value) {
  if (!value) return null;
  return {
    valid: !!value.valid,
    meshCount: value.meshCount || 0,
    nodeCount: value.nodeCount || 0,
    nodesWithExtras: value.nodesWithExtras || 0,
    errors: value.errors || [],
    warnings: value.warnings || [],
  };
}

function summarizeAudit(audit) {
  if (!audit) return null;
  return {
    schemaVersion: audit.schemaVersion,
    scope: audit.scope,
    componentCount: audit.componentCount,
    meshCount: audit.meshCount,
    fallbackObjectCount: audit.fallbackObjectCount,
    primitiveKindCounts: audit.primitiveKindCounts || {},
    typeCounts: audit.typeCounts || {},
  };
}

function finish(result) {
  result.valid = result.errors.length === 0 && result.loaderParsed && result.importedMeshCount > 0;
  return result;
}

function downloadRoundTripJson() {
  const value = globalThis[GLOBAL_KEY] || baseResult('last', null, null);
  downloadJson(value, fileBase(value.scope || 'last'));
}

function fileBase(scope) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '-').replace('Z', '');
  return `rvm-native-scene-${scope}-${stamp}.roundtrip.json`;
}

function downloadJson(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function publish(result) {
  globalThis[GLOBAL_KEY] = result;
  try { globalThis.dispatchEvent?.(new CustomEvent('rvm-glb-roundtrip-validation-diagnostics', { detail: result })); } catch (_) {}
}

function setStatus(root, message) { const chip = root?.querySelector?.('#rvm-mode-chip'); if (chip) chip.textContent = message; }
function bump(map, key) { const name = String(key || '').trim() || 'UNKNOWN'; map[name] = (map[name] || 0) + 1; }
function round(value) { return Math.round(Number(value || 0) * 1e6) / 1e6; }

function injectStyles() {
  if (document.getElementById('rvm-glb-roundtrip-validation-style')) return;
  const style = document.createElement('style');
  style.id = 'rvm-glb-roundtrip-validation-style';
  style.textContent = `.rvm-glb-roundtrip-validation-section .rvm-glb-roundtrip-validation-buttons{display:flex;flex-wrap:wrap;gap:4px}.rvm-glb-roundtrip-validation-section .rvm-btn{padding:4px 7px;font-size:11px}.rvm-glb-roundtrip-validation-section .rvm-btn:disabled{opacity:.55;cursor:wait}`;
  document.head.appendChild(style);
}
