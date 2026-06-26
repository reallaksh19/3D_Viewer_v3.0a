const VERSION = 'rvm-glb-export-validation/v1-json-bin-extras';
const CACHE_KEY = '20260620-rvm-glb-export-validation-1';
const GLOBAL_KEY = '__PCF_GLB_RVM_GLB_EXPORT_VALIDATION_DIAGNOSTICS__';
const EXPORT_API_KEY = '__PCF_GLB_RVM_NATIVE_GLB_EXPORT__';

export function installRvmGlbExportValidationBridge() {
  injectStyles();
  const api = {
    version: VERSION,
    validateVisible: () => exportAndValidate('visible'),
    validateSelected: () => exportAndValidate('selected'),
    validateBlob,
    getDiagnostics: () => globalThis[GLOBAL_KEY] || null,
  };
  globalThis.__PCF_GLB_RVM_GLB_EXPORT_VALIDATION__ = api;
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
  if (!ribbon || root.querySelector('[data-rvm-glb-export-validation]')) return;
  const section = document.createElement('div');
  section.className = 'rvm-ribbon-section rvm-glb-export-validation-section';
  section.dataset.rvmGlbExportValidation = CACHE_KEY;
  section.innerHTML = `
    <span class="rvm-ribbon-label">Validate</span>
    <div class="rvm-glb-export-validation-buttons" role="group" aria-label="RVM GLB export validation">
      <button class="rvm-btn" type="button" data-rvm-glb-validation-action="visible">Visible GLB</button>
      <button class="rvm-btn" type="button" data-rvm-glb-validation-action="selected">Selected GLB</button>
      <button class="rvm-btn" type="button" data-rvm-glb-validation-action="json">JSON</button>
    </div>`;
  const exportSection = ribbon.querySelector('[data-rvm-native-glb-export]');
  if (exportSection?.nextSibling) ribbon.insertBefore(section, exportSection.nextSibling);
  else ribbon.appendChild(section);
  section.addEventListener('click', async (event) => {
    const button = event.target?.closest?.('[data-rvm-glb-validation-action]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    button.disabled = true;
    try {
      const action = button.dataset.rvmGlbValidationAction;
      if (action === 'json') downloadValidationJson();
      else await exportAndValidate(action === 'selected' ? 'selected' : 'visible');
    } finally {
      button.disabled = false;
    }
  });
  setStatus(root, 'RVM GLB export validation ready');
}

async function exportAndValidate(scope) {
  const root = document.querySelector('[data-rvm-viewer]');
  const exporter = globalThis[EXPORT_API_KEY];
  const fn = scope === 'selected' ? exporter?.exportSelected : exporter?.exportVisible;
  if (typeof fn !== 'function') {
    const result = baseResult(scope);
    result.valid = false;
    result.errors.push('native-scene-glb-export-api-not-ready');
    publish(result);
    setStatus(root, 'RVM GLB exporter is not ready yet');
    return result;
  }
  setStatus(root, `Exporting and validating ${scope} RVM GLB...`);
  const exported = await fn();
  if (!exported?.blob) {
    const result = baseResult(scope, exported?.audit || null);
    result.valid = false;
    result.errors.push('glb-export-returned-no-blob');
    publish(result);
    setStatus(root, `No ${scope} GLB blob returned for validation`);
    return result;
  }
  const result = await validateBlob(exported.blob, exported.audit, scope);
  publish(result);
  downloadJson(result, fileBase(scope));
  setStatus(root, result.valid ? `Validated ${scope} GLB: ${result.meshCount} mesh(es), ${result.nodesWithExtras} node extras` : `GLB validation failed: ${result.errors[0] || 'unknown error'}`);
  return result;
}

async function validateBlob(blob, audit = null, scope = 'unknown') {
  const result = baseResult(scope, audit);
  try {
    const buffer = await blob.arrayBuffer();
    result.byteLength = buffer.byteLength;
    if (buffer.byteLength < 20) {
      result.errors.push('glb-too-small');
      return finish(result);
    }
    const view = new DataView(buffer);
    const magic = view.getUint32(0, true);
    const version = view.getUint32(4, true);
    const declaredLength = view.getUint32(8, true);
    result.magicHex = `0x${magic.toString(16).padStart(8, '0')}`;
    result.glbVersion = version;
    result.declaredLength = declaredLength;
    if (magic !== 0x46546c67) result.errors.push('invalid-glb-magic');
    if (version !== 2) result.errors.push('unsupported-glb-version');
    if (declaredLength !== buffer.byteLength) result.errors.push('glb-length-mismatch');
    let offset = 12;
    let jsonText = '';
    while (offset + 8 <= buffer.byteLength) {
      const chunkLength = view.getUint32(offset, true);
      const chunkType = view.getUint32(offset + 4, true);
      const chunkStart = offset + 8;
      const chunkEnd = chunkStart + chunkLength;
      if (chunkEnd > buffer.byteLength) {
        result.errors.push('glb-chunk-overruns-buffer');
        break;
      }
      const typeName = chunkType === 0x4e4f534a ? 'JSON' : chunkType === 0x004e4942 ? 'BIN' : `0x${chunkType.toString(16)}`;
      result.chunks.push({ type: typeName, length: chunkLength });
      if (typeName === 'JSON') jsonText = decodeText(buffer.slice(chunkStart, chunkEnd));
      if (typeName === 'BIN') result.binChunkCount += 1;
      offset = chunkEnd;
    }
    if (!jsonText) result.errors.push('missing-json-chunk');
    else inspectGltfJson(result, jsonText);
    if (result.binChunkCount < 1) result.warnings.push('missing-bin-chunk');
    if (result.nodesWithExtras < 1) result.warnings.push('no-node-extras-found');
    if (result.fallbackObjectCount > 0) result.warnings.push('fallback-objects-exported');
  } catch (error) {
    result.errors.push(`exception:${String(error?.message || error)}`);
  }
  return finish(result);
}

function inspectGltfJson(result, jsonText) {
  const cleaned = jsonText.replace(/[\u0000\s]+$/g, '');
  let json = null;
  try { json = JSON.parse(cleaned); }
  catch (error) {
    result.errors.push(`invalid-json-chunk:${String(error?.message || error)}`);
    return;
  }
  result.assetVersion = json?.asset?.version || '';
  result.generator = json?.asset?.generator || '';
  result.sceneCount = Array.isArray(json?.scenes) ? json.scenes.length : 0;
  result.nodeCount = Array.isArray(json?.nodes) ? json.nodes.length : 0;
  result.meshCount = Array.isArray(json?.meshes) ? json.meshes.length : 0;
  result.materialCount = Array.isArray(json?.materials) ? json.materials.length : 0;
  result.accessorCount = Array.isArray(json?.accessors) ? json.accessors.length : 0;
  result.bufferViewCount = Array.isArray(json?.bufferViews) ? json.bufferViews.length : 0;
  result.bufferCount = Array.isArray(json?.buffers) ? json.buffers.length : 0;
  if (!result.sceneCount) result.errors.push('no-scenes');
  if (!result.nodeCount) result.errors.push('no-nodes');
  if (!result.meshCount) result.errors.push('no-meshes');
  for (const node of json?.nodes || []) inspectNodeExtras(result, node);
}

function inspectNodeExtras(result, node) {
  const extras = node?.extras;
  if (!extras || typeof extras !== 'object') return;
  result.nodesWithExtras += 1;
  if (extras.glbExportSchema) result.nodesWithGlbExportSchema += 1;
  const attrs = extras.browserRvmAttributes || extras.attributes || {};
  const code = String(extras.glbExportPrimitiveCode || attrs.RVM_PRIMITIVE_CODE || '').trim();
  const type = String(attrs.TYPE || extras.TYPE || extras.browserRvmProperties?.type || '').trim();
  const render = String(extras.glbExportRenderPrimitive || attrs.RVM_BROWSER_RENDER_PRIMITIVE || '').toUpperCase();
  if (code) bump(result.primitiveCodeCounts, code);
  if (type) bump(result.typeCounts, type);
  if (/BBOX|PLACEHOLDER|BOX_SOLID|FALLBACK|UNKNOWN/.test(render)) {
    result.fallbackObjectCount += 1;
    bump(result.fallbackReasonCounts, render.includes('BOX_SOLID') ? 'box-solid-fallback' : render.includes('BBOX') ? 'bbox-placeholder' : render.includes('PLACEHOLDER') ? 'placeholder' : 'non-native-rendered');
  }
}

function baseResult(scope, audit = null) {
  return {
    schemaVersion: VERSION,
    cacheKey: CACHE_KEY,
    capturedAt: new Date().toISOString(),
    scope,
    valid: false,
    errors: [],
    warnings: [],
    byteLength: 0,
    declaredLength: 0,
    magicHex: '',
    glbVersion: null,
    assetVersion: '',
    generator: '',
    chunks: [],
    binChunkCount: 0,
    sceneCount: 0,
    nodeCount: 0,
    meshCount: 0,
    materialCount: 0,
    accessorCount: 0,
    bufferViewCount: 0,
    bufferCount: 0,
    nodesWithExtras: 0,
    nodesWithGlbExportSchema: 0,
    primitiveCodeCounts: {},
    typeCounts: {},
    fallbackObjectCount: 0,
    fallbackReasonCounts: {},
    exportAuditSummary: summarizeAudit(audit),
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
    fallbackReasonCounts: audit.fallbackReasonCounts || {},
  };
}

function finish(result) {
  result.valid = result.errors.length === 0;
  return result;
}

function decodeText(buffer) { return new TextDecoder('utf-8').decode(new Uint8Array(buffer)); }
function bump(map, key) { const name = String(key || '').trim() || 'UNKNOWN'; map[name] = (map[name] || 0) + 1; }
function publish(result) { globalThis[GLOBAL_KEY] = result; try { globalThis.dispatchEvent?.(new CustomEvent('rvm-glb-export-validation-diagnostics', { detail: result })); } catch (_) {} }
function fileBase(scope) { const stamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '-').replace('Z', ''); return `rvm-native-scene-${scope}-${stamp}.validation.json`; }
function downloadValidationJson() { const value = globalThis[GLOBAL_KEY] || baseResult('last'); downloadJson(value, fileBase(value.scope || 'last')); }
function downloadJson(value, filename) { const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
function setStatus(root, message) { const chip = root?.querySelector?.('#rvm-mode-chip'); if (chip) chip.textContent = message; }
function injectStyles() { if (document.getElementById('rvm-glb-export-validation-style')) return; const style = document.createElement('style'); style.id = 'rvm-glb-export-validation-style'; style.textContent = `.rvm-glb-export-validation-section .rvm-glb-export-validation-buttons{display:flex;flex-wrap:wrap;gap:4px}.rvm-glb-export-validation-section .rvm-btn{padding:4px 7px;font-size:11px}.rvm-glb-export-validation-section .rvm-btn:disabled{opacity:.55;cursor:wait}`; document.head.appendChild(style); }
