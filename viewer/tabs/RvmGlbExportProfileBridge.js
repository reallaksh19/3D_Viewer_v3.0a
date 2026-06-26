import { exportSceneToGLB } from '../js/pcf2glb/glb/exportSceneToGLB.js';

const VERSION = 'rvm-glb-export-profile/v1-units-orientation-contract';
const CACHE_KEY = '20260620-rvm-glb-export-profile-units-1';
const GLOBAL_KEY = '__PCF_GLB_RVM_GLB_EXPORT_PROFILE_DIAGNOSTICS__';
const API_KEY = '__PCF_GLB_RVM_GLB_EXPORT_PROFILE__';

const EXPORT_PROFILE = Object.freeze({
  schema: VERSION,
  profileId: 'RVM_NATIVE_SCENE_METERS_WORLD_MATRIX_V1',
  sourceFormat: 'RVM_BINARY_WITH_ATT_SIDECAR',
  sourceScene: 'rendered-upgraded-threejs-scene',
  sourceUnits: 'metre',
  glbUnits: 'metre',
  unitScaleToMeters: 1,
  coordinateSystem: {
    sourceBasis: 'RVM Review world XYZ as loaded in viewer',
    threeJsBasis: 'viewer scene basis, no axis remap during export',
    gltfBasis: 'glTF node matrices preserve exported Three.js world transforms',
    handedness: 'right-handed viewer scene',
    axisRemap: 'none',
    transformPolicy: 'clone rendered/upgraded object geometry and bake source matrixWorld into exported node matrix',
  },
  metadataPolicy: {
    nodeExtras: true,
    componentExtras: true,
    normalizedRvmAttMetadata: true,
    sourceUuid: true,
    componentHierarchy: true,
  },
});

export function installRvmGlbExportProfileBridge() {
  injectStyles();
  const api = {
    version: VERSION,
    cacheKey: CACHE_KEY,
    profile: EXPORT_PROFILE,
    exportVisible: () => exportProfiled('visible'),
    exportSelected: () => exportProfiled('selected'),
    downloadProfile: () => downloadProfile(),
    prepareVisible: () => prepareProfiled('visible'),
    prepareSelected: () => prepareProfiled('selected'),
    getDiagnostics: () => globalThis[GLOBAL_KEY] || null,
  };
  globalThis[API_KEY] = api;
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
  if (!ribbon || root.querySelector('[data-rvm-glb-export-profile]')) return;
  const section = document.createElement('div');
  section.className = 'rvm-ribbon-section rvm-glb-export-profile-section';
  section.dataset.rvmGlbExportProfile = CACHE_KEY;
  section.innerHTML = `
    <span class="rvm-ribbon-label">ExportProfile</span>
    <div class="rvm-glb-export-profile-buttons" role="group" aria-label="RVM GLB export profile">
      <button class="rvm-btn" type="button" data-rvm-glb-export-profile-action="visible">Visible GLB</button>
      <button class="rvm-btn" type="button" data-rvm-glb-export-profile-action="selected">Selected GLB</button>
      <button class="rvm-btn" type="button" data-rvm-glb-export-profile-action="json">Profile JSON</button>
    </div>`;
  const search = ribbon.querySelector('.rvm-ribbon-search');
  ribbon.insertBefore(section, search || null);
  section.addEventListener('click', async (event) => {
    const button = event.target?.closest?.('[data-rvm-glb-export-profile-action]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    button.disabled = true;
    try {
      const action = button.dataset.rvmGlbExportProfileAction;
      if (action === 'json') downloadProfile();
      else await exportProfiled(action === 'selected' ? 'selected' : 'visible');
    } finally {
      button.disabled = false;
    }
  });
  setStatus(root, 'RVM GLB export profile ready');
}

function prepareProfiled(scope = 'visible') {
  const exporter = globalThis.__PCF_GLB_RVM_NATIVE_GLB_EXPORT__;
  const prepared = scope === 'selected' ? exporter?.prepareSelected?.() : exporter?.prepareVisible?.();
  if (!prepared?.scene || !prepared?.audit) {
    const audit = baseAudit(scope, ['native-exporter-not-ready']);
    publishDiagnostics(audit);
    return { scene: null, audit, objects: [] };
  }
  decoratePrepared(prepared, scope);
  publishDiagnostics(prepared.audit);
  return prepared;
}

async function exportProfiled(scope = 'visible') {
  const root = document.querySelector('[data-rvm-viewer]');
  const prepared = prepareProfiled(scope);
  if (!prepared.scene || prepared.audit.preflight?.status === 'fail') {
    setStatus(root, `Profiled GLB export blocked: ${prepared.audit.preflight?.errors?.[0] || 'preflight failed'}`);
    downloadJson(prepared.audit, `${fileBase(scope)}.profile-audit.json`);
    return { blob: null, audit: prepared.audit, blocked: true };
  }
  setStatus(root, `Exporting profiled ${scope} RVM GLB...`);
  prepared.scene.updateMatrixWorld?.(true);
  const blob = await exportSceneToGLB(prepared.scene);
  prepared.audit.glbBlobByteLength = Number(blob?.size || 0);
  prepared.audit.exportProfileCompleted = true;
  prepared.audit.exportCompleted = true;
  publishDiagnostics(prepared.audit);
  downloadBlob(blob, `${fileBase(scope)}.glb`);
  downloadJson(prepared.audit, `${fileBase(scope)}.profile-audit.json`);
  setStatus(root, `Exported profiled ${scope} RVM GLB`);
  return { blob, audit: prepared.audit };
}

function decoratePrepared(prepared, scope) {
  const audit = prepared.audit;
  const profile = serializable(EXPORT_PROFILE);
  let nodeCount = 0;
  prepared.scene.userData = serializable({
    ...prepared.scene.userData,
    glbExportProfileSchema: VERSION,
    glbExportProfileCacheKey: CACHE_KEY,
    glbExportProfile: profile,
    glbExportUnits: EXPORT_PROFILE.glbUnits,
    glbExportUnitScaleToMeters: EXPORT_PROFILE.unitScaleToMeters,
    glbExportAxisRemap: EXPORT_PROFILE.coordinateSystem.axisRemap,
    glbExportTransformPolicy: EXPORT_PROFILE.coordinateSystem.transformPolicy,
  });
  prepared.scene.traverse?.((node) => {
    nodeCount += 1;
    node.userData = serializable({
      ...node.userData,
      glbExportProfileSchema: VERSION,
      glbExportProfileCacheKey: CACHE_KEY,
      glbExportProfileId: EXPORT_PROFILE.profileId,
      glbExportUnits: EXPORT_PROFILE.glbUnits,
      glbExportSourceUnits: EXPORT_PROFILE.sourceUnits,
      glbExportUnitScaleToMeters: EXPORT_PROFILE.unitScaleToMeters,
      glbExportCoordinateSystem: EXPORT_PROFILE.coordinateSystem,
      glbExportMetadataPolicy: EXPORT_PROFILE.metadataPolicy,
    });
  });
  audit.schemaVersion = audit.schemaVersion || VERSION;
  audit.exportProfile = profile;
  audit.exportProfileCacheKey = CACHE_KEY;
  audit.exportProfileApplied = true;
  audit.exportProfileAppliedNodeCount = nodeCount;
  audit.exportProfileScope = scope;
  audit.unitContract = {
    sourceUnits: EXPORT_PROFILE.sourceUnits,
    glbUnits: EXPORT_PROFILE.glbUnits,
    unitScaleToMeters: EXPORT_PROFILE.unitScaleToMeters,
  };
  audit.coordinateContract = EXPORT_PROFILE.coordinateSystem;
  audit.metadataPolicy = EXPORT_PROFILE.metadataPolicy;
  audit.pipelineStages = Array.from(new Set([...(audit.pipelineStages || []), 'apply-export-profile-units-orientation-contract']));
  audit.pipelineStageStatus = {
    ...(audit.pipelineStageStatus || {}),
    exportProfileApplied: true,
    unitsDeclared: true,
    coordinateContractDeclared: true,
  };
  audit.preflight = enrichPreflight(audit.preflight);
  return prepared;
}

function enrichPreflight(preflight = {}) {
  const warnings = Array.from(new Set([...(preflight.warnings || []), 'export-profile-declared']));
  return { ...preflight, warnings };
}

function downloadProfile() {
  const value = {
    schemaVersion: VERSION,
    cacheKey: CACHE_KEY,
    capturedAt: new Date().toISOString(),
    profile: EXPORT_PROFILE,
    nativeExporterDiagnostics: globalThis.__PCF_GLB_RVM_NATIVE_GLB_EXPORT_DIAGNOSTICS__ || null,
  };
  publishDiagnostics(value);
  downloadJson(value, `${fileBase('visible')}.profile.json`);
  setStatus(document.querySelector('[data-rvm-viewer]'), 'Downloaded RVM GLB export profile JSON');
}

function baseAudit(scope, errors = []) {
  return {
    schemaVersion: VERSION,
    cacheKey: CACHE_KEY,
    capturedAt: new Date().toISOString(),
    scope,
    exportProfile: EXPORT_PROFILE,
    preflight: { status: errors.length ? 'fail' : 'pass', errors, warnings: [] },
    pipelineStageStatus: { nativeExporterReady: errors.length === 0 },
  };
}

function fileBase(scope) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '-').replace('Z', '');
  return `rvm-profiled-scene-${scope}-${stamp}`;
}

function downloadJson(value, filename) {
  downloadBlob(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }), filename);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function publishDiagnostics(value) {
  globalThis[GLOBAL_KEY] = value;
  try { globalThis.dispatchEvent?.(new CustomEvent('rvm-glb-export-profile-diagnostics', { detail: value })); } catch (_) {}
}

function setStatus(root, message) {
  const chip = root?.querySelector?.('#rvm-mode-chip');
  if (chip) chip.textContent = message;
}

function serializable(value) {
  try { return JSON.parse(JSON.stringify(value ?? {})); } catch (_) { return {}; }
}

function injectStyles() {
  if (document.getElementById('rvm-glb-export-profile-style')) return;
  const style = document.createElement('style');
  style.id = 'rvm-glb-export-profile-style';
  style.textContent = `.rvm-glb-export-profile-section .rvm-glb-export-profile-buttons{display:flex;flex-wrap:wrap;gap:4px}.rvm-glb-export-profile-section .rvm-btn{padding:4px 7px;font-size:11px}.rvm-glb-export-profile-section .rvm-btn:disabled{opacity:.55;cursor:wait}`;
  document.head.appendChild(style);
}
