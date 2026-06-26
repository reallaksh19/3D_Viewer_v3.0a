import { buildRenderedGeometrySnapshot, buildRenderedGeometrySnapshotSummary } from './RenderedGeometrySnapshotBuilder.js?v=20260622-geometry-workspace-1';
import { discoverRenderedGeometryFields, selectDefaultTableFields, valueAtPath } from './RenderedGeometryFieldDiscovery.js?v=20260622-geometry-workspace-1';
import { buildGeometryImportHierarchy, flattenGeometryImportHierarchy, collectObjectIdsForHierarchyPaths, countCheckedHierarchyObjects } from './GeometryImportHierarchyModel.js?v=20260622-geometry-import-tree-1';
import { mapRenderedGeometryRecords } from './GeometryMappingEngine.js?v=20260622-geometry-mapping-1';

const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-geometry-export-workspace-v1');
const BRIDGE_VERSION = '20260622-geometry-mapping-1';
const MAX_TABLE_ROWS = 300;
const MAX_HIERARCHY_DEPTH = 5;
const MAX_HIERARCHY_ROWS = 500;
const MAX_MAPPED_ROWS = 300;

let workspaceState = {
  schemaVersion: 'geometry-export-workspace/v1',
  import: null,
  snapshot: null,
  summary: null,
  fieldDiscovery: null,
  hierarchyTree: null,
  mapping: null,
  checkedHierarchyPaths: new Set(),
  expandedHierarchyPaths: new Set(['__ROOT__']),
  activeObjectIds: new Set(),
  hierarchySearch: '',
};

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function rootEl() {
  return typeof document === 'undefined' ? null : document.querySelector('[data-rvm-viewer]');
}

function setStatus(text, warning = false) {
  const el = rootEl()?.querySelector?.('#rvm-sb-msg');
  if (!el) return;
  el.textContent = text;
  el.style.color = warning ? '#ffcf70' : '';
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function currentDialog() {
  return document.getElementById('geometry-export-workspace-dialog');
}

function activeScope(dialog = currentDialog()) {
  return dialog?.querySelector?.('[data-gew-import-scope]')?.value || 'visible';
}

function allRecordIds(snapshot) {
  return new Set(ensureArray(snapshot?.records).map((record) => record.id).filter(Boolean));
}

function getActiveRecords() {
  const records = ensureArray(workspaceState.snapshot?.records);
  const active = workspaceState.activeObjectIds;
  if (!(active instanceof Set) || !active.size) return [];
  return records.filter((record) => active.has(record.id));
}

function getActiveMappedObjects() {
  const active = workspaceState.activeObjectIds;
  return ensureArray(workspaceState.mapping?.mappedObjects).filter((object) => active.has(object.sourceId || object.id));
}

function selectedTreeObjectIds() {
  return collectObjectIdsForHierarchyPaths(workspaceState.hierarchyTree, workspaceState.checkedHierarchyPaths);
}

function rebuildMapping(records = ensureArray(workspaceState.snapshot?.records)) {
  workspaceState.mapping = mapRenderedGeometryRecords(records);
  return workspaceState.mapping;
}

function importSnapshot(scope = 'visible') {
  const snapshot = buildRenderedGeometrySnapshot({ scope });
  const summary = buildRenderedGeometrySnapshotSummary(snapshot);
  const fieldDiscovery = discoverRenderedGeometryFields(snapshot);
  const hierarchyTree = buildGeometryImportHierarchy(snapshot.records, {
    maxDepth: MAX_HIERARCHY_DEPTH,
    rootName: snapshot.modelName || 'Rendered Geometry'
  });
  const mapping = mapRenderedGeometryRecords(snapshot.records);
  workspaceState = {
    schemaVersion: 'geometry-export-workspace/v1',
    import: {
      source: `current-${scope}-rendered-objects`,
      importedAt: snapshot.generatedAt,
      objectCount: snapshot.recordCount,
      scanned: snapshot.scanned,
      capped: snapshot.capped
    },
    snapshot,
    summary,
    fieldDiscovery,
    hierarchyTree,
    mapping,
    checkedHierarchyPaths: new Set(),
    expandedHierarchyPaths: new Set(['__ROOT__']),
    activeObjectIds: allRecordIds(snapshot),
    hierarchySearch: '',
  };
  renderWorkspace();
  setStatus(`Geometry Workspace: imported ${snapshot.recordCount}${snapshot.capped ? '+' : ''} ${scope} rendered object(s); auto-mapped ${mapping.mappedCount}.`, snapshot.capped);
  return workspaceState;
}

function renderSummary() {
  const state = workspaceState;
  const summary = state.summary;
  const fieldDiscovery = state.fieldDiscovery;
  const mapping = state.mapping;
  if (!summary) return '<div class="gew-empty">No geometry imported yet. Choose Selected, Visible, or Full rendered model.</div>';
  const activeCount = getActiveRecords().length;
  const activeMapped = getActiveMappedObjects();
  const checkedCount = countCheckedHierarchyObjects(state.hierarchyTree, state.checkedHierarchyPaths);
  const topClasses = Object.entries(summary.byClass || {}).slice(0, 8).map(([key, value]) => `<span>${esc(key)} <b>${value}</b></span>`).join('');
  return `
    <div class="gew-summary-grid">
      <div><b>${summary.recordCount}${summary.capped ? '+' : ''}</b><span>objects</span></div>
      <div><b>${activeCount}</b><span>active import list</span></div>
      <div><b>${fieldDiscovery?.fieldCount || 0}</b><span>dynamic fields</span></div>
      <div><b>${mapping?.mappedCount || 0}</b><span>auto-mapped</span></div>
      <div><b>${mapping?.summary?.supportCount || 0}</b><span>support candidates</span></div>
      <div><b>${mapping?.summary?.pipeCount || 0}</b><span>pipe candidates</span></div>
      <div><b>${checkedCount}</b><span>checked tree objects</span></div>
      <div><b>${activeMapped.length}</b><span>mapped active rows</span></div>
    </div>
    <div class="gew-class-chips">${topClasses || '<span>No class summary</span>'}</div>`;
}

function nodeCheckedState(node) {
  return workspaceState.checkedHierarchyPaths.has(node.path) ? 'checked' : '';
}

function nodeActiveState(node) {
  const active = workspaceState.activeObjectIds;
  const ids = ensureArray(node.objectIds);
  if (!ids.length || !(active instanceof Set) || !active.size) return '';
  const activeCount = ids.reduce((count, id) => count + (active.has(id) ? 1 : 0), 0);
  if (activeCount === ids.length) return 'all-active';
  if (activeCount > 0) return 'part-active';
  return '';
}

function renderHierarchy() {
  const tree = workspaceState.hierarchyTree;
  if (!tree) return '<div class="gew-empty">Import geometry to build hierarchy.</div>';
  const rows = flattenGeometryImportHierarchy(tree, {
    search: workspaceState.hierarchySearch,
    expandedPaths: workspaceState.expandedHierarchyPaths,
    maxRows: MAX_HIERARCHY_ROWS
  });
  if (!rows.length) return '<div class="gew-empty">No hierarchy paths found.</div>';
  const checkedCount = countCheckedHierarchyObjects(tree, workspaceState.checkedHierarchyPaths);
  const activeCount = getActiveRecords().length;
  return `
    <div class="gew-hierarchy-toolbar">
      <input type="search" data-gew-hierarchy-search value="${esc(workspaceState.hierarchySearch)}" placeholder="Search top-5 hierarchy...">
      <button type="button" data-gew-tree-use-checked="true">Use Checked</button>
      <button type="button" data-gew-tree-add-checked="true">Add</button>
      <button type="button" data-gew-tree-remove-checked="true">Remove</button>
      <button type="button" data-gew-tree-all="true">All</button>
      <button type="button" data-gew-tree-clear="true">Clear</button>
    </div>
    <div class="gew-hierarchy-status">${checkedCount} checked object(s) · ${activeCount} active object(s) · ${tree.nodeCount} tree node(s)</div>
    <div class="gew-hierarchy-list">${rows.map((row) => {
      const hasChildren = Number(row.childCount) > 0;
      const expanded = row.path === '__ROOT__' || workspaceState.expandedHierarchyPaths.has(row.path) || workspaceState.hierarchySearch;
      const activeState = nodeActiveState(row);
      return `<div class="gew-hrow ${activeState}" style="--indent:${Math.max(0, row.level - 1)}" data-gew-hrow="${esc(row.path)}">
        <button type="button" class="gew-hrow-toggle" data-gew-toggle-path="${esc(row.path)}" ${hasChildren ? '' : 'disabled'}>${hasChildren ? (expanded ? '-' : '+') : '·'}</button>
        <input type="checkbox" data-gew-hpath="${esc(row.path)}" ${nodeCheckedState(row)} aria-label="Check hierarchy node ${esc(row.name)}">
        <span title="${esc(row.path)}">${esc(row.name || row.path)}</span>
        <b>${row.count}</b>
      </div>`;
    }).join('')}</div>`;
}

function renderFieldDiscovery() {
  const fields = ensureArray(workspaceState.fieldDiscovery?.fieldSet).slice(0, 80);
  if (!fields.length) return '<div class="gew-empty">No field discovery yet.</div>';
  return `<div class="gew-field-list">${fields.map((field) => `
    <div class="gew-field-row">
      <b>${esc(field.path)}</b>
      <span>${esc(field.inferredType)} · seen ${field.seenCount} · confidence ${field.confidence}</span>
      <small>${esc(ensureArray(field.sampleValues).join(' | '))}</small>
    </div>`).join('')}</div>`;
}

function renderRawTable() {
  const snapshot = workspaceState.snapshot;
  const fields = selectDefaultTableFields(workspaceState.fieldDiscovery, 12);
  const activeRecords = getActiveRecords();
  const records = activeRecords.slice(0, MAX_TABLE_ROWS);
  if (!snapshot) return '<div class="gew-empty">Import geometry to view raw table.</div>';
  if (!records.length) return '<div class="gew-empty">No active records. Use the hierarchy tree to add objects to the import list, or click All.</div>';
  const header = fields.map((field) => `<th title="${esc(field.path)}">${esc(field.key)}</th>`).join('');
  const body = records.map((record) => `<tr data-gew-object-id="${esc(record.id)}">${fields.map((field) => `<td>${esc(valueAtPath(record, field.path))}</td>`).join('')}</tr>`).join('');
  return `
    <div class="gew-table-note">Showing ${records.length} of ${activeRecords.length} active records from ${snapshot.recordCount}${snapshot.capped ? '+' : ''} imported records. Columns are dynamic from field discovery.</div>
    <div class="gew-table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function renderMappingPreview() {
  const mapping = workspaceState.mapping;
  if (!mapping) return '<div class="gew-empty">Import geometry to run automatic mapping.</div>';
  const activeMapped = getActiveMappedObjects();
  const rows = activeMapped.slice(0, MAX_MAPPED_ROWS);
  const coverage = ensureArray(mapping.fieldCoverage).slice(0, 12);
  const coverageHtml = coverage.map((row) => `<div class="gew-map-row"><b>${esc(row.targetField)}</b><span>${row.mappedCount} mapped · ${esc(row.rules.join(', '))}</span></div>`).join('');
  const tableRows = rows.map((object) => `<tr>
    <td>${esc(object.displayName)}</td>
    <td>${esc(object.family)}</td>
    <td>${esc(object.support?.supportType || '')}</td>
    <td>${esc(object.support?.supportTag || '')}</td>
    <td>${esc(object.pipe?.odMm ?? '')}</td>
    <td>${esc(object.pipe?.wallThicknessMm ?? '')}</td>
    <td>${esc(object.lineNo || '')}</td>
    <td>${esc(object.mappingStatus)}</td>
    <td>${esc(object.mappingConfidence)}</td>
  </tr>`).join('');
  return `
    <div class="gew-map-summary">
      <div><b>${mapping.profileId}</b><span>mapping profile</span></div>
      <div><b>${mapping.mappedCount}</b><span>mapped records</span></div>
      <div><b>${mapping.unmappedCount}</b><span>unmapped records</span></div>
      <div><b>${activeMapped.length}</b><span>active mapped records</span></div>
    </div>
    <h4>Mapping coverage</h4>
    <div class="gew-map-list">${coverageHtml || '<div class="gew-empty">No mapping coverage yet.</div>'}</div>
    <h4>Mapped active objects</h4>
    <div class="gew-table-note">Showing ${rows.length} of ${activeMapped.length} active mapped objects. Mapping is automatic and auditable; user-confirmed profiles come next.</div>
    <div class="gew-table-wrap"><table><thead><tr><th>Object</th><th>Family</th><th>Support Type</th><th>Support Tag</th><th>Pipe OD mm</th><th>Wall mm</th><th>Line</th><th>Status</th><th>Confidence</th></tr></thead><tbody>${tableRows}</tbody></table></div>`;
}

function renderCalculationCanvas() {
  const activeMapped = getActiveMappedObjects();
  const supportRows = activeMapped.filter((object) => object.family === 'SUPPORT');
  const withOd = supportRows.filter((object) => Number(object.pipe?.odMm) > 0).length;
  return `<div class="gew-calc-shell">
    <h4>Calculation Canvas shell</h4>
    <p class="gew-note">Support Load module will consume confirmed mapped objects. This phase only produces automatic canonical mapping and audit data.</p>
    <div class="gew-map-summary">
      <div><b>${supportRows.length}</b><span>support candidates</span></div>
      <div><b>${withOd}</b><span>support rows with pipe OD</span></div>
      <div><b>${activeMapped.length}</b><span>active mapped objects</span></div>
      <div><b>${workspaceState.mapping?.profileId || 'none'}</b><span>mapping profile</span></div>
    </div>
    <ul class="gew-checklist">
      <li>Required for support loads: support type, support position, attached pipe OD, wall/schedule, material/process data.</li>
      <li>No fabricated calculation values are produced here.</li>
      <li>Next phase adds user confirmation and saved mapping profiles.</li>
    </ul>
  </div>`;
}

function renderWorkspace() {
  const dialog = currentDialog();
  if (!dialog) return;
  const body = dialog.querySelector('[data-gew-body]');
  if (!body) return;
  body.innerHTML = `
    <section data-gew-tab-panel="import">
      ${renderSummary()}
      <div class="gew-subgrid"><div><h4>Top 5 hierarchy import tree</h4>${renderHierarchy()}</div><div><h4>Dynamic field discovery</h4>${renderFieldDiscovery()}</div></div>
    </section>
    <section data-gew-tab-panel="raw">${renderRawTable()}</section>
    <section data-gew-tab-panel="mapping"><h4>Automatic mapping engine</h4>${renderMappingPreview()}</section>
    <section data-gew-tab-panel="calc">${renderCalculationCanvas()}</section>`;
  setActiveTab(dialog, dialog.dataset.gewActiveTab || 'import');
}

function setActiveTab(dialog, tab) {
  dialog.dataset.gewActiveTab = tab;
  dialog.querySelectorAll('[data-gew-tab]').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.gewTab === tab));
  dialog.querySelectorAll('[data-gew-tab-panel]').forEach((panel) => { panel.hidden = panel.dataset.gewTabPanel !== tab; });
}

function ensureDialog() {
  let dialog = currentDialog();
  if (dialog) return dialog;
  dialog = document.createElement('div');
  dialog.id = 'geometry-export-workspace-dialog';
  dialog.className = 'geometry-export-workspace-dialog';
  dialog.setAttribute('aria-hidden', 'true');
  dialog.dataset.gewActiveTab = 'import';
  dialog.innerHTML = `
    <div class="gew-card" role="dialog" aria-modal="false" aria-label="Geometry Export Workspace">
      <div class="gew-head">
        <div><b>Export Geometry Workspace</b><small>${esc(BRIDGE_VERSION)} · rendered graphics snapshot · dynamic mapping engine</small></div>
        <button type="button" data-gew-close="true" aria-label="Close geometry workspace">x</button>
      </div>
      <div class="gew-toolbar">
        <label>Source <select data-gew-import-scope><option value="selected">Canvas selection</option><option value="visible" selected>Visible rendered geometry</option><option value="all">Full rendered model</option></select></label>
        <button type="button" data-gew-import="true">Import</button>
        <button type="button" data-gew-refresh="true">Refresh</button>
        <button type="button" data-gew-run-mapping="true">Auto Map</button>
        <button type="button" data-gew-export-json="true">Export Workspace JSON</button>
      </div>
      <nav class="gew-tabs">
        <button type="button" data-gew-tab="import" class="is-active">Import</button>
        <button type="button" data-gew-tab="raw">Raw Geometry</button>
        <button type="button" data-gew-tab="mapping">Mapped Objects</button>
        <button type="button" data-gew-tab="calc">Calculation Canvas</button>
      </nav>
      <div class="gew-body" data-gew-body></div>
    </div>`;
  document.body.appendChild(dialog);
  bindDialog(dialog);
  return dialog;
}

function openDialog() {
  const dialog = ensureDialog();
  dialog.classList.add('is-open');
  dialog.setAttribute('aria-hidden', 'false');
  renderWorkspace();
}

function closeDialog() {
  const dialog = currentDialog();
  if (!dialog) return;
  dialog.classList.remove('is-open');
  dialog.setAttribute('aria-hidden', 'true');
}

function serializableState() {
  return {
    ...workspaceState,
    checkedHierarchyPaths: [...workspaceState.checkedHierarchyPaths],
    expandedHierarchyPaths: [...workspaceState.expandedHierarchyPaths],
    activeObjectIds: [...workspaceState.activeObjectIds]
  };
}

function downloadSnapshot() {
  if (!workspaceState.snapshot) {
    setStatus('Geometry Workspace: import geometry before exporting snapshot.', true);
    return;
  }
  const blob = new Blob([JSON.stringify(serializableState(), null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'rendered-geometry-workspace-snapshot.json';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function updateActiveImportList(mode) {
  if (!workspaceState.snapshot) return;
  const checkedIds = selectedTreeObjectIds();
  if (mode === 'use') workspaceState.activeObjectIds = checkedIds;
  else if (mode === 'add') {
    const next = new Set(workspaceState.activeObjectIds);
    checkedIds.forEach((id) => next.add(id));
    workspaceState.activeObjectIds = next;
  } else if (mode === 'remove') {
    const next = new Set(workspaceState.activeObjectIds);
    checkedIds.forEach((id) => next.delete(id));
    workspaceState.activeObjectIds = next;
  } else if (mode === 'all') workspaceState.activeObjectIds = allRecordIds(workspaceState.snapshot);
  else if (mode === 'clear') workspaceState.activeObjectIds = new Set();
  renderWorkspace();
}

function toggleExpanded(path) {
  if (!path || path === '__ROOT__') return;
  const next = new Set(workspaceState.expandedHierarchyPaths);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  workspaceState.expandedHierarchyPaths = next;
  renderWorkspace();
}

function runMapping() {
  if (!workspaceState.snapshot) {
    setStatus('Geometry Workspace: import geometry before mapping.', true);
    return;
  }
  rebuildMapping(workspaceState.snapshot.records);
  renderWorkspace();
  setStatus(`Geometry Workspace: auto-mapped ${workspaceState.mapping.mappedCount} rendered object(s).`, false);
}

function bindDialog(dialog) {
  dialog.addEventListener('click', (event) => {
    if (event.target?.closest?.('[data-gew-close]')) { closeDialog(); return; }
    const tab = event.target?.closest?.('[data-gew-tab]')?.dataset?.gewTab;
    if (tab) { setActiveTab(dialog, tab); return; }
    if (event.target?.closest?.('[data-gew-import]')) { importSnapshot(activeScope(dialog)); return; }
    if (event.target?.closest?.('[data-gew-refresh]')) { if (workspaceState.snapshot) importSnapshot(workspaceState.snapshot.scope); else renderWorkspace(); return; }
    if (event.target?.closest?.('[data-gew-run-mapping]')) { runMapping(); return; }
    if (event.target?.closest?.('[data-gew-export-json]')) { downloadSnapshot(); return; }
    const togglePath = event.target?.closest?.('[data-gew-toggle-path]')?.dataset?.gewTogglePath;
    if (togglePath) { event.preventDefault(); event.stopPropagation(); toggleExpanded(togglePath); return; }
    if (event.target?.closest?.('[data-gew-tree-use-checked]')) { updateActiveImportList('use'); return; }
    if (event.target?.closest?.('[data-gew-tree-add-checked]')) { updateActiveImportList('add'); return; }
    if (event.target?.closest?.('[data-gew-tree-remove-checked]')) { updateActiveImportList('remove'); return; }
    if (event.target?.closest?.('[data-gew-tree-all]')) { updateActiveImportList('all'); return; }
    if (event.target?.closest?.('[data-gew-tree-clear]')) { updateActiveImportList('clear'); }
  }, true);
  dialog.addEventListener('change', (event) => {
    const hpath = event.target?.dataset?.gewHpath;
    if (!hpath) return;
    if (event.target.checked) workspaceState.checkedHierarchyPaths.add(hpath);
    else workspaceState.checkedHierarchyPaths.delete(hpath);
    renderWorkspace();
  }, true);
  dialog.addEventListener('input', (event) => {
    if (!event.target?.matches?.('[data-gew-hierarchy-search]')) return;
    workspaceState.hierarchySearch = event.target.value || '';
    renderWorkspace();
    const input = currentDialog()?.querySelector?.('[data-gew-hierarchy-search]');
    input?.focus?.();
  }, true);
}

function injectToolbar(root) {
  const ribbon = root?.querySelector?.('.geo-top-ribbon');
  if (!ribbon) return;
  let section = ribbon.querySelector('.geometry-export-workspace-tool-group');
  if (section?.dataset?.gewVersion === BRIDGE_VERSION) return;
  if (!section) {
    section = document.createElement('div');
    section.className = 'rvm-ribbon-section rvm-tool-group geometry-export-workspace-tool-group';
    const report = ribbon.querySelector('.rvm-report-export-tool-group');
    ribbon.insertBefore(section, report?.nextSibling || ribbon.querySelector('.rvm-model-health-tool-group') || null);
  }
  section.dataset.gewVersion = BRIDGE_VERSION;
  section.innerHTML = `
    <span class="rvm-ribbon-label">Geometry</span>
    <div class="rvm-ribbon-button-row">
      <button type="button" class="rvm-tool-btn" data-geometry-export-workspace-open="true" title="Open rendered geometry export workspace"><span aria-hidden="true">RAW</span><span>Export</span></button>
      <button type="button" class="rvm-tool-btn" data-geometry-export-workspace-quick-visible="true" title="Import visible rendered geometry into workspace"><span aria-hidden="true">MAP</span><span>Visible</span></button>
    </div>
    <div class="geometry-export-workspace-summary">Raw geometry · top-5 tree · mapping engine</div>`;
}

function injectStyles() {
  if (document.getElementById('geometry-export-workspace-style')) return;
  const style = document.createElement('style');
  style.id = 'geometry-export-workspace-style';
  style.textContent = `
    .geometry-export-workspace-summary{margin-top:3px;color:#94a3b8;font-size:9.5px;white-space:nowrap}.geometry-export-workspace-dialog{position:fixed;inset:0;display:none;align-items:flex-start;justify-content:center;padding:64px 18px 18px;background:rgba(2,6,23,.50);z-index:12250}.geometry-export-workspace-dialog.is-open{display:flex}.gew-card{width:min(1240px,calc(100vw - 44px));max-height:calc(100vh - 88px);display:grid;grid-template-rows:auto auto auto minmax(0,1fr);gap:10px;border:1px solid rgba(126,190,255,.28);border-radius:14px;background:#0b1424;box-shadow:0 24px 80px rgba(0,0,0,.52);padding:12px;color:#dbeafe}.gew-head{display:flex;align-items:center;justify-content:space-between}.gew-head b{font-size:15px;color:#bfdbfe}.gew-head small{display:block;color:#7f94b7;font-size:10px}.gew-head button{border:1px solid rgba(148,163,184,.30);background:#111827;color:#e5e7eb;border-radius:8px;width:30px;height:28px}.gew-toolbar,.gew-tabs,.gew-hierarchy-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.gew-toolbar label{display:flex;align-items:center;gap:6px;color:#bcd8ff;font-size:12px}.gew-toolbar select,.gew-toolbar button,.gew-tabs button,.gew-hierarchy-toolbar button,.gew-hierarchy-toolbar input{border:1px solid rgba(126,190,255,.24);border-radius:8px;background:#132238;color:#dbeafe;padding:7px 10px}.gew-hierarchy-toolbar input{flex:1;min-width:180px}.gew-tabs button.is-active{background:#1d4ed8;color:#fff}.gew-body{min-height:0;overflow:auto;border:1px solid rgba(126,190,255,.12);border-radius:10px;background:rgba(255,255,255,.025);padding:10px}.gew-empty{padding:18px;border:1px dashed rgba(148,163,184,.22);border-radius:10px;color:#9fb3cc;text-align:center}.gew-summary-grid,.gew-map-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:8px}.gew-summary-grid div,.gew-map-summary div{border:1px solid rgba(126,190,255,.15);border-radius:9px;padding:8px;background:rgba(255,255,255,.035)}.gew-summary-grid b,.gew-map-summary b{display:block;color:#dbeafe;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gew-summary-grid span,.gew-map-summary span{display:block;color:#8ea8c8;font-size:11px}.gew-class-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.gew-class-chips span{border:1px solid rgba(126,190,255,.18);border-radius:999px;padding:4px 7px;background:#111827;color:#bfd7ff;font-size:11px}.gew-subgrid{display:grid;grid-template-columns:minmax(360px,1fr) minmax(320px,1fr);gap:10px}.gew-subgrid h4,.gew-body h4{margin:0 0 8px;color:#bfdbfe}.gew-hierarchy-status{margin:6px 0;color:#9fb3cc;font-size:11px}.gew-hierarchy-list,.gew-field-list,.gew-map-list{display:grid;gap:5px;max-height:430px;overflow:auto}.gew-hrow{display:grid;grid-template-columns:24px auto minmax(0,1fr) auto;gap:7px;align-items:center;padding:6px 8px 6px calc(8px + var(--indent,0)*16px);border:1px solid rgba(126,190,255,.13);border-radius:8px;background:#111827;color:#dbeafe;font-size:12px}.gew-hrow.all-active{border-color:rgba(59,130,246,.58);background:rgba(37,99,235,.16)}.gew-hrow.part-active{border-color:rgba(234,179,8,.46);background:rgba(234,179,8,.07)}.gew-hrow-toggle{width:22px;height:22px;border:1px solid rgba(126,190,255,.24);border-radius:6px;background:#0f1b2d;color:#bfdbfe}.gew-hrow-toggle:disabled{opacity:.45}.gew-hrow span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gew-hrow b{font-size:11px;color:#93c5fd}.gew-field-row,.gew-map-row{border:1px solid rgba(126,190,255,.13);border-radius:8px;background:#111827;padding:7px;display:grid;gap:3px}.gew-field-row b,.gew-map-row b{font-size:12px;color:#dbeafe}.gew-field-row span,.gew-map-row span,.gew-field-row small{font-size:11px;color:#9fb3cc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gew-table-note,.gew-note{margin:0 0 8px;color:#9fb3cc;font-size:11px}.gew-table-wrap{overflow:auto;max-height:500px}.gew-table-wrap table{border-collapse:collapse;min-width:100%;font-size:11px}.gew-table-wrap th,.gew-table-wrap td{border:1px solid rgba(126,190,255,.13);padding:5px 7px;text-align:left;white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis}.gew-table-wrap th{position:sticky;top:0;background:#132238;color:#bfdbfe;z-index:1}.gew-checklist{color:#b7c8de;font-size:12px;line-height:1.55}
  `;
  document.head.appendChild(style);
}

function attach() {
  const root = rootEl();
  if (!root) return false;
  injectToolbar(root);
  return true;
}

function onDocumentClick(event) {
  if (event.target?.closest?.('[data-geometry-export-workspace-open]')) {
    event.preventDefault();
    event.stopPropagation();
    openDialog();
    return;
  }
  if (event.target?.closest?.('[data-geometry-export-workspace-quick-visible]')) {
    event.preventDefault();
    event.stopPropagation();
    openDialog();
    importSnapshot('visible');
  }
}

export function installGeometryExportWorkspaceBridge() {
  if (typeof document === 'undefined') return;
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;
  injectStyles();
  document.addEventListener('click', onDocumentClick, true);
  let attempts = 0;
  const waitAttach = () => {
    attempts += 1;
    const ok = attach();
    if (!ok && attempts < 180) setTimeout(waitAttach, 300);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitAttach, { once: true });
  else waitAttach();
  globalThis.addEventListener?.('rvm-model-loaded', () => setTimeout(() => { attach(); }, 320));
  globalThis.__PCF_GLB_GEOMETRY_EXPORT_WORKSPACE__ = {
    version: BRIDGE_VERSION,
    open: openDialog,
    importSnapshot,
    runMapping,
    state: () => workspaceState,
    serializableState,
    schemas: {
      workspace: 'geometry-export-workspace/v1',
      snapshot: 'rendered-geometry-snapshot/v1',
      fieldDiscovery: 'geometry-field-discovery/v1',
      hierarchy: 'geometry-import-hierarchy/v1',
      mapping: 'geometry-mapping-engine/v1'
    }
  };
}
