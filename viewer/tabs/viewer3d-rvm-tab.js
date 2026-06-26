import { RuntimeEvents } from '../contracts/runtime-events.js';
import { RvmViewer3D } from '../rvm-viewer/RvmViewer3D.js?v=20260620-rvm-direct-tab-1';
import { installRvmProgressiveModelRootPatch } from '../rvm-viewer/RvmProgressiveModelRootPatchV5.js?v=20260620-rvm-tree-select-nohide-1';
import { AvevaJsonLoader } from '../rvm/AvevaJsonLoader.js';
import { isLikelyRvmFileName } from '../rvm/BrowserRvmParser.js';
import { loadRvmFileInBrowser } from '../rvm/BrowserRvmLoadBridge.js?v=20260621-rvm-native-facet-primary-1';
import {
  convertUxmlDocumentToAvevaHierarchy,
  isUxmlDocument,
} from '../rvm/UxmlToAvevaJsonAdapter.js?v=20260618-rvm-rich-ui-source-kind-1';
import {
  installSelectedGeometryEnrichmentPanel,
  syncAllPanels as syncSelectedGeometryEnrichmentPanels,
} from '../enrichment/SelectedGeometryEnrichmentPanel.js?v=20260624-selected-geometry-floating-workflow-3';

installRvmProgressiveModelRootPatch(RvmViewer3D);
installSelectedGeometryEnrichmentPanel();

const RVM_TAB_JS_VERSION = '20260622-rvm-support-runtime-retired-2';
const JSON_TREE_RENDER_LIMIT = 2600;
const RVM_TREE_RENDER_LIMIT = 320;
const STATUS_TRAVERSE_LIMIT = 4000;

const ACTION_LABELS = {
  NAV_SELECT: 'Select',
  NAV_ORBIT: 'Orbit',
  NAV_PAN: 'Pan',
  MARQUEE_SELECT: 'Box Sel',
  MEASURE_TOOL: 'Measure',
  VIEW_MARQUEE_ZOOM: 'Zoom',
  VIEW_FIT_ALL: 'Fit All',
  VIEW_FIT_SELECTION: 'Fit Sel',
  VIEW_TOGGLE_PROJECTION: 'Ortho',
  SECTION_BOX: 'Sec Box',
  SECTION_PLANE_UP: 'Sec Up',
  SECTION_DISABLE: 'Sec Off',
  NAV_PLAN_X: 'Top',
  NAV_ROTATE_Y: 'Front',
  NAV_ROTATE_Z: 'Right',
  SNAP_ISO_NW: 'Iso NW',
  SNAP_ISO_NE: 'NE',
  SNAP_ISO_SW: 'SW',
  SNAP_ISO_SE: 'SE',
};

const ACTION_ICONS = {
  NAV_SELECT: '⌖',
  NAV_ORBIT: '⟳',
  NAV_PAN: '↔',
  MARQUEE_SELECT: '□',
  MEASURE_TOOL: '↕',
  VIEW_FIT_ALL: '⛶',
  VIEW_FIT_SELECTION: '◉',
  VIEW_TOGGLE_PROJECTION: '▣',
  VIEW_MARQUEE_ZOOM: '⌕',
  SECTION_BOX: '▧',
  SECTION_PLANE_UP: '⊥',
  SECTION_DISABLE: '⊘',
  NAV_PLAN_X: 'T',
  NAV_ROTATE_Y: 'F',
  NAV_ROTATE_Z: 'R',
  SNAP_ISO_NW: 'NW',
  SNAP_ISO_NE: 'NE',
  SNAP_ISO_SW: 'SW',
  SNAP_ISO_SE: 'SE',
};

const TOOL_GROUPS = [
  { label: 'Navigate', actions: ['NAV_SELECT', 'NAV_ORBIT', 'NAV_PAN', 'MARQUEE_SELECT', 'MEASURE_TOOL'] },
  { label: 'View', actions: ['VIEW_FIT_ALL', 'VIEW_FIT_SELECTION', 'VIEW_TOGGLE_PROJECTION', 'VIEW_MARQUEE_ZOOM'] },
  { label: 'Section', actions: ['SECTION_BOX', 'SECTION_PLANE_UP', 'SECTION_DISABLE'] },
  { label: 'Orient', actions: ['NAV_PLAN_X', 'NAV_ROTATE_Y', 'NAV_ROTATE_Z', 'SNAP_ISO_NW', 'SNAP_ISO_NE', 'SNAP_ISO_SW', 'SNAP_ISO_SE'] },
];

const MODE_ACTIONS = new Set(['NAV_SELECT', 'NAV_ORBIT', 'NAV_PAN', 'MARQUEE_SELECT', 'MEASURE_TOOL', 'VIEW_MARQUEE_ZOOM']);
const ICON_ONLY_ACTIONS = new Set(['NAV_PLAN_X', 'NAV_ROTATE_Y', 'NAV_ROTATE_Z', 'SNAP_ISO_NW', 'SNAP_ISO_NE', 'SNAP_ISO_SW', 'SNAP_ISO_SE']);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function makeAsyncSession(statusEl) {
  let stale = false;
  return {
    update(stage, percent) {
      if (statusEl) statusEl.textContent = `${stage} ${Number.isFinite(percent) ? `${percent}%` : ''}`.trim();
    },
    complete() {
      if (statusEl) statusEl.textContent = 'Loaded';
    },
    cancel() { stale = true; },
    isStale() { return stale; },
    isCancelled() { return stale; },
  };
}

function parseJsonSource(text, fileName = '') {
  const doc = JSON.parse(text);
  if (isUxmlDocument(doc)) return convertUxmlDocumentToAvevaHierarchy(doc, { fileName });
  if (isUxmlDocument(doc?.uxml)) return convertUxmlDocumentToAvevaHierarchy(doc.uxml, { fileName });
  if (isUxmlDocument(doc?.document)) return convertUxmlDocumentToAvevaHierarchy(doc.document, { fileName });
  if (Array.isArray(doc)) return doc;
  if (doc?.hierarchy && Array.isArray(doc.hierarchy)) return doc.hierarchy;
  if (doc?.nodes && Array.isArray(doc.nodes)) return doc.nodes;
  return doc;
}

function sourceKindForJsonFileName(fileName = '') {
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.jscon')) return 'jscon';
  if (lower.endsWith('.uxml') || lower.endsWith('.uxml.json')) return 'inputxml';
  return 'json';
}

function stampSourcePreviewHierarchy(scene, source, sourceKind, fileName = '') {
  if (!scene?.userData || !source) return;
  scene.userData.__rvmNonPrimitiveSourceHierarchy = source;
  scene.userData.__rvmNonPrimitiveSourceKind = sourceKind;
  scene.userData.__rvmNonPrimitiveAutoBendSourceHierarchy = source;
  scene.userData.__rvmNonPrimitiveAutoBendSourceKind = sourceKind;
  scene.userData.__rvmSourcePreviewStampedByTab = RVM_TAB_JS_VERSION;
  scene.userData.fileName = fileName;
}

async function loadJsonOrUxmlFile(file, viewer, statusEl, sourceKind = sourceKindForJsonFileName(file?.name)) {
  if (isLikelyRvmFileName(file?.name)) throw new Error('Internal routing error: binary RVM reached JSON/UXML loader.');
  const text = await file.text();
  const source = parseJsonSource(text, file.name);
  const loader = new AvevaJsonLoader();
  const payload = await loader.load(source, {}, makeAsyncSession(statusEl));
  if (!payload?.gltf?.scene) throw new Error('RVM/AVEVA JSON loader produced no scene.');
  stampSourcePreviewHierarchy(payload.gltf.scene, source, sourceKind, file.name);
  viewer.ctx.identityMap = payload.identityMap;
  viewer.setModel(payload.gltf.scene, payload.manifest?.runtime?.upAxis || 'Z');
  return payload;
}

function renderToolButton(action) {
  const label = ACTION_LABELS[action] || action;
  const iconOnly = ICON_ONLY_ACTIONS.has(action);
  return `<button class="rvm-tool-btn ${action === 'NAV_SELECT' ? 'is-active' : ''} ${iconOnly ? 'is-icon-only' : ''}" data-action="${escapeHtml(action)}" type="button" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"><span aria-hidden="true">${escapeHtml(ACTION_ICONS[action] || '')}</span>${iconOnly ? '' : `<span>${escapeHtml(label)}</span>`}</button>`;
}

function renderToolGroup(group) {
  return `<div class="rvm-ribbon-section rvm-tool-group" aria-label="${escapeHtml(group.label)} tools"><span class="rvm-ribbon-label">${escapeHtml(group.label)}</span><div class="rvm-ribbon-button-row">${group.actions.map(renderToolButton).join('')}</div></div>`;
}

function renderShell(container) {
  queueMicrotask(() => {
    const modeChip = container.querySelector('#rvm-mode-chip');
    if (modeChip) modeChip.textContent = 'Select';
  });
  container.innerHTML = `<div class="rvm-tab-root geo-theme-navisdark" data-rvm-viewer data-rvm-tab-version="${escapeHtml(RVM_TAB_JS_VERSION)}"><div class="rvm-capability-banner" id="rvm-capability-banner" data-mode="worker-first">RVM / REV / ATT / JSON / UXML viewer ready — direct RVM worker path</div><div class="geo-top-ribbon">${TOOL_GROUPS.map(renderToolGroup).join('')}<div class="rvm-ribbon-section rvm-ribbon-load"><label class="rvm-btn rvm-btn-file" title="Load RVM / REV / ATT / JSON / UXML"><span>Load</span><input id="rvm-file-input" type="file" accept=".json,.jscon,.uxml,.uxml.json,.rvm,.rev,.att" multiple data-browser-rvm-fallback="true" data-browser-rvm-att-sidecar="true" data-rvm-direct-worker-load="true" style="display:none" /></label></div><div class="rvm-ribbon-search"><input id="rvm-search-input" placeholder="Search hierarchy / object…" /></div><span class="mode-chip" id="rvm-mode-chip">Orbit</span></div><div id="rvm-status-strip" class="rvm-status-strip" aria-live="polite"><span class="rvm-status-chip" data-rvm-status-chip="objects">Objects: 0</span><span class="rvm-status-chip" data-rvm-status-chip="visible">Visible: 0</span><span class="rvm-status-chip" data-rvm-status-chip="selected">Selected: 0</span><span class="rvm-status-chip" data-rvm-status-chip="kind">Kinds: -</span></div><div class="rvm-body"><aside class="rvm-left-panel"><div class="rvm-panel-header">Hierarchy</div><div class="rvm-panel-filter-row"><input id="rvm-tree-filter" class="rvm-panel-filter" placeholder="Filter tree…"></div><ul id="rvm-tree" class="rvm-tree"><li class="rvm-empty-state">Load RVM / REV / ATT / JSON / UXML to view hierarchy.</li></ul></aside><section class="rvm-viewport"><div id="rvm-canvas" class="rvm-canvas"></div><div class="rvm-placeholder" id="rvm-placeholder">Load RVM / REV / ATT / JSON / UXML to begin.</div></section><aside class="rvm-right-panel"><div class="rvm-panel-header">Properties</div><div id="rvm-attributes-panel" class="rvm-attributes-panel"><div class="rvm-empty-state">No object selected.</div></div><div class="rvm-panel-header" data-rvm-browser-diagnostics-header="true">Browser RVM Performance</div><div id="rvm-browser-parse-diagnostics" class="rvm-tag-list rvm-browser-parse-diagnostics" aria-live="polite" data-browser-rvm-diagnostics-panel="true"><div class="rvm-empty-state">No browser RVM load yet.</div></div></aside></div><div class="viewer-statusbar"><span id="rvm-sb-msg">Ready</span><span>Selection <b id="rvm-sel-count">0</b></span></div></div>`;
}

function nodeDisplayName(node) {
  return node?.name || node?.canonicalObjectId || node?.sourceObjectId || node?.id || 'Node';
}

function nodeKind(node) {
  return String(node?.kind || node?.attributes?.TYPE || '').toUpperCase() || 'NODE';
}

function buildNodeTree(nodes = [], options = {}) {
  if (options.flat === true) return buildFlatNodeTree(nodes, options);
  const limit = options.limit || JSON_TREE_RENDER_LIMIT;
  const recursive = options.recursive !== false;
  const children = new Map();
  for (const node of nodes) {
    if (!node?.canonicalObjectId) continue;
    const parent = node.parentCanonicalObjectId || '';
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(node);
  }
  const roots = children.get('') || nodes.filter((node) => !node.parentCanonicalObjectId).slice(0, limit);
  const renderNode = (node, depth = 0) => {
    const kids = children.get(node.canonicalObjectId) || [];
    const childHtml = recursive && kids.length && depth < 10 ? `<ul>${kids.slice(0, limit).map((kid) => renderNode(kid, depth + 1)).join('')}</ul>` : '';
    return `<li data-node-id="${escapeHtml(node.canonicalObjectId || '')}" data-depth="${depth}"><button type="button" class="rvm-tree-node"><span class="rvm-kind">${escapeHtml(nodeKind(node))}</span><span>${escapeHtml(nodeDisplayName(node))}</span>${kids.length ? `<span class="rvm-tree-count">${kids.length}</span>` : ''}</button>${childHtml}</li>`;
  };
  const rows = roots.slice(0, limit).map((node) => renderNode(node));
  const suffix = nodes.length > limit ? `<li class="rvm-empty-state">Tree capped at ${limit} rows for responsive RVM loading.</li>` : '';
  return rows.join('') + suffix || '<li class="rvm-empty-state">No hierarchy nodes.</li>';
}

function buildFlatNodeTree(nodes = [], options = {}) {
  const limit = options.limit || RVM_TREE_RENDER_LIMIT;
  const list = Array.isArray(nodes) ? nodes.filter((node) => node?.canonicalObjectId) : [];
  const rows = list.slice(0, limit).map((node) => `<li data-node-id="${escapeHtml(node.canonicalObjectId || '')}"><button type="button" class="rvm-tree-node"><span class="rvm-kind">${escapeHtml(nodeKind(node))}</span><span>${escapeHtml(nodeDisplayName(node))}</span></button></li>`);
  const suffix = list.length > limit ? `<li class="rvm-empty-state">Showing first ${limit} of ${list.length} hierarchy nodes. Use search/filter to narrow.</li>` : '';
  return rows.join('') + suffix || '<li class="rvm-empty-state">No hierarchy nodes.</li>';
}

function updateStatus(root, viewer, payload = {}) {
  const counts = { objects: 0, visible: 0, selected: 0 };
  const kinds = new Map();
  let traversed = 0;
  viewer?.modelGroup?.traverse?.((obj) => {
    traversed += 1;
    if (traversed > STATUS_TRAVERSE_LIMIT) return;
    if (obj?.isMesh || obj?.isLine || obj?.isPoints) {
      counts.objects += 1;
      if (obj.visible !== false) counts.visible += 1;
      const kind = obj.userData?.kind || obj.userData?.type || obj.type || 'Object';
      kinds.set(kind, (kinds.get(kind) || 0) + 1);
    }
  });
  const selected = viewer?.selection?.getSelectedCanonicalIds?.() || [];
  counts.selected = Array.isArray(selected) ? selected.length : 0;
  const setChip = (name, value) => {
    const chip = root.querySelector(`[data-rvm-status-chip="${name}"]`);
    if (chip) chip.textContent = value;
  };
  setChip('objects', `Objects: ${counts.objects}`);
  setChip('visible', `Visible: ${counts.visible}`);
  setChip('selected', `Selected: ${counts.selected}`);
  const topKinds = [...kinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([kind, count]) => `${kind}:${count}`).join(' ');
  setChip('kind', `Kinds: ${topKinds || payload?.manifest?.runtime?.upAxis || '-'}`);
  const selectedCount = root.querySelector('#rvm-sel-count');
  if (selectedCount) selectedCount.textContent = String(counts.selected);
}

function clearRvmSelectionState(root, viewer, reason) {
  try { globalThis.__PCF_GLB_RVM_INTERACTION__?.clearSelection?.(); } catch (_) {}
  try { viewer?.selection?.clearSelection?.(); } catch (_) {}
  try { viewer?.clearSelection?.(); } catch (_) {}
  if (viewer) viewer._rvmCanvasSelectedMeshes = [];
  root?.querySelectorAll?.('#rvm-tree li.is-selected').forEach((row) => row.classList.remove('is-selected'));
  const panel = root?.querySelector?.('#rvm-attributes-panel');
  if (panel) panel.innerHTML = '<div class="rvm-empty-state">No object selected.</div>';
  const selectedCount = root?.querySelector?.('#rvm-sel-count');
  if (selectedCount) selectedCount.textContent = '0';
  const chip = root?.querySelector?.('[data-rvm-status-chip="selected"]');
  if (chip) chip.textContent = 'Selected: 0';
  if (root?.dataset) root.dataset.rvmSelectionClearedReason = reason || 'selection-clear';
}

function setInitialSelectMode(root, viewer) {
  try {
    if (typeof viewer?.handleToolbarAction === 'function') viewer.handleToolbarAction('NAV_SELECT');
    else if (typeof viewer?.dispatchAction === 'function') viewer.dispatchAction('NAV_SELECT');
    else viewer?.setNavMode?.('select');
  } catch (error) {
    reportRvmActionError(error, { action: 'initial-select-mode' });
  }
  root?.querySelectorAll?.('[data-action]').forEach((button) => button.classList.toggle('is-active', button.dataset.action === 'NAV_SELECT'));
  const modeChip = root?.querySelector?.('#rvm-mode-chip');
  if (modeChip) modeChip.textContent = 'Select';
}

function diagnosticRow(label, value) {
  return `<div class="rvm-browser-diag-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value === undefined || value === null || value === '' ? '-' : value)}</b></div>`;
}

function timingText(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(1)} ms` : '-';
}

function makeDiagnosticsSeed(fileName = '') {
  return {
    fileName,
    loadedJsVersion: RVM_TAB_JS_VERSION,
    browserRvmLoadState: 'pending',
    browserRvmDirectTabLoadPath: true,
    browserRvmLegacyJsonHandlerBypassed: true,
  };
}

function renderDiagnostics(root, diagnostics = {}) {
  const panel = root.querySelector('#rvm-browser-parse-diagnostics');
  if (!panel) return;
  const render = diagnostics.browserRvmRender || diagnostics;
  const rows = [
    ['File', diagnostics.fileName],
    ['Load state', diagnostics.browserRvmLoadState],
    ['Worker loaded', diagnostics.browserRvmWorkerLoaded ? 'yes' : 'no'],
    ['Renderable', render.renderableCount ?? diagnostics.browserRvmRenderableCount],
    ['Skipped', render.skippedCount ?? diagnostics.browserRvmSkippedCount],
    ['Embedded InputXML markers skipped', diagnostics.embeddedInputXmlSupportMarkerSkippedCount ?? render.embeddedInputXmlSupportMarkerSkippedCount],
    ['Tree nodes rendered', diagnostics.browserRvmTreeNodesRendered],
    ['Max event-loop stall', timingText(diagnostics.browserRvmMaxEventLoopStallMs)],
    ['Binary PRIM', diagnostics.binaryPrimitiveRecordCount],
    ['Hierarchy groups', diagnostics.hierarchyGroupCount],
  ];
  panel.innerHTML = `<div class="rvm-browser-diag-grid">${rows.map(([label, value]) => diagnosticRow(label, value)).join('')}</div>${diagnostics.error ? `<div class="rvm-browser-diag-warning">${escapeHtml(diagnostics.error)}</div>` : ''}`;
}

function isJsonOrUxmlFileName(fileName = '') {
  return /\.(json|jscon|uxml)$/i.test(String(fileName || '').trim()) || /\.uxml\.json$/i.test(String(fileName || '').trim());
}

function isLikelyAttFileName(fileName = '') {
  return /\.att$/i.test(String(fileName || '').trim());
}

async function readBestAttSidecarText(files = [], rvmName = '') {
  const base = String(rvmName || '').replace(/\.[^.]+$/, '').toLowerCase();
  const candidates = files.filter((file) => isLikelyAttFileName(file?.name));
  const best = candidates.find((file) => String(file.name || '').replace(/\.[^.]+$/, '').toLowerCase() === base) || candidates[0];
  if (!best) return '';
  try { return await best.text(); } catch (_) { return ''; }
}

async function loadDirectBrowserRvm({ root, viewer, files, rvmFile, stateBag }) {
  const status = root.querySelector('#rvm-sb-msg');
  const startedAt = performance.now();
  let latestDiagnostics = makeDiagnosticsSeed(rvmFile.name);
  root.dataset.rvmLoadedSourceKind = 'rvm';
  root.dataset.rvmModelPrimitiveMode = 'rvm-native';
  status.textContent = `Loading ${rvmFile.name} with direct RVM worker path…`;
  renderDiagnostics(root, latestDiagnostics);
  const attText = await readBestAttSidecarText(files, rvmFile.name);
  const payload = await loadRvmFileInBrowser(rvmFile, viewer, {
    statusEl: status,
    attText,
    signal: stateBag.abortController.signal,
    allowMainThreadParserFallback: false,
    buildHierarchyFallback: false,
    renderOptions: { maxRenderableObjects: 6000, batchSize: 64, timeSliceMs: 8 },
    beforeRenderInstructions: (event) => globalThis.__PCF_GLB_RVM_ZONE_LOD_LABELS__?.beforeRenderInstructions?.({ ...event, root, viewer }),
    onProgress: (progress = {}) => {
      if (stateBag.abortController.signal.aborted) return;
      latestDiagnostics = {
        ...latestDiagnostics,
        browserRvmLoadState: progress.stage || latestDiagnostics.browserRvmLoadState || 'loading',
        browserRvmWorkerLoaded: true,
        browserRvmWorkerMessageReceived: true,
        browserRvmProgressProcessed: progress.processed,
        browserRvmProgressTotal: progress.total,
        browserRvmRenderableCount: progress.renderableCount ?? latestDiagnostics.browserRvmRenderableCount,
        browserRvmSkippedCount: progress.skippedCount ?? latestDiagnostics.browserRvmSkippedCount,
      };
      if (!Number.isFinite(latestDiagnostics.browserRvmFirstGeometryMs) && Number(progress.renderableCount) > 0) {
        latestDiagnostics.browserRvmFirstGeometryMs = performance.now() - startedAt;
      }
      renderDiagnostics(root, latestDiagnostics);
    },
    onDiagnostics: (diagnostics = {}) => {
      latestDiagnostics = {
        ...latestDiagnostics,
        ...diagnostics,
        loadedJsVersion: RVM_TAB_JS_VERSION,
        browserRvmDirectTabLoadPath: true,
        browserRvmLegacyJsonHandlerBypassed: true,
        browserRvmWorkerLoaded: diagnostics.browserRvmWorkerEnabled ?? latestDiagnostics.browserRvmWorkerLoaded,
        browserRvmWorkerMessageReceived: true,
      };
      renderDiagnostics(root, latestDiagnostics);
    },
  });
  if (stateBag.abortController.signal.aborted) return null;
  const nodes = payload.manifest?.nodes || payload.manifest?.items || payload.manifest?.runtime?.nodes || [];
  const tree = root.querySelector('#rvm-tree');
  if (tree) {
    tree.innerHTML = buildNodeTree(nodes, { limit: RVM_TREE_RENDER_LIMIT, flat: true });
    latestDiagnostics.browserRvmTreeNodesRendered = Math.min(nodes.length, RVM_TREE_RENDER_LIMIT);
  }
  root.querySelector('#rvm-placeholder')?.remove();
  clearRvmSelectionState(root, viewer, 'browser-rvm-load');
  updateStatus(root, viewer, payload);
  latestDiagnostics = {
    ...latestDiagnostics,
    ...(payload.browserRvmParser || {}),
    ...(payload.browserRvmRender?.diagnostics || {}),
    loadedJsVersion: RVM_TAB_JS_VERSION,
    browserRvmDirectTabLoadPath: true,
    browserRvmLegacyJsonHandlerBypassed: true,
    browserRvmWorkerLoaded: true,
    browserRvmWorkerMessageReceived: true,
    browserRvmTreeNodesRendered: Math.min(nodes.length, RVM_TREE_RENDER_LIMIT),
  };
  renderDiagnostics(root, latestDiagnostics);
  const renderCount = payload.browserRvmRender?.renderableCount ?? payload.manifest?.browserRvmRenderScene?.renderableCount;
  status.textContent = `Loaded browser RVM ${rvmFile.name}${Number.isFinite(renderCount) ? ` (${renderCount} renderable)` : ''}`;
  return payload;
}

function bindToolbar(viewer, root) {
  root.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.action;
      root.querySelectorAll('[data-action]').forEach((entry) => entry.classList.remove('is-active'));
      if (MODE_ACTIONS.has(action)) button.classList.add('is-active');
      const modeChip = root.querySelector('#rvm-mode-chip');
      if (modeChip) modeChip.textContent = ACTION_LABELS[action] || action;
      try {
        if (typeof viewer?.handleToolbarAction === 'function') viewer.handleToolbarAction(action);
        else RuntimeEvents.emit?.('viewer3d:rvm:toolbar-action', { action, viewer });
      } catch (error) {
        reportRvmActionError(error, { action });
      }
    });
  });
}

function markRvmModelLoaded(root, reason = 'model-loaded') {
  if (root?.dataset) root.dataset.rvmModelLoaded = 'true';
  try { globalThis.dispatchEvent?.(new CustomEvent('rvm-model-loaded', { detail: { reason, version: RVM_TAB_JS_VERSION } })); } catch (_) {}
  try { globalThis.__PCF_GLB_RVM_BRIDGE_LOADER__?.ensurePostModel?.(reason); } catch (error) { reportRvmActionError(error, { action: 'post-model-bridge-loader', reason }); }
  if (root?.dataset?.rvmModelPrimitiveMode === 'source-preview') {
    try { globalThis.__PCF_GLB_RVM_BRIDGE_LOADER__?.ensureSourcePreview?.(reason); } catch (error) { reportRvmActionError(error, { action: 'source-preview-bridge-loader', reason }); }
  }
}

function reportRvmActionError(error, context = {}) {
  if (typeof globalThis.__PCF_GLB_RVM_REPORT_ACTION_ERROR__ === 'function') return globalThis.__PCF_GLB_RVM_REPORT_ACTION_ERROR__(error, context);
  console.warn('[RVM tab] action failed', context, error);
  return null;
}

function cancelActiveLoad(stateBag) {
  try { stateBag.abortController?.abort?.(); } catch (_) {}
  stateBag.abortController = null;
}

function cleanupRvmTab(root, viewer, stateBag) {
  cancelActiveLoad(stateBag);
  try { root?.dispatchEvent?.(new CustomEvent('rvm-tab-dispose')); } catch (_) {}
  try { root?._rvmEscKeyCleanup?.(); } catch (_) {}
  try { globalThis.__PCF_GLB_RVM_BOTTOM_DIAGNOSTICS_DRAWER__?.destroy?.(root); } catch (_) {}
  try { viewer?.dispose?.(); } catch (error) { reportRvmActionError(error, { action: 'viewer-dispose' }); }
  if (globalThis.__3D_RVM_VIEWER__ === viewer) {
    try { delete globalThis.__3D_RVM_VIEWER__; } catch (_) { globalThis.__3D_RVM_VIEWER__ = null; }
  }
}

export function mountViewer3DRvmTab(container) {
  renderShell(container);
  syncSelectedGeometryEnrichmentPanels();
  const root = container.querySelector('[data-rvm-viewer]');
  const canvas = root.querySelector('#rvm-canvas');
  const status = root.querySelector('#rvm-sb-msg');
  const tree = root.querySelector('#rvm-tree');
  const viewer = new RvmViewer3D(canvas, { runtimeEvents: RuntimeEvents, autoFit: true });
  const stateBag = { abortController: null };

  bindToolbar(viewer, root);
  setInitialSelectMode(root, viewer);

  root.querySelector('#rvm-file-input')?.addEventListener('change', async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    cancelActiveLoad(stateBag);
    stateBag.abortController = new AbortController();
    const rvmFile = files.find((file) => isLikelyRvmFileName(file?.name));
    if (rvmFile) {
      event.preventDefault?.();
      event.stopPropagation?.();
      try {
        const payload = await loadDirectBrowserRvm({ root, viewer, files, rvmFile, stateBag });
        if (payload) markRvmModelLoaded(root, 'browser-rvm-load-success');
      } catch (err) {
        if (stateBag.abortController?.signal?.aborted || err?.name === 'AbortError') {
          status.textContent = `Cancelled RVM load ${rvmFile.name}`;
          return;
        }
        status.textContent = `RVM load failed: ${err.message || err}`;
        renderDiagnostics(root, { ...makeDiagnosticsSeed(rvmFile.name), browserRvmLoadFailed: true, browserRvmWorkerLoaded: false, error: err.message || String(err) });
        reportRvmActionError(err, { action: 'load-rvm', fileName: rvmFile.name });
      }
      return;
    }

    const jsonFile = files.find((file) => isJsonOrUxmlFileName(file?.name));
    if (!jsonFile) {
      const onlyAtt = files.every((file) => isLikelyAttFileName(file?.name));
      status.textContent = onlyAtt ? 'ATT sidecar selected. Select the matching RVM/REV file with it.' : 'File type not accepted for this tab.';
      return;
    }

    const sourceKind = sourceKindForJsonFileName(jsonFile.name);
    root.dataset.rvmLoadedSourceKind = sourceKind;
    root.dataset.rvmModelPrimitiveMode = 'source-preview';
    status.textContent = `Loading ${jsonFile.name}…`;
    try {
      const payload = await loadJsonOrUxmlFile(jsonFile, viewer, status, sourceKind);
      const nodes = payload.manifest?.nodes || payload.manifest?.items || payload.manifest?.runtime?.nodes || [];
      tree.innerHTML = buildNodeTree(nodes, { limit: JSON_TREE_RENDER_LIMIT, recursive: true });
      status.textContent = `Loaded ${jsonFile.name}`;
      root.querySelector('#rvm-placeholder')?.remove();
      clearRvmSelectionState(root, viewer, 'json-uxml-load');
      updateStatus(root, viewer, payload);
      markRvmModelLoaded(root, 'json-uxml-load-success');
    } catch (err) {
      status.textContent = `Load failed: ${err.message}`;
      reportRvmActionError(err, { action: 'load-json-uxml', fileName: jsonFile.name });
    }
  });

  tree.addEventListener('click', (event) => {
    const li = event.target.closest?.('li[data-node-id]');
    if (!li) return;
    const id = li.dataset.nodeId;
    try {
      viewer.selection?.set?.([id]);
      viewer.selection?.selectByCanonicalId?.(id);
      viewer.fitSelection?.();
      updateStatus(root, viewer);
    } catch (err) {
      reportRvmActionError(err, { action: 'tree-selection', nodeId: id });
    }
  });

  const bindFilter = (selector) => root.querySelector(selector)?.addEventListener('input', (event) => {
    const q = event.target.value.trim().toLowerCase();
    tree.querySelectorAll('li[data-node-id]').forEach((li) => {
      li.style.display = !q || li.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
  bindFilter('#rvm-search-input');
  bindFilter('#rvm-tree-filter');

  window.__3D_RVM_VIEWER__ = viewer;
  requestAnimationFrame(() => updateStatus(root, viewer));
  return () => cleanupRvmTab(root, viewer, stateBag);
}
