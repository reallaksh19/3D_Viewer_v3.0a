const CACHE_KEY = '20260622-rvm-retired-support-tools-purge-2';
const API_KEY = '__PCF_GLB_RVM_RETIRED_SUPPORT_TOOLS__';
const DEBUG_EMBEDDED_INPUTXML_MARKERS_KEY = 'rvm.debug.showEmbeddedInputXmlSupportMarkers';

const RETIRED_SCENE_ROOTS = Object.freeze([
  '__RVM_GEOMETRY_SUPPORT_SYMBOLS__',
  '__RVM_SUPPORT_ASSEMBLY_MARKERS__',
  '__RVM_EXPORTABLE_SUPPORT_GEOMETRY__',
  '__RVM_SUPPORT_SYMBOLS__',
  '__NON_PRIMITIVE_SUPPORT_OVERLAY__'
]);

const RETIRED_GLOBALS = Object.freeze([
  '__PCF_GLB_RVM_SUPPORT_DIAGNOSTICS__',
  '__PCF_GLB_RVM_SUPPORT_ASSEMBLY_DIAGNOSTICS__',
  '__PCF_GLB_RVM_INTELLIGENT_SUPPORT_ENGINE_DIAGNOSTICS__',
  '__PCF_GLB_RVM_INTELLIGENT_SUPPORT_ENGINE__',
  '__PCF_GLB_RVM_SUPPORT_ATT_MAPPING_DIAGNOSTICS__',
  '__PCF_GLB_RVM_SUPPORT_GEOMETRY_DIAGNOSTICS__',
  '__PCF_GLB_RVM_RAW_SUPPORT_CYLINDER_GUARD__',
]);

const RETIRED_STORAGE_KEYS = Object.freeze([
  'rvm_support_render_mode_v1',
  'rvm_support_render_mode_v2',
  'rvm_support_geometry_mode_v1',
  'rvm_support_assembly_markers_v1',
  'rvm.rawInputXmlSupportPrimitives',
]);

const EMBEDDED_INPUTXML_MARKER_RE = /\b(RVM\s+(CYLINDER|PYRAMID|BOX|SPHERE|TORUS|SNOUT|FACET)\b[\s\S]*)?INPUTXML[-_ ]?\d+[-_ ]?(REST|GUIDE|LINE\s*STOP|LINESTOP|STOP|LIMIT|LIM|SUPPORT|SHOE)\b/i;

export function installRvmRetiredSupportToolsPurgeBridge() {
  const api = globalThis[API_KEY] || {
    version: CACHE_KEY,
    retired: true,
    purge: () => purgeRetiredSupportTools('api'),
  };
  api.version = CACHE_KEY;
  api.retired = true;
  globalThis[API_KEY] = api;

  purgeStorage();
  let attempts = 0;
  const tick = () => {
    attempts += 1;
    purgeRetiredSupportTools(`startup-${attempts}`);
    if (attempts < 40) setTimeout(tick, attempts < 10 ? 250 : 1000);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick, { once: true });
  else tick();
  installEventPurge();
  return api;
}

function installEventPurge() {
  if (globalThis.__PCF_GLB_RVM_RETIRED_SUPPORT_TOOLS_EVENT_PURGE__) return;
  globalThis.__PCF_GLB_RVM_RETIRED_SUPPORT_TOOLS_EVENT_PURGE__ = true;
  for (const eventName of ['rvm-model-loaded', 'rvm-render-complete', 'rvm-support-assembly-diagnostics', 'rvm-intelligent-support-engine-diagnostics']) {
    globalThis.addEventListener?.(eventName, () => setTimeout(() => purgeRetiredSupportTools(eventName), 0));
  }
}

function purgeRetiredSupportTools(reason = 'manual') {
  const root = document.querySelector('[data-rvm-viewer]');
  const viewer = globalThis.__3D_RVM_VIEWER__;
  const removedSceneRoots = purgeSceneRoots(viewer);
  const hiddenEmbeddedMarkers = hideEmbeddedInputXmlMarkers(viewer, root);
  const removedDomNodes = purgeDom(root);
  const clearedGlobals = purgeGlobals();
  purgeStorage();
  const payload = { schema: 'rvm-retired-support-tools/v2', version: CACHE_KEY, reason, removedSceneRoots, hiddenEmbeddedMarkers, removedDomNodes, clearedGlobals, retired: true };
  globalThis[API_KEY] = { ...(globalThis[API_KEY] || {}), ...payload, purge: () => purgeRetiredSupportTools('api') };
  if (root) root.dataset.rvmSupportToolsRetired = CACHE_KEY;
  return payload;
}

function purgeSceneRoots(viewer) {
  let count = 0;
  for (const parent of [viewer?.scene, viewer?.modelGroup]) {
    for (const name of RETIRED_SCENE_ROOTS) {
      let obj = parent?.getObjectByName?.(name);
      while (obj) {
        obj.parent?.remove?.(obj);
        disposeObject(obj);
        count += 1;
        obj = parent?.getObjectByName?.(name);
      }
    }
  }
  return count;
}

function hideEmbeddedInputXmlMarkers(viewer, root) {
  if (showEmbeddedInputXmlMarkers()) return 0;
  let count = 0;
  for (const parent of [viewer?.scene, viewer?.modelGroup]) {
    parent?.traverse?.((obj) => {
      if (!obj || obj.isScene) return;
      const text = objectText(obj);
      if (!EMBEDDED_INPUTXML_MARKER_RE.test(text)) return;
      if (obj.visible !== false) count += 1;
      obj.visible = false;
      obj.userData = {
        ...(obj.userData || {}),
        rvmHiddenEmbeddedInputXmlSupportMarker: true,
        rvmDoNotLabel: true,
        rvmDoNotIndex: true,
        pickable: false,
        selectable: false,
        nonSelectableReason: `Embedded InputXML marker hidden by default; set ${DEBUG_EMBEDDED_INPUTXML_MARKERS_KEY}=true for debug inspection`,
      };
      if (obj.element?.style) hideDomNode(obj.element);
    });
  }
  count += hideEmbeddedInputXmlDomLabels(root);
  return count;
}

function showEmbeddedInputXmlMarkers() {
  try { return localStorage.getItem(DEBUG_EMBEDDED_INPUTXML_MARKERS_KEY) === 'true'; } catch (_) { return false; }
}

function purgeDom(root) {
  if (!root) return 0;
  let count = 0;
  for (const selector of [
    '[data-rvm-support-engine]',
    '[data-rvm-support-att-mapping]',
    '[data-rvm-support-assembly-toggle]',
    '[data-rvm-support-assembly-diagnostics]',
    '[data-rvm-support-att-panel]',
    '[data-rvm-support-engine-panel]',
    '[data-rvm-support-geometry-panel]',
    '[data-rvm-support-label]',
    '.rvm-support-symbol-label',
    '.rvm-support-engine-section',
    '.rvm-support-att-section',
    '.rvm-support-mode-row',
    '.rvm-support-summary-list',
    '.rvm-support-assembly-row',
    '.rvm-support-assembly-diag',
  ]) count += removeAll(root, selector);

  const summary = root.querySelector('#rvm-support-summary');
  if (summary) {
    const header = previousElement(summary);
    if (/support/i.test(header?.textContent || '')) {
      header.remove();
      count += 1;
    }
    summary.remove();
    count += 1;
  }

  for (const selector of ['#rvm-support-scale', '#rvm-support-labels', '[data-rvm-status-chip="supports"]']) {
    const node = root.querySelector(selector);
    const section = node?.closest?.('.rvm-ribbon-section');
    if (section) {
      section.remove();
      count += 1;
    } else if (node) {
      node.remove();
      count += 1;
    }
  }

  const search = root.querySelector('#rvm-search-input');
  if (search && /support tag/i.test(search.getAttribute('placeholder') || '')) search.setAttribute('placeholder', 'Search hierarchy / object…');
  count += hideEmbeddedInputXmlDomLabels(root);
  return count;
}

function hideEmbeddedInputXmlDomLabels(root) {
  if (!root || showEmbeddedInputXmlMarkers()) return 0;
  let count = 0;
  const selectors = [
    '.rvm-object-label',
    '.rvm-label',
    '.css2d-label',
    '[data-rvm-label]',
    '[data-rvm-object-label]',
    '[data-rvm-support-label]',
    '.rvm-canvas-label',
    '.rvm-object-badge',
    'div',
    'span'
  ].join(',');
  const seen = new WeakSet();
  root.querySelectorAll?.(selectors)?.forEach((node) => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    if (!EMBEDDED_INPUTXML_MARKER_RE.test(node.textContent || '')) return;
    hideDomNode(node);
    count += 1;
  });
  return count;
}

function hideDomNode(node) {
  if (!node?.style) return;
  if (!node.dataset.rvmPreviousDisplay) node.dataset.rvmPreviousDisplay = node.style.display || '';
  node.dataset.rvmHiddenEmbeddedInputXmlSupportMarker = 'true';
  node.style.display = 'none';
  node.setAttribute('aria-hidden', 'true');
}

function previousElement(node) {
  let current = node?.previousElementSibling || null;
  while (current && current.nodeType !== 1) current = current.previousElementSibling;
  return current;
}

function removeAll(root, selector) {
  let count = 0;
  root.querySelectorAll(selector).forEach((node) => { node.remove(); count += 1; });
  return count;
}

function purgeGlobals() {
  let count = 0;
  for (const key of RETIRED_GLOBALS) {
    if (Object.prototype.hasOwnProperty.call(globalThis, key)) {
      try { delete globalThis[key]; } catch (_) { globalThis[key] = undefined; }
      count += 1;
    }
  }
  return count;
}

function purgeStorage() {
  try { for (const key of RETIRED_STORAGE_KEYS) localStorage.removeItem(key); } catch (_) {}
}

function objectText(obj) {
  const data = obj?.userData || {};
  const attrs = { ...(data.browserRvmAttributes || {}), ...(data.attributes || {}), ...(data.rawAttributes || {}) };
  return [
    obj?.name,
    obj?.element?.textContent,
    data.displayName,
    data.sourcePath,
    data.sourceName,
    data.type,
    data.kind,
    data.renderPrimitive,
    data.effectiveRenderPrimitive,
    attrs.NAME,
    attrs.TYPE,
    attrs.RVM_OWNER_NAME,
    attrs.RVM_OWNER_PATH,
  ].map((value) => String(value || '')).join(' ');
}

function disposeObject(root) {
  root?.traverse?.((obj) => {
    obj.geometry?.dispose?.();
    const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
    mats.forEach((mat) => mat?.dispose?.());
  });
}
