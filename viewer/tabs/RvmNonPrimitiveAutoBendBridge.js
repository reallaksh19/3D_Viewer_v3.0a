import * as THREE from 'three';
import { AvevaJsonLoader } from '../rvm/AvevaJsonLoader.js';
import { RvmViewer3D } from '../rvm-viewer/RvmViewer3D.js?v=20260622-rvm-leaf-picking-2';
import { canUseAutoBend, sourceKindFromContext } from '../overlays/autobend/NonPrimitiveAutoBendGate.js';
import { readNonPrimitiveAutoBendSettings } from '../overlays/autobend/NonPrimitiveAutoBendSettings.js';
import { resolveNonPrimitiveAutoBends, buildVisualTrimLookup } from '../overlays/autobend/NonPrimitiveAutoBendResolver.js';
import { sampleBendArc } from '../overlays/autobend/NonPrimitiveAutoBendGeometry.js';
import { collectExistingAutoBendNodeKinds, collectExplicitNonPrimitiveAutoBends, collectNonPrimitiveAutoBendSegments } from '../overlays/autobend/NonPrimitiveAutoBendSourceAdapter.js';

export const RVM_NON_PRIMITIVE_AUTO_BEND_SCHEMA = 'rvm-non-primitive-auto-bend/v1';

const ROOT_NAME = '__NON_PRIMITIVE_AUTO_BEND_OVERLAY__';
const GLOBAL_KEY = '__PCF_GLB_RVM_NON_PRIMITIVE_AUTO_BEND__';
const PATCH_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-auto-bend-v1');
const LOADER_PATCH_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-auto-bend-loader-v1');
const VIEWER_PATCH_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-auto-bend-viewer-v1');

export function installRvmNonPrimitiveAutoBendBridge() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  globalThis[GLOBAL_KEY] = {
    schema: RVM_NON_PRIMITIVE_AUTO_BEND_SCHEMA,
    rootName: ROOT_NAME,
    applyFromSource,
    clear,
    collectSegments: collectNonPrimitiveAutoBendSegments,
    collectExplicitBends: collectExplicitNonPrimitiveAutoBends,
  };
  patchAvevaJsonLoaderForAutoBendSource();
  patchRvmViewerSetModelForAutoBendOverlay();
}

function patchAvevaJsonLoaderForAutoBendSource() {
  const proto = AvevaJsonLoader?.prototype;
  if (!proto || proto[LOADER_PATCH_FLAG] || typeof proto.load !== 'function') return;
  const originalLoad = proto.load;
  proto.load = async function loadWithNonPrimitiveAutoBendSource(source, ...args) {
    const payload = await originalLoad.call(this, source, ...args);
    const scene = payload?.gltf?.scene;
    if (scene?.userData && source) {
      scene.userData.__rvmNonPrimitiveAutoBendSourceHierarchy = source;
      scene.userData.__rvmNonPrimitiveAutoBendSourceKind = 'json';
      scene.userData.__rvmNonPrimitiveAutoBendSchema = RVM_NON_PRIMITIVE_AUTO_BEND_SCHEMA;
    }
    return payload;
  };
  proto[LOADER_PATCH_FLAG] = true;
}

function patchRvmViewerSetModelForAutoBendOverlay() {
  const proto = RvmViewer3D?.prototype;
  if (!proto || proto[VIEWER_PATCH_FLAG] || typeof proto.setModel !== 'function') return;
  const originalSetModel = proto.setModel;
  proto.setModel = function setModelWithNonPrimitiveAutoBend(model, upAxis = 'Y') {
    const result = originalSetModel.call(this, model, upAxis);
    const source = model?.userData?.__rvmNonPrimitiveAutoBendSourceHierarchy
      || model?.userData?.__rvmNonPrimitiveSourceHierarchy;
    const sourceKind = normalizeBridgeSourceKind(
      model?.userData?.__rvmNonPrimitiveAutoBendSourceKind
        || model?.userData?.__rvmNonPrimitiveSourceKind
    );
    if (source) applyFromSource({ viewer: this, source, sourceKind });
    else clear(this, 'primitive-rvm-or-no-source-hierarchy');
    return result;
  };
  proto[VIEWER_PATCH_FLAG] = true;
}

export function applyFromSource({ viewer, source, sourceKind = '', fileName = '', settings: injectedSettings = null } = {}) {
  const normalizedKind = normalizeBridgeSourceKind(sourceKind || sourceKindFromContext({ sourceKind, fileName }));
  if (!viewer?.modelGroup) {
    return diagnosticsFor('blocked', normalizedKind, { reason: 'viewer-missing' });
  }
  if (!canUseAutoBend({ sourceKind: normalizedKind, fileName, modelPrimitiveMode: viewer.modelPrimitiveMode, viewerMode: viewer.viewerMode })) {
    clear(viewer, 'rvm-glb-or-unsupported-source');
    return diagnosticsFor('skipped', normalizedKind, { reason: 'rvm-glb-or-unsupported-source' }, viewer);
  }

  const settings = injectedSettings || readNonPrimitiveAutoBendSettings();
  clear(viewer, 'before-non-primitive-auto-bend');
  if (settings.enabled === false) {
    return diagnosticsFor('disabled', normalizedKind, { reason: 'setting-disabled' }, viewer);
  }

  const segments = collectNonPrimitiveAutoBendSegments(source);
  const explicitBends = collectExplicitNonPrimitiveAutoBends(source);
  const existingNodeKinds = collectExistingAutoBendNodeKinds(source);
  const result = resolveNonPrimitiveAutoBends(
    { sourceKind: normalizedKind, segments, explicitBends, existingNodeKinds },
    { enabled: true, defaultRadiusFactor: settings.defaultRadiusFactor }
  );
  const trimmedSegmentCount = applyVisualTrimmedSegments(viewer, result, segments);
  const overlayRoot = buildThreeAutoBendOverlay(result, normalizedKind, fileName);
  if (overlayRoot.children.length) viewer.modelGroup.add(overlayRoot);

  const diagnostics = {
    schema: RVM_NON_PRIMITIVE_AUTO_BEND_SCHEMA,
    status: overlayRoot.children.length ? 'applied' : 'empty',
    sourceKind: normalizedKind,
    sourceFile: fileName,
    settings: { ...settings },
    segmentCount: segments.length,
    explicitBendCount: explicitBends.length,
    bendCount: result.bends.length,
    trimCount: result.trims.length,
    trimmedSegmentCount,
    overlayChildren: overlayRoot.children.length,
    primitiveExcluded: true,
    resolver: result.diagnostics,
  };
  viewer.nonPrimitiveAutoBendDiagnostics = diagnostics;
  return diagnostics;
}

export function clear(viewer, reason = 'clear') {
  let removed = 0;
  restoreVisualTrimmedSegments(viewer);
  const removeFrom = (parent) => {
    const nodes = [];
    parent?.traverse?.((obj) => {
      if (obj?.name === ROOT_NAME || obj?.userData?.nonPrimitiveAutoBendOverlay) nodes.push(obj);
    });
    for (const node of nodes) {
      if (node.parent) node.parent.remove(node);
      disposeObjectTree(node);
      removed += 1;
    }
  };
  removeFrom(viewer?.scene);
  removeFrom(viewer?.modelGroup);
  if (viewer) viewer.nonPrimitiveAutoBendDiagnostics = { schema: RVM_NON_PRIMITIVE_AUTO_BEND_SCHEMA, status: 'cleared', reason, removed };
  return { schema: RVM_NON_PRIMITIVE_AUTO_BEND_SCHEMA, status: 'cleared', reason, removed };
}

function buildThreeAutoBendOverlay(result, sourceKind, sourceFile) {
  const root = new THREE.Group();
  root.name = ROOT_NAME;
  root.userData = {
    schema: RVM_NON_PRIMITIVE_AUTO_BEND_SCHEMA,
    nonPrimitiveAutoBendOverlay: true,
    overlayKind: 'auto-bend',
    sourceKind,
    sourceFile,
    pickable: false,
    selectable: false,
  };

  for (const bend of result.bends || []) {
    const points = sampleBendArc(bend, 24).map(toVector3).filter(Boolean);
    if (points.length < 2) continue;
    const radius = resolveOverlayRadius(bend);
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, Math.max(8, points.length - 1), radius, 12, false);
    const material = new THREE.MeshStandardMaterial({ color: 0xaa55aa, roughness: 0.62, metalness: 0.12, transparent: true, opacity: 0.92, depthTest: true });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `NON_PRIMITIVE_AUTO_BEND_${safeName(bend.nodeId)}`;
    mesh.userData = {
      schema: RVM_NON_PRIMITIVE_AUTO_BEND_SCHEMA,
      nonPrimitiveAutoBendOverlay: true,
      overlayKind: 'auto-bend',
      nodeId: bend.nodeId,
      segmentAId: bend.segmentAId,
      segmentBId: bend.segmentBId,
      radiusMm: bend.radiusMm,
      turnAngleDeg: bend.turnAngleDeg,
      source: bend.source,
      warnings: bend.warnings,
      pickable: false,
      selectable: false,
    };
    root.add(mesh);
  }
  return root;
}

function applyVisualTrimmedSegments(viewer, result, segments) {
  const trimLookup = buildVisualTrimLookup(result.trims || []);
  if (!trimLookup.size || !viewer?.modelGroup) return 0;
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  let trimmed = 0;
  viewer.modelGroup.traverse?.((obj) => {
    if (!obj || obj.type !== 'Group') return;
    const segment = segmentById.get(obj.name);
    if (!segment) return;
    const startTrim = trimLookup.get(`${segment.id}:${segment.fromNode}`) || 0;
    const endTrim = trimLookup.get(`${segment.id}:${segment.toNode}`) || 0;
    if (!(startTrim > 0 || endTrim > 0)) return;
    restoreTrimmedSegmentGroup(obj);
    const replacement = createTrimmedSegmentCylinder(segment, startTrim, endTrim);
    if (!replacement) return;
    for (const child of obj.children) {
      if (child?.userData?.nonPrimitiveAutoBendTrimmedSegment) continue;
      child.userData = {
        ...(child.userData || {}),
        nonPrimitiveAutoBendOriginalSegmentChild: true,
        __nonPrimitiveAutoBendOriginalVisible: child.visible !== false,
      };
      child.visible = false;
    }
    obj.add(replacement);
    obj.userData = {
      ...(obj.userData || {}),
      nonPrimitiveAutoBendTrimmed: true,
      autoBendVisualTrimStartMm: startTrim,
      autoBendVisualTrimEndMm: endTrim,
    };
    trimmed += 1;
  });
  return trimmed;
}

function restoreVisualTrimmedSegments(viewer) {
  let restored = 0;
  viewer?.modelGroup?.traverse?.((obj) => {
    if (obj?.userData?.nonPrimitiveAutoBendTrimmed) restored += restoreTrimmedSegmentGroup(obj);
  });
  return restored;
}

function restoreTrimmedSegmentGroup(group) {
  if (!group?.children) return 0;
  let restored = 0;
  for (const child of [...group.children]) {
    if (child?.userData?.nonPrimitiveAutoBendTrimmedSegment) {
      group.remove(child);
      disposeObjectTree(child);
      continue;
    }
    if (child?.userData?.nonPrimitiveAutoBendOriginalSegmentChild) {
      child.visible = child.userData.__nonPrimitiveAutoBendOriginalVisible !== false;
      delete child.userData.nonPrimitiveAutoBendOriginalSegmentChild;
      delete child.userData.__nonPrimitiveAutoBendOriginalVisible;
      restored += 1;
    }
  }
  if (group.userData) {
    delete group.userData.nonPrimitiveAutoBendTrimmed;
    delete group.userData.autoBendVisualTrimStartMm;
    delete group.userData.autoBendVisualTrimEndMm;
  }
  return restored;
}

function createTrimmedSegmentCylinder(segment, startTrim, endTrim) {
  const start = toVector3(segment.from);
  const end = toVector3(segment.to);
  if (!start || !end) return null;
  const diff = new THREE.Vector3().subVectors(end, start);
  const length = diff.length();
  if (!Number.isFinite(length) || length < 0.001 || startTrim + endTrim >= length * 0.9) return null;
  const dir = diff.clone().normalize();
  const trimmedStart = start.clone().addScaledVector(dir, startTrim);
  const trimmedEnd = end.clone().addScaledVector(dir, -endTrim);
  const trimmedDiff = new THREE.Vector3().subVectors(trimmedEnd, trimmedStart);
  const trimmedLength = trimmedDiff.length();
  if (!Number.isFinite(trimmedLength) || trimmedLength < 0.001) return null;
  const radius = resolveOverlayRadius(segment);
  const geometry = new THREE.CylinderGeometry(radius, radius, trimmedLength, 16);
  const material = new THREE.MeshStandardMaterial({ color: 0x3d74c5, roughness: 0.65, metalness: 0.15 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = segment.id;
  mesh.position.copy(new THREE.Vector3().addVectors(trimmedStart, trimmedEnd).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), trimmedDiff.clone().normalize());
  mesh.userData = {
    schema: RVM_NON_PRIMITIVE_AUTO_BEND_SCHEMA,
    nonPrimitiveAutoBendTrimmedSegment: true,
    segmentId: segment.id,
    fromNode: segment.fromNode,
    toNode: segment.toNode,
    trimStartMm: startTrim,
    trimEndMm: endTrim,
  };
  return mesh;
}

function diagnosticsFor(status, sourceKind, extras = {}, viewer = null) {
  const diagnostics = { schema: RVM_NON_PRIMITIVE_AUTO_BEND_SCHEMA, status, sourceKind, ...extras };
  if (viewer) viewer.nonPrimitiveAutoBendDiagnostics = diagnostics;
  return diagnostics;
}

function normalizeBridgeSourceKind(value) {
  const kind = String(value || '').trim().toLowerCase().replace(/^\./, '');
  if (!kind || kind === 'source-preview' || kind === 'aveva-json') return 'json';
  if (kind === 'xml' || kind === 'uxml') return 'inputxml';
  return kind;
}

function toVector3(point) {
  if (!point) return null;
  return new THREE.Vector3(Number(point.x) || 0, Number(point.y) || 0, Number(point.z) || 0);
}

function resolveOverlayRadius(value) {
  const raw = Number(value?.pipeOdMm) || Number(value?.boreMm) || 100;
  return Math.max(1, Math.min(raw * 0.5, 80));
}

function safeName(value) {
  return String(value || 'unknown').replace(/[^a-z0-9_.:-]+/gi, '_').slice(0, 96);
}

function disposeObjectTree(root) {
  root?.traverse?.((obj) => {
    obj.geometry?.dispose?.();
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material].filter(Boolean);
    for (const material of materials) material?.dispose?.();
  });
}
