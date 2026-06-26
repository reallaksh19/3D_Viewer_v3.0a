import { RvmViewer3D } from '../rvm-viewer/RvmViewer3D.js?v=20260622-rvm-leaf-picking-2';
import { readNonPrimitiveSupportOverlaySettings } from '../overlays/support/SupportOverlaySettings.js';

export const RVM_NON_PRIMITIVE_SUPPORT_HARD_DISABLE_SCHEMA = 'rvm-non-primitive-support-overlay-hard-disable/v1';

const GLOBAL_KEY = '__PCF_GLB_RVM_NON_PRIMITIVE_SUPPORT_HARD_DISABLE__';
const PATCH_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-support-hard-disable-v1');
const VIEWER_PATCH_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-support-hard-disable-viewer-v1');
const DOM_PATCH_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-support-hard-disable-dom-v1');
const SUPPORT_OVERLAY_ROOT_NAME = '__RVM_NON_PRIMITIVE_SUPPORT_OVERLAY__';
const SOURCE_TOOLS_ROOT_SELECTOR = '[data-rvm-viewer]';
const SUPPORT_DETAILS_PANEL_ID = 'rvm-nonprimitive-support-details-panel';
const SUPPORT_LABEL_SELECTOR = '.non-primitive-support-overlay-label,[data-overlay-kind="support"][data-support-tag]';
const SUPPORT_HOVER_SELECTOR = '[data-rvm-nonprimitive-support-hover-preview="true"]';
const SOURCE_KIND_RE = /^(json|jscon|inputxml|txt|source-preview)$/i;
const PRIMITIVE_KIND_RE = /^(rvm|glb|gltf|rev)$/i;

export function installRvmNonPrimitiveSupportOverlayHardDisableBridge() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  globalThis[GLOBAL_KEY] = {
    schema: RVM_NON_PRIMITIVE_SUPPORT_HARD_DISABLE_SCHEMA,
    hardDisable: hardDisableNonPrimitiveSupportOverlay,
    clearSupportText: clearSupportOverlayTextDom,
    enforce: enforceSupportOverlaySettings,
  };
  patchRvmViewerSetModelForSupportHardDisable();
  installSourceToolsSupportDisableListener();
  try { globalThis.addEventListener?.('rvm-model-loaded', () => enforceSupportOverlaySettings(globalThis.__3D_RVM_VIEWER__, 'model-loaded')); } catch (_) {}
  queueMicrotask(() => enforceSupportOverlaySettings(globalThis.__3D_RVM_VIEWER__, 'install'));
}

function patchRvmViewerSetModelForSupportHardDisable() {
  const proto = RvmViewer3D?.prototype;
  if (!proto || proto[VIEWER_PATCH_FLAG] || typeof proto.setModel !== 'function') return;
  const originalSetModel = proto.setModel;
  proto.setModel = function setModelWithNonPrimitiveSupportHardDisable(model, upAxis = 'Y') {
    const result = originalSetModel.call(this, model, upAxis);
    const sourceKind = normalizeSourceKind(model?.userData?.__rvmNonPrimitiveSourceKind || model?.userData?.sourceKind || this?.sourceKind || '');
    if (!model?.userData?.__rvmNonPrimitiveSourceHierarchy || !isNonPrimitiveKind(sourceKind)) {
      hardDisableNonPrimitiveSupportOverlay(this, 'primitive-or-no-source-hierarchy');
    } else {
      queueMicrotask(() => enforceSupportOverlaySettings(this, 'set-model'));
    }
    return result;
  };
  proto[VIEWER_PATCH_FLAG] = true;
}

function installSourceToolsSupportDisableListener() {
  const doc = globalThis.document;
  if (!doc?.addEventListener || doc[DOM_PATCH_FLAG]) return;
  doc[DOM_PATCH_FLAG] = true;
  doc.addEventListener('change', (event) => {
    const control = event.target?.closest?.('[data-source-tool]');
    if (!control) return;
    const tool = control.dataset.sourceTool;
    if (tool === 'support-enabled' && control.checked === false) {
      queueMicrotask(() => hardDisableNonPrimitiveSupportOverlay(globalThis.__3D_RVM_VIEWER__, 'source-tools-support-overlay-unchecked'));
      return;
    }
    if (tool === 'support-labels' && control.checked === false) {
      queueMicrotask(() => clearSupportOverlayTextDom('source-tools-support-labels-unchecked'));
    }
  }, true);
}

export function enforceSupportOverlaySettings(viewer = globalThis.__3D_RVM_VIEWER__, reason = 'enforce') {
  const settings = readNonPrimitiveSupportOverlaySettings();
  if (!settings.enabled) return hardDisableNonPrimitiveSupportOverlay(viewer, `support-overlay-disabled:${reason}`);
  if (!settings.labels) clearSupportOverlayTextDom(`support-labels-disabled:${reason}`);
  return {
    schema: RVM_NON_PRIMITIVE_SUPPORT_HARD_DISABLE_SCHEMA,
    status: 'kept',
    reason,
    supportEnabled: settings.enabled,
    labelsEnabled: settings.labels,
    primitiveExcluded: true,
  };
}

export function hardDisableNonPrimitiveSupportOverlay(viewer = globalThis.__3D_RVM_VIEWER__, reason = 'hard-disable') {
  const support = globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_SUPPORT_OVERLAY__?.clear?.(viewer, reason) || clearSupportOverlayRoots(viewer, reason);
  const hover = globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_SUPPORT_HOVER__?.clear?.(viewer, reason) || clearSupportOverlayTextDom(reason);
  const details = clearSupportDetailsPanel(viewer, reason);
  const text = clearSupportOverlayTextDom(reason);
  const roots = clearSupportOverlayRoots(viewer, reason);
  const result = {
    schema: RVM_NON_PRIMITIVE_SUPPORT_HARD_DISABLE_SCHEMA,
    status: 'cleared',
    reason,
    support,
    hover,
    details,
    text,
    roots,
    primitiveExcluded: true,
    rvmSearchIndexed: false,
    rvmSelectionUsed: false,
  };
  if (viewer) viewer.nonPrimitiveSupportOverlayHardDisableState = result;
  return result;
}

function clearSupportDetailsPanel(viewer, reason) {
  const api = globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_SUPPORT_DETAILS_PANEL__;
  const panels = globalThis.document?.querySelectorAll?.(`#${SUPPORT_DETAILS_PANEL_ID}`) || [];
  let cleared = 0;
  for (const panel of panels) {
    if (api?.clear) api.clear(panel, viewer, reason);
    else {
      panel.hidden = true;
      panel.innerHTML = '';
      panel.dataset.supportDetailsActive = 'false';
      panel.dataset.supportDetailsCleared = reason;
    }
    cleared += 1;
  }
  if (viewer) {
    viewer.nonPrimitiveSupportOverlaySelectedDetails = { status: 'cleared', reason };
    viewer.nonPrimitiveSupportOverlayHighlightState = { status: 'cleared', reason };
  }
  return { status: 'cleared', reason, panels: cleared };
}

export function clearSupportOverlayTextDom(reason = 'clear') {
  const doc = globalThis.document;
  if (!doc?.querySelectorAll) return { status: 'skipped', reason: 'document-missing', removed: 0 };
  let removed = 0;
  for (const element of doc.querySelectorAll(SUPPORT_LABEL_SELECTOR)) {
    element.remove?.();
    removed += 1;
  }
  for (const tooltip of doc.querySelectorAll(SUPPORT_HOVER_SELECTOR)) {
    tooltip.hidden = true;
    tooltip.dataset.supportHoverActive = 'false';
    tooltip.dataset.supportHoverCleared = reason;
    tooltip.innerHTML = '';
  }
  return { status: 'cleared', reason, removed };
}

function clearSupportOverlayRoots(viewer, reason = 'clear') {
  const roots = [];
  const scan = (parent) => parent?.traverse?.((object) => {
    if (object?.name === SUPPORT_OVERLAY_ROOT_NAME || object?.userData?.nonPrimitiveSupportOverlay) roots.push(object);
  });
  scan(viewer?.scene);
  scan(viewer?.modelGroup);
  for (const root of Array.from(new Set(roots))) {
    if (root.parent) root.parent.remove(root);
    disposeObjectTree(root);
  }
  return { status: 'cleared', reason, removed: roots.length };
}

function disposeObjectTree(root) {
  root?.traverse?.((object) => {
    object.element?.remove?.();
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material].filter(Boolean);
    for (const material of materials) material?.dispose?.();
  });
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
