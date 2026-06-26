import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { AvevaJsonLoader } from '../rvm/AvevaJsonLoader.js';
import { RvmViewer3D } from '../rvm-viewer/RvmViewer3D.js?v=20260622-rvm-leaf-picking-2';
import { readNonPrimitiveSupportOverlaySettings } from '../overlays/support/SupportOverlaySettings.js';
import { resolveSupportSymbol } from '../overlays/support/NonPrimitiveSupportOverlayResolver.js';
import {
  buildSupportOverlayFilterPlan,
  SUPPORT_OVERLAY_FILTER_DIAGNOSTICS_SCHEMA,
} from '../overlays/support/SupportOverlayFilterDiagnostics.js';
import {
  collectSourcePipeSegments,
  createSupportCoordinateMapper,
  resolveSupportPipeAxis,
} from '../overlays/support/SupportOverlayCoordinateMapper.js';
import {
  collectNonPrimitiveSupportRecords as collectSupportRecordsFromSource,
  SUPPORT_OVERLAY_SOURCE_EXTRACTION_SCHEMA,
} from '../overlays/support/SupportOverlaySourceExtraction.js';
import { buildSupportOverlayGlyphGroup } from '../overlays/support/SupportOverlayGlyphGeometry.js';
import { createSupportOverlayLabelObject, shouldShowSupportOverlayLabel } from '../overlays/support/SupportOverlayLabels.js';
import { buildSupportOverlayDetails, SUPPORT_OVERLAY_DETAILS_SCHEMA } from '../overlays/support/SupportOverlayDetails.js';
import {
  readSourceAxisTransformSettings,
  sourceAxisBasis3,
  transformSourcePipeSegments,
  transformSourceVector,
  SOURCE_AXIS_TRANSFORM_SCHEMA,
} from '../overlays/source-tools/SourceAxisTransform.js';

export const RVM_NON_PRIMITIVE_SUPPORT_OVERLAY_SCHEMA = 'rvm-non-primitive-support-overlay/v9';

const ROOT_NAME = '__RVM_NON_PRIMITIVE_SUPPORT_OVERLAY__';
const GLOBAL_KEY = '__PCF_GLB_RVM_NON_PRIMITIVE_SUPPORT_OVERLAY__';
const PATCH_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-support-overlay-v9');
const LOADER_PATCH_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-support-overlay-loader-v9');
const VIEWER_PATCH_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-support-overlay-viewer-v9');
const MAX_SUPPORT_OVERLAYS = 500;
const NON_PRIMITIVE_SOURCE_RE = /\.(json|jscon|uxml|inputxml|txt)$/i;
const RVM_SOURCE_RE = /\.(rvm|rev)$/i;

export function installRvmNonPrimitiveSupportOverlayBridge() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  globalThis[GLOBAL_KEY] = {
    schema: RVM_NON_PRIMITIVE_SUPPORT_OVERLAY_SCHEMA,
    sourceExtractionSchema: SUPPORT_OVERLAY_SOURCE_EXTRACTION_SCHEMA,
    filterDiagnosticsSchema: SUPPORT_OVERLAY_FILTER_DIAGNOSTICS_SCHEMA,
    detailsSchema: SUPPORT_OVERLAY_DETAILS_SCHEMA,
    axisTransformSchema: SOURCE_AXIS_TRANSFORM_SCHEMA,
    rootName: ROOT_NAME,
    applyFromSource,
    clear,
    collect: collectNonPrimitiveSupportRecords,
    isNonPrimitiveSource,
  };
  patchAvevaJsonLoaderForNonPrimitiveSource();
  patchRvmViewerSetModelForNonPrimitiveOverlay();
}

function patchAvevaJsonLoaderForNonPrimitiveSource() {
  const proto = AvevaJsonLoader?.prototype;
  if (!proto || proto[LOADER_PATCH_FLAG] || typeof proto.load !== 'function') return;
  const originalLoad = proto.load;
  proto.load = async function loadWithNonPrimitiveOverlaySource(source, ...args) {
    const payload = await originalLoad.call(this, source, ...args);
    const scene = payload?.gltf?.scene;
    if (scene?.userData && source) {
      scene.userData.__rvmNonPrimitiveSourceHierarchy = source;
      scene.userData.__rvmNonPrimitiveSourceKind = 'source-preview';
      scene.userData.__rvmNonPrimitiveSupportOverlaySchema = RVM_NON_PRIMITIVE_SUPPORT_OVERLAY_SCHEMA;
      scene.userData.__rvmNonPrimitiveSupportSourceExtractionSchema = SUPPORT_OVERLAY_SOURCE_EXTRACTION_SCHEMA;
      scene.userData.__rvmNonPrimitiveSupportFilterDiagnosticsSchema = SUPPORT_OVERLAY_FILTER_DIAGNOSTICS_SCHEMA;
      scene.userData.__rvmNonPrimitiveSupportDetailsSchema = SUPPORT_OVERLAY_DETAILS_SCHEMA;
      scene.userData.__rvmSourceAxisTransformSchema = SOURCE_AXIS_TRANSFORM_SCHEMA;
    }
    return payload;
  };
  proto[LOADER_PATCH_FLAG] = true;
}

function patchRvmViewerSetModelForNonPrimitiveOverlay() {
  const proto = RvmViewer3D?.prototype;
  if (!proto || proto[VIEWER_PATCH_FLAG] || typeof proto.setModel !== 'function') return;
  const originalSetModel = proto.setModel;
  proto.setModel = function setModelWithNonPrimitiveSupportOverlay(model, upAxis = 'Y') {
    const result = originalSetModel.call(this, model, upAxis);
    const source = model?.userData?.__rvmNonPrimitiveSourceHierarchy;
    const sourceKind = model?.userData?.__rvmNonPrimitiveSourceKind;
    if (source) applyFromSource({ viewer: this, source, sourceKind });
    else clear(this, 'primitive-rvm-or-no-source-hierarchy');
    return result;
  };
  proto[VIEWER_PATCH_FLAG] = true;
}

export function applyFromSource({ viewer, root, source, sourceKind = '', fileName = '' } = {}) {
  const kind = normalizeSourceKind(sourceKind, fileName, root);
  if (!viewer?.scene || !viewer?.modelGroup) return { schema: RVM_NON_PRIMITIVE_SUPPORT_OVERLAY_SCHEMA, status: 'blocked', reason: 'viewer-missing', created: 0 };
  if (!isNonPrimitiveSource({ sourceKind: kind, fileName })) {
    clear(viewer, 'rvm-or-unsupported-source');
    return { schema: RVM_NON_PRIMITIVE_SUPPORT_OVERLAY_SCHEMA, status: 'skipped', reason: 'rvm-or-unsupported-source', sourceKind: kind, created: 0 };
  }

  const settings = readNonPrimitiveSupportOverlaySettings();
  if (!settings.enabled) {
    clear(viewer, 'non-primitive-support-overlay-disabled');
    return { schema: RVM_NON_PRIMITIVE_SUPPORT_OVERLAY_SCHEMA, status: 'disabled', sourceKind: kind, sourceFile: fileName, created: 0 };
  }

  const axisTransform = readSourceAxisTransformSettings();
  const records = collectNonPrimitiveSupportRecords(source).slice(0, MAX_SUPPORT_OVERLAYS);
  const filterPlan = buildSupportOverlayFilterPlan(records, settings);
  const sourcePipeSegments = collectSourcePipeSegments(source);
  const pipeSegments = transformSourcePipeSegments(sourcePipeSegments, axisTransform);
  clear(viewer, 'before-non-primitive-overlay');
  if (!records.length) {
    const diagnostics = {
      schema: RVM_NON_PRIMITIVE_SUPPORT_OVERLAY_SCHEMA,
      sourceExtractionSchema: SUPPORT_OVERLAY_SOURCE_EXTRACTION_SCHEMA,
      filterDiagnosticsSchema: SUPPORT_OVERLAY_FILTER_DIAGNOSTICS_SCHEMA,
      detailsSchema: SUPPORT_OVERLAY_DETAILS_SCHEMA,
      axisTransformSchema: SOURCE_AXIS_TRANSFORM_SCHEMA,
      status: 'empty',
      sourceKind: kind,
      sourceFile: fileName,
      created: 0,
      sourceSupports: 0,
      acceptedSupports: 0,
      filteredOut: 0,
      filteredByFamily: {},
      sourceByFamily: {},
      disabledFamilies: filterPlan.disabledFamilies,
      filtersApplied: filterPlan.filtersApplied,
      sourcePipeSegments: pipeSegments.length,
      axisTransform,
      warnings: [],
    };
    viewer.nonPrimitiveSupportOverlayDiagnostics = diagnostics;
    return diagnostics;
  }

  viewer.modelGroup.updateMatrixWorld?.(true);
  const box = new THREE.Box3().setFromObject(viewer.modelGroup);
  const size = box.isEmpty() ? 1000 : Math.max(box.getSize(new THREE.Vector3()).length(), 1);
  const glyphSize = Math.max(6, Math.min(80, size * 0.004)) * (Number(settings.scale) || 1);
  const coordinateMapper = createSupportCoordinateMapper({
    sourceUnits: 'mm',
    viewerUnits: 'scene',
    axisBasis: sourceAxisBasis3(axisTransform),
    modelRootMatrix: null,
    sceneScale: 1,
  });

  const overlayRoot = new THREE.Group();
  overlayRoot.name = ROOT_NAME;
  overlayRoot.userData = {
    schema: RVM_NON_PRIMITIVE_SUPPORT_OVERLAY_SCHEMA,
    sourceExtractionSchema: SUPPORT_OVERLAY_SOURCE_EXTRACTION_SCHEMA,
    filterDiagnosticsSchema: SUPPORT_OVERLAY_FILTER_DIAGNOSTICS_SCHEMA,
    detailsSchema: SUPPORT_OVERLAY_DETAILS_SCHEMA,
    axisTransformSchema: SOURCE_AXIS_TRANSFORM_SCHEMA,
    nonPrimitiveSupportOverlay: true,
    sourceKind: kind,
    sourceFile: fileName,
    axisTransform,
    pickable: false,
  };

  const seen = new Set();
  const warnings = [];
  const coordinateMappings = [];
  const pipeAxisResolutions = [];
  const supportDetails = [];
  const byFamily = {};
  let skippedDuplicates = 0;
  let skippedGlyphs = 0;

  for (const record of filterPlan.acceptedRecords) {
    const key = `${record.tag}:${record.kind}:${record.local.x.toFixed(1)}:${record.local.y.toFixed(1)}:${record.local.z.toFixed(1)}`.toUpperCase();
    if (seen.has(key)) {
      skippedDuplicates += 1;
      continue;
    }
    seen.add(key);
    const object = makeSupportGlyph(record, viewer, glyphSize, kind, fileName, settings, pipeSegments, coordinateMapper, axisTransform);
    if (!object) {
      skippedGlyphs += 1;
      continue;
    }
    overlayRoot.add(object);
    byFamily[record.kind] = (byFamily[record.kind] || 0) + 1;
    if (object.userData?.coordinateMapping) coordinateMappings.push(object.userData.coordinateMapping);
    if (object.userData?.pipeAxisResolution) pipeAxisResolutions.push(object.userData.pipeAxisResolution);
    if (object.userData?.supportOverlayDetails) supportDetails.push(object.userData.supportOverlayDetails);
    for (const warning of object.userData?.warnings || []) warnings.push({ supportId: record.tag, family: record.kind, code: warning });
  }

  if (overlayRoot.children.length) viewer.scene.add(overlayRoot);
  const diagnostics = {
    schema: RVM_NON_PRIMITIVE_SUPPORT_OVERLAY_SCHEMA,
    sourceExtractionSchema: SUPPORT_OVERLAY_SOURCE_EXTRACTION_SCHEMA,
    filterDiagnosticsSchema: SUPPORT_OVERLAY_FILTER_DIAGNOSTICS_SCHEMA,
    detailsSchema: SUPPORT_OVERLAY_DETAILS_SCHEMA,
    axisTransformSchema: SOURCE_AXIS_TRANSFORM_SCHEMA,
    status: overlayRoot.children.length ? 'applied' : 'empty',
    sourceKind: kind,
    sourceFile: fileName,
    created: overlayRoot.children.length,
    sourceSupports: records.length,
    acceptedSupports: filterPlan.acceptedCount,
    filteredOut: filterPlan.filteredOut,
    filteredByFamily: filterPlan.filteredByFamily,
    sourceByFamily: filterPlan.sourceByFamily,
    disabledFamilies: filterPlan.disabledFamilies,
    filtersApplied: filterPlan.filtersApplied,
    skippedDuplicates,
    skippedGlyphs,
    sourcePipeSegments: pipeSegments.length,
    byFamily,
    warningCount: warnings.length,
    warnings,
    coordinateMappings,
    pipeAxisResolutions,
    supportDetails,
    maxSupportOverlays: MAX_SUPPORT_OVERLAYS,
    axisTransform,
    labelsVisible: Boolean(settings.labels),
    rvmExcluded: true,
  };
  viewer.nonPrimitiveSupportOverlayDiagnostics = diagnostics;
  return diagnostics;
}

export function clear(viewer, reason = 'clear') {
  let removed = 0;
  const removeFrom = (parent) => {
    const nodes = [];
    parent?.traverse?.((obj) => { if (obj?.name === ROOT_NAME || obj?.userData?.nonPrimitiveSupportOverlay) nodes.push(obj); });
    for (const node of nodes) {
      if (node.parent) node.parent.remove(node);
      disposeObjectTree(node);
      removed += 1;
    }
  };
  removeFrom(viewer?.scene);
  removeFrom(viewer?.modelGroup);
  if (viewer) viewer.nonPrimitiveSupportOverlayDiagnostics = { schema: RVM_NON_PRIMITIVE_SUPPORT_OVERLAY_SCHEMA, status: 'cleared', reason, removed };
  return { schema: RVM_NON_PRIMITIVE_SUPPORT_OVERLAY_SCHEMA, status: 'cleared', reason, removed };
}

export function isNonPrimitiveSource({ sourceKind = '', fileName = '' } = {}) {
  const kind = String(sourceKind || '').toLowerCase();
  const name = String(fileName || '');
  if (kind === 'rvm' || kind === 'glb' || kind === 'gltf' || RVM_SOURCE_RE.test(name) || /\.(glb|gltf)$/i.test(name)) return false;
  if (kind === 'json' || kind === 'jscon' || kind === 'uxml' || kind === 'inputxml' || kind === 'txt' || kind === 'source-preview') return true;
  return NON_PRIMITIVE_SOURCE_RE.test(name);
}

export function collectNonPrimitiveSupportRecords(source, out = []) {
  return collectSupportRecordsFromSource(source, out, { max: MAX_SUPPORT_OVERLAYS });
}

function makeSupportGlyph(record, viewer, glyphSize, sourceKind, sourceFile, settings, pipeSegments, coordinateMapper, axisTransform) {
  const mapping = coordinateMapper.mapPoint({ x: record.local.x, y: record.local.y, z: record.local.z }, { supportId: record.tag });
  if (!mapping.mappedPoint) return null;

  const local = vec3(mapping.mappedPoint);
  const world = viewer.modelGroup.localToWorld(local.clone());

  const axisResolution = resolveSupportPipeAxis(record, pipeSegments, { toleranceMm: Math.max(100, glyphSize * 10) });
  const resolvedAxis = axisResolution.source === 'explicit-axis'
    ? transformSourceVector(axisResolution.axis || record.axis || { x: 1, y: 0, z: 0 }, axisTransform)
    : (axisResolution.axis || record.axis || { x: 1, y: 0, z: 0 });
  const axis = vec3(resolvedAxis);
  axis.transformDirection?.(viewer.modelGroup.matrixWorld);
  if (axis.lengthSq() <= 1e-9) axis.set(1, 0, 0);
  axis.normalize();

  const symbol = resolveSupportSymbol({
    family: record.kind,
    rawType: record.rawType,
    rawText: record.rawText,
    pipeAxis: { x: axis.x, y: axis.y, z: axis.z },
    gapMm: record.gapMm,
    explicitSign: record.explicitSign,
    pipeOdMm: record.pipeOdMm,
    singleAxis: record.singleAxis,
    warnings: [...(axisResolution.warnings || []), ...(mapping.warnings || [])],
  }, { baseSizeMm: glyphSize });

  if (settings.warningsOnly && !symbol.popupRequired && !symbol.warnings.length) return null;

  const group = buildSupportOverlayGlyphGroup({
    THREE,
    symbol,
    origin: world,
    glyphSize,
    record,
    schema: RVM_NON_PRIMITIVE_SUPPORT_OVERLAY_SCHEMA,
    sourceKind,
    sourceFile,
    coordinateMapping: mapping,
    pipeAxisResolution: { ...axisResolution, axis: { x: axis.x, y: axis.y, z: axis.z }, axisTransform },
  });
  if (!group) return null;

  group.userData.supportOverlayDetails = buildSupportOverlayDetails({
    record,
    symbol,
    coordinateMapping: mapping,
    pipeAxisResolution: { ...axisResolution, axis: { x: axis.x, y: axis.y, z: axis.z }, axisTransform },
    sourceKind,
    sourceFile,
  });
  group.userData.detailsSchema = SUPPORT_OVERLAY_DETAILS_SCHEMA;
  group.userData.rvmSearchIndexed = false;

  if (shouldShowSupportOverlayLabel(settings)) {
    const label = createSupportOverlayLabelObject({
      CSS2DObject,
      THREE,
      record,
      symbol,
      origin: world,
      glyphSize,
      schema: RVM_NON_PRIMITIVE_SUPPORT_OVERLAY_SCHEMA,
      sourceKind,
      sourceFile,
    });
    if (label) group.add(label);
  }

  return group;
}

function vec3(value) { return new THREE.Vector3(Number(value?.x) || 0, Number(value?.y) || 0, Number(value?.z) || 0); }

function normalizeSourceKind(sourceKind, fileName, root) {
  const kind = String(sourceKind || root?.dataset?.rvmLoadedSourceKind || '').toLowerCase();
  if (kind) return kind;
  const name = String(fileName || '').toLowerCase();
  if (/\.jscon$/i.test(name)) return 'jscon';
  if (/\.uxml(\.json)?$/i.test(name) || /\.inputxml$/i.test(name)) return 'inputxml';
  if (/\.txt$/i.test(name)) return 'txt';
  if (/\.json$/i.test(name)) return 'json';
  if (RVM_SOURCE_RE.test(name)) return 'rvm';
  if (/\.(glb|gltf)$/i.test(name)) return 'glb';
  return '';
}

function disposeObjectTree(root) {
  root?.traverse?.((obj) => {
    obj.element?.remove?.();
    obj.geometry?.dispose?.();
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material].filter(Boolean);
    for (const material of materials) material?.dispose?.();
  });
}
