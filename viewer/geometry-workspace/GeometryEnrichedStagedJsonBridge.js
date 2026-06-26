import { buildGeometryEnrichedStagedJson, downloadGeometryEnrichedStagedJson, GEOMETRY_ENRICHED_STAGEDJSON_SCHEMA, GEOMETRY_ENRICHED_STAGEDJSON_VERSION } from './GeometryEnrichedStagedJsonExporter.js?v=20260622-geometry-enriched-stagedjson-support-loads-1';

const INSTALL_FLAG = Symbol.for('pcf-glb-geometry-enriched-stagedjson-bridge-v2');
let lastPayload = null;

function workspaceApi() {
  return globalThis.__PCF_GLB_GEOMETRY_EXPORT_WORKSPACE__ || null;
}

function workspaceState() {
  return workspaceApi()?.state?.() || {};
}

function activeIds(state) {
  return state.activeObjectIds instanceof Set ? state.activeObjectIds : new Set(state.activeObjectIds || []);
}

function objectId(object) {
  return String(object?.sourceId || object?.id || object?.canonicalId || object?.displayName || '').trim();
}

function selectedSource(state) {
  if (Array.isArray(state.supportLoadCalculatedObjects) && state.supportLoadCalculatedObjects.length) {
    return { sourceMode: 'geometry-workspace-support-load-calculated-objects', objects: state.supportLoadCalculatedObjects };
  }
  if (Array.isArray(state.supportLoadHydratedObjects) && state.supportLoadHydratedObjects.length) {
    return { sourceMode: 'geometry-workspace-support-load-hydrated-objects', objects: state.supportLoadHydratedObjects };
  }
  const enriched = Array.isArray(state.geometryEnrichedObjects) && state.geometryEnrichedObjects.length
    ? state.geometryEnrichedObjects
    : (Array.isArray(state.calculationResolvedObjects) ? state.calculationResolvedObjects : []);
  const mapped = Array.isArray(state.mapping?.mappedObjects) ? state.mapping.mappedObjects : [];
  return { sourceMode: enriched.length ? 'geometry-workspace-active-enriched-objects' : 'geometry-workspace-active-mapped-objects', objects: enriched.length ? enriched : mapped };
}

function candidateObjects() {
  const state = workspaceState();
  const active = activeIds(state);
  const selected = selectedSource(state);
  const source = selected.objects || [];
  const objects = active.size ? source.filter((object) => active.has(object.sourceId || object.id) || active.has(objectId(object))) : source;
  return { sourceMode: selected.sourceMode, objects };
}

function buildPayload() {
  const state = workspaceState();
  const candidate = candidateObjects();
  lastPayload = buildGeometryEnrichedStagedJson(candidate.objects, {
    sourceMode: candidate.sourceMode,
    masterSummary: state.enrichment?.resolution?.masterSummary || {},
    formulaResults: state.supportLoadFormulaResults || null,
    inputModelSummary: state.supportLoadInputModel ? {
      pipeInputCount: state.supportLoadInputModel.pipeInputCount,
      calcReadyPipeInputCount: state.supportLoadInputModel.calcReadyPipeInputCount,
      supportRefCount: state.supportLoadInputModel.supportRefCount,
    } : null,
  });
  if (state && typeof state === 'object') {
    state.enrichedStagedJson = lastPayload;
  }
  return lastPayload;
}

function exportPayload() {
  const payload = buildPayload();
  const hasSupportLoads = payload?.policies?.supportLoadFormulaApplied || payload?.source?.supportLoadInputCount;
  downloadGeometryEnrichedStagedJson(payload, hasSupportLoads ? 'geometry-enriched-stagedjson-support-loads.json' : 'geometry-enriched-stagedjson.json');
  return payload;
}

function injectToolbar(root) {
  const section = root?.querySelector?.('.geometry-export-workspace-tool-group');
  if (!section || section.querySelector('[data-geometry-enriched-stagedjson-export]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'rvm-tool-btn';
  button.dataset.geometryEnrichedStagedjsonExport = 'true';
  button.title = 'Export active Geometry Workspace records as enriched stagedJSON with enrichment, support-load input, and calculated support-load audit fields';
  button.innerHTML = '<span aria-hidden="true">EXPORT</span><span>StagedJSON</span>';
  section.querySelector('.rvm-ribbon-button-row')?.appendChild(button);
}

function attach() {
  const root = document.querySelector('[data-rvm-viewer]');
  if (!root) return false;
  injectToolbar(root);
  return true;
}

function onDocumentClick(event) {
  if (!event.target?.closest?.('[data-geometry-enriched-stagedjson-export]')) return;
  event.preventDefault();
  event.stopPropagation();
  const payload = exportPayload();
  const status = document.querySelector('[data-rvm-viewer] #rvm-sb-msg');
  if (status) status.textContent = `Enriched stagedJSON exported: ${payload.source.objectCount} object(s), ${payload.source.enrichedCount} enriched, ${payload.source.supportLoadCalculatedCount} support-load result(s).`;
}

export function installGeometryEnrichedStagedJsonBridge() {
  if (typeof document === 'undefined') return;
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;
  document.addEventListener('click', onDocumentClick, true);
  let attempts = 0;
  const waitAttach = () => { attempts += 1; if (!attach() && attempts < 180) setTimeout(waitAttach, 300); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitAttach, { once: true });
  else waitAttach();
  globalThis.addEventListener?.('rvm-model-loaded', () => setTimeout(waitAttach, 320));
  globalThis.__PCF_GLB_GEOMETRY_ENRICHED_STAGEDJSON__ = {
    version: GEOMETRY_ENRICHED_STAGEDJSON_VERSION,
    schema: GEOMETRY_ENRICHED_STAGEDJSON_SCHEMA,
    build: buildPayload,
    export: exportPayload,
    lastPayload: () => lastPayload,
  };
}
