/**
 * Functionality: installs the RVM selected-geometry enrichment workflow as a
 * movable non-modal popup, captures selected/visible/hierarchy/full geometry,
 * runs XML->CII branch enrichment, exports the workspace package, and posts it
 * to Simplified Analysis. Parameters: current RVM viewer state, popup controls,
 * and imported master files. Outputs: frozen preview/enrichment/package state
 * plus status UI. Fallback: JSON export remains available when popup messaging
 * or target storage is unavailable.
 */

import { RuntimeEvents } from '../contracts/runtime-events.js';
import { on } from '../core/event-bus.js';
import { buildSelectedGeometryScope } from './selected-geometry-scope.js';
import { summarizeEnrichmentObjects } from './selected-geometry-diagnostics.js';
import {
  PENDING_WORKSPACE_PACKAGE_STORAGE_KEY,
  RVM_SELECTED_GEOMETRY_WORKSPACE_PACKAGE_SCHEMA,
  buildSelectedGeometryWorkspacePackage,
  selectedGeometryWorkspacePackageFileName,
  serializeSelectedGeometryWorkspacePackage,
  writePendingWorkspacePackageToStorage,
} from './selected-geometry-package.js';
import { objectAliases, text } from './selected-geometry-shared.js';
import { parseSelectedGeometryMasterFile } from './selected-geometry-master-parser.js';
import {
  applySelectedGeometryEnrichmentIndicators,
  renderSelectedGeometryEnrichmentDetails,
} from './SelectedGeometryEnrichmentDetails.js';
import {
  buildSelectedGeometryBranchPreview,
  buildSelectedGeometryWorkflowConfig,
  enrichSelectedGeometryScopeWithBranchWorkflow,
} from './selected-geometry-branch-workflow.js';
import {
  SELECTED_GEOMETRY_WORKFLOW_PHASES,
  renderSelectedGeometryWorkflowPhase,
} from './SelectedGeometryEnrichmentPopupRenderer.js';

export const RVM_SELECTED_GEOMETRY_ENRICHMENT_UI_SCHEMA = 'rvm-selected-geometry-enrichment-ui/v2-floating-workflow';
export const RVM_SELECTED_GEOMETRY_POST_MESSAGE_TYPE = 'rvm-selected-geometry-workspace-package';

const INSTALL_FLAG = Symbol.for('rvm-selected-geometry-enrichment-floating-workflow-v1');
const STYLE_ID = 'rvm-selected-geometry-enrichment-floating-workflow-style';
const ROOT_SELECTOR = '[data-rvm-viewer]';
const GLOBAL_KEY = '__RVM_SELECTED_GEOMETRY_ENRICHMENT__';
const DEFAULT_TARGET_URL = 'http://localhost:5173/';
const ACTIVE_PHASE_KEY = 'rvmSelectedGeometry.enrichment.activePhase.v1';
const POPUP_ID = 'rvm-selected-geometry-workflow-popup';
const TOOLBAR_SECTION_ATTR = 'data-selected-geometry-workflow-toolbar';

const MASTER_LABELS = Object.freeze({
  lineList: 'Line list',
  pipingClass: 'Piping class',
  materialMap: 'Material map',
  weightMaster: 'Weight master',
});

export function installSelectedGeometryEnrichmentPanel() {
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;
  globalThis[GLOBAL_KEY] = globalThis[GLOBAL_KEY] || createState();
  installStyles();
  document.addEventListener('click', handleDocumentClick, true);
  document.addEventListener('change', handleDocumentChange, true);
  document.addEventListener('input', handleDocumentInput, true);
  on(RuntimeEvents.RVM_NODE_SELECTED, (payload) => scheduleSelectionRefresh(payload));
  globalThis.addEventListener?.('rvm-model-loaded', () => setTimeout(syncAllPanels, 160));
  queueMicrotask(syncAllPanels);
}

export function syncAllPanels() {
  const roots = document.querySelectorAll?.(ROOT_SELECTOR) || [];
  for (const root of roots) {
    removeLegacyRightPanel(root);
    installToolbar(root);
    applySelectedGeometryEnrichmentIndicators(root, state().lastEnrichedScope);
    refreshSelectionDetails(root, {});
  }
}

function createState() {
  return {
    schema: RVM_SELECTED_GEOMETRY_ENRICHMENT_UI_SCHEMA,
    masters: {
      lineList: [],
      pipingClass: [],
      materialMap: [],
      weightMaster: [],
      lineListVersion: '',
      pipingClassVersion: '',
      materialMapVersion: '',
      weightMasterVersion: '',
    },
    masterFiles: {},
    config: {},
    targetUrl: readTargetUrl(),
    scopeMode: 'selected',
    phaseId: readStored(ACTIVE_PHASE_KEY, 'preview'),
    activeMaster: 'lineList',
    popupEl: null,
    popupBodyEl: null,
    lastScope: null,
    lastPreview: null,
    lastEnrichedScope: null,
    lastPackage: null,
    lastSummary: null,
    lastMessage: 'Idle',
    lastError: '',
    configText: null,
    configStatus: '',
    drag: null,
  };
}

function state() {
  globalThis[GLOBAL_KEY] = globalThis[GLOBAL_KEY] || createState();
  return globalThis[GLOBAL_KEY];
}

function installToolbar(root) {
  const ribbon = root?.querySelector?.('.geo-top-ribbon');
  if (!ribbon) return;
  let section = ribbon.querySelector(`[${TOOLBAR_SECTION_ATTR}]`);
  if (!section) {
    section = document.createElement('div');
    section.className = 'rvm-ribbon-section rvm-tool-group rvm-selected-geometry-workflow-tool-group';
    section.setAttribute(TOOLBAR_SECTION_ATTR, 'true');
    const search = ribbon.querySelector('.rvm-ribbon-search');
    if (search) ribbon.insertBefore(section, search);
    else ribbon.appendChild(section);
  }
  section.innerHTML = `
    <span class="rvm-ribbon-label">Enrich</span>
    <div class="rvm-ribbon-button-row">
      <button type="button" class="rvm-tool-btn" data-sgw-open="true" title="Open selected geometry enrichment workflow">
        <span aria-hidden="true">E</span><span>Workflow</span>
      </button>
    </div>`;
}

function removeLegacyRightPanel(root) {
  root.querySelector?.('#rvm-selected-geometry-enrichment-panel')?.remove();
  root.querySelectorAll?.('[data-selected-geometry-enrichment-header="true"]').forEach((node) => node.remove());
}

async function handleDocumentClick(event) {
  const openButton = event.target?.closest?.('[data-sgw-open]');
  if (openButton) {
    event.preventDefault();
    openWorkflowPopup(openButton.closest(ROOT_SELECTOR) || document.querySelector(ROOT_SELECTOR));
    return;
  }
  const tab = event.target?.closest?.('[data-sgw-phase]');
  if (tab) {
    selectPhase(tab.dataset.sgwPhase || 'preview');
    return;
  }
  const masterTab = event.target?.closest?.('[data-sgw-master-tab]');
  if (masterTab) {
    state().activeMaster = masterTab.dataset.sgwMasterTab || 'lineList';
    renderPopup();
    return;
  }
  const fillDown = event.target?.closest?.('[data-sgw-filldown-field]');
  if (fillDown) {
    event.preventDefault();
    applyPreviewFillDown(popupRoot(event) || document.querySelector(ROOT_SELECTOR), fillDown);
    return;
  }
  const action = event.target?.closest?.('[data-sgw-action]')?.dataset?.sgwAction;
  if (action) await handlePopupAction(action, event);
  const close = event.target?.closest?.('[data-sgw-close]');
  if (close) closePopup();
  const fullscreen = event.target?.closest?.('[data-sgw-fullscreen]');
  if (fullscreen) toggleFullscreen();
}

async function handlePopupAction(action, event) {
  const root = popupRoot(event) || document.querySelector(ROOT_SELECTOR);
  try {
    if (action === 'preview') runPreview(root);
    if (action === 'apply-common-overrides') applyCommonOverrides(root);
    if (action === 'run') runEnrichment(root);
    if (action === 'export') exportPackage(root);
    if (action === 'send') await sendPackage(root);
    if (action === 'save-config') saveConfigText(root);
    if (action === 'export-config') exportConfig();
  } catch (error) {
    setMessage(root, errorMessage(error), true);
  }
}

async function handleDocumentChange(event) {
  const input = event.target?.closest?.('[data-sgw-master], [data-sgw-control], [data-sgw-config-path], [data-sgw-import-config], [data-sgw-clear-master], [data-sgw-row-field]');
  if (!input) return;
  const root = popupRoot(event) || document.querySelector(ROOT_SELECTOR);
  try {
    if (input.dataset.sgwRowField) {
      updatePreviewRowOverride(root, input);
      return;
    }
    if (input.dataset.sgwMaster) {
      await readMasterInput(root, input);
      return;
    }
    if (input.dataset.sgwClearMaster) {
      clearMaster(root, input.dataset.sgwClearMaster);
      return;
    }
    if (input.dataset.sgwControl) {
      updateControl(root, input);
      return;
    }
    if (input.dataset.sgwConfigPath) {
      updateConfigPath(root, input);
      return;
    }
    if (input.dataset.sgwImportConfig !== undefined) {
      await importConfigFile(root, input);
    }
  } catch (error) {
    setMessage(root, errorMessage(error), true);
  }
}

function handleDocumentInput(event) {
  const textarea = event.target?.closest?.('[data-sgw-config-text]');
  if (!textarea) return;
  const current = state();
  current.configText = textarea.value;
  current.configStatus = 'Unsaved changes';
}

function updatePreviewRowOverride(root, input) {
  const rows = state().lastPreview?.branchRows || [];
  const row = rows[Number(input.dataset.sgwRowIndex || -1)] || null;
  if (!row) throw new Error('Preview row is no longer available. Refresh preview and retry.');
  applyOverrideToRows([row], input.dataset.sgwRowField, input.value);
  state().configText = null;
  runPreview(root);
}

function applyCommonOverrides(root) {
  const rows = state().lastPreview?.branchRows || [];
  if (!rows.length) throw new Error('No preview rows are available for common overrides.');
  const fields = state().popupEl?.querySelectorAll?.('[data-sgw-common-override-field]') || [];
  let changed = 0;
  fields.forEach((input) => {
    const value = text(input.value).trim();
    if (!value) return;
    applyOverrideToRows(rows, input.dataset.sgwCommonOverrideField, value);
    changed += 1;
  });
  if (!changed) {
    setMessage(root, 'No common override values entered.', false);
    return;
  }
  state().configText = null;
  runPreview(root);
}

function applyPreviewFillDown(root, button) {
  const rows = state().lastPreview?.branchRows || [];
  const field = button.dataset.sgwFilldownField;
  const fromIndex = Number(button.dataset.sgwFilldownFrom || -1);
  const sourceRow = rows[fromIndex] || null;
  if (!sourceRow || !field) throw new Error('Fill-down source row is no longer available.');
  const input = button.closest?.('.sgw-edit-cell')?.querySelector?.('[data-sgw-row-field]');
  const value = text(input?.value ?? sourceRow[field]).trim();
  if (!value) throw new Error(`Cannot fill down empty ${field}.`);
  applyOverrideToRows(rows.slice(fromIndex), field, value);
  state().configText = null;
  runPreview(root);
}

function applyOverrideToRows(rows, field, value) {
  const cleanField = text(field);
  const cleanValue = text(value).trim();
  if (!cleanField) return;
  const overrides = ensureOverrides();
  for (const row of rows || []) {
    if (!row) continue;
    if (['p1', 't1', 't2', 't3', 'density', 'rating'].includes(cleanField)) {
      setProcessOverride(overrides, row, cleanField, cleanValue);
      if (cleanField === 'rating') setFlatOverride(overrides, 'rating', rowOverrideKeys(row), cleanValue);
      continue;
    }
    if (cleanField === 'pipingClass') {
      setFlatOverride(overrides, 'pipingClass', [row.pipingClassDerived, row.pipingClass], cleanValue);
      continue;
    }
    if (cleanField === 'materialCode') {
      setFlatOverride(overrides, 'materialCode', rowOverrideKeys(row), cleanValue);
      continue;
    }
    if (cleanField === 'wallThickness' || cleanField === 'corrosion') {
      setFlatOverride(overrides, cleanField, rowOverrideKeys(row), cleanValue);
    }
  }
}

function ensureOverrides() {
  const current = state();
  const nextConfig = clonePlainObject(current.config);
  const currentOverrides = nextConfig.overrides && typeof nextConfig.overrides === 'object' && !Array.isArray(nextConfig.overrides)
    ? nextConfig.overrides
    : {};
  nextConfig.overrides = { ...currentOverrides };
  current.config = nextConfig;
  return nextConfig.overrides;
}

function setProcessOverride(overrides, row, field, value) {
  const keys = uniqueText([row.lineKey, row.branchName]);
  if (!keys.length) return;
  if (!overrides.processData || typeof overrides.processData !== 'object' || Array.isArray(overrides.processData)) overrides.processData = {};
  for (const key of keys) {
    const current = overrides.processData[key] && typeof overrides.processData[key] === 'object' && !Array.isArray(overrides.processData[key])
      ? { ...overrides.processData[key] }
      : {};
    if (value) current[field] = value;
    else delete current[field];
    if (Object.keys(current).length) overrides.processData[key] = current;
    else delete overrides.processData[key];
  }
}

function setFlatOverride(overrides, bucketName, keys, value) {
  const cleanKeys = uniqueText(keys);
  if (!cleanKeys.length) return;
  const bucket = overrides[bucketName] && typeof overrides[bucketName] === 'object' && !Array.isArray(overrides[bucketName])
    ? { ...overrides[bucketName] }
    : {};
  for (const key of cleanKeys) {
    if (value) bucket[key] = value;
    else delete bucket[key];
  }
  overrides[bucketName] = bucket;
}

function rowOverrideKeys(row) {
  return uniqueText([row?.lineKey, row?.branchName, row?.pipingClassDerived, row?.pipingClass, row?.material]);
}

function uniqueText(values) {
  return Array.from(new Set((values || []).map((value) => text(value).trim()).filter(Boolean)));
}

async function readMasterInput(root, input) {
  const file = input.files?.[0] || null;
  const kind = input.dataset.sgwMaster;
  if (!file) throw new Error(`No ${MASTER_LABELS[kind] || kind} file selected.`);
  const parsed = await parseSelectedGeometryMasterFile(file, kind);
  const current = state();
  current.masters[kind] = parsed.rows;
  current.masters[`${kind}Version`] = parsed.version || parsed.fileName;
  current.masterFiles[kind] = { fileName: parsed.fileName, format: parsed.format, rows: parsed.rows.length };
  setMessage(root, `${MASTER_LABELS[kind] || kind}: ${parsed.rows.length} rows loaded.`, false);
  runPreview(root);
}

function clearMaster(root, kind) {
  const current = state();
  if (!Object.prototype.hasOwnProperty.call(current.masters, kind)) return;
  current.masters[kind] = [];
  current.masters[`${kind}Version`] = '';
  delete current.masterFiles[kind];
  setMessage(root, `${MASTER_LABELS[kind] || kind} cleared.`, false);
  runPreview(root);
}

function updateControl(root, input) {
  const current = state();
  if (input.dataset.sgwControl === 'scope') {
    current.scopeMode = input.value;
    setMessage(root, `Scope set to ${input.value}.`, false);
    runPreview(root);
    return;
  }
  if (input.dataset.sgwControl === 'target-url') {
    current.targetUrl = input.value;
    writeTargetUrl(input.value);
    setMessage(root, 'Target URL updated.', false);
  }
}

function updateConfigPath(root, input) {
  const current = state();
  current.config = writePathValue(current.config, input.dataset.sgwConfigPath, input.type === 'number' ? Number(input.value) : input.value);
  current.configText = null;
  setMessage(root, 'Regex/config updated.', false);
  runPreview(root);
}

async function importConfigFile(root, input) {
  const file = input.files?.[0] || null;
  if (!file) return;
  const raw = await file.text();
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Config JSON must be an object.');
  const current = state();
  current.config = parsed;
  current.configText = null;
  current.configStatus = `Imported ${file.name}`;
  setMessage(root, `Imported config ${file.name}.`, false);
  runPreview(root);
}

function saveConfigText(root) {
  const current = state();
  const raw = current.configText !== null && current.configText !== undefined ? current.configText : '{}';
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Config JSON must be an object.');
  current.config = parsed;
  current.configText = null;
  current.configStatus = 'Saved';
  setMessage(root, 'Config saved.', false);
  runPreview(root);
}

function exportConfig() {
  const current = state();
  downloadText('selected-geometry-enrichment-config.json', JSON.stringify(current.config || {}, null, 2), 'application/json');
}

function openWorkflowPopup(root) {
  if (!root) return;
  const current = state();
  if (!current.popupEl) createPopup(root);
  current.popupEl.hidden = false;
  try { runPreview(root); } catch (error) { setMessage(root, errorMessage(error), true); }
  renderPopup();
}

function createPopup(root) {
  const current = state();
  const popup = document.createElement('div');
  popup.id = POPUP_ID;
  popup.className = 'sgw-popup';
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-modal', 'false');
  popup.setAttribute('aria-label', 'Selected Geometry Enrichment Workflow');
  popup.dataset.rootSelector = ROOT_SELECTOR;
  popup.innerHTML = `
    <div class="sgw-popup-head" data-sgw-drag-handle>
      <div>
        <div class="sgw-popup-title">Selected Geometry Enrichment</div>
        <div class="sgw-detail-text">Branch-driven XML-&gt;CII enrichment for selected RVM geometry.</div>
      </div>
      <div class="sgw-popup-actions">
        <button type="button" class="sgw-btn" data-sgw-action="preview">Refresh</button>
        <button type="button" class="sgw-btn" data-sgw-fullscreen="true">Fullscreen</button>
        <button type="button" class="sgw-btn" data-sgw-close="true">Close</button>
      </div>
    </div>
    <div class="sgw-tabs">
      ${SELECTED_GEOMETRY_WORKFLOW_PHASES.map((phase) => `<button type="button" class="sgw-phase" data-sgw-phase="${phase.id}"><span>${phase.label}</span></button>`).join('')}
    </div>
    <div class="sgw-popup-body" data-sgw-body></div>`;
  document.body.appendChild(popup);
  current.popupEl = popup;
  current.popupBodyEl = popup.querySelector('[data-sgw-body]');
  bindPopupDrag(popup);
  setInitialPopupPosition(popup, root);
}

function renderPopup() {
  const current = state();
  if (!current.popupEl || !current.popupBodyEl) return;
  const phaseId = normalizePhase(current.phaseId);
  current.phaseId = phaseId;
  current.popupEl.querySelectorAll('[data-sgw-phase]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.sgwPhase === phaseId);
  });
  current.popupBodyEl.innerHTML = renderSelectedGeometryWorkflowPhase(phaseId, snapshotForRender(), current);
}

function snapshotForRender() {
  const current = state();
  const config = buildSelectedGeometryWorkflowConfig({ masters: current.masters, config: current.config });
  return {
    rawConfig: current.config,
    config,
    targetUrl: current.targetUrl,
    scopeMode: current.scopeMode,
    message: current.lastError || current.lastMessage,
    masterCounts: masterCounts(current),
    masterFiles: current.masterFiles,
    masterPreviewRows: masterPreviewRows(current),
    sampleBranch: current.lastPreview?.branchRows?.[0]?.branchName || config.linelist?.sampleBranchName || '',
    preview: current.lastPreview,
  };
}

function runPreview(root) {
  const scope = buildScope(root);
  const current = state();
  current.lastScope = scope;
  current.lastPreview = buildSelectedGeometryBranchPreview({ scope, masters: current.masters, config: current.config });
  current.lastEnrichedScope = null;
  current.lastPackage = null;
  current.lastSummary = {
    objects: current.lastPreview.counts.objects,
    resolved: current.lastPreview.counts.resolved,
    conflicts: 0,
    missing: current.lastPreview.counts.diagnostics,
    diagnostics: current.lastPreview.diagnostics,
  };
  setMessage(root, `Preview captured ${current.lastPreview.counts.branches} branch(es) from ${current.lastPreview.counts.objects} object(s).`, false);
}

function runEnrichment(root) {
  const scope = buildScope(root);
  const enrichedScope = enrichSelectedGeometryScopeWithBranchWorkflow({ scope, masters: state().masters, config: state().config });
  const summary = summarizeEnrichmentObjects(enrichedScope.objects);
  const current = state();
  current.lastScope = scope;
  current.lastPreview = enrichedScope.branchWorkflowPreview;
  current.lastEnrichedScope = enrichedScope;
  current.lastPackage = null;
  current.lastSummary = summary;
  current.lastError = '';
  current.lastMessage = `Enriched ${summary.objects} object(s) across ${current.lastPreview.counts.branches} branch(es).`;
  applySelectedGeometryEnrichmentIndicators(root, enrichedScope);
  refreshSelectionDetails(root, {});
  renderPopup();
}

function exportPackage(root) {
  const packageJson = ensurePackage(root);
  const source = packageJson.source || {};
  const fileName = selectedGeometryWorkspacePackageFileName(source);
  downloadText(fileName, serializeSelectedGeometryWorkspacePackage(packageJson), 'application/json');
  setMessage(root, `Exported ${fileName}.`, false);
}

async function sendPackage(root) {
  const packageJson = ensurePackage(root);
  const targetUrl = resolveTargetUrl(state().targetUrl);
  const storageResult = writePendingWorkspacePackageToStorage(packageJson, globalThis.sessionStorage || null);
  const popup = globalThis.open?.(targetUrl.href, '_blank');
  if (!popup) throw new Error('Simplified Analysis window was not opened; export the JSON package instead.');
  postPackageToTarget(popup, targetUrl, packageJson);
  setMessage(root, `Package posted to Simplified Analysis. Storage ${storageResult.status} at ${PENDING_WORKSPACE_PACKAGE_STORAGE_KEY}.`, false);
  await Promise.resolve();
}

function ensurePackage(root) {
  const current = state();
  const enrichedScope = current.lastEnrichedScope || enrichSelectedGeometryScopeWithBranchWorkflow({ scope: buildScope(root), masters: current.masters, config: current.config });
  const packageJson = buildSelectedGeometryWorkspacePackage({
    scope: enrichedScope,
    objects: enrichedScope.objects,
    masters: current.masters,
    source: sourceInfo(root, enrichedScope),
    axisTransform: enrichedScope.axisTransform,
  });
  current.lastEnrichedScope = enrichedScope;
  current.lastPreview = enrichedScope.branchWorkflowPreview;
  current.lastSummary = summarizeEnrichmentObjects(enrichedScope.objects);
  current.lastPackage = packageJson;
  renderPopup();
  return packageJson;
}

function buildScope(root) {
  const currentViewer = viewer();
  if (!currentViewer?.modelGroup) throw new Error('No RVM model is loaded.');
  const scopeMode = state().scopeMode || 'selected';
  const scope = buildSelectedGeometryScope({
    hierarchy: hierarchyInputs(currentViewer),
    sourceObjects: [],
    selectedIds: selectedIds(currentViewer),
    visibleIds: visibleIds(currentViewer),
    hierarchyNodeId: activeHierarchyNodeId(root, currentViewer),
    scopeMode,
    axisTransform: axisTransform(currentViewer),
  });
  if (!scope.objects.length) throw new Error(`Scope "${scopeMode}" captured 0 objects.`);
  return scope;
}

function hierarchyInputs(currentViewer) {
  const inputs = [currentViewer.modelGroup];
  const model = currentViewer.modelGroup?.children?.[0] || null;
  const source = model?.userData?.__rvmNonPrimitiveSourceHierarchy
    || model?.userData?.__rvmNonPrimitiveAutoBendSourceHierarchy
    || currentViewer.modelGroup?.userData?.__rvmNonPrimitiveSourceHierarchy
    || null;
  if (source) inputs.push(source);
  return inputs;
}

function selectedIds(currentViewer) {
  const ids = new Set();
  for (const value of currentViewer.selection?.getSelectedCanonicalIds?.() || []) ids.add(String(value));
  for (const value of currentViewer.selection?.getSelectionRenderIds?.() || []) ids.add(String(value));
  for (const object of currentViewer._rvmCanvasSelectedMeshes || []) {
    for (const alias of objectAliases(object)) ids.add(alias);
  }
  return Array.from(ids).filter(Boolean);
}

function visibleIds(currentViewer) {
  const ids = new Set();
  currentViewer.modelGroup?.traverse?.((object) => {
    if (!(object?.isMesh || object?.isLine || object?.isPoints)) return;
    if (!isVisibleInTree(object)) return;
    for (const alias of objectAliases(object)) ids.add(alias);
  });
  return Array.from(ids).filter(Boolean);
}

function isVisibleInTree(object) {
  let current = object;
  while (current) {
    if (current.visible === false) return false;
    current = current.parent || null;
  }
  return true;
}

function activeHierarchyNodeId(root, currentViewer) {
  const selectedRow = root?.querySelector?.('#rvm-tree li.is-selected[data-node-id]');
  if (selectedRow?.dataset?.nodeId) return selectedRow.dataset.nodeId;
  const ids = selectedIds(currentViewer);
  return ids[0] || '';
}

function axisTransform(currentViewer) {
  return {
    verticalAxis: text(currentViewer._upAxis || 'Y') || 'Y',
    northAxis: 'Z',
    handedness: 'right',
  };
}

function sourceInfo(root, scope) {
  const currentViewer = viewer();
  const model = currentViewer?.modelGroup?.children?.[0] || null;
  const fileName = text(model?.userData?.fileName || model?.userData?.sourceFileName || root?.dataset?.rvmLoadedFileName || 'rvm-model');
  return {
    sourceModelName: text(model?.name || fileName || 'rvm-model'),
    sourceFileName: fileName,
    scopeMode: scope.scopeMode,
    capturedAt: scope.capturedAt,
  };
}

function refreshSelectionDetails(root, payload) {
  const selected = collectSelectedObjects(viewer(), payload);
  renderSelectedGeometryEnrichmentDetails(root, selected, state().lastEnrichedScope);
}

function scheduleSelectionRefresh(payload) {
  setTimeout(() => {
    const root = document.querySelector(ROOT_SELECTOR);
    if (!root) return;
    refreshSelectionDetails(root, payload);
    if (state().popupEl && !state().popupEl.hidden) {
      try { runPreview(root); } catch (error) { setMessage(root, errorMessage(error), true); }
    }
  }, 30);
}

function collectSelectedObjects(currentViewer, payload) {
  if (!currentViewer?.modelGroup) return [];
  const direct = Array.isArray(currentViewer._rvmCanvasSelectedMeshes) ? currentViewer._rvmCanvasSelectedMeshes.filter(isRenderable) : [];
  if (direct.length) return direct;
  const ids = new Set(selectedIdsFromPayload(currentViewer, payload));
  if (!ids.size) return [];
  const selected = [];
  currentViewer.modelGroup.traverse?.((object) => {
    if (!isRenderable(object)) return;
    if (objectAliases(object).some((alias) => ids.has(alias))) selected.push(object);
  });
  return selected;
}

function selectedIdsFromPayload(currentViewer, payload) {
  const values = [];
  const source = payload && typeof payload === 'object' ? payload : {};
  for (const value of [source.canonicalId, source.renderObjectId]) if (value) values.push(String(value));
  for (const value of source.canonicalIds || []) values.push(String(value));
  for (const value of source.renderObjectIds || []) values.push(String(value));
  for (const value of currentViewer.selection?.getSelectedCanonicalIds?.() || []) values.push(String(value));
  for (const value of currentViewer.selection?.getSelectionRenderIds?.() || []) values.push(String(value));
  return values;
}

function isRenderable(object) {
  return Boolean(object?.isMesh || object?.isLine || object?.isPoints);
}

function postPackageToTarget(popup, targetUrl, packageJson) {
  const payload = {
    type: RVM_SELECTED_GEOMETRY_POST_MESSAGE_TYPE,
    schema: RVM_SELECTED_GEOMETRY_WORKSPACE_PACKAGE_SCHEMA,
    packageJson,
  };
  for (const delay of [400, 900, 1500, 2500, 4000]) {
    setTimeout(() => popup.postMessage(payload, targetUrl.origin), delay);
  }
}

function bindPopupDrag(popup) {
  const handle = popup.querySelector('[data-sgw-drag-handle]');
  handle?.addEventListener('pointerdown', (event) => {
    if (event.target?.closest?.('button,input,select,textarea,label')) return;
    const rect = popup.getBoundingClientRect();
    state().drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top };
    handle.setPointerCapture?.(event.pointerId);
  });
  handle?.addEventListener('pointermove', (event) => {
    const drag = state().drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPopupPosition(popup, drag.left + event.clientX - drag.startX, drag.top + event.clientY - drag.startY);
  });
  handle?.addEventListener('pointerup', (event) => {
    if (state().drag?.pointerId === event.pointerId) state().drag = null;
  });
}

function setInitialPopupPosition(popup, root) {
  const rect = root?.getBoundingClientRect?.();
  const left = rect ? Math.max(16, rect.left + rect.width * 0.18) : 48;
  const top = rect ? Math.max(16, rect.top + 72) : 48;
  setPopupPosition(popup, left, top);
}

function setPopupPosition(popup, rawLeft, rawTop) {
  const width = popup.offsetWidth || 980;
  const height = popup.offsetHeight || 680;
  const left = Math.max(8, Math.min(rawLeft, window.innerWidth - Math.min(220, width)));
  const top = Math.max(8, Math.min(rawTop, window.innerHeight - Math.min(80, height)));
  popup.style.left = `${Math.round(left)}px`;
  popup.style.top = `${Math.round(top)}px`;
}

function closePopup() {
  const current = state();
  current.popupEl?.remove();
  current.popupEl = null;
  current.popupBodyEl = null;
}

function toggleFullscreen() {
  const popup = state().popupEl;
  if (!popup) return;
  popup.classList.toggle('is-fullscreen');
}

function selectPhase(phaseId) {
  const current = state();
  current.phaseId = normalizePhase(phaseId);
  writeStored(ACTIVE_PHASE_KEY, current.phaseId);
  renderPopup();
}

function normalizePhase(phaseId) {
  const id = text(phaseId);
  return SELECTED_GEOMETRY_WORKFLOW_PHASES.some((phase) => phase.id === id) ? id : 'preview';
}

function masterCounts(current) {
  return {
    lineList: current.masters.lineList.length,
    pipingClass: current.masters.pipingClass.length,
    materialMap: current.masters.materialMap.length,
    weightMaster: current.masters.weightMaster.length,
  };
}

function masterPreviewRows(current) {
  return {
    lineList: current.masters.lineList.slice(0, 25),
    pipingClass: current.masters.pipingClass.slice(0, 25),
    materialMap: current.masters.materialMap.slice(0, 25),
    weightMaster: current.masters.weightMaster.slice(0, 25),
  };
}

function popupRoot(event) {
  return event.target?.closest?.(`#${POPUP_ID}`) ? document.querySelector(ROOT_SELECTOR) : event.target?.closest?.(ROOT_SELECTOR);
}

function writePathValue(source, path, value) {
  const root = clonePlainObject(source);
  const parts = text(path).split('.').filter(Boolean);
  let cursor = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    const next = cursor[key];
    cursor[key] = next && typeof next === 'object' && !Array.isArray(next) ? { ...next } : {};
    cursor = cursor[key];
  }
  if (parts.length) cursor[parts[parts.length - 1]] = value;
  return root;
}

function clonePlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : {};
}

function downloadText(fileName, body, mimeType) {
  const url = URL.createObjectURL(new Blob([body], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function resolveTargetUrl(value) {
  return new URL(text(value) || DEFAULT_TARGET_URL, globalThis.location?.href || DEFAULT_TARGET_URL);
}

function readTargetUrl() {
  return text(globalThis.localStorage?.getItem?.('rvmSelectedGeometryWorkspaceTargetUrl')) || DEFAULT_TARGET_URL;
}

function writeTargetUrl(value) {
  globalThis.localStorage?.setItem?.('rvmSelectedGeometryWorkspaceTargetUrl', text(value));
}

function readStored(key, fallback) {
  try { return globalThis.localStorage?.getItem?.(key) || fallback; } catch { return fallback; }
}

function writeStored(key, value) {
  try { globalThis.localStorage?.setItem?.(key, value); } catch {}
}

function viewer() {
  return globalThis.__3D_RVM_VIEWER__ || null;
}

function setMessage(root, message, isError) {
  const current = state();
  current.lastError = isError ? message : '';
  current.lastMessage = message;
  renderPopup();
  const status = root?.querySelector?.('#rvm-sb-msg');
  if (status) status.textContent = message;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .rvm-selected-geometry-workflow-tool-group .rvm-tool-btn span:first-child{font-weight:800;font-size:12px}
    .sgw-popup{position:fixed;z-index:12150;width:min(1180px,calc(100vw - 32px));height:min(820px,calc(100vh - 32px));display:flex;flex-direction:column;resize:both;overflow:hidden;background:#0f1724;border:1px solid #2c3a4f;border-radius:8px;box-shadow:0 24px 70px rgba(0,0,0,.50);color:#dbeafe;font-family:system-ui,sans-serif}
    .sgw-popup.is-fullscreen{left:12px!important;top:12px!important;width:calc(100vw - 24px)!important;height:calc(100vh - 24px)!important;resize:none}
    .sgw-popup-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #2c3a4f;background:#111c2c;cursor:move;user-select:none}
    .sgw-popup-title{color:#d7e6ff;font-size:16px;font-weight:750}.sgw-popup-actions{display:flex;gap:8px;flex-wrap:wrap}.sgw-tabs{display:flex;flex-wrap:wrap;gap:4px;padding:8px 14px 0;border-bottom:1px solid #243247}
    .sgw-phase{display:flex;gap:8px;align-items:center;min-height:32px;padding:4px 12px;border:1px solid #31455f;border-radius:8px 8px 0 0;background:#182334;color:#e6edf5;font-size:12px;cursor:pointer}.sgw-phase.is-active{border-color:#67a8ff;background:#1d3554}
    .sgw-popup-body{flex:1;min-height:0;overflow:auto;padding:12px 14px 14px}.sgw-card{margin-top:10px;padding:10px;background:#0b1420;border:1px solid #28405e;border-radius:6px}.sgw-card-head,.sgw-phase-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:8px}
    .sgw-detail-title{color:#d7e6ff;font-weight:750;margin-bottom:5px}.sgw-detail-text,.sgw-detail-note,.sgw-hint,.sgw-status-text,.sgw-count{color:#9aa8ba;font-size:12px;line-height:1.4}.sgw-section-title{color:#9cc5ff;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px}
    .sgw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.sgw-grid-wide{grid-template-columns:minmax(320px,1fr) minmax(120px,160px) minmax(120px,180px)}.sgw-field{display:flex;flex-direction:column;gap:5px;min-width:0;color:#d7e6ff;font-size:12px;font-weight:650}.sgw-scope-field{max-width:180px}
    .sgw-field input,.sgw-field select,.sgw-config-editor{width:100%;box-sizing:border-box;background:#172336;color:#e6edf5;border:1px solid #385678;border-radius:6px;padding:7px 9px;font:inherit}.sgw-field strong{color:#fff;font-size:13px}
    .sgw-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:10px}.sgw-btn,.sgw-run-btn{min-height:32px;padding:7px 10px;border:1px solid #385678;border-radius:6px;background:#172336;color:#e6edf5;cursor:pointer;font-size:12px}.sgw-run-btn{background:#1d4ed8;border-color:#60a5fa;color:#fff}.sgw-btn:hover,.sgw-run-btn:hover{filter:brightness(1.12)}.sgw-file-btn{display:inline-flex;align-items:center}
    .sgw-master-tabs{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:10px 0}.sgw-master-tab{display:flex;flex-direction:column;gap:4px;min-height:48px;padding:8px 10px;text-align:left;background:#152236;color:#e6edf5;border:1px solid #345171;border-radius:6px;cursor:pointer}.sgw-master-tab.is-active{background:#1f3d63;border-color:#69a9ff}.sgw-master-tab span{font-weight:750}.sgw-master-tab small{color:#9aa8ba}
    .sgw-workflow-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,34%);gap:12px;align-items:start;min-height:0}.sgw-workflow-main{min-width:0}.sgw-preview-side{position:sticky;top:0;align-self:start;min-width:0;max-height:calc(100vh - 220px);overflow:auto;padding:10px;background:#09121d;border:1px solid #28405e;border-radius:6px}.sgw-preview-side .sgw-table{min-width:560px}.sgw-common-overrides{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-top:10px}.sgw-editable-preview-table{min-width:1280px}.sgw-edit-cell{display:flex;align-items:center;gap:5px;min-width:105px}.sgw-edit-cell input{width:82px;min-width:0;box-sizing:border-box;background:#111f31;color:#f0f7ff;border:1px solid #385678;border-radius:5px;padding:5px 6px;font:inherit}.sgw-edit-cell.is-override input{border-color:#4ade80;box-shadow:inset 3px 0 0 #22c55e}.sgw-edit-cell.is-missing input{border-color:#f59e0b;box-shadow:inset 3px 0 0 #f59e0b}.sgw-fill-btn{min-height:26px;padding:3px 6px;border:1px solid #35506f;border-radius:5px;background:#142235;color:#cfe1f8;cursor:pointer;font-size:10px}.sgw-fill-btn:hover{border-color:#60a5fa;background:#1e3a5f}
    .sgw-status-list{display:grid;gap:0}.sgw-status-row{display:grid;grid-template-columns:54px minmax(180px,1fr) auto;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid #1d2e44;color:#c8d6e8;font-size:12px}.sgw-status-row:last-child{border-bottom:0}.sgw-status-icon{display:inline-flex;align-items:center;justify-content:center;min-width:42px;padding:2px 5px;border-radius:999px;font-size:10px;font-weight:800}.sgw-status-row.is-ok .sgw-status-icon{color:#bdf7cf;background:#123c25;border:1px solid #2f9e63}.sgw-status-row.is-warn .sgw-status-icon{color:#ffe0a3;background:#4a2d12;border:1px solid #d08a22}.sgw-status-row strong{color:#f4f8ff;white-space:nowrap}
    .sgw-table-wrap{overflow:auto;max-height:min(52vh,520px);border:1px solid #243a55;border-radius:6px}.sgw-table{width:100%;min-width:980px;border-collapse:collapse;font-size:12px}.sgw-table th,.sgw-table td{padding:7px 8px;border-bottom:1px solid #1d2e44;color:#d7e6ff;text-align:left;white-space:nowrap}.sgw-table th{position:sticky;top:0;z-index:1;background:#111c2c;color:#9cc5ff;font-size:11px;text-transform:uppercase}.sgw-table tr:hover td{background:#142035}.sgw-badge{display:inline-flex;margin-left:4px;padding:2px 6px;border-radius:999px;font-size:10px;font-weight:800}.sgw-badge.is-ok{color:#bbf7d0;background:#14532d}.sgw-badge.is-warn{color:#fed7aa;background:#7c2d12}
    .sgw-details{margin-top:8px}.sgw-details>summary{cursor:pointer;color:#9cc5ff;font-size:12px;font-weight:750}.sgw-config-editor{display:block;min-height:360px;max-height:56vh;margin-top:10px;resize:vertical;font-family:Consolas,Monaco,monospace;font-size:12px;line-height:1.35}
    .rvm-selected-geometry-details-card{display:grid;gap:7px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(126,190,255,.14)}.rvm-selected-geometry-details-title{display:flex;align-items:center;justify-content:space-between;gap:8px;color:#93c5fd;font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:.04em}.rvm-selected-geometry-details-title small{font-size:8.5px;color:#7f94b7;text-transform:none;font-weight:600;letter-spacing:0}
    .rvm-selected-geometry-detail-grid{display:grid;gap:3px}.rvm-selected-geometry-detail-row{display:grid;grid-template-columns:minmax(84px,.72fr) minmax(0,1.28fr);gap:6px;align-items:start;padding:4px 6px;border:1px solid rgba(126,190,255,.12);border-radius:5px;background:rgba(255,255,255,.026);font-size:10px}.rvm-selected-geometry-detail-row span{color:#9eb7d8}.rvm-selected-geometry-detail-row b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#edf6ff;font-weight:650}
    .rvm-selected-geometry-status-row{display:grid;gap:2px;padding:6px;border:1px solid rgba(126,190,255,.18);border-radius:6px;background:rgba(15,23,42,.74);font-size:10.5px}.rvm-selected-geometry-status-row.is-resolved{border-color:rgba(74,222,128,.32)}.rvm-selected-geometry-status-row.is-review{border-color:rgba(251,191,36,.36)}.rvm-selected-geometry-status-row.is-conflict{border-color:rgba(248,113,113,.42)}.rvm-selected-geometry-footer{color:#91a1ba;font-size:10px;line-height:1.35}
    #rvm-tree li.has-selected-geometry-enrichment>.rvm-tree-node{position:relative;border-left:3px solid rgba(148,163,184,.32)}#rvm-tree li.has-selected-geometry-enrichment.is-resolved>.rvm-tree-node{border-left-color:#4ade80}#rvm-tree li.has-selected-geometry-enrichment.is-review>.rvm-tree-node{border-left-color:#fbbf24}#rvm-tree li.has-selected-geometry-enrichment.is-conflict>.rvm-tree-node{border-left-color:#f87171}.rvm-selected-geometry-tree-badge{margin-left:auto;padding:1px 4px;border:1px solid rgba(148,163,184,.25);border-radius:999px;color:#cbd5e1;background:rgba(15,23,42,.72);font-size:9px;line-height:1.2}
    @media(max-width:980px){.sgw-workflow-layout{grid-template-columns:1fr}.sgw-preview-side{position:relative;max-height:280px}}
    @media(max-width:760px){.sgw-popup{left:8px!important;top:8px!important;width:calc(100vw - 16px)!important;height:calc(100vh - 16px)!important}.sgw-grid-wide{grid-template-columns:1fr}.sgw-status-row{grid-template-columns:48px minmax(0,1fr)}.sgw-status-row strong{grid-column:2}.sgw-popup-head{align-items:stretch;flex-direction:column}.sgw-popup-actions{justify-content:flex-start}}
  `;
  document.head.appendChild(style);
}
