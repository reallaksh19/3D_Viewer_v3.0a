import * as THREE from 'three';
import { exportSceneToGLB } from '../js/pcf2glb/glb/exportSceneToGLB.js';

const VERSION = 'rvm-native-scene-glb-export/v3-component-hierarchy';
const CACHE_KEY = '20260620-rvm-glb-component-hierarchy-v3-1';
const GLOBAL_KEY = '__PCF_GLB_RVM_NATIVE_GLB_EXPORT_DIAGNOSTICS__';
const API_KEY = '__PCF_GLB_RVM_NATIVE_GLB_EXPORT__';

export function installRvmNativeSceneGlbExportBridge() {
  injectStyles();
  const api = {
    version: VERSION,
    cacheKey: CACHE_KEY,
    exportVisible: () => exportScope('visible'),
    exportSelected: () => exportScope('selected'),
    prepareVisible: () => prepareExportScene(globalThis.__3D_RVM_VIEWER__, 'visible'),
    prepareSelected: () => prepareExportScene(globalThis.__3D_RVM_VIEWER__, 'selected'),
    exportScope,
    downloadAudit: () => downloadAudit(),
    downloadPlan: () => downloadPlan(),
    getDiagnostics: () => globalThis[GLOBAL_KEY] || null,
  };
  globalThis[API_KEY] = api;
  let attempts = 0;
  const attach = () => {
    attempts += 1;
    const root = document.querySelector('[data-rvm-viewer]');
    const viewer = globalThis.__3D_RVM_VIEWER__;
    if (root) injectControls(root, viewer);
    if ((!root || !viewer) && attempts < 160) setTimeout(attach, 350);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
  else attach();
  return api;
}

function injectControls(root) {
  const ribbon = root?.querySelector?.('.geo-top-ribbon');
  if (!ribbon || root.querySelector('[data-rvm-native-glb-export]')) return;
  const section = document.createElement('div');
  section.className = 'rvm-ribbon-section rvm-native-glb-export-section';
  section.dataset.rvmNativeGlbExport = CACHE_KEY;
  section.innerHTML = `
    <span class="rvm-ribbon-label">Export</span>
    <div class="rvm-native-glb-export-buttons" role="group" aria-label="RVM native scene export">
      <button class="rvm-btn" type="button" data-rvm-native-glb-export-action="visible">Visible GLB</button>
      <button class="rvm-btn" type="button" data-rvm-native-glb-export-action="selected">Selected GLB</button>
      <button class="rvm-btn" type="button" data-rvm-native-glb-export-action="audit">Audit JSON</button>
      <button class="rvm-btn" type="button" data-rvm-native-glb-export-action="plan">Plan JSON</button>
    </div>`;
  const search = ribbon.querySelector('.rvm-ribbon-search');
  ribbon.insertBefore(section, search || null);
  section.addEventListener('click', async (event) => {
    const button = event.target?.closest?.('[data-rvm-native-glb-export-action]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const action = button.dataset.rvmNativeGlbExportAction;
    button.disabled = true;
    try {
      if (action === 'audit') downloadAudit();
      else if (action === 'plan') downloadPlan();
      else await exportScope(action === 'selected' ? 'selected' : 'visible');
    } finally {
      button.disabled = false;
    }
  });
  setStatus(root, 'RVM native GLB export pipeline ready');
}

async function exportScope(scope, options = {}) {
  const viewer = globalThis.__3D_RVM_VIEWER__;
  const root = document.querySelector('[data-rvm-viewer]');
  const prepared = prepareExportScene(viewer, scope, options);
  if (!prepared.objects.length) {
    setStatus(root, scope === 'selected' ? 'No selected RVM geometry to export' : 'No visible RVM geometry to export');
    publishDiagnostics(prepared.audit);
    return null;
  }
  if (prepared.audit.preflight.status === 'fail') {
    setStatus(root, `RVM GLB export blocked: ${prepared.audit.preflight.errors[0] || 'preflight failed'}`);
    publishDiagnostics(prepared.audit);
    if (options.downloadOnBlocked !== false) downloadJson(prepared.audit, `${fileBase(scope)}.audit.json`);
    return { blob: null, audit: prepared.audit, blocked: true };
  }
  setStatus(root, `Exporting ${prepared.objects.length} ${scope} RVM object(s) to GLB...`);
  prepared.scene.updateMatrixWorld?.(true);
  const blob = await exportSceneToGLB(prepared.scene);
  prepared.audit.glbBlobByteLength = Number(blob?.size || 0);
  prepared.audit.exportCompleted = true;
  publishDiagnostics(prepared.audit);
  if (options.download !== false) {
    downloadBlob(blob, `${fileBase(scope)}.glb`);
    downloadJson(prepared.audit, `${fileBase(scope)}.audit.json`);
  }
  setStatus(root, `Exported ${prepared.objects.length} ${scope} RVM object(s) to GLB`);
  return { blob, audit: prepared.audit };
}

function prepareExportScene(viewer, scope = 'visible', options = {}) {
  const collection = collectSourceMeshes(viewer, scope);
  const scene = new THREE.Scene();
  scene.name = `RVM native scene export ${scope}`;
  scene.userData = serializable({
    exporter: VERSION,
    cacheKey: CACHE_KEY,
    scope,
    source: 'rendered-upgraded-threejs-scene',
    capturedAt: new Date().toISOString(),
    exportLogic: 'collect-visible-or-selected-normalize-metadata-build-component-hierarchy-clone-world-transform-serialize-glb',
    componentHierarchySchema: 'rvm-glb-component-hierarchy/v1',
  });
  const rootGroup = new THREE.Group();
  rootGroup.name = 'RVM_EXPORT_ROOT';
  rootGroup.userData = serializable({
    exporterRoot: true,
    exporter: VERSION,
    cacheKey: CACHE_KEY,
    scope,
    source: 'rendered-upgraded-threejs-scene',
    componentHierarchySchema: 'rvm-glb-component-hierarchy/v1',
  });
  scene.add(rootGroup);

  const componentGroups = new Map();
  const audit = baseAudit(scope, options);
  audit.rejectedCandidateCount = collection.rejected.length;
  audit.rejectedReasons = summarizeRejected(collection.rejected);

  for (const source of collection.objects) {
    const attrs = attrsFor(source);
    const props = source.userData?.browserRvmProperties || {};
    const key = componentKey(source, attrs, props);
    let entry = componentGroups.get(key);
    if (!entry) {
      const index = componentGroups.size + 1;
      const component = componentMetadata(source, attrs, props, key, index);
      const group = new THREE.Group();
      group.name = component.groupName;
      group.userData = serializable({
        exporterComponentGroup: true,
        componentHierarchySchema: 'rvm-glb-component-hierarchy/v1',
        glbExportSchema: VERSION,
        glbExportCacheKey: CACHE_KEY,
        componentIndex: index,
        componentKey: key,
        glbExportNodePath: `RVM_EXPORT_ROOT/${component.groupName}`,
        ...component.extras,
      });
      entry = { group, component, meshCount: 0, primitiveCounts: {}, typeCounts: {}, metadataFieldCounts: {} };
      componentGroups.set(key, entry);
      rootGroup.add(group);
      audit.componentCount += 1;
      audit.componentGroups.push(componentAuditBase(component, key, index));
      bump(audit.componentKeyCounts, key || 'UNKNOWN');
      bump(audit.componentTypeCounts, component.extras.TYPE || 'UNKNOWN');
    }

    const normalized = normalizedMetadata(source, attrs, props);
    const meshIndex = entry.meshCount + 1;
    const nodeName = primitiveNodeName(entry.component, source, attrs, props, normalized, meshIndex);
    const nodePath = `RVM_EXPORT_ROOT/${entry.component.groupName}/${nodeName}`;
    const clone = cloneExportObject(source, attrs, props, normalized, { nodeName, nodePath, meshIndex, component: entry.component });
    if (!clone) {
      audit.skippedCount += 1;
      bump(audit.skippedReasons, 'clone-failed');
      continue;
    }
    entry.group.add(clone);
    entry.meshCount += 1;
    bump(entry.primitiveCounts, String(normalized.RVM_PRIMITIVE_CODE || normalized.RVM_PRIMITIVE_KIND_NAME || 'UNKNOWN'));
    bump(entry.typeCounts, String(normalized.TYPE || 'UNKNOWN'));
    bumpMetadataCounts({ metadataFieldCounts: entry.metadataFieldCounts }, normalized);

    audit.meshCount += 1;
    audit.exportedObjects.push(objectAudit(source, attrs, props, normalized, { nodeName, nodePath, component: entry.component, meshIndex }));
    updateAuditBounds(audit, source);
    bump(audit.primitiveKindCounts, String(normalized.RVM_PRIMITIVE_CODE || normalized.RVM_PRIMITIVE_KIND_NAME || 'UNKNOWN'));
    bump(audit.typeCounts, String(normalized.TYPE || 'UNKNOWN'));
    bump(audit.geometryTypeCounts, geometryType(source));
    bumpMetadataCounts(audit, normalized);
    if (isFallback(source, attrs)) {
      audit.fallbackObjectCount += 1;
      bump(audit.fallbackReasonCounts, fallbackReason(source, attrs));
    }
  }

  finalizeComponentGroups(audit, componentGroups);
  rootGroup.userData.componentCount = audit.componentCount;
  rootGroup.userData.meshCount = audit.meshCount;
  rootGroup.userData.componentGroups = audit.componentGroups.map((entry) => ({
    componentIndex: entry.componentIndex,
    componentId: entry.componentId,
    name: entry.name,
    type: entry.type,
    meshCount: entry.meshCount,
  }));
  audit.boundsFinite = boundsFinite(audit.worldBounds);
  audit.pipelineStageStatus = stageStatus(audit);
  audit.preflight = runPreflight(audit, options);
  return { scene, audit, objects: collection.objects };
}

function collectSourceMeshes(viewer, scope) {
  const rejected = [];
  if (!viewer?.modelGroup?.traverse) return { objects: [], rejected: [{ reason: 'viewer-model-group-not-ready' }] };
  const selected = scope === 'selected' ? new Set((viewer._rvmCanvasSelectedMeshes || []).filter(Boolean)) : null;
  const objects = [];
  viewer.modelGroup.updateMatrixWorld?.(true);
  viewer.modelGroup.traverse((obj) => {
    const reason = rejectionReason(obj, selected);
    if (reason) {
      if (obj?.isMesh || obj?.isLine || obj?.isPoints) rejected.push({ reason, name: obj.name || obj.uuid || '' });
      return;
    }
    objects.push(obj);
  });
  return { objects: unique(objects), rejected };
}

function rejectionReason(obj, selected) {
  if (!obj) return 'missing-object';
  if (selected && !selected.has(obj)) return 'not-selected';
  if (obj.visible === false) return 'not-visible';
  if (obj.userData?.rvmHiddenByUser) return 'hidden-by-user';
  if (!(obj.isMesh || obj.isLine || obj.isPoints)) return 'not-renderable-object';
  if (!obj.geometry) return 'missing-geometry';
  if (!hasRenderableGeometry(obj.geometry)) return 'empty-geometry';
  if (obj.userData?.supportAssemblyMarker || obj.userData?.browserRvmSupportContactMarker) return 'marker-helper';
  return '';
}

function hasRenderableGeometry(geometry) {
  const position = geometry?.attributes?.position;
  if (position?.count > 0) return true;
  return Number(geometry?.index?.count || 0) > 0;
}

function cloneExportObject(source, attrs, props, normalized, naming = {}) {
  try {
    const clone = source.clone(false);
    clone.geometry = source.geometry?.clone?.() || source.geometry;
    clone.material = cloneMaterial(source);
    clone.name = safeName(naming.nodeName || props.displayName || attrs.NAME || source.name || source.uuid);
    clone.userData = serializable({
      ...source.userData,
      browserRvmAttributes: attrs,
      attributes: attrs,
      browserRvmProperties: props,
      glbExportSchema: VERSION,
      glbExportCacheKey: CACHE_KEY,
      glbExportSourceUuid: source.uuid,
      glbExportComponentIndex: naming.component?.index || 0,
      glbExportComponentId: naming.component?.extras?.COMPONENT_ID || normalized.COMPONENT_ID || '',
      glbExportComponentName: naming.component?.extras?.NAME || normalized.RVM_OWNER_NAME || normalized.NAME || '',
      glbExportComponentType: naming.component?.extras?.TYPE || normalized.TYPE || '',
      glbExportMeshIndexInComponent: naming.meshIndex || 0,
      glbExportNodeName: clone.name,
      glbExportNodePath: naming.nodePath || clone.name,
      glbExportRenderPrimitive: source.userData?.effectiveRenderPrimitive || source.userData?.renderPrimitive || attrs.RVM_BROWSER_RENDER_PRIMITIVE,
      glbExportRenderQuality: source.userData?.renderQuality || '',
      glbExportPrimitiveCode: attrs.RVM_PRIMITIVE_CODE || '',
      glbExportNormalizedMetadata: normalized,
    });
    clone.matrix.copy(source.matrixWorld);
    clone.matrixAutoUpdate = false;
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, 0, 0);
    clone.scale.set(1, 1, 1);
    return clone;
  } catch (_) {
    return null;
  }
}

function cloneMaterial(source) {
  const original = source.userData?.rvmCanvasSelectionOriginalMaterial || source.userData?.rvmMaterialModeOriginalMaterial || source.material;
  if (Array.isArray(original)) return original.map((m) => m?.clone?.() || m);
  return original?.clone?.() || original;
}

function attrsFor(obj) {
  const data = obj.userData || {};
  const props = data.browserRvmProperties || {};
  return { ...(data.attributes || {}), ...(props.attributes || {}), ...(data.browserRvmAttributes || {}) };
}

function normalizedMetadata(obj, attrs, props) {
  const data = obj.userData || {};
  return serializable({
    NAME: attrs.NAME || props.displayName || data.displayName || obj.name || obj.uuid,
    TYPE: attrs.TYPE || props.type || data.type || '',
    COMPONENT_ID: attrs.COMPONENT_ID || attrs.RVM_OWNER_NAME || props.displayName || obj.name || obj.uuid,
    RVM_OWNER_NAME: attrs.RVM_OWNER_NAME || '',
    RVM_OWNER_PATH: attrs.RVM_OWNER_PATH || props.sourcePath || data.sourcePath || '',
    RVM_PRIMITIVE_CODE: attrs.RVM_PRIMITIVE_CODE || '',
    RVM_PRIMITIVE_KIND_NAME: attrs.RVM_PRIMITIVE_KIND_NAME || '',
    RVM_BYTE_OFFSET: attrs.RVM_BYTE_OFFSET || '',
    RVM_BYTE_LENGTH: attrs.RVM_BYTE_LENGTH || '',
    RVM_RECORD_TAG: attrs.RVM_RECORD_TAG || '',
    RVM_BROWSER_RENDER_PRIMITIVE: data.effectiveRenderPrimitive || data.renderPrimitive || attrs.RVM_BROWSER_RENDER_PRIMITIVE || '',
    RENDER_QUALITY: data.renderQuality || '',
    APOS: attrs.APOS || '',
    LPOS: attrs.LPOS || '',
    BPOS: attrs.BPOS || '',
    POS: attrs.POS || '',
    HBOR: attrs.HBOR || '',
    MATERIAL: attrs.MATERIAL || '',
    SPEC: attrs.SPEC || '',
    RATING: attrs.RATING || '',
    SOURCE_FORMAT: attrs.SOURCE_FORMAT || data.SOURCE_FORMAT || '',
    sourceUuid: obj.uuid,
  });
}

function componentKey(obj, attrs, props) {
  return String(attrs.COMPONENT_ID || attrs.RVM_OWNER_NAME || attrs.RVM_OWNER_PATH || props.sourcePath || props.displayName || obj.userData?.sourcePath || obj.name || obj.uuid || 'RVM_COMPONENT');
}

function componentMetadata(obj, attrs, props, key, index) {
  const ownerName = attrs.RVM_OWNER_NAME || attrs.NAME || props.displayName || obj.userData?.displayName || obj.name || `COMPONENT_${index}`;
  const type = attrs.TYPE || props.type || obj.userData?.type || attrs.RVM_PRIMITIVE_KIND || 'UNKNOWN';
  const componentId = attrs.COMPONENT_ID || attrs.RVM_OWNER_NAME || stableId(key, index);
  const sourcePath = props.sourcePath || obj.userData?.sourcePath || attrs.RVM_OWNER_PATH || '';
  const groupName = safeName(`${pad(index, 4)}_${String(type || 'UNKNOWN').toUpperCase()}_${componentId || ownerName}`);
  return {
    index,
    groupName,
    key,
    extras: serializable({
      NAME: ownerName,
      TYPE: type,
      COMPONENT_ID: componentId,
      RVM_OWNER_NAME: attrs.RVM_OWNER_NAME || '',
      RVM_OWNER_PATH: attrs.RVM_OWNER_PATH || sourcePath,
      SOURCE_PATH: sourcePath,
      MATERIAL: attrs.MATERIAL || '',
      SPEC: attrs.SPEC || '',
      RATING: attrs.RATING || '',
    }),
  };
}

function componentAuditBase(component, key, index) {
  return {
    componentIndex: index,
    componentKey: key,
    componentId: component.extras.COMPONENT_ID || '',
    name: component.extras.NAME || '',
    type: component.extras.TYPE || '',
    sourcePath: component.extras.SOURCE_PATH || component.extras.RVM_OWNER_PATH || '',
    groupName: component.groupName,
    meshCount: 0,
    primitiveKindCounts: {},
    typeCounts: {},
    metadataFieldCounts: {},
  };
}

function primitiveNodeName(component, source, attrs, props, normalized, meshIndex) {
  const primitiveCode = normalized.RVM_PRIMITIVE_CODE || normalized.RVM_PRIMITIVE_KIND_NAME || 'UNK';
  const byteOffset = normalized.RVM_BYTE_OFFSET ? `@${normalized.RVM_BYTE_OFFSET}` : '';
  const primitiveName = props.displayName || attrs.NAME || source.name || `${component.extras.TYPE || 'RVM'}_${primitiveCode}`;
  return safeName(`${pad(meshIndex, 3)}_PRIM${primitiveCode}${byteOffset}_${primitiveName}`);
}

function finalizeComponentGroups(audit, componentGroups) {
  const groups = Array.from(componentGroups.values());
  for (const entry of groups) {
    entry.group.userData.componentMeshCount = entry.meshCount;
    entry.group.userData.primitiveKindCounts = serializable(entry.primitiveCounts);
    entry.group.userData.typeCounts = serializable(entry.typeCounts);
    entry.group.userData.metadataFieldCounts = serializable(entry.metadataFieldCounts);
    const auditEntry = audit.componentGroups.find((item) => item.componentIndex === entry.component.index);
    if (auditEntry) {
      auditEntry.meshCount = entry.meshCount;
      auditEntry.primitiveKindCounts = serializable(entry.primitiveCounts);
      auditEntry.typeCounts = serializable(entry.typeCounts);
      auditEntry.metadataFieldCounts = serializable(entry.metadataFieldCounts);
    }
  }
  audit.componentHierarchy = {
    schema: 'rvm-glb-component-hierarchy/v1',
    rootNodeName: 'RVM_EXPORT_ROOT',
    componentNodeCount: groups.length,
    componentMeshCounts: groups.map((entry) => ({
      componentIndex: entry.component.index,
      componentId: entry.component.extras.COMPONENT_ID || '',
      name: entry.component.extras.NAME || '',
      type: entry.component.extras.TYPE || '',
      meshCount: entry.meshCount,
    })),
  };
}

function baseAudit(scope, options = {}) {
  return {
    schemaVersion: VERSION,
    cacheKey: CACHE_KEY,
    capturedAt: new Date().toISOString(),
    scope,
    source: 'rendered-upgraded-threejs-scene',
    exportLogicVersion: 3,
    pipelineStages: [
      'collect-source-meshes',
      'normalize-rvm-att-metadata',
      'build-component-node-hierarchy',
      'deterministic-node-naming',
      'clone-world-transformed-rendered-objects',
      'preflight-gate',
      'gltfexporter-binary-glb',
      'audit-json',
    ],
    policy: {
      onlyVisible: true,
      includeHidden: false,
      includeMarkers: false,
      selectedOnly: scope === 'selected',
      blockEmptyExport: true,
      blockInvalidBounds: options.blockInvalidBounds !== false,
      blockFallbacks: Boolean(options.blockFallbacks),
    },
    onlyVisible: true,
    includeHidden: false,
    componentCount: 0,
    meshCount: 0,
    skippedCount: 0,
    rejectedCandidateCount: 0,
    glbBlobByteLength: 0,
    exportCompleted: false,
    fallbackObjectCount: 0,
    primitiveKindCounts: {},
    typeCounts: {},
    componentKeyCounts: {},
    componentTypeCounts: {},
    geometryTypeCounts: {},
    fallbackReasonCounts: {},
    skippedReasons: {},
    rejectedReasons: {},
    metadataFieldCounts: {},
    componentGroups: [],
    componentHierarchy: null,
    worldBounds: { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], size: [0, 0, 0] },
    boundsFinite: false,
    preflight: null,
    pipelineStageStatus: {},
    fallbackDiagnostics: globalThis.__PCF_GLB_RVM_PRIMITIVE_FALLBACK_DIAGNOSTICS__ || null,
    materialDiagnostics: globalThis.__PCF_GLB_RVM_MATERIAL_MODE_DIAGNOSTICS__ || null,
    supportEngineDiagnostics: globalThis.__PCF_GLB_RVM_INTELLIGENT_SUPPORT_ENGINE_DIAGNOSTICS__ || null,
    supportAttDiagnostics: globalThis.__PCF_GLB_RVM_SUPPORT_ATT_MAPPING_DIAGNOSTICS__ || null,
    exportedObjects: [],
  };
}

function objectAudit(obj, attrs, props, normalized, naming = {}) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  return {
    uuid: obj.uuid,
    name: normalized.NAME || props.displayName || attrs.NAME || obj.name || obj.uuid,
    type: normalized.TYPE || '',
    componentIndex: naming.component?.index || 0,
    componentId: naming.component?.extras?.COMPONENT_ID || normalized.COMPONENT_ID || '',
    componentName: naming.component?.extras?.NAME || '',
    componentType: naming.component?.extras?.TYPE || '',
    meshIndexInComponent: naming.meshIndex || 0,
    glbNodeName: naming.nodeName || '',
    glbNodePath: naming.nodePath || '',
    primitiveCode: normalized.RVM_PRIMITIVE_CODE || '',
    primitiveKindName: normalized.RVM_PRIMITIVE_KIND_NAME || '',
    renderPrimitive: normalized.RVM_BROWSER_RENDER_PRIMITIVE || '',
    renderQuality: normalized.RENDER_QUALITY || '',
    sourcePath: normalized.RVM_OWNER_PATH || '',
    byteOffset: normalized.RVM_BYTE_OFFSET || '',
    geometryType: geometryType(obj),
    bboxSize: [round(size.x), round(size.y), round(size.z)],
    fallbackReason: isFallback(obj, attrs) ? fallbackReason(obj, attrs) : '',
    metadataKeys: Object.keys(normalized).filter((key) => normalized[key] !== ''),
  };
}

function updateAuditBounds(audit, obj) {
  try {
    const box = new THREE.Box3().setFromObject(obj);
    if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) return;
    audit.worldBounds.min[0] = Math.min(audit.worldBounds.min[0], box.min.x);
    audit.worldBounds.min[1] = Math.min(audit.worldBounds.min[1], box.min.y);
    audit.worldBounds.min[2] = Math.min(audit.worldBounds.min[2], box.min.z);
    audit.worldBounds.max[0] = Math.max(audit.worldBounds.max[0], box.max.x);
    audit.worldBounds.max[1] = Math.max(audit.worldBounds.max[1], box.max.y);
    audit.worldBounds.max[2] = Math.max(audit.worldBounds.max[2], box.max.z);
    audit.worldBounds.size = [
      round(audit.worldBounds.max[0] - audit.worldBounds.min[0]),
      round(audit.worldBounds.max[1] - audit.worldBounds.min[1]),
      round(audit.worldBounds.max[2] - audit.worldBounds.min[2]),
    ];
  } catch (_) {}
}

function runPreflight(audit, options = {}) {
  const errors = [];
  const warnings = [];
  if (audit.meshCount < 1) errors.push('no-exportable-meshes');
  if (options.blockInvalidBounds !== false && !audit.boundsFinite) errors.push('invalid-world-bounds');
  if (options.blockFallbacks && audit.fallbackObjectCount > 0) errors.push('fallback-objects-present');
  if (audit.componentCount < 1) errors.push('no-component-hierarchy');
  if (audit.fallbackObjectCount > 0) warnings.push('fallback-objects-exported');
  if (!audit.metadataFieldCounts.TYPE) warnings.push('no-type-metadata');
  if (!audit.metadataFieldCounts.NAME) warnings.push('no-name-metadata');
  if (!audit.metadataFieldCounts.COMPONENT_ID && !audit.metadataFieldCounts.RVM_OWNER_NAME) warnings.push('weak-component-id-metadata');
  if (audit.skippedCount > 0) warnings.push('objects-skipped-during-clone');
  return {
    status: errors.length ? 'fail' : warnings.length ? 'warn' : 'pass',
    errors,
    warnings,
  };
}

function stageStatus(audit) {
  return {
    sourceCollected: audit.meshCount + audit.skippedCount > 0,
    metadataNormalized: Object.keys(audit.metadataFieldCounts).length > 0,
    componentGrouped: audit.componentCount > 0,
    componentHierarchyBuilt: Boolean(audit.componentHierarchy?.componentNodeCount),
    deterministicNodeNaming: audit.exportedObjects.every((item) => Boolean(item.glbNodeName && item.glbNodePath)),
    boundsComputed: audit.boundsFinite,
    fallbackAudited: true,
  };
}

function boundsFinite(bounds) {
  return [...bounds.min, ...bounds.max, ...bounds.size].every(Number.isFinite);
}

function bumpMetadataCounts(audit, normalized) {
  for (const key of Object.keys(normalized || {})) {
    if (normalized[key] !== '' && normalized[key] != null) bump(audit.metadataFieldCounts, key);
  }
}

function summarizeRejected(items) {
  const result = {};
  for (const item of items || []) bump(result, item.reason || 'unknown');
  return result;
}

function geometryType(obj) {
  if (obj?.isLine) return 'Line';
  if (obj?.isPoints) return 'Points';
  return obj?.geometry?.type || (obj?.isMesh ? 'Mesh' : 'Object');
}

function isFallback(obj, attrs) {
  const text = `${obj.userData?.effectiveRenderPrimitive || ''} ${obj.userData?.renderPrimitive || ''} ${attrs.RVM_BROWSER_RENDER_PRIMITIVE || ''}`.toUpperCase();
  return /BBOX|PLACEHOLDER|BOX_SOLID|FALLBACK|UNKNOWN/.test(text);
}

function fallbackReason(obj, attrs) {
  const text = `${obj.userData?.effectiveRenderPrimitive || ''} ${obj.userData?.renderPrimitive || ''} ${attrs.RVM_BROWSER_RENDER_PRIMITIVE || ''}`.toUpperCase();
  if (text.includes('BOX_SOLID')) return 'box-solid-fallback';
  if (text.includes('BBOX')) return 'bbox-placeholder';
  if (text.includes('PLACEHOLDER')) return 'placeholder';
  return 'non-native-rendered';
}

function downloadAudit() {
  const prepared = prepareExportScene(globalThis.__3D_RVM_VIEWER__, 'visible');
  publishDiagnostics(prepared.audit);
  downloadJson(prepared.audit, `${fileBase('visible')}.audit.json`);
  setStatus(document.querySelector('[data-rvm-viewer]'), 'Downloaded RVM GLB export audit JSON');
}

function downloadPlan() {
  const prepared = prepareExportScene(globalThis.__3D_RVM_VIEWER__, 'visible');
  const plan = serializable({
    schemaVersion: `${VERSION}/plan`,
    cacheKey: CACHE_KEY,
    capturedAt: new Date().toISOString(),
    pipelineStages: prepared.audit.pipelineStages,
    policy: prepared.audit.policy,
    pipelineStageStatus: prepared.audit.pipelineStageStatus,
    preflight: prepared.audit.preflight,
    meshCount: prepared.audit.meshCount,
    componentCount: prepared.audit.componentCount,
    componentHierarchy: prepared.audit.componentHierarchy,
    componentGroups: prepared.audit.componentGroups,
    fallbackObjectCount: prepared.audit.fallbackObjectCount,
    primitiveKindCounts: prepared.audit.primitiveKindCounts,
    typeCounts: prepared.audit.typeCounts,
    componentTypeCounts: prepared.audit.componentTypeCounts,
    metadataFieldCounts: prepared.audit.metadataFieldCounts,
    worldBounds: prepared.audit.worldBounds,
  });
  publishDiagnostics(prepared.audit);
  downloadJson(plan, `${fileBase('visible')}.plan.json`);
  setStatus(document.querySelector('[data-rvm-viewer]'), 'Downloaded RVM GLB export plan JSON');
}

function fileBase(scope) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '-').replace('Z', '');
  return `rvm-native-scene-${scope}-${stamp}`;
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

function publishDiagnostics(audit) {
  globalThis[GLOBAL_KEY] = audit;
  try { globalThis.dispatchEvent?.(new CustomEvent('rvm-native-glb-export-diagnostics', { detail: audit })); } catch (_) {}
}

function setStatus(root, message) {
  const chip = root?.querySelector?.('#rvm-mode-chip');
  if (chip) chip.textContent = message;
}

function serializable(value) {
  try { return JSON.parse(JSON.stringify(value ?? {})); } catch (_) { return {}; }
}

function stableId(value, index) {
  const text = String(value || `COMPONENT_${index}`).replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return text || `COMPONENT_${index}`;
}

function safeName(value) { return String(value || 'RVM_OBJECT').replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_').slice(0, 180); }
function unique(items) { return Array.from(new Set(items)); }
function bump(map, key) { const name = String(key || '').trim() || 'UNKNOWN'; map[name] = (map[name] || 0) + 1; }
function round(value) { return Math.round(Number(value || 0) * 1e6) / 1e6; }
function pad(value, width) { return String(Math.max(0, Number(value) || 0)).padStart(width, '0'); }

function injectStyles() {
  if (document.getElementById('rvm-native-scene-glb-export-style')) return;
  const style = document.createElement('style');
  style.id = 'rvm-native-scene-glb-export-style';
  style.textContent = `.rvm-native-glb-export-section .rvm-native-glb-export-buttons{display:flex;flex-wrap:wrap;gap:4px}.rvm-native-glb-export-section .rvm-btn{padding:4px 7px;font-size:11px}.rvm-native-glb-export-section .rvm-btn:disabled{opacity:.55;cursor:wait}`;
  document.head.appendChild(style);
}
