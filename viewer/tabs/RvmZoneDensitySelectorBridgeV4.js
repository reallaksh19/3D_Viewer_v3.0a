import {
  buildRvmHierarchyModelFromZoneRows,
  flattenHierarchyNodes,
  topLevelSelectablePaths,
} from './RvmHierarchyModelBuilder.js?v=20260622-rvm-zone-density-selector-4';
import {
  recoverRvmDeepSourcePathFromInstruction,
  recoverDeepRvmSourcePathFromCandidates,
  sourcePathCandidatesFromInstruction,
  isWeakRvmSourcePath,
} from './RvmDeepSourcePathRecoveryBridge.js?v=20260622-rvm-deep-source-path-recovery-1';

const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-zone-density-selector-v4');
const STYLE_ID = 'rvm-zone-density-selector-style-v4';
const VERSION = '20260622-rvm-zone-density-selector-4';
const LARGE_FILE_THRESHOLD_BYTES = 8 * 1024 * 1024;
const ZONE_STORAGE_KEY = 'rvm_zone_density_last_selection_v1';
const DENSITY_STORAGE_KEY = 'rvm_zone_density_detail_by_zone_v1';
const GLOBAL_DETAIL_STORAGE_KEY = 'rvm_zone_lod_detail_v1';
const MAX_LEVEL = 2;
const MAX_SELECTOR_ROWS = 180;
const DENSITY_OPTIONS = [250, 100, 50, 25];
const GENERIC_TOP_BUCKETS = new Set(['/equipment', '/structure', '/structures', '/piping', '/civil', '/model']);

export function installRvmZoneDensitySelectorBridge() {
  if (typeof document === 'undefined') return null;
  if (globalThis[INSTALL_FLAG]) return globalThis[INSTALL_FLAG];
  injectStyles();
  const state = { version: VERSION, beforeRenderInstructions, buildSelectorRows };
  globalThis[INSTALL_FLAG] = state;
  patchGlobalZoneApi(state);
  for (const delay of [0, 100, 500]) setTimeout(() => patchGlobalZoneApi(state), delay);
  return state;
}

function patchGlobalZoneApi(state) {
  const api = globalThis.__PCF_GLB_RVM_ZONE_LOD_LABELS__ || {};
  globalThis.__PCF_GLB_RVM_ZONE_LOD_LABELS__ = {
    ...api,
    version: state.version,
    beforeRenderInstructions: state.beforeRenderInstructions,
    buildZoneDensitySelectorRows: state.buildSelectorRows,
  };
}

async function beforeRenderInstructions({ instructionSet, file, parsed, root } = {}) {
  const instructions = Array.isArray(instructionSet?.instructions) ? instructionSet.instructions : [];
  const rows = buildSelectorRows({ instructions, manifestNodes: parsed?.manifestNodes || [], fileName: file?.name || parsed?.fileName || 'RVM model' });
  const fileSize = Number(file?.size || parsed?.byteLength || 0);
  const shouldPrompt = fileSize >= LARGE_FILE_THRESHOLD_BYTES && rows.length > 1;
  const selection = shouldPrompt
    ? await showZoneDensitySelector({ file, rows, instructionCount: instructions.length })
    : { mode: 'all', selectedZones: [], zoneDensities: {}, selectorSource: rows.selectorSource || 'instructions' };
  const filtered = applyZoneDensitySelection(instructionSet || { instructions }, selection);
  setStatus(root, statusForSelection(file, filtered?.diagnostics?.zoneSelection));
  return filtered;
}

export function buildSelectorRows({ instructions = [], manifestNodes = [], fileName = 'RVM model' } = {}) {
  const rowMap = new Map();
  const source = Array.isArray(manifestNodes) && manifestNodes.length ? 'preload-manifest+instructions' : 'instructions';
  const manifestContext = buildManifestContext(manifestNodes);
  const addPath = (path, count = 0, meta = {}) => {
    const recovered = recoverDeepRvmSourcePathFromCandidates([path, meta.name, meta.displayName], { fileName });
    const normalizedPath = recovered.displayPath || '/Unzoned';
    const parts = normalizedPath.split('/').filter(Boolean);
    if (!parts.length) return;
    let cur = '';
    for (let i = 0; i < Math.min(parts.length, MAX_LEVEL + 1); i += 1) {
      cur += `/${parts[i]}`;
      const key = cur.replace(/\/+/g, '/');
      const entry = rowMap.get(key) || {
        key,
        path: key,
        parentPath: parentPathFor(key),
        name: `/${parts[i]}`,
        count: 0,
        primitiveCount: 0,
        depth: i,
        source: meta.source || source,
        type: i === 0 ? 'ZONE' : 'NODE',
        manifestOnly: true,
      };
      entry.count += count;
      entry.primitiveCount += count;
      entry.manifestOnly = entry.manifestOnly && count <= 0;
      if (meta.type) entry.type = meta.type;
      if (meta.source) entry.source = meta.source;
      rowMap.set(key, entry);
    }
  };

  for (const node of Array.isArray(manifestNodes) ? manifestNodes : []) {
    const path = manifestPathForNode(node, manifestContext.byId);
    if (path && !isWeakRvmSourcePath(path)) addPath(path, 0, { type: node.type || node.kind || node.attributes?.TYPE || 'NODE', name: node.name, source: 'preload-manifest' });
  }

  for (const instruction of instructions) {
    const path = pathForInstruction(instruction, fileName, manifestContext);
    addPath(path, 1, { type: instruction?.type || instruction?.kind || 'NODE', source: 'instructions', displayName: instruction?.displayName || instruction?.sourceName || instruction?.name || '' });
  }

  let rows = [...rowMap.values()].filter((row) => row.depth <= MAX_LEVEL && (row.count > 0 || row.source === 'preload-manifest'));
  rows = removeGenericBucketRowsWhenDeepRowsExist(rows);
  if (!rows.length) rows = buildFlatRowsFromInstructions(instructions, fileName);

  const model = buildRvmHierarchyModelFromZoneRows(rows, { fileName, source });
  const allNodes = flattenHierarchyNodes(model.rootNode)
    .filter((node) => node.level >= 0 && node.level <= MAX_LEVEL)
    .map((node) => ({
      key: node.path,
      path: node.path,
      parentPath: parentPathFor(node.path),
      name: node.name,
      count: node.count,
      primitiveCount: node.primitiveCount,
      depth: node.level,
      childCount: node.childCount,
      type: node.type,
      source,
      hasChildren: node.childCount > 0,
    }));
  const top = allNodes.filter((row) => row.depth === 0).sort((a, b) => sortZoneRows(a, b));
  const allowed = new Set();
  for (const row of top) {
    allowed.add(row.key);
    for (const child of allNodes.filter((item) => item.key !== row.key && item.key.startsWith(`${row.key}/`)).sort((a, b) => sortZoneRows(a, b))) allowed.add(child.key);
    if (allowed.size >= MAX_SELECTOR_ROWS) break;
  }
  const flat = allNodes.filter((row) => allowed.has(row.key)).sort((a, b) => rowOrder(a, b)).slice(0, MAX_SELECTOR_ROWS);
  flat.selectorSource = source;
  flat.topPaths = topLevelSelectablePaths(model.rootNode, 3);
  return flat;
}

function buildFlatRowsFromInstructions(instructions, fileName) {
  const map = new Map();
  for (const instruction of instructions) {
    const recovered = recoverRvmDeepSourcePathFromInstruction(instruction, { fileName });
    const parts = recovered.parts || [];
    const key = parts.length ? `/${parts.slice(0, MAX_LEVEL + 1).join('/')}` : '/Unzoned';
    const entry = map.get(key) || { key, path: key, parentPath: parentPathFor(key), name: key.split('/').pop() || key, count: 0, primitiveCount: 0, depth: Math.max(0, key.split('/').filter(Boolean).length - 1), source: 'instructions', type: instruction?.type || 'NODE' };
    entry.count += 1;
    entry.primitiveCount += 1;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => rowOrder(a, b)).slice(0, MAX_SELECTOR_ROWS);
}

function buildManifestContext(manifestNodes = []) {
  const byId = new Map();
  for (const node of Array.isArray(manifestNodes) ? manifestNodes : []) {
    const keys = [node.canonicalObjectId, node.sourceObjectId, node.renderObjectId, node.id, node.key, node.attributes?.CANONICAL_OBJECT_ID, node.attributes?.SOURCE_OBJECT_ID, node.attributes?.RVM_OBJECT_ID, node.attributes?.ID].filter(Boolean).map(String);
    for (const key of keys) byId.set(key, node);
  }
  return { byId };
}

function manifestPathForInstruction(instruction = {}, context = {}) {
  const candidates = [instruction.canonicalObjectId, instruction.sourceObjectId, instruction.renderObjectId, instruction.id, instruction.attributes?.CANONICAL_OBJECT_ID, instruction.attributes?.SOURCE_OBJECT_ID, instruction.attributes?.RVM_OBJECT_ID, instruction.attributes?.ID].filter(Boolean).map(String);
  for (const key of candidates) {
    const node = context.byId?.get?.(key);
    if (!node) continue;
    const path = manifestPathForNode(node, context.byId);
    if (path) return path;
  }
  return '';
}

function manifestPathForNode(node = {}, byId = new Map()) {
  const attrs = node.attributes || {};
  const direct = attrs.RVM_OWNER_PATH || attrs.RVM_OWNER_NAME || attrs.RVM_REVIEW_PATH || attrs.REVIEW_NAME || node.path || attrs.PATH || attrs.FULL_PATH;
  if (String(direct || '').includes('/')) return direct;
  const parts = [];
  let cur = node;
  const seen = new Set();
  while (cur && !seen.has(cur.canonicalObjectId || cur.sourceObjectId || cur.id || cur.name)) {
    seen.add(cur.canonicalObjectId || cur.sourceObjectId || cur.id || cur.name);
    const name = cur.name || cur.attributes?.NAME || cur.attributes?.RVM_NAME || cur.attributes?.RVM_REVIEW_NAME || cur.canonicalObjectId;
    if (name) parts.push(String(name).replace(/^\/+/g, ''));
    const parentKey = cur.parentCanonicalObjectId || cur.parentSourceObjectId || cur.parentId || cur.attributes?.PARENT_CANONICAL_OBJECT_ID || cur.attributes?.PARENT_ID;
    cur = parentKey ? byId.get(String(parentKey)) : null;
  }
  return `/${parts.reverse().filter(Boolean).join('/')}`;
}

function pathForInstruction(instruction = {}, fileName = '', manifestContext = null) {
  const raw = recoverRvmDeepSourcePathFromInstruction(instruction, { fileName });
  const manifestPath = manifestContext ? manifestPathForInstruction(instruction, manifestContext) : '';
  const manifest = recoverDeepRvmSourcePathFromCandidates([manifestPath], { fileName });
  if (raw?.displayPath && (!manifestPath || raw.score >= manifest.score || isWeakRvmSourcePath(manifest.displayPath))) return raw.displayPath;
  return manifest.displayPath || raw.displayPath || '/Unzoned';
}

function removeGenericBucketRowsWhenDeepRowsExist(rows = []) {
  const deepTop = rows.some((row) => Number(row.depth || 0) === 0 && !GENERIC_TOP_BUCKETS.has(String(row.key || '').toLowerCase()));
  if (!deepTop) return rows;
  return rows.filter((row) => !(Number(row.depth || 0) === 0 && GENERIC_TOP_BUCKETS.has(String(row.key || '').toLowerCase()) && row.manifestOnly));
}

async function showZoneDensitySelector({ file, rows, instructionCount }) {
  return new Promise((resolve) => {
    const rowKeys = new Set(rows.map((row) => row.key));
    const previous = new Set(loadJson(ZONE_STORAGE_KEY, []).filter((key) => rowKeys.has(key)));
    const previousDensities = loadJson(DENSITY_STORAGE_KEY, {});
    const defaultDensities = defaultDensityMap(rows, previousDensities);
    const defaultSelected = previous.size ? previous : new Set(topRows(rows, 3).map((row) => row.key));
    const overlay = document.createElement('div');
    overlay.className = 'rvm-zone-density-overlay';
    overlay.innerHTML = `
      <div class="rvm-zone-density-modal" role="dialog" aria-modal="true" aria-label="Select RVM hierarchy zones and density">
        <div class="rvm-zone-density-head">
          <div><b>Large RVM load: choose hierarchy zones to render</b><p>${esc(file?.name || 'RVM file')} has ${instructionCount} render instruction(s). Selector source: ${esc(rows.selectorSource || 'instructions')}. Showing first ${MAX_LEVEL + 1} hierarchy levels only; use + to expand.</p></div>
          <button type="button" data-zone-density-action="all">Render all</button>
        </div>
        <div class="rvm-zone-density-toolbar">
          <input data-zone-density-search placeholder="Search top hierarchy zones…" />
          <button type="button" data-zone-density-action="check-visible">Check visible</button>
          <button type="button" data-zone-density-action="top3">Top 3</button>
          <button type="button" data-zone-density-action="expand-all">Expand all</button>
          <button type="button" data-zone-density-action="collapse-all">Collapse</button>
          <button type="button" data-zone-density-action="clear">Clear</button>
          <label>Default <select data-zone-density-default>${densityOptionsHtml(Number(storageGet(GLOBAL_DETAIL_STORAGE_KEY, '100')))}</select></label>
        </div>
        <div class="rvm-zone-density-list" role="tree">
          ${rows.map((row) => zoneRowHtml(row, defaultSelected.has(row.key), defaultDensities[row.key] || 100)).join('')}
        </div>
        <div class="rvm-zone-density-foot"><span data-zone-density-summary></span><button type="button" class="rvm-zone-density-primary" data-zone-density-action="selected">Render selected zones</button></div>
      </div>`;
    document.body.appendChild(overlay);
    const summary = overlay.querySelector('[data-zone-density-summary]');
    const search = overlay.querySelector('[data-zone-density-search]');
    const boxes = () => [...overlay.querySelectorAll('[data-zone-density-key]')];
    const visibleRows = () => [...overlay.querySelectorAll('[data-zone-density-row]')].filter((row) => row.style.display !== 'none');
    const selectedZones = () => boxes().filter((box) => box.checked).map((box) => box.dataset.zoneDensityKey);
    const densities = () => Object.fromEntries([...overlay.querySelectorAll('[data-zone-density-percent]')].map((select) => [select.dataset.zoneDensityPercent, Number(select.value || 100)]));
    const updateTreeState = () => {
      const allRows = [...overlay.querySelectorAll('[data-zone-density-row]')];
      for (const row of allRows.sort((a, b) => Number(b.dataset.zoneDepth || 0) - Number(a.dataset.zoneDepth || 0))) {
        const key = row.dataset.zonePath;
        const box = row.querySelector('[data-zone-density-key]');
        if (!box) continue;
        const childBoxes = allRows.filter((child) => child.dataset.zonePath !== key && child.dataset.zonePath.startsWith(`${key}/`)).map((child) => child.querySelector('[data-zone-density-key]')).filter(Boolean);
        if (!childBoxes.length) { box.indeterminate = false; continue; }
        const checked = childBoxes.filter((child) => child.checked).length;
        box.indeterminate = checked > 0 && checked < childBoxes.length;
        if (checked === childBoxes.length) box.checked = true;
        else if (checked === 0 && !box.dataset.directChecked) box.checked = false;
      }
    };
    const applyVisibility = () => {
      const q = search?.value?.trim?.().toLowerCase?.() || '';
      const allRows = [...overlay.querySelectorAll('[data-zone-density-row]')];
      const matched = new Set();
      if (q) for (const row of allRows) if (row.dataset.zoneSearch.includes(q)) {
        matched.add(row.dataset.zonePath);
        const parts = row.dataset.zonePath.split('/').filter(Boolean);
        let path = '';
        for (const part of parts) { path += `/${part}`; matched.add(path); }
      }
      allRows.forEach((row) => {
        const parent = row.dataset.zoneParent || '';
        const visibleBySearch = !q || matched.has(row.dataset.zonePath);
        const visibleByExpansion = !parent || q || isAncestorExpanded(row, allRows);
        row.style.display = visibleBySearch && visibleByExpansion ? '' : 'none';
        const button = row.querySelector('[data-zone-density-toggle]');
        if (button) button.textContent = row.dataset.zoneExpanded === 'true' ? '−' : '+';
      });
    };
    const update = () => {
      updateTreeState();
      applyVisibility();
      const picked = selectedZones();
      if (summary) summary.textContent = `${picked.length} zone(s) selected · ${visibleRows().length} visible · per-zone density supports 25/50/100/250%`;
      const primary = overlay.querySelector('[data-zone-density-action="selected"]');
      if (primary) primary.disabled = picked.length === 0;
    };
    const close = (payload) => { overlay.remove(); resolve(payload); };
    overlay.addEventListener('change', (event) => {
      const box = event.target?.closest?.('[data-zone-density-key]');
      if (box) {
        const row = box.closest('[data-zone-density-row]');
        const key = row?.dataset.zonePath || box.dataset.zoneDensityKey;
        const checked = box.checked;
        box.dataset.directChecked = checked ? 'true' : '';
        overlay.querySelectorAll('[data-zone-density-row]').forEach((childRow) => {
          if (childRow.dataset.zonePath !== key && childRow.dataset.zonePath.startsWith(`${key}/`)) {
            const childBox = childRow.querySelector('[data-zone-density-key]');
            if (childBox) { childBox.checked = checked; childBox.dataset.directChecked = checked ? 'true' : ''; }
          }
        });
      }
      const def = event.target?.closest?.('[data-zone-density-default]');
      if (def) {
        storageSet(GLOBAL_DETAIL_STORAGE_KEY, def.value || '100');
        overlay.querySelectorAll('[data-zone-density-percent]').forEach((select) => { if (!select.dataset.zoneDensityTouched) select.value = def.value || '100'; });
      }
      const percent = event.target?.closest?.('[data-zone-density-percent]');
      if (percent) percent.dataset.zoneDensityTouched = 'true';
      update();
    });
    overlay.addEventListener('click', (event) => {
      const toggle = event.target?.closest?.('[data-zone-density-toggle]');
      if (toggle) {
        event.preventDefault();
        event.stopPropagation();
        const row = toggle.closest('[data-zone-density-row]');
        if (row) row.dataset.zoneExpanded = row.dataset.zoneExpanded === 'true' ? 'false' : 'true';
        update();
        return;
      }
      const action = event.target?.closest?.('[data-zone-density-action]')?.dataset.zoneDensityAction;
      if (!action) return;
      event.preventDefault();
      if (action === 'all') close({ mode: 'all', selectedZones: [], zoneDensities: {}, selectorSource: rows.selectorSource || 'instructions' });
      if (action === 'clear') { boxes().forEach((box) => { box.checked = false; box.indeterminate = false; box.dataset.directChecked = ''; }); update(); }
      if (action === 'check-visible') { visibleRows().forEach((row) => { const box = row.querySelector('[data-zone-density-key]'); if (box) { box.checked = true; box.dataset.directChecked = 'true'; } }); update(); }
      if (action === 'top3') { const top = new Set(topRows(rows, 3).map((row) => row.key)); boxes().forEach((box) => { box.checked = top.has(box.dataset.zoneDensityKey); box.dataset.directChecked = box.checked ? 'true' : ''; }); update(); }
      if (action === 'expand-all' || action === 'collapse-all') { overlay.querySelectorAll('[data-zone-density-row]').forEach((row) => { row.dataset.zoneExpanded = action === 'expand-all' ? 'true' : 'false'; }); update(); }
      if (action === 'selected') {
        const picked = selectedZones();
        const zoneDensities = densities();
        storageSet(ZONE_STORAGE_KEY, JSON.stringify(picked));
        storageSet(DENSITY_STORAGE_KEY, JSON.stringify(zoneDensities));
        close({ mode: 'selected', selectedZones: picked, zoneDensities, selectorSource: rows.selectorSource || 'instructions' });
      }
    });
    search?.addEventListener('input', update);
    update();
  });
}

function isAncestorExpanded(row, allRows) {
  const parent = row.dataset.zoneParent || '';
  if (!parent) return true;
  const parentRow = allRows.find((item) => item.dataset.zonePath === parent);
  if (!parentRow || parentRow.dataset.zoneExpanded !== 'true') return false;
  return isAncestorExpanded(parentRow, allRows);
}

function zoneRowHtml(row, checked, density) {
  const depth = Math.max(0, Math.min(MAX_LEVEL, Number(row.depth || 0)));
  const hasChildren = Boolean(row.hasChildren || Number(row.childCount || 0) > 0);
  return `<div class="rvm-zone-density-row" data-zone-density-row="true" data-zone-depth="${depth}" data-zone-path="${esc(row.key)}" data-zone-parent="${esc(row.parentPath || parentPathFor(row.key))}" data-zone-expanded="false" data-zone-search="${esc(`${row.key} ${row.type || ''}`.toLowerCase())}" role="treeitem" aria-level="${depth + 1}" style="--zone-depth:${depth}">
    <button type="button" class="rvm-zone-density-toggle" data-zone-density-toggle="true" ${hasChildren ? '' : 'disabled'} aria-label="Toggle ${esc(row.key)}">${hasChildren ? '+' : ''}</button>
    <input type="checkbox" data-zone-density-key="${esc(row.key)}" ${checked ? 'checked data-direct-checked="true"' : ''} />
    <span class="rvm-zone-density-name"><span class="rvm-zone-density-indent"></span>${esc(row.key)}</span>
    <span class="rvm-zone-density-count">${Number(row.count || 0)}</span>
    <select data-zone-density-percent="${esc(row.key)}" title="Render density for ${esc(row.key)}">${densityOptionsHtml(density)}</select>
  </div>`;
}

function densityOptionsHtml(current) { return DENSITY_OPTIONS.map((value) => `<option value="${value}" ${Number(current) === value ? 'selected' : ''}>${value}%</option>`).join(''); }

export function applyZoneDensitySelection(instructionSet = {}, selection = {}) {
  const original = Array.isArray(instructionSet.instructions) ? instructionSet.instructions : [];
  const selectedZones = selection.mode === 'selected' ? (selection.selectedZones || []).map(String) : [];
  const selectedNormalized = selectedZones.map((zone) => normalizePathKey(zone)).filter(Boolean);
  const zoneDensities = selection.zoneDensities || {};
  const kept = [];
  let skippedByZone = 0;
  let skippedByDensity = 0;
  for (const instruction of original) {
    const path = normalizePathKey(pathForInstruction(instruction));
    const match = selectedNormalized.length ? bestZoneMatch(path, selectedNormalized) : '';
    if (selectedNormalized.length && !match) { skippedByZone += 1; continue; }
    const originalZone = selectedZones[selectedNormalized.indexOf(match)] || match;
    const percent = positiveDensity(zoneDensities[originalZone] ?? zoneDensities[match] ?? storageGet(GLOBAL_DETAIL_STORAGE_KEY, '100'));
    if (shouldKeepInstruction(instruction, percent)) kept.push({ ...instruction, rvmZoneDensityPercent: percent, rvmZoneDensityPath: originalZone || '' });
    else skippedByDensity += 1;
  }
  kept.sort((a, b) => Number(b.rvmZoneDensityPercent || 100) - Number(a.rvmZoneDensityPercent || 100));
  return {
    ...instructionSet,
    instructions: kept,
    count: kept.length,
    diagnostics: {
      ...(instructionSet.diagnostics || {}),
      zoneSelection: {
        schemaVersion: 'browser-rvm-zone-selection/v5-deep-source-density-tree',
        selectorSource: selection.selectorSource || 'instructions',
        enabled: true,
        mode: selectedZones.length ? 'selected' : 'all',
        selectedZones,
        zoneDensities,
        maxDisplayedHierarchyLevel: MAX_LEVEL,
        originalInstructionCount: original.length,
        afterZoneInstructionCount: original.length - skippedByZone,
        renderedInstructionCount: kept.length,
        skippedByZoneCount: skippedByZone,
        skippedByDensityCount: skippedByDensity,
      },
      lodSelection: { schemaVersion: 'browser-rvm-lod/v2-per-zone-density', perZoneDensity: true, defaultDetailPercent: Number(storageGet(GLOBAL_DETAIL_STORAGE_KEY, '100')) || 100, skippedByLodCount: skippedByDensity },
    },
  };
}

function shouldKeepInstruction(instruction = {}, percent = 100) {
  if (percent >= 100) return true;
  const type = String(instruction.type || '').toUpperCase();
  const primitive = String(instruction.renderPrimitive || instruction.kind || '').toUpperCase();
  if (type === 'SUPPORT' || primitive.includes('SUPPORT') || primitive.includes('CYLINDER') || type === 'PIPE') return true;
  const factor = percent >= 50 ? 2 : 4;
  return stableHash(`${pathForInstruction(instruction)}|${instruction.displayName}|${primitive}`) % factor === 0;
}

function bestZoneMatch(path, zones) { let best = ''; for (const zone of zones) if (path === zone || path.startsWith(`${zone}/`)) if (zone.length > best.length) best = zone; return best; }
function normalizePathKey(path = '') { return recoverDeepRvmSourcePathFromCandidates([path]).displayPath.toLowerCase().replace(/\/+/g, '/').replace(/\/$/, ''); }
function topRows(rows = [], count = 3) { return rows.filter((row) => Number(row.depth || 0) === 0).sort((a, b) => Number(b.count || 0) - Number(a.count || 0) || a.key.localeCompare(b.key)).slice(0, count); }
function defaultDensityMap(rows = [], saved = {}) { const out = {}; for (const row of rows) out[row.key] = positiveDensity(saved[row.key] || storageGet(GLOBAL_DETAIL_STORAGE_KEY, '100')); return out; }
function parentPathFor(path = '') { const parts = String(path || '').split('/').filter(Boolean); return parts.length <= 1 ? '' : `/${parts.slice(0, -1).join('/')}`; }
function sortZoneRows(a, b) { return Number(b.count || 0) - Number(a.count || 0) || String(a.key).localeCompare(String(b.key), undefined, { numeric: true, sensitivity: 'base' }); }
function rowOrder(a, b) { const partsA = String(a.key || '').split('/').filter(Boolean); const partsB = String(b.key || '').split('/').filter(Boolean); const len = Math.min(partsA.length, partsB.length); for (let i = 0; i < len; i += 1) { const cmp = partsA[i].localeCompare(partsB[i], undefined, { numeric: true, sensitivity: 'base' }); if (cmp) return cmp; } return partsA.length - partsB.length; }
function statusForSelection(file, zone = {}) { return zone?.enabled ? `Loaded ${file?.name || 'RVM'} zone mode ${zone.mode}: ${zone.renderedInstructionCount}/${zone.originalInstructionCount} instructions after zone/density filtering.` : ''; }
function setStatus(root, message) { if (!message) return; const el = root?.querySelector?.('#rvm-sb-msg'); if (el) el.textContent = message; }
function loadJson(key, fallback) { try { const parsed = JSON.parse(localStorage.getItem(key) || ''); return parsed ?? fallback; } catch { return fallback; } }
function storageGet(key, fallback = '') { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } }
function storageSet(key, value) { try { localStorage.setItem(key, value); } catch {} }
function positiveDensity(value) { const n = Number(value); return DENSITY_OPTIONS.includes(n) ? n : 100; }
function stableHash(text = '') { let hash = 2166136261; for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); } return Math.abs(hash >>> 0); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .rvm-zone-density-overlay{position:fixed;inset:0;background:rgba(2,6,23,.70);display:grid;place-items:center;z-index:99999;color:#e8f3ff;font-family:system-ui,sans-serif}
    .rvm-zone-density-modal{width:min(980px,calc(100vw - 40px));max-height:min(800px,calc(100vh - 40px));background:#101827;border:1px solid rgba(126,190,255,.36);border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.58);display:flex;flex-direction:column;overflow:hidden}
    .rvm-zone-density-head,.rvm-zone-density-toolbar,.rvm-zone-density-foot{display:flex;gap:10px;align-items:center;padding:12px;border-bottom:1px solid rgba(126,190,255,.18)}
    .rvm-zone-density-head{justify-content:space-between}.rvm-zone-density-head p{margin:4px 0 0;color:#9fb4d2;font-size:12px}.rvm-zone-density-toolbar input{flex:1;min-width:180px}.rvm-zone-density-toolbar input,.rvm-zone-density-toolbar select,.rvm-zone-density-row select{background:#0b1220;color:#e8f3ff;border:1px solid rgba(126,190,255,.35);border-radius:7px;padding:6px}
    .rvm-zone-density-list{overflow:auto;padding:8px;display:grid;gap:4px}.rvm-zone-density-row{display:grid;grid-template-columns:24px auto minmax(0,1fr) auto auto;gap:9px;align-items:center;padding:7px 8px;border:1px solid rgba(148,163,184,.14);border-radius:8px;background:rgba(255,255,255,.035)}
    .rvm-zone-density-row[data-zone-depth="0"]{background:rgba(74,144,226,.15);border-color:rgba(126,190,255,.28);font-weight:700}.rvm-zone-density-row[data-zone-depth="1"]{background:rgba(59,130,246,.08)}
    .rvm-zone-density-toggle{width:22px;height:22px;display:inline-grid;place-items:center;background:#0b1220!important;color:#e8f3ff!important;border:1px solid rgba(126,190,255,.35)!important;border-radius:5px!important;padding:0!important;font-weight:800}.rvm-zone-density-toggle:disabled{opacity:.2;color:transparent!important}
    .rvm-zone-density-name{display:flex;align-items:center;gap:4px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rvm-zone-density-indent{display:inline-block;width:calc(var(--zone-depth,0) * 18px);flex:0 0 calc(var(--zone-depth,0) * 18px)}.rvm-zone-density-count{color:#9fd0ff;font-size:12px}.rvm-zone-density-foot{justify-content:space-between;border-top:1px solid rgba(126,190,255,.18);border-bottom:0}.rvm-zone-density-modal button{background:#1f2b45;color:#e8f3ff;border:1px solid rgba(126,190,255,.35);border-radius:8px;padding:7px 10px}.rvm-zone-density-primary{background:#2563eb!important}.rvm-zone-density-primary:disabled{opacity:.45}`;
  document.head.appendChild(style);
}
