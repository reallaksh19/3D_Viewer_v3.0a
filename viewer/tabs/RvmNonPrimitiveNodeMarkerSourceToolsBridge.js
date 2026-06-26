export const RVM_NON_PRIMITIVE_NODE_MARKER_SOURCE_TOOLS_SCHEMA = 'rvm-non-primitive-node-marker-source-tools/v1';

const GLOBAL_KEY = '__PCF_GLB_RVM_NON_PRIMITIVE_NODE_MARKER_SOURCE_TOOLS__';
const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-non-primitive-node-marker-source-tools-v1');
const PANEL_SELECTOR = '#rvm-nonprimitive-source-tools-panel';

export function installRvmNonPrimitiveNodeMarkerSourceToolsBridge() {
  if (globalThis[INSTALL_FLAG] && globalThis[GLOBAL_KEY]) return globalThis[GLOBAL_KEY];
  globalThis[INSTALL_FLAG] = true;
  const api = {
    schema: RVM_NON_PRIMITIVE_NODE_MARKER_SOURCE_TOOLS_SCHEMA,
    sync,
    clear,
    copyXmlCiiCsv,
    downloadXmlCiiCsv,
    copyDiagnosticsJson,
    downloadDiagnosticsJson,
    rebuild,
  };
  globalThis[GLOBAL_KEY] = api;
  return api;
}

export function sync(viewer = globalThis.__3D_RVM_VIEWER__) {
  const panel = globalThis.document?.querySelector?.(PANEL_SELECTOR);
  if (!panel || panel.hidden) return { status: 'skipped', reason: 'source-tools-panel-missing' };
  const grid = panel.querySelector('[data-source-tools-layout]') || panel;
  const section = ensureSection(grid);
  section.innerHTML = renderNodeMarkerSection(viewer);
  bindNodeMarkerControls(section, viewer);
  return { status: 'synced', markerCount: getMarkerCount(viewer) };
}

export function clear(viewer = globalThis.__3D_RVM_VIEWER__, reason = 'clear-node-marker-source-tools') {
  const section = globalThis.document?.querySelector?.('[data-rvm-node-marker-source-tools]');
  section?.remove?.();
  if (viewer) viewer.nonPrimitiveNodeMarkerSourceToolsStatus = { schema: RVM_NON_PRIMITIVE_NODE_MARKER_SOURCE_TOOLS_SCHEMA, status: 'cleared', reason };
  return { status: 'cleared', reason };
}

export function rebuild(viewer = globalThis.__3D_RVM_VIEWER__, reason = 'source-tools-node-marker-rebuild') {
  const result = globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_NODE_MARKERS__?.rebuild?.(viewer, reason) || null;
  sync(viewer);
  return result || { status: 'skipped', reason: 'node-marker-bridge-missing' };
}

export async function copyXmlCiiCsv(viewer = globalThis.__3D_RVM_VIEWER__) {
  const text = ensureFreshCsv(viewer);
  return copyText(text, 'xml-cii-csv');
}

export function downloadXmlCiiCsv(viewer = globalThis.__3D_RVM_VIEWER__) {
  const text = ensureFreshCsv(viewer);
  return downloadText(text, nodeMarkerFileName(viewer, 'xml-cii-tables.csv'), 'text/csv');
}

export async function copyDiagnosticsJson(viewer = globalThis.__3D_RVM_VIEWER__) {
  const text = JSON.stringify(buildDiagnosticsPayload(viewer), null, 2);
  return copyText(text, 'node-marker-diagnostics');
}

export function downloadDiagnosticsJson(viewer = globalThis.__3D_RVM_VIEWER__) {
  const text = JSON.stringify(buildDiagnosticsPayload(viewer), null, 2);
  return downloadText(text, nodeMarkerFileName(viewer, 'diagnostics.json'), 'application/json');
}

function ensureSection(grid) {
  let section = grid.querySelector('[data-rvm-node-marker-source-tools]');
  if (section) return section;
  section = globalThis.document.createElement('section');
  section.className = 'rvm-source-tools-group';
  section.dataset.sourceToolsGroup = 'node-markers';
  section.dataset.rvmNodeMarkerSourceTools = 'true';
  const diagnosticsActions = grid.querySelector('[data-source-tool-actions="diagnostics"]');
  if (diagnosticsActions) grid.insertBefore(section, diagnosticsActions);
  else grid.appendChild(section);
  return section;
}

function renderNodeMarkerSection(viewer) {
  const diag = globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_NODE_MARKERS__?.getDiagnostics?.(viewer) || viewer?.nonPrimitiveNodeMarkerDiagnostics || {};
  const stale = globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_NODE_MARKERS__?.getStaleStatus?.(viewer) || { status: 'blocked' };
  const count = getMarkerCount(viewer);
  const exportStatus = viewer?.nonPrimitiveNodeMarkerExportStatus || 'blocked';
  const warn = stale.status === 'stale' || exportStatus === 'blocked';
  return `
    <div class="rvm-source-tools-group-title"><span>Node Markers</span><strong class="rvm-source-tools-badge ${warn ? 'is-warn' : ''}" data-node-marker-badge>${escapeHtml(count)} node</strong></div>
    <label class="rvm-source-tools-row"><span>Enable</span><input type="checkbox" data-node-marker-tool="enable" checked></label>
    <label class="rvm-source-tools-row"><span>Labels</span><input type="checkbox" data-node-marker-tool="labels"></label>
    <div class="rvm-source-tools-actions" data-node-marker-actions>
      <button type="button" data-node-marker-action="rebuild">Rebuild</button>
      <button type="button" data-node-marker-action="copy-csv">Copy XML-CII CSV</button>
      <button type="button" data-node-marker-action="download-csv">Download XML-CII CSV</button>
      <button type="button" data-node-marker-action="copy-diagnostics">Copy diagnostics JSON</button>
      <button type="button" data-node-marker-action="download-diagnostics">Download diagnostics JSON</button>
    </div>
    <div class="rvm-source-tools-diag" data-node-marker-diag>Markers: ${escapeHtml(count)} · Export: ${escapeHtml(exportStatus)} · Stale: ${escapeHtml(stale.status || 'unknown')} · ${escapeHtml(diag.sourceSubKind || 'unknown')}</div>`;
}

function bindNodeMarkerControls(section, viewer) {
  if (section.dataset.nodeMarkerControlsBound === 'true') return;
  section.dataset.nodeMarkerControlsBound = 'true';
  section.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-node-marker-action]');
    if (!button) return;
    event.preventDefault();
    const activeViewer = viewer || globalThis.__3D_RVM_VIEWER__;
    const action = button.dataset.nodeMarkerAction;
    if (action === 'rebuild') rebuild(activeViewer);
    else if (action === 'copy-csv') copyXmlCiiCsv(activeViewer).catch?.(() => {});
    else if (action === 'download-csv') downloadXmlCiiCsv(activeViewer);
    else if (action === 'copy-diagnostics') copyDiagnosticsJson(activeViewer).catch?.(() => {});
    else if (action === 'download-diagnostics') downloadDiagnosticsJson(activeViewer);
  });
}

function ensureFreshCsv(viewer) {
  const stale = globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_NODE_MARKERS__?.getStaleStatus?.(viewer) || { status: 'blocked' };
  if (stale.status === 'stale' || stale.status === 'blocked') rebuild(viewer, stale.status === 'stale' ? 'stale-before-export' : 'blocked-before-export');
  return globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_NODE_MARKERS__?.getCsv?.(viewer) || '';
}

function buildDiagnosticsPayload(viewer) {
  return {
    schema: 'non-primitive-node-marker-source-tools-diagnostics/v1',
    nodeMarkers: globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_NODE_MARKERS__?.getDiagnostics?.(viewer) || viewer?.nonPrimitiveNodeMarkerDiagnostics || null,
    stale: globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_NODE_MARKERS__?.getStaleStatus?.(viewer) || null,
    markerCount: getMarkerCount(viewer),
  };
}

function getMarkerCount(viewer) {
  return Number(globalThis.__PCF_GLB_RVM_NON_PRIMITIVE_NODE_MARKERS__?.getMarkers?.(viewer)?.length ?? viewer?.nonPrimitiveNodeMarkers?.length ?? 0) || 0;
}

async function copyText(text, kind) {
  if (globalThis.navigator?.clipboard?.writeText) {
    await globalThis.navigator.clipboard.writeText(text);
    return { status: 'copied', kind, bytes: text.length };
  }
  return { status: 'unavailable', reason: 'clipboard-api-missing', kind, bytes: text.length };
}

function downloadText(text, fileName, mimeType) {
  const doc = globalThis.document;
  const BlobCtor = globalThis.Blob;
  const URLApi = globalThis.URL;
  if (!doc?.createElement || !BlobCtor || !URLApi?.createObjectURL) return { status: 'unavailable', reason: 'download-api-missing', bytes: text.length };
  const url = URLApi.createObjectURL(new BlobCtor([text], { type: mimeType }));
  const link = doc.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  doc.body?.appendChild?.(link);
  link.click?.();
  link.remove?.();
  setTimeout(() => URLApi.revokeObjectURL?.(url), 0);
  return { status: 'downloaded', fileName, bytes: text.length };
}

function nodeMarkerFileName(viewer, suffix) {
  const file = viewer?.modelGroup?.userData?.fileName || viewer?.scene?.userData?.fileName || 'source-preview';
  return `${String(file).replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '_')}-node-markers-${suffix}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
