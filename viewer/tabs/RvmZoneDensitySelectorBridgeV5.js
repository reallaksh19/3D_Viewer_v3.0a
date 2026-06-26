import {
  recoverRvmDeepSourcePathFromInstruction,
  recoverDeepRvmSourcePathFromCandidates,
  isWeakRvmSourcePath,
} from './RvmDeepSourcePathRecoveryBridge.js?v=20260622-rvm-deep-source-path-recovery-1';

const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-zone-density-selector-v5');
const STYLE_ID = 'rvm-zone-density-selector-style-v5';
const VERSION = '20260622-rvm-zone-density-selector-5';
const LARGE_FILE_THRESHOLD_BYTES = 8 * 1024 * 1024;
const ZONE_STORAGE_KEY = 'rvm_zone_density_last_selection_v2';
const DENSITY_STORAGE_KEY = 'rvm_zone_density_detail_by_zone_v2';
const GLOBAL_DETAIL_STORAGE_KEY = 'rvm_zone_lod_detail_v1';
const MAX_LEVEL = 2;
const MAX_SELECTOR_ROWS = 240;
const DENSITY_OPTIONS = [250, 100, 50, 25];
const GENERIC_BUCKETS = new Set(['EQUIPMENT', 'STRUCTURE', 'STRUCTURES', 'PIPING', 'PIPE', 'CIVIL', 'MODEL', 'RVM', 'REV']);
const CIVIL_CATEGORY = new Set(['GRID', 'GRIDS', 'FDNS', 'FDN', 'FOUNDATION', 'FOOTING', 'PITS', 'PIT', 'ROAD', 'GRAD', 'GRADE', 'PAVE', 'TRENCH', 'DRAIN', 'PANEL', 'FRAMEWORK', 'FRMWORK', 'FRMW', 'STRUCTURE', 'STRUCTURAL']);
const PROCESS_CATEGORY = new Set(['PI', 'SU', 'CI', 'PIPE', 'PIPING', 'EQUIPMENT', 'EQPT']);

export function installRvmZoneDensitySelectorBridge() {
  if (typeof document === 'undefined') return null;
  if (globalThis[INSTALL_FLAG]) return globalThis[INSTALL_FLAG];
  injectStyles();
  const state = { version: VERSION, beforeRenderInstructions, buildSelectorRows, selectorSource: 'synthetic-navis-tree' };
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
  const source = Array.isArray(manifestNodes) && manifestNodes.length ? 'preload-manifest+instructions+synthetic' : 'instructions+synthetic';
  const rowMap = new Map();
  const manifestContext = buildManifestContext(manifestNodes);
  const addTreeParts = (parts = [], count = 0, meta = {}) => {
    const clean = parts.map((part) => String(part || '').trim()).filter(Boolean).slice(0, MAX_LEVEL + 1);
    if (!clean.length) return;
    for (let depth = 0; depth < clean.length; depth += 1) {
      const key = `/${clean.slice(0, depth + 1).join('/')}`.replace(/\/+/g, '/');
      const entry = rowMap.get(key) || {
        key,
        path: key,
        parentPath: parentPathFor(key),
        name: depth === 0 ? `/${clean[depth]}` : clean[depth],
        label: depth === 0 ? `/${clean[depth]}` : clean[depth],
        count: 0,
        primitiveCount: 0,
        depth,
        source: meta.source || source,
        type: depth === 0 ? 'ZONE' : 'NODE',
        childCount: 0,
        hasChildren: false,
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
    const parts = syntheticTreePartsFromPath(path, { fileName, name: node.name || node.attributes?.NAME });
    if (parts.length && !isGenericOnly(parts)) addTreeParts(parts, 0, { source: 'preload-manifest', type: node.type || node.kind || node.attributes?.TYPE || 'NODE' });
  }

  for (const instruction of instructions) {
    const parts = selectorTreePartsForInstruction(instruction, { fileName, manifestContext });
    addTreeParts(parts, 1, { source: 'instructions', type: instruction?.type || instruction?.kind || 'NODE' });
  }

  let rows = [...rowMap.values()].filter((row) => row.depth <= MAX_LEVEL && (row.count > 0 || row.source === 'preload-manifest'));
  rows = removeGenericRows(rows);
  rollChildren(rows);
  rows = preferParentZones(rows);
  rows.sort((a, b) => rowOrder(a, b));
  const limited = limitRowsByTopZones(rows, MAX_SELECTOR_ROWS);
  limited.selectorSource = source;
  limited.topPaths = limited.filter((row) => Number(row.depth || 0) === 0).map((row) => row.key);
  return limited;
}

function selectorTreePartsForInstruction(instruction = {}, { fileName = '', manifestContext = null } = {}) {
  const raw = recoverRvmDeepSourcePathFromInstruction(instruction, { fileName });
  const manifestPath = manifestContext ? manifestPathForInstruction(instruction, manifestContext) : '';
  const manifest = recoverDeepRvmSourcePathFromCandidates([manifestPath], { fileName });
  const candidateValues = [
    raw?.displayPath,
    manifest?.displayPath,
    instruction.sourcePath,
    instruction.reviewName,
    instruction.displayName,
    instruction.sourceName,
    instruction.name,
    instruction.attributes?.RVM_OWNER_PATH,
    instruction.attributes?.RVM_REVIEW_PATH,
    instruction.attributes?.REVIEW_NAME,
  ];
  let best = [];
  let bestScore = -Infinity;
  for (const value of candidateValues) {
    const parts = syntheticTreePartsFromPath(value, { fileName, name: instruction.displayName || instruction.name || '' });
    if (!parts.length || isGenericOnly(parts)) continue;
    const score = scoreSelectorParts(parts, value);
    if (score > bestScore || (score === bestScore && parts.join('/').length > best.join('/').length)) { best = parts; bestScore = score; }
  }
  return best.length ? best : ['Unzoned'];
}

function syntheticTreePartsFromPath(value = '', options = {}) {
  const recovered = recoverDeepRvmSourcePathFromCandidates([value, options.name], { fileName: options.fileName || '' });
  let parts = (recovered.parts || []).map(cleanPart).filter(Boolean).filter((part) => !/^RVM\s+RVM_PRIM_CODE/i.test(part));
  if (!parts.length) return [];
  while (parts.length > 1 && GENERIC_BUCKETS.has(parts[0].toUpperCase())) parts = parts.slice(1);
  const plantIndex = parts.findIndex((part) => isPlantLikePart(part));
  if (plantIndex >= 0) {
    const first = expandPlantPart(parts[plantIndex]);
    const tail = parts.slice(plantIndex + 1).filter((part) => !GENERIC_BUCKETS.has(part.toUpperCase()));
    return compactTreeParts([...first, ...tail]).slice(0, MAX_LEVEL + 1);
  }
  const firstPlantName = parts.find((part) => /[-_]/.test(part) && /[A-Z]/i.test(part));
  if (firstPlantName) return compactTreeParts([firstPlantName, ...parts.slice(parts.indexOf(firstPlantName) + 1)]).slice(0, MAX_LEVEL + 1);
  return compactTreeParts(parts).slice(0, MAX_LEVEL + 1);
}

function expandPlantPart(part = '') {
  const text = cleanPart(part);
  const tokens = text.split(/[-_]/).filter(Boolean);
  if (tokens.length < 3) return [text];
  const upper = tokens.map((token) => token.toUpperCase());
  const cu = upper.indexOf('CU');
  if (cu >= 0 && tokens[cu + 1]) {
    const rootTokens = tokens.slice(0, cu + 2);
    const root = rootTokens.join('-');
    const rest = tokens.slice(cu + 2);
    const children = civilOrProcessChildren(root, rest);
    return [root, ...children];
  }
  const civilIndex = upper.findIndex((token, idx) => idx >= 2 && CIVIL_CATEGORY.has(token));
  if (civilIndex >= 0) {
    const root = tokens.slice(0, civilIndex + 1).join('-');
    const child = tokens.length > civilIndex + 1 ? tokens.slice(0, civilIndex + 2).join('-') : '';
    return child ? [root, child] : [root];
  }
  const processIndex = upper.findIndex((token, idx) => idx >= 2 && PROCESS_CATEGORY.has(token));
  if (processIndex >= 0) return [tokens.slice(0, processIndex + 1).join('-')];
  return [tokens.slice(0, Math.min(3, tokens.length)).join('-'), text];
}

function civilOrProcessChildren(root, rest = []) {
  const clean = rest.filter(Boolean);
  const withoutLeadingNumbers = clean.filter((token, idx) => idx > 0 || !/^\d+[A-Z]?$/i.test(token));
  const categoryIndex = withoutLeadingNumbers.findIndex((token) => CIVIL_CATEGORY.has(token.toUpperCase()) || PROCESS_CATEGORY.has(token.toUpperCase()));
  if (categoryIndex < 0) return clean.length ? [`${root}-${clean[0]}`] : [];
  const category = withoutLeadingNumbers[categoryIndex];
  const child = `${root}-${category}`;
  const next = withoutLeadingNumbers[categoryIndex + 1];
  return next ? [child, `${child}-${next}`] : [child];
}

function compactTreeParts(parts = []) {
  const out = [];
  const seen = new Set();
  for (const part of parts.map(cleanPart).filter(Boolean)) {
    const key = part.toLowerCase();
    if (GENERIC_BUCKETS.has(part.toUpperCase()) || seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

function preferParentZones(rows = []) {
  const roots = rows.filter((row) => row.depth === 0);
  if (!roots.length) return rows;
  const parentRoots = new Set();
  for (const root of roots) {
    const compact = collapseHyphenRoot(root.name || root.key);
    if (compact && compact !== cleanPart(root.name || root.key)) parentRoots.add(`/${compact}`);
  }
  return rows;
}

function collapseHyphenRoot(value = '') { return cleanPart(value); }

export function applyZoneDensitySelection(instructionSet = {}, selection = {}) {
  const original = Array.isArray(instructionSet.instructions) ? instructionSet.instructions : [];
  const selectedZones = selection.mode === 'selected' ? (selection.selectedZones || []).map(String) : [];
  const selectedNormalized = selectedZones.map((zone) => normalizeSelectorKey(zone)).filter(Boolean);
  const zoneDensities = selection.zoneDensities || {};
  const kept = [];
  let skippedByZone = 0;
  let skippedByDensity = 0;
  for (const instruction of original) {
    const path = normalizeSelectorKey(selectorKeyForInstruction(instruction));
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
        schemaVersion: 'browser-rvm-zone-selection/v6-synthetic-navis-density-tree',
        selectorSource: selection.selectorSource || 'instructions+synthetic',
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

function selectorKeyForInstruction(instruction = {}) { return `/${selectorTreePartsForInstruction(instruction).join('/')}`.replace(/\/+/g, '/'); }

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
          <div><b>Large RVM load: choose hierarchy zones to render</b><p>${esc(file?.name || 'RVM file')} has ${instructionCount} render instruction(s). Selector source: ${esc(rows.selectorSource || 'instructions')}. Synthetic Navis-style tree, first ${MAX_LEVEL + 1} levels only.</p></div>
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
        <div class="rvm-zone-density-list" role="tree">${rows.map((row) => zoneRowHtml(row, defaultSelected.has(row.key), defaultDensities[row.key] || 100)).join('')}</div>
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
      }
    };
    const applyVisibility = () => {
      const q = search?.value?.trim?.().toLowerCase?.() || '';
      const allRows = [...overlay.querySelectorAll('[data-zone-density-row]')];
      const matched = new Set();
      if (q) for (const row of allRows) if (row.dataset.zoneSearch.includes(q)) {
        matched.add(row.dataset.zonePath);
        let path = '';
        for (const part of row.dataset.zonePath.split('/').filter(Boolean)) { path += `/${part}`; matched.add(path); }
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
    const update = () => { updateTreeState(); applyVisibility(); const picked = selectedZones(); if (summary) summary.textContent = `${picked.length} zone(s) selected · ${visibleRows().length} visible · per-zone density supports 25/50/100/250%`; const primary = overlay.querySelector('[data-zone-density-action="selected"]'); if (primary) primary.disabled = picked.length === 0; };
    const close = (payload) => { overlay.remove(); resolve(payload); };
    overlay.addEventListener('change', (event) => {
      const box = event.target?.closest?.('[data-zone-density-key]');
      if (box) {
        const row = box.closest('[data-zone-density-row]');
        const key = row?.dataset.zonePath || box.dataset.zoneDensityKey;
        const checked = box.checked;
        overlay.querySelectorAll('[data-zone-density-row]').forEach((childRow) => {
          if (childRow.dataset.zonePath !== key && childRow.dataset.zonePath.startsWith(`${key}/`)) {
            const childBox = childRow.querySelector('[data-zone-density-key]');
            if (childBox) childBox.checked = checked;
          }
        });
      }
      const def = event.target?.closest?.('[data-zone-density-default]');
      if (def) { storageSet(GLOBAL_DETAIL_STORAGE_KEY, def.value || '100'); overlay.querySelectorAll('[data-zone-density-percent]').forEach((select) => { if (!select.dataset.zoneDensityTouched) select.value = def.value || '100'; }); }
      const percent = event.target?.closest?.('[data-zone-density-percent]');
      if (percent) percent.dataset.zoneDensityTouched = 'true';
      update();
    });
    overlay.addEventListener('click', (event) => {
      const toggle = event.target?.closest?.('[data-zone-density-toggle]');
      if (toggle) { event.preventDefault(); event.stopPropagation(); const row = toggle.closest('[data-zone-density-row]'); if (row) row.dataset.zoneExpanded = row.dataset.zoneExpanded === 'true' ? 'false' : 'true'; update(); return; }
      const action = event.target?.closest?.('[data-zone-density-action]')?.dataset.zoneDensityAction;
      if (!action) return;
      event.preventDefault();
      if (action === 'all') close({ mode: 'all', selectedZones: [], zoneDensities: {}, selectorSource: rows.selectorSource || 'instructions+synthetic' });
      if (action === 'clear') { boxes().forEach((box) => { box.checked = false; box.indeterminate = false; }); update(); }
      if (action === 'check-visible') { visibleRows().forEach((row) => { const box = row.querySelector('[data-zone-density-key]'); if (box) box.checked = true; }); update(); }
      if (action === 'top3') { const top = new Set(topRows(rows, 3).map((row) => row.key)); boxes().forEach((box) => { box.checked = top.has(box.dataset.zoneDensityKey); }); update(); }
      if (action === 'expand-all' || action === 'collapse-all') { overlay.querySelectorAll('[data-zone-density-row]').forEach((row) => { row.dataset.zoneExpanded = action === 'expand-all' ? 'true' : 'false'; }); update(); }
      if (action === 'selected') { const picked = selectedZones(); const zoneDensities = densities(); storageSet(ZONE_STORAGE_KEY, JSON.stringify(picked)); storageSet(DENSITY_STORAGE_KEY, JSON.stringify(zoneDensities)); close({ mode: 'selected', selectedZones: picked, zoneDensities, selectorSource: rows.selectorSource || 'instructions+synthetic' }); }
    });
    search?.addEventListener('input', update);
    update();
  });
}

function zoneRowHtml(row, checked, density) {
  const depth = Math.max(0, Math.min(MAX_LEVEL, Number(row.depth || 0)));
  const hasChildren = Boolean(row.hasChildren || Number(row.childCount || 0) > 0);
  const label = row.label || row.name || row.key;
  return `<div class="rvm-zone-density-row" data-zone-density-row="true" data-zone-depth="${depth}" data-zone-path="${esc(row.key)}" data-zone-parent="${esc(row.parentPath || parentPathFor(row.key))}" data-zone-expanded="false" data-zone-search="${esc(`${row.key} ${label} ${row.type || ''}`.toLowerCase())}" role="treeitem" aria-level="${depth + 1}" style="--zone-depth:${depth}">
    <button type="button" class="rvm-zone-density-toggle" data-zone-density-toggle="true" ${hasChildren ? '' : 'disabled'} aria-label="Toggle ${esc(row.key)}">${hasChildren ? '+' : ''}</button>
    <input type="checkbox" data-zone-density-key="${esc(row.key)}" ${checked ? 'checked' : ''} />
    <span class="rvm-zone-density-name" title="${esc(row.key)}"><span class="rvm-zone-density-indent"></span>${esc(label)}</span>
    <span class="rvm-zone-density-count">${Number(row.count || 0)}</span>
    <select data-zone-density-percent="${esc(row.key)}" title="Render density for ${esc(row.key)}">${densityOptionsHtml(density)}</select>
  </div>`;
}

function buildManifestContext(manifestNodes = []) {
  const byId = new Map();
  for (const node of Array.isArray(manifestNodes) ? manifestNodes : []) {
    const keys = [node.canonicalObjectId, node.sourceObjectId, node.renderObjectId, node.id, node.key, node.attributes?.CANONICAL_OBJECT_ID, node.attributes?.SOURCE_OBJECT_ID, node.attributes?.RVM_OBJECT_ID, node.attributes?.ID].filter(Boolean).map(String);
    for (const key of keys) byId.set(key, node);
  }
  return { byId };
}
function manifestPathForInstruction(instruction = {}, context = {}) { const candidates = [instruction.canonicalObjectId, instruction.sourceObjectId, instruction.renderObjectId, instruction.id, instruction.attributes?.CANONICAL_OBJECT_ID, instruction.attributes?.SOURCE_OBJECT_ID, instruction.attributes?.RVM_OBJECT_ID, instruction.attributes?.ID].filter(Boolean).map(String); for (const key of candidates) { const node = context.byId?.get?.(key); if (!node) continue; const path = manifestPathForNode(node, context.byId); if (path) return path; } return ''; }
function manifestPathForNode(node = {}, byId = new Map()) { const attrs = node.attributes || {}; const direct = attrs.RVM_OWNER_PATH || attrs.RVM_OWNER_NAME || attrs.RVM_REVIEW_PATH || attrs.REVIEW_NAME || node.path || attrs.PATH || attrs.FULL_PATH; if (String(direct || '').includes('/')) return direct; const parts = []; let cur = node; const seen = new Set(); while (cur && !seen.has(cur.canonicalObjectId || cur.sourceObjectId || cur.id || cur.name)) { seen.add(cur.canonicalObjectId || cur.sourceObjectId || cur.id || cur.name); const name = cur.name || cur.attributes?.NAME || cur.attributes?.RVM_NAME || cur.attributes?.RVM_REVIEW_NAME || cur.canonicalObjectId; if (name) parts.push(String(name).replace(/^\/+/g, '')); const parentKey = cur.parentCanonicalObjectId || cur.parentSourceObjectId || cur.parentId || cur.attributes?.PARENT_CANONICAL_OBJECT_ID || cur.attributes?.PARENT_ID; cur = parentKey ? byId.get(String(parentKey)) : null; } return `/${parts.reverse().filter(Boolean).join('/')}`; }
function rollChildren(rows = []) { const byKey = new Map(rows.map((row) => [row.key, row])); for (const row of rows) { const parent = byKey.get(row.parentPath); if (parent) { parent.hasChildren = true; parent.childCount = Number(parent.childCount || 0) + 1; } } }
function removeGenericRows(rows = []) { const hasRealRoot = rows.some((row) => row.depth === 0 && !GENERIC_BUCKETS.has(cleanPart(row.name || row.key).toUpperCase())); return hasRealRoot ? rows.filter((row) => !(row.depth === 0 && GENERIC_BUCKETS.has(cleanPart(row.name || row.key).toUpperCase()))) : rows; }
function limitRowsByTopZones(rows = [], max = MAX_SELECTOR_ROWS) { const top = rows.filter((row) => row.depth === 0).sort((a, b) => sortZoneRows(a, b)); const allowed = new Set(); for (const row of top) { allowed.add(row.key); for (const child of rows.filter((item) => item.key !== row.key && item.key.startsWith(`${row.key}/`)).sort((a, b) => rowOrder(a, b))) allowed.add(child.key); if (allowed.size >= max) break; } return rows.filter((row) => allowed.has(row.key)).sort((a, b) => rowOrder(a, b)).slice(0, max); }
function isAncestorExpanded(row, allRows) { const parent = row.dataset.zoneParent || ''; if (!parent) return true; const parentRow = allRows.find((item) => item.dataset.zonePath === parent); if (!parentRow || parentRow.dataset.zoneExpanded !== 'true') return false; return isAncestorExpanded(parentRow, allRows); }
function shouldKeepInstruction(instruction = {}, percent = 100) { if (percent >= 100) return true; const type = String(instruction.type || '').toUpperCase(); const primitive = String(instruction.renderPrimitive || instruction.kind || '').toUpperCase(); if (type === 'SUPPORT' || primitive.includes('SUPPORT') || primitive.includes('CYLINDER') || type === 'PIPE') return true; const factor = percent >= 50 ? 2 : 4; return stableHash(`${selectorKeyForInstruction(instruction)}|${instruction.displayName}|${primitive}`) % factor === 0; }
function bestZoneMatch(path, zones) { let best = ''; for (const zone of zones) if (path === zone || path.startsWith(`${zone}/`)) if (zone.length > best.length) best = zone; return best; }
function normalizeSelectorKey(path = '') { return `/${String(path || '').split('/').filter(Boolean).join('/')}`.toLowerCase().replace(/\/+/g, '/').replace(/\/$/, ''); }
function topRows(rows = [], count = 3) { return rows.filter((row) => Number(row.depth || 0) === 0).sort((a, b) => Number(b.count || 0) - Number(a.count || 0) || a.key.localeCompare(b.key)).slice(0, count); }
function defaultDensityMap(rows = [], saved = {}) { const out = {}; for (const row of rows) out[row.key] = positiveDensity(saved[row.key] || storageGet(GLOBAL_DETAIL_STORAGE_KEY, '100')); return out; }
function parentPathFor(path = '') { const parts = String(path || '').split('/').filter(Boolean); return parts.length <= 1 ? '' : `/${parts.slice(0, -1).join('/')}`; }
function sortZoneRows(a, b) { return Number(b.count || 0) - Number(a.count || 0) || String(a.key).localeCompare(String(b.key), undefined, { numeric: true, sensitivity: 'base' }); }
function rowOrder(a, b) { const partsA = String(a.key || '').split('/').filter(Boolean); const partsB = String(b.key || '').split('/').filter(Boolean); const len = Math.min(partsA.length, partsB.length); for (let i = 0; i < len; i += 1) { const cmp = partsA[i].localeCompare(partsB[i], undefined, { numeric: true, sensitivity: 'base' }); if (cmp) return cmp; } return partsA.length - partsB.length; }
function scoreSelectorParts(parts = [], value = '') { let score = parts.length * 2; if (parts[0] && /[-_]/.test(parts[0])) score += 6; if (/\bCU[-_](CI|SU|PI)\b/i.test(parts[0] || '')) score += 8; if (/GRID|FDNS|PITS|FRMW|PANEL|PIPE|VALVE|PUMP|EQUIPMENT/i.test(String(value))) score += 2; return score; }
function isGenericOnly(parts = []) { return parts.length === 1 && GENERIC_BUCKETS.has(String(parts[0]).toUpperCase()); }
function isPlantLikePart(part = '') { const text = cleanPart(part); return /^[A-Z]{2,}[-_]\d+/i.test(text) || /\bCU[-_](CI|SU|PI)\b/i.test(text) || /^[A-Z0-9]+[-_][A-Z0-9]+[-_][A-Z0-9]+/i.test(text); }
function cleanPart(value = '') { return String(value || '').replace(/^\/+|\/+$/g, '').trim(); }
function densityOptionsHtml(current) { return DENSITY_OPTIONS.map((value) => `<option value="${value}" ${Number(current) === value ? 'selected' : ''}>${value}%</option>`).join(''); }
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
    .rvm-zone-density-modal{width:min(1040px,calc(100vw - 40px));max-height:min(820px,calc(100vh - 40px));background:#101827;border:1px solid rgba(126,190,255,.36);border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.58);display:flex;flex-direction:column;overflow:hidden}
    .rvm-zone-density-head,.rvm-zone-density-toolbar,.rvm-zone-density-foot{display:flex;gap:10px;align-items:center;padding:12px;border-bottom:1px solid rgba(126,190,255,.18)}
    .rvm-zone-density-head{justify-content:space-between}.rvm-zone-density-head p{margin:4px 0 0;color:#9fb4d2;font-size:12px}.rvm-zone-density-toolbar input{flex:1;min-width:180px}.rvm-zone-density-toolbar input,.rvm-zone-density-toolbar select,.rvm-zone-density-row select{background:#0b1220;color:#e8f3ff;border:1px solid rgba(126,190,255,.28);border-radius:8px;padding:6px 8px}.rvm-zone-density-head button,.rvm-zone-density-toolbar button,.rvm-zone-density-primary{background:#1d4ed8;color:#fff;border:1px solid rgba(147,197,253,.45);border-radius:8px;padding:7px 10px;cursor:pointer}.rvm-zone-density-list{overflow:auto;padding:8px;min-height:300px}.rvm-zone-density-row{display:grid;grid-template-columns:28px 26px minmax(360px,1fr) 86px 86px;gap:8px;align-items:center;padding:5px 8px;margin:2px 0;border:1px solid rgba(126,190,255,.10);border-radius:8px;background:rgba(15,23,42,.65)}.rvm-zone-density-row:hover{border-color:rgba(126,190,255,.35);background:rgba(30,41,59,.72)}.rvm-zone-density-toggle{height:22px;border-radius:6px;border:1px solid rgba(126,190,255,.25);background:#0b1220;color:#dbeafe;cursor:pointer}.rvm-zone-density-toggle:disabled{opacity:.35;cursor:default}.rvm-zone-density-name{padding-left:calc(var(--zone-depth) * 24px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rvm-zone-density-count{font-variant-numeric:tabular-nums;text-align:right;color:#b6c9e8}.rvm-zone-density-foot{border-top:1px solid rgba(126,190,255,.18);border-bottom:0;justify-content:space-between;color:#b6c9e8}.rvm-zone-density-primary:disabled{opacity:.45;cursor:not-allowed}
  `;
  document.head.appendChild(style);
}
