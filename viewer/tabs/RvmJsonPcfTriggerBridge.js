import { RuntimeEvents } from '../contracts/runtime-events.js';
import { emit } from '../core/event-bus.js';
import { setActiveTab, state, updateRvmPcfExtractState } from '../core/state.js';
import {
  buildRvmJsonPcfRequestPayload,
  normalizeRvmJsonPcfRequestPayload,
} from './rvm-json-pcf-trigger-helpers.js';

const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-json-pcf-trigger-bridge-v2-visible-scope');
const ROOT_BOUND_ATTR = 'data-rvm-json-pcf-trigger-bound';
const SECTION_ATTR = 'data-rvm-json-pcf-trigger-section';
const SYNTHETIC_INDEX_SCHEMA = 'rvm-pcf-synthetic-render-index/v1-visible-scope';
const MAX_SYNTHETIC_INDEX_NODES = 25000;

function selectedCanonicalIdsFromViewer() {
  const viewer = globalThis.__3D_RVM_VIEWER__;
  const ids = viewer?.selection?.getSelectedCanonicalIds?.();
  if (Array.isArray(ids) && ids.length) return ids.filter(Boolean).map(String);

  const stateIds = state?.rvm?.selection?.canonicalObjectIds;
  if (Array.isArray(stateIds) && stateIds.length) return stateIds.filter(Boolean).map(String);

  const single = state?.rvm?.selection?.canonicalObjectId;
  return single ? [String(single)] : [];
}

function viewer() {
  return globalThis.__3D_RVM_VIEWER__ || null;
}

function objectId(obj) {
  return String(
    obj?.userData?.canonicalObjectId
    || obj?.userData?.sourceObjectId
    || obj?.userData?.name
    || obj?.name
    || obj?.uuid
    || ''
  ).trim();
}

function objectName(obj, id) {
  return String(
    obj?.userData?.displayName
    || obj?.userData?.name
    || obj?.name
    || id
    || 'RVM object'
  );
}

function objectSourcePath(obj, fallbackName = '') {
  const ud = obj?.userData || {};
  const attrs = ud.attributes || ud.rawAttributes || {};
  return String(
    ud.sourcePath
    || ud.path
    || attrs.RVM_SOURCE_PATH
    || attrs.RVM_OWNER_PATH
    || attrs.RVM_OWNER_NAME
    || attrs.NAME
    || fallbackName
    || ''
  );
}

function mergeAttributes(obj, id, sourcePath) {
  const ud = obj?.userData || {};
  const attrs = {
    ...(ud.rawAttributes && typeof ud.rawAttributes === 'object' ? ud.rawAttributes : {}),
    ...(ud.attributes && typeof ud.attributes === 'object' ? ud.attributes : {}),
  };
  attrs.RVM_RENDER_OBJECT_ID = id;
  attrs.RVM_SYNTHETIC_INDEX = 'true';
  attrs.RVM_SOURCE_PATH = attrs.RVM_SOURCE_PATH || sourcePath;
  attrs.RVM_VISIBLE = obj?.visible === false ? 'false' : 'true';
  if (ud.renderPrimitive) attrs.RVM_RENDER_PRIMITIVE = String(ud.renderPrimitive);
  if (ud.effectiveRenderPrimitive) attrs.RVM_EFFECTIVE_RENDER_PRIMITIVE = String(ud.effectiveRenderPrimitive);
  if (ud.rvmZoneLodDetail) attrs.RVM_ZONE_LOD_DETAIL = String(ud.rvmZoneLodDetail);
  if (!attrs.TYPE) attrs.TYPE = String(ud.type || ud.kind || ud.renderPrimitive || 'RVM_OBJECT').toUpperCase();
  if (!attrs.NAME) attrs.NAME = objectName(obj, id);
  return attrs;
}

function hasRvmPcfSourceIndex() {
  return Array.isArray(state?.rvm?.index?.nodes) && state.rvm.index.nodes.length > 0;
}

function renderedObjectNodes() {
  const v = viewer();
  const nodes = [];
  const seen = new Set();
  v?.modelGroup?.traverse?.((obj) => {
    if (!(obj?.isMesh || obj?.isLine || obj?.isPoints)) return;
    if (nodes.length >= MAX_SYNTHETIC_INDEX_NODES) return;
    const id = objectId(obj);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const sourcePath = objectSourcePath(obj, id);
    const attrs = mergeAttributes(obj, id, sourcePath);
    nodes.push({
      canonicalObjectId: id,
      sourceObjectId: String(obj?.userData?.sourceObjectId || id),
      name: objectName(obj, id),
      kind: String(attrs.TYPE || obj?.userData?.kind || 'RVM_OBJECT').toUpperCase(),
      type: String(attrs.TYPE || obj?.userData?.type || 'RVM_OBJECT').toUpperCase(),
      parentCanonicalObjectId: '',
      attributes: attrs,
    });
  });
  return nodes;
}

function ensureRvmPcfSourceIndex(root) {
  if (hasRvmPcfSourceIndex()) return { ready: true, synthetic: false, count: state.rvm.index.nodes.length };
  const nodes = renderedObjectNodes();
  if (!nodes.length) return { ready: false, synthetic: false, count: 0 };
  state.rvm.index = {
    schemaVersion: SYNTHETIC_INDEX_SCHEMA,
    bundleId: `browser-rvm-render-index-${Date.now()}`,
    source: 'browser-rvm-rendered-objects',
    generatedAt: new Date().toISOString(),
    nodeLimit: MAX_SYNTHETIC_INDEX_NODES,
    nodes,
  };
  state.rvm.identityMap = state.rvm.identityMap || new Map();
  setStatus(root, `Built PCF source index from ${nodes.length} rendered RVM object(s).`);
  return { ready: true, synthetic: true, count: nodes.length };
}

function visibleCanonicalIdsFromViewer() {
  const ids = [];
  const seen = new Set();
  viewer()?.modelGroup?.traverse?.((obj) => {
    if (!(obj?.isMesh || obj?.isLine || obj?.isPoints)) return;
    if (obj.visible === false) return;
    const id = objectId(obj);
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return ids;
}

function setStatus(root, message, isWarning = false) {
  const status = root?.querySelector?.('#rvm-sb-msg');
  if (!status) return;
  status.textContent = message;
  status.style.color = isWarning ? '#ffcf70' : '';
}

function buildSection() {
  const section = document.createElement('div');
  section.className = 'rvm-ribbon-section rvm-json-pcf-trigger-section';
  section.setAttribute(SECTION_ATTR, 'true');
  section.innerHTML = `
    <span class="rvm-ribbon-label">PCF</span>
    <div class="rvm-ribbon-button-row">
      <button class="rvm-btn rvm-json-pcf-trigger-btn" type="button" data-rvm-json-pcf-scope="selected" title="Convert selected RVM geometry to PCF">Sel → PCF</button>
      <button class="rvm-btn rvm-json-pcf-trigger-btn" type="button" data-rvm-json-pcf-scope="visible" title="Convert currently visible RVM geometry to PCF, respecting hidden hierarchy zones">Visible → PCF</button>
      <button class="rvm-btn rvm-json-pcf-trigger-btn" type="button" data-rvm-json-pcf-scope="full" title="Convert full RVM model to PCF">Full → PCF</button>
    </div>
  `;
  return section;
}

function installSection(root) {
  if (!root || root.getAttribute(ROOT_BOUND_ATTR) === 'true') return;
  const ribbon = root.querySelector?.('.geo-top-ribbon');
  if (!ribbon) return;

  root.setAttribute(ROOT_BOUND_ATTR, 'true');
  if (!ribbon.querySelector(`[${SECTION_ATTR}]`)) {
    const section = buildSection();
    const search = ribbon.querySelector('.rvm-ribbon-search');
    if (search) ribbon.insertBefore(section, search);
    else ribbon.appendChild(section);
  }

  ribbon.querySelectorAll('[data-rvm-json-pcf-scope]').forEach((button) => {
    if (button.dataset.rvmJsonPcfBound === 'true') return;
    button.dataset.rvmJsonPcfBound = 'true';
    button.addEventListener('click', () => triggerJsonRvmPcf(root, button.dataset.rvmJsonPcfScope || 'full'));
  });
}

function scopeIdsFor(requestedScope) {
  if (requestedScope === 'selected') return selectedCanonicalIdsFromViewer();
  if (requestedScope === 'visible') return visibleCanonicalIdsFromViewer();
  return [];
}

function displayScope(scope) {
  if (scope === 'visible') return 'visible geometry';
  if (scope === 'selected') return 'selected geometry';
  return 'full model';
}

function triggerJsonRvmPcf(root, requestedScope) {
  const source = ensureRvmPcfSourceIndex(root);
  if (!source.ready) {
    setStatus(root, 'JSON/RVM → PCF requires a loaded RVM model with rendered objects or an extract index.', true);
    return;
  }

  const ids = scopeIdsFor(requestedScope);
  const resolvedScope = requestedScope === 'full' ? 'full' : 'selected';
  if (requestedScope !== 'full' && ids.length === 0) {
    setStatus(root, `JSON/RVM → PCF: no ${displayScope(requestedScope)} found. Use Full → PCF or adjust hierarchy visibility.`, true);
    return;
  }

  const payload = buildRvmJsonPcfRequestPayload({
    appState: state,
    overrides: {
      scope: resolvedScope,
      selectedCanonicalIds: ids,
      openWorkflow: true,
      requestedPanel: 'workflow',
      requestedPhase: 'preview',
      sourceScope: requestedScope,
      sourceIndexSynthetic: source.synthetic,
    },
  });
  const normalized = normalizeRvmJsonPcfRequestPayload({ payload, appState: state });

  if (!state.rvm.selection) state.rvm.selection = { canonicalObjectId: null, canonicalObjectIds: [], renderObjectIds: [] };
  if (resolvedScope === 'selected') {
    state.rvm.selection.canonicalObjectIds = [...ids];
    state.rvm.selection.canonicalObjectId = ids[0] || null;
  }

  updateRvmPcfExtractState({
    workflowMode: normalized.workflowMode,
    workflowAdapterId: normalized.workflowAdapterId,
    sourceKind: normalized.sourceKind,
    sourceStatus: 'ready',
    sourceLabel: source.synthetic
      ? `Rendered RVM geometry index (${source.count} object(s), synthetic)`
      : `Current RVM viewer model (${source.count} node(s))`,
    scope: normalized.scope,
    sourceScope: requestedScope,
    selectedCanonicalIds: normalized.selectedCanonicalIds,
    selectedVisibleOnly: requestedScope === 'visible',
    activeWorkflowPhase: normalized.activeWorkflowPhase,
    requestedPanel: normalized.requestedPanel,
    lastRequestedAt: new Date().toISOString(),
  }, 'rvm-viewer-json-pcf-trigger-visible-scope');

  const countText = resolvedScope === 'selected' ? `${ids.length} object(s)` : `${source.count} indexed object(s)`;
  setStatus(root, `JSON/RVM → PCF requested for ${displayScope(requestedScope)}: ${countText}.`);

  setActiveTab('rvm-json-pcf');
  setTimeout(() => emit(RuntimeEvents.RVM_EXTRACT_PCF_REQUESTED, payload), 75);
  setTimeout(() => emit(RuntimeEvents.RVM_EXTRACT_PCF_REQUESTED, payload), 250);
}

function scan() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll?.('[data-rvm-viewer]').forEach(installSection);
}

export function installRvmJsonPcfTriggerBridge() {
  if (typeof document === 'undefined') return;
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;
  scan();
  if (typeof MutationObserver === 'function') {
    const observer = new MutationObserver(scan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  globalThis.__PCF_GLB_RVM_JSON_PCF_TRIGGER_BRIDGE__ = {
    version: '20260621-rvm-pcf-visible-scope-1',
    scan,
    trigger(scope = 'full') {
      const root = document.querySelector('[data-rvm-viewer]');
      if (root) triggerJsonRvmPcf(root, scope);
    },
    ensureSourceIndex() {
      const root = document.querySelector('[data-rvm-viewer]');
      return ensureRvmPcfSourceIndex(root);
    },
  };
}
