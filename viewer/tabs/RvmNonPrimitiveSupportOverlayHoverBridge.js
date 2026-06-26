import * as THREE from 'three';
import { RvmViewer3D } from '../rvm-viewer/RvmViewer3D.js?v=20260622-rvm-leaf-picking-2';
import {
  buildSupportOverlayHoverPreviewState,
  clearSupportOverlayHovers,
  createEmptySupportOverlayHoverState,
  hoverSupportOverlayGlyph,
  renderSupportOverlayHoverPreviewHtml,
  SUPPORT_OVERLAY_HOVER_SCHEMA,
} from '../overlays/support/SupportOverlayHover.js';

export const RVM_NON_PRIMITIVE_SUPPORT_HOVER_SCHEMA = 'rvm-non-primitive-support-overlay-hover/v2';

const ROOT_SELECTOR = '[data-rvm-viewer]';
const SUPPORT_OVERLAY_ROOT_NAME = '__RVM_NON_PRIMITIVE_SUPPORT_OVERLAY__';
const GLOBAL_KEY = '__PCF_GLB_RVM_NON_PRIMITIVE_SUPPORT_HOVER__';
const PATCH_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-support-hover-v2');
const VIEWER_PATCH_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-support-hover-viewer-v2');
const POINTER_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-support-hover-pointer-v2');
const STYLE_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-support-hover-style-v2');
const SOURCE_KIND_RE = /^(json|jscon|inputxml|txt|source-preview)$/i;
const PRIMITIVE_KIND_RE = /^(rvm|glb|gltf|rev)$/i;
const HOVER_THROTTLE_MS = 80;

export function installRvmNonPrimitiveSupportOverlayHoverBridge() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  globalThis[GLOBAL_KEY] = {
    schema: RVM_NON_PRIMITIVE_SUPPORT_HOVER_SCHEMA,
    hoverSchema: SUPPORT_OVERLAY_HOVER_SCHEMA,
    previewFromPointer: previewSupportOverlayHoverFromPointer,
    clear: clearSupportOverlayHoverPreview,
  };
  installSupportHoverStyles();
  patchRvmViewerSetModelForSupportHover();
  try { globalThis.addEventListener?.('rvm-model-loaded', () => clearSupportOverlayHoverPreview(globalThis.__3D_RVM_VIEWER__, 'model-loaded')); } catch (_) {}
}

function installSupportHoverStyles() {
  if (globalThis[STYLE_FLAG]) return;
  globalThis[STYLE_FLAG] = true;
  const doc = globalThis.document;
  if (!doc?.createElement) return;
  const style = doc.createElement('style');
  style.dataset.rvmNonPrimitiveSupportHoverStyle = 'v2';
  style.textContent = `
    .rvm-support-hover-preview {
      position: fixed;
      z-index: 2147482500;
      min-width: 150px;
      max-width: 260px;
      padding: 7px 9px;
      border: 1px solid rgba(255, 242, 138, 0.66);
      border-radius: 8px;
      background: rgba(11, 15, 23, 0.92);
      color: #eef6ff;
      box-shadow: 0 8px 22px rgba(0, 0, 0, 0.32);
      pointer-events: none;
      user-select: none;
      font-size: 11px;
      line-height: 1.35;
    }
    .rvm-support-hover-preview__title {
      font-weight: 700;
      color: #fff2a0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .rvm-support-hover-preview__row {
      opacity: 0.88;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .rvm-support-hover-preview__warn {
      margin-top: 3px;
      color: #ffd28a;
      font-weight: 700;
    }
  `;
  doc.head?.appendChild?.(style);
}

function patchRvmViewerSetModelForSupportHover() {
  const proto = RvmViewer3D?.prototype;
  if (!proto || proto[VIEWER_PATCH_FLAG] || typeof proto.setModel !== 'function') return;
  const originalSetModel = proto.setModel;
  proto.setModel = function setModelWithNonPrimitiveSupportHover(model, upAxis = 'Y') {
    const result = originalSetModel.call(this, model, upAxis);
    ensureSupportHoverPointerEvents(this);
    const sourceKind = normalizeSourceKind(model?.userData?.__rvmNonPrimitiveSourceKind || model?.userData?.sourceKind || this?.sourceKind || '');
    if (!model?.userData?.__rvmNonPrimitiveSourceHierarchy && !isNonPrimitiveKind(sourceKind)) {
      clearSupportOverlayHoverPreview(this, 'primitive-or-no-source-hierarchy');
    }
    return result;
  };
  proto[VIEWER_PATCH_FLAG] = true;
}

function ensureSupportHoverPointerEvents(viewer) {
  if (!viewer || viewer[POINTER_FLAG]) return;
  const dom = viewer.renderer?.domElement || viewer.container;
  if (!dom?.addEventListener) return;
  const onMove = (event) => previewSupportOverlayHoverFromPointer(viewer, event);
  const onLeave = () => clearSupportOverlayHoverPreview(viewer, 'pointer-leave');
  const onDown = () => clearSupportOverlayHoverPreview(viewer, 'navigation-pointer-down');
  dom.addEventListener('pointermove', onMove, false);
  dom.addEventListener('pointerleave', onLeave, false);
  dom.addEventListener('pointerdown', onDown, false);
  viewer[POINTER_FLAG] = { dom, onMove, onLeave, onDown };
}

export function previewSupportOverlayHoverFromPointer(viewer = globalThis.__3D_RVM_VIEWER__, event = {}) {
  if (!viewer?.camera || !viewer?.scene) return writeHoverDiagnostics(viewer, { status: 'skipped', reason: 'viewer-missing' });

  if (isNavigationDragEvent(event)) {
    clearSupportOverlayHoverPreview(viewer, 'navigation-drag');
    return writeHoverDiagnostics(viewer, {
      schema: RVM_NON_PRIMITIVE_SUPPORT_HOVER_SCHEMA,
      status: 'skipped',
      reason: 'navigation-drag',
      primitiveExcluded: true,
      rvmSearchIndexed: false,
      pickable: false,
      selectable: false,
    });
  }

  const throttle = shouldThrottleHover(viewer, event);
  if (throttle.throttled) return writeHoverDiagnostics(viewer, throttle);

  const roots = collectSupportOverlayRoots(viewer);
  if (!roots.length) return clearSupportOverlayHoverPreview(viewer, 'support-overlay-root-missing');

  const dom = viewer.renderer?.domElement || event.currentTarget || viewer.container;
  const rect = dom?.getBoundingClientRect?.();
  if (!rect || !Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) {
    return writeHoverDiagnostics(viewer, { status: 'skipped', reason: 'invalid-dom-rect' });
  }

  const owner = findHoverOwnerFromPointer(viewer, roots, rect, event);
  if (!owner?.userData?.supportOverlayDetails) {
    return clearSupportOverlayHoverPreview(viewer, 'pointer-miss');
  }

  const diagnostics = viewer.nonPrimitiveSupportOverlayDiagnostics || {};
  const preview = buildSupportOverlayHoverPreviewState(owner.userData.supportOverlayDetails, {
    sourceKind: owner.userData.sourceKind || diagnostics.sourceKind || viewer.sourceKind || '',
    sourceFile: owner.userData.sourceFile || diagnostics.sourceFile || '',
  });
  const ownerKey = hoverOwnerKey(preview);
  const previousKey = viewer.__nonPrimitiveSupportOverlayHoverOwnerKey || '';
  let hoverState = viewer.nonPrimitiveSupportOverlayHoverState;
  if (ownerKey !== previousKey) {
    hoverState = hoverSupportOverlayGlyph(owner, roots, {
      supportId: preview.supportId,
      family: preview.family,
    });
    viewer.__nonPrimitiveSupportOverlayHoverOwnerKey = ownerKey;
  }

  viewer.nonPrimitiveSupportOverlayHoverState = hoverState;
  viewer.nonPrimitiveSupportOverlayHoverPreview = preview;
  renderHoverTooltip(preview, event);

  return writeHoverDiagnostics(viewer, {
    schema: RVM_NON_PRIMITIVE_SUPPORT_HOVER_SCHEMA,
    status: 'preview',
    supportId: preview.supportId,
    family: preview.family,
    hoverStatus: hoverState?.status || 'unchanged',
    duplicateOwnerSkipped: ownerKey === previousKey,
    primitiveExcluded: true,
    rvmSearchIndexed: false,
    pickable: false,
    selectable: false,
  });
}

export function clearSupportOverlayHoverPreview(viewer = globalThis.__3D_RVM_VIEWER__, reason = 'clear') {
  const roots = collectSupportOverlayRoots(viewer);
  const hoverState = roots.length
    ? clearSupportOverlayHovers(roots, reason)
    : createEmptySupportOverlayHoverState(reason);
  if (viewer) {
    viewer.nonPrimitiveSupportOverlayHoverState = hoverState;
    viewer.nonPrimitiveSupportOverlayHoverPreview = createEmptySupportOverlayHoverState(reason);
    viewer.__nonPrimitiveSupportOverlayHoverOwnerKey = '';
    writeHoverDiagnostics(viewer, {
      schema: RVM_NON_PRIMITIVE_SUPPORT_HOVER_SCHEMA,
      status: 'cleared',
      reason,
      primitiveExcluded: true,
      rvmSearchIndexed: false,
      pickable: false,
      selectable: false,
    });
  }
  hideHoverTooltip(reason);
  return hoverState;
}

function shouldThrottleHover(viewer, event = {}) {
  const now = performanceNow();
  const last = Number(viewer.__nonPrimitiveSupportOverlayHoverLastTs || 0);
  if (last > 0 && now - last < HOVER_THROTTLE_MS) {
    return {
      schema: RVM_NON_PRIMITIVE_SUPPORT_HOVER_SCHEMA,
      status: 'throttled',
      throttled: true,
      reason: 'pointermove-throttled',
      elapsedMs: Math.max(0, now - last),
      primitiveExcluded: true,
      rvmSearchIndexed: false,
      pickable: false,
      selectable: false,
    };
  }
  viewer.__nonPrimitiveSupportOverlayHoverLastTs = now;
  return { throttled: false };
}

function isNavigationDragEvent(event = {}) {
  const buttons = Number(event.buttons || 0);
  return buttons !== 0;
}

function writeHoverDiagnostics(viewer, state = {}) {
  if (viewer) viewer.nonPrimitiveSupportOverlayHoverDiagnostics = {
    schema: RVM_NON_PRIMITIVE_SUPPORT_HOVER_SCHEMA,
    throttleMs: HOVER_THROTTLE_MS,
    ...state,
  };
  return state;
}

function hoverOwnerKey(preview = {}) {
  return [preview.supportId || preview.supportNo || '', preview.family || '', preview.nodeId || ''].join('|');
}

function findHoverOwnerFromPointer(viewer, roots, rect, event) {
  const pointer = new THREE.Vector2(
    ((Number(event.clientX) - rect.left) / rect.width) * 2 - 1,
    -(((Number(event.clientY) - rect.top) / rect.height) * 2 - 1),
  );
  const raycaster = viewer.raycaster || new THREE.Raycaster();
  raycaster.setFromCamera(pointer, viewer.camera);
  const targets = [];
  for (const root of roots) {
    root.traverse?.((object) => {
      if (object?.isMesh || object?.isLine || object?.isSprite) targets.push(object);
    });
  }
  const hits = raycaster.intersectObjects(targets, false);
  for (const hit of hits) {
    const owner = findDetailsOwner(hit.object, roots);
    if (owner?.userData?.supportOverlayDetails) return owner;
  }
  return null;
}

function renderHoverTooltip(preview, event) {
  const root = findViewerRoot(event) || globalThis.document?.querySelector?.(ROOT_SELECTOR);
  const tooltip = ensureHoverTooltip(root);
  if (!tooltip) return null;
  tooltip.hidden = false;
  tooltip.dataset.supportHoverActive = 'true';
  delete tooltip.dataset.supportHoverCleared;
  tooltip.innerHTML = renderSupportOverlayHoverPreviewHtml(preview, { escapeHtml });
  const x = Number(event.clientX || 0) + 14;
  const y = Number(event.clientY || 0) + 14;
  tooltip.style.left = `${Math.max(0, x)}px`;
  tooltip.style.top = `${Math.max(0, y)}px`;
  tooltip.style.pointerEvents = 'none';
  tooltip.style.userSelect = 'none';
  return tooltip;
}

function hideHoverTooltip(reason = 'clear') {
  const tooltips = globalThis.document?.querySelectorAll?.('[data-rvm-nonprimitive-support-hover-preview="true"]') || [];
  for (const tooltip of tooltips) {
    tooltip.hidden = true;
    tooltip.dataset.supportHoverActive = 'false';
    tooltip.dataset.supportHoverCleared = reason;
    tooltip.innerHTML = '';
    tooltip.style.pointerEvents = 'none';
  }
}

function ensureHoverTooltip(root) {
  const doc = globalThis.document;
  if (!doc?.createElement) return null;
  let tooltip = root?.querySelector?.('[data-rvm-nonprimitive-support-hover-preview="true"]')
    || doc.querySelector?.('[data-rvm-nonprimitive-support-hover-preview="true"]');
  if (tooltip) return tooltip;
  tooltip = doc.createElement('div');
  tooltip.className = 'rvm-support-hover-preview';
  tooltip.dataset.rvmNonprimitiveSupportHoverPreview = 'true';
  tooltip.hidden = true;
  tooltip.style.pointerEvents = 'none';
  tooltip.style.userSelect = 'none';
  (root || doc.body || doc.documentElement)?.appendChild?.(tooltip);
  return tooltip;
}

function findViewerRoot(event) {
  return event?.currentTarget?.closest?.(ROOT_SELECTOR)
    || event?.target?.closest?.(ROOT_SELECTOR)
    || globalThis.document?.querySelector?.(ROOT_SELECTOR)
    || null;
}

function collectSupportOverlayRoots(viewer) {
  const roots = [];
  const scan = (parent) => parent?.traverse?.((object) => {
    if (object?.name === SUPPORT_OVERLAY_ROOT_NAME || object?.userData?.nonPrimitiveSupportOverlay) roots.push(object);
  });
  scan(viewer?.scene);
  scan(viewer?.modelGroup);
  return Array.from(new Set(roots));
}

function findDetailsOwner(object, roots) {
  let current = object;
  while (current) {
    if (current.userData?.supportOverlayDetails) return current;
    if (roots.includes(current)) return null;
    current = current.parent;
  }
  return null;
}

function isNonPrimitiveKind(kind) {
  const normalized = normalizeSourceKind(kind);
  return SOURCE_KIND_RE.test(normalized) && !PRIMITIVE_KIND_RE.test(normalized);
}

function normalizeSourceKind(value) {
  const kind = String(value || '').trim().toLowerCase().replace(/^\./, '');
  if (!kind || kind === 'aveva-json' || kind === 'source-preview') return 'json';
  if (kind === 'xml' || kind === 'uxml') return 'inputxml';
  return kind;
}

function performanceNow() {
  return (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
