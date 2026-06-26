const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-zone-lod-label-bridge-v2');
const LARGE_FILE_THRESHOLD_BYTES = 8 * 1024 * 1024;
const DEFAULT_LABEL_CONFIRM_THRESHOLD = 28;
const ZONE_STORAGE_KEY = 'rvm_zone_lod_last_selection_v1';
const DETAIL_STORAGE_KEY = 'rvm_zone_lod_detail_v1';
const PRELOAD_MANIFEST_SCHEMA = 'browser-rvm-preload-hierarchy-manifest/v1';
const MAX_SELECTOR_ROWS = 700;

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function storageGet(key, fallback = '') {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

function setStatus(root, message, warning = false) {
  const el = root?.querySelector?.('#rvm-sb-msg');
  if (!el) return;
  el.textContent = message;
  el.style.color = warning ? '#ffcf70' : '';
}

function zoneKeyForInstruction(instruction = {}) {
  const attrs = instruction.attributes || {};
  const raw = [
    instruction.sourcePath,
    attrs.RVM_OWNER_PATH,
    attrs.RVM_OWNER_NAME,
    attrs.NAME,
    instruction.displayName,
    instruction.sourceName,
  ].filter(Boolean).join('/');
  const parts = raw
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^RVM\s+RVM_PRIM_CODE/i.test(part));

  const preferred = parts.find((part) => /^(BTRM|PS[-_]?|SL[-_]?|EQUI|STRU|PIPE|BRANCH|PANEL|FLOOR|FRAME|GRAD|GRID|ROAD|FRMW|FDNS|PITS|STDS|SLEE)/i.test(part));
  const fallback = parts.find((part) => !/^GAS_?\d/i.test(part)) || parts[0] || 'Unzoned';
  return normalizeZoneLabel(preferred || fallback);
}

function normalizeZoneLabel(value) {
  const text = String(value || 'Unzoned').replace(/\s+/g, ' ').trim();
  if (!text) return 'Unzoned';
  return text.startsWith('/') ? text : `/${text}`;
}

function instructionSearchText(instruction = {}) {
  const attrs = instruction.attributes || {};
  return [
    instruction.sourcePath,
    instruction.sourceName,
    instruction.displayName,
    attrs.RVM_OWNER_PATH,
    attrs.RVM_OWNER_NAME,
    attrs.NAME,
    attrs.TYPE,
  ].filter(Boolean).map(String).join('/');
}

function instructionMatchesZone(instruction, selectedSet) {
  if (!selectedSet?.size) return true;
  const direct = zoneKeyForInstruction(instruction);
  if (selectedSet.has(direct)) return true;
  const text = instructionSearchText(instruction).replace(/\\/g, '/');
  for (const zone of selectedSet) {
    const raw = String(zone || '').trim();
    const bare = raw.replace(/^\/+/, '');
    if (!bare) continue;
    if (text.includes(raw) || text.includes(bare)) return true;
    if (text.split('/').map((part) => part.trim()).includes(bare)) return true;
  }
  return false;
}

function buildZones(instructions = []) {
  const map = new Map();
  for (const instruction of instructions) {
    const key = zoneKeyForInstruction(instruction);
    const entry = map.get(key) || { key, count: 0, supportCount: 0, primitiveCounts: {}, depth: 0, source: 'instructions' };
    entry.count += 1;
    if (String(instruction.type || '').toUpperCase() === 'SUPPORT') entry.supportCount += 1;
    const primitive = String(instruction.renderPrimitive || 'UNKNOWN').toUpperCase();
    entry.primitiveCounts[primitive] = (entry.primitiveCounts[primitive] || 0) + 1;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function manifestNodePath(node = {}, byId = new Map()) {
  const attrs = node.attributes || {};
  const direct = attrs.RVM_OWNER_PATH || node.canonicalObjectId || node.name || attrs.NAME;
  if (String(direct || '').includes('/')) return normalizeZoneLabel(direct);
  const parts = [];
  let cur = node;
  const seen = new Set();
  while (cur && !seen.has(cur.canonicalObjectId)) {
    seen.add(cur.canonicalObjectId);
    const text = cur.name || cur.attributes?.NAME || cur.canonicalObjectId;
    if (text) parts.push(String(text).replace(/^\/+/, ''));
    cur = cur.parentCanonicalObjectId ? byId.get(cur.parentCanonicalObjectId) : null;
  }
  return normalizeZoneLabel(parts.reverse().join('/'));
}

function buildPreloadHierarchyZones(manifestNodes = [], instructions = []) {
  if (!Array.isArray(manifestNodes) || manifestNodes.length === 0) return [];
  const instructionZones = buildZones(instructions);
  const byId = new Map(manifestNodes.map((node) => [node.canonicalObjectId, node]));
  const rows = [];
  const seen = new Set();
  for (const node of manifestNodes) {
    if (!node || !node.canonicalObjectId) continue;
    const key = manifestNodePath(node, byId);
    const depth = Number.isFinite(Number(node.depth)) ? Number(node.depth) : Math.max(key.split('/').filter(Boolean).length - 1, 0);
    if (seen.has(key)) continue;
    seen.add(key);
    const count = countInstructionsForZone(instructions, key, instructionZones);
    if (count <= 0 && depth > 2) continue;
    rows.push({
      key,
      count,
      supportCount: 0,
      primitiveCounts: {},
      depth: Math.min(depth, 8),
      source: 'preload-manifest',
      type: node.type || node.kind || node.attributes?.TYPE || 'NODE',
    });
    if (rows.length >= MAX_SELECTOR_ROWS) break;
  }
  return rows.sort((a, b) => a.depth - b.depth || b.count - a.count || a.key.localeCompare(b.key));
}

function countInstructionsForZone(instructions = [], zoneKey = '', instructionZones = []) {
  const direct = instructionZones.find((zone) => zone.key === zoneKey)?.count;
  if (direct) return direct;
  const selected = new Set([zoneKey]);
  let count = 0;
  for (const instruction of instructions) if (instructionMatchesZone(instruction, selected)) count += 1;
  return count;
}

function detailFactor() {
  const value = storageGet(DETAIL_STORAGE_KEY, '100');
  if (value === '50') return 2;
  if (value === '25') return 4;
  return 1;
}

function stableHash(text = '') {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function applyLod(instructions, factor) {
  if (factor <= 1) return { instructions, skipped: 0 };
  const kept = [];
  let skipped = 0;
  for (const instruction of instructions) {
    const type = String(instruction.type || '').toUpperCase();
    const primitive = String(instruction.renderPrimitive || '').toUpperCase();
    const alwaysKeep = type === 'SUPPORT' || primitive.includes('SUPPORT') || primitive.includes('CYLINDER');
    if (alwaysKeep || stableHash(`${instruction.sourcePath}|${instruction.displayName}|${primitive}`) % factor === 0) kept.push(instruction);
    else skipped += 1;
  }
  return { instructions: kept, skipped };
}

function selectedZonesFromStorage() {
  try {
    const parsed = JSON.parse(storageGet(ZONE_STORAGE_KEY, '[]'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function showZoneSelector({ file, zones, instructionCount, selectorSource = 'instructions' }) {
  if (typeof document === 'undefined') return { mode: 'all', selectedZones: [], selectorSource };

  return new Promise((resolve) => {
    const previous = new Set(selectedZonesFromStorage());
    const overlay = document.createElement('div');
    overlay.className = 'rvm-zone-select-overlay';
    overlay.innerHTML = `
      <div class="rvm-zone-select-modal" role="dialog" aria-modal="true" aria-label="Select RVM zones to render">
        <div class="rvm-zone-select-head">
          <div>
            <b>Large RVM load: choose hierarchy zones to render</b>
            <p>${esc(file?.name || 'RVM file')} has ${instructionCount} render instruction(s). Selector source: ${esc(selectorSource)}.</p>
          </div>
          <button type="button" data-zone-action="all" title="Render all zones">Render all</button>
        </div>
        <div class="rvm-zone-select-toolbar">
          <input data-zone-search placeholder="Search hierarchy zones…" />
          <button type="button" data-zone-action="check-visible">Check visible</button>
          <button type="button" data-zone-action="top3">Top 3</button>
          <button type="button" data-zone-action="clear">Clear</button>
          <label>Detail
            <select data-zone-detail>
              <option value="100">100%</option>
              <option value="50">50%</option>
              <option value="25">25%</option>
            </select>
          </label>
        </div>
        <div class="rvm-zone-list" data-zone-preload-manifest="${selectorSource === 'preload-manifest'}">
          ${zones.slice(0, MAX_SELECTOR_ROWS).map((zone, index) => `
            <label class="rvm-zone-row" data-zone-row="${esc(zone.key.toLowerCase())}" data-zone-depth="${Number(zone.depth || 0)}" style="--zone-depth:${Number(zone.depth || 0)}">
              <input type="checkbox" data-zone-key="${esc(zone.key)}" ${previous.has(zone.key) || (!previous.size && index < 3) ? 'checked' : ''} />
              <span class="rvm-zone-name"><span class="rvm-zone-indent"></span>${esc(zone.key)}</span>
              <span class="rvm-zone-count">${Number(zone.count || 0)}</span>
            </label>
          `).join('')}
        </div>
        <div class="rvm-zone-select-foot">
          <span data-zone-summary></span>
          <button type="button" class="rvm-zone-primary" data-zone-action="selected">Render selected zones</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    injectZoneStyles();

    const detail = overlay.querySelector('[data-zone-detail]');
    if (detail) detail.value = storageGet(DETAIL_STORAGE_KEY, '100');
    const search = overlay.querySelector('[data-zone-search]');
    const summary = overlay.querySelector('[data-zone-summary]');
    const checkboxes = () => [...overlay.querySelectorAll('[data-zone-key]')];
    const visibleRows = () => [...overlay.querySelectorAll('[data-zone-row]')].filter((row) => row.style.display !== 'none');
    const selected = () => checkboxes().filter((box) => box.checked).map((box) => box.dataset.zoneKey);
    const close = (result) => {
      overlay.remove();
      resolve({ ...result, selectorSource });
    };
    const update = () => {
      const picked = selected();
      if (summary) summary.textContent = `${picked.length} zone(s) selected · ${visibleRows().length} visible in selector`;
      const primary = overlay.querySelector('[data-zone-action="selected"]');
      if (primary) primary.disabled = picked.length === 0;
    };

    search?.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      overlay.querySelectorAll('[data-zone-row]').forEach((row) => {
        row.style.display = !q || row.dataset.zoneRow.includes(q) ? '' : 'none';
      });
      update();
    });
    overlay.addEventListener('change', (event) => {
      if (event.target?.matches?.('[data-zone-key]')) update();
      if (event.target?.matches?.('[data-zone-detail]')) storageSet(DETAIL_STORAGE_KEY, event.target.value || '100');
    });
    overlay.addEventListener('click', (event) => {
      const action = event.target?.closest?.('[data-zone-action]')?.dataset?.zoneAction;
      if (!action) return;
      if (action === 'all') close({ mode: 'all', selectedZones: [] });
      if (action === 'clear') { checkboxes().forEach((box) => { box.checked = false; }); update(); }
      if (action === 'check-visible') { visibleRows().forEach((row) => { row.querySelector('input').checked = true; }); update(); }
      if (action === 'top3') { checkboxes().forEach((box, index) => { box.checked = index < 3; }); update(); }
      if (action === 'selected') {
        const picked = selected();
        storageSet(ZONE_STORAGE_KEY, JSON.stringify(picked));
        close({ mode: 'selected', selectedZones: picked });
      }
    });
    update();
  });
}

function filterInstructionSet(instructionSet, selection) {
  const original = Array.isArray(instructionSet.instructions) ? instructionSet.instructions : [];
  const selectedSet = new Set(selection.selectedZones || []);
  const zoneFiltered = selection.mode === 'selected'
    ? original.filter((instruction) => instructionMatchesZone(instruction, selectedSet))
    : original;
  const factor = detailFactor();
  const lod = applyLod(zoneFiltered, factor);
  const instructions = lod.instructions;
  return {
    ...instructionSet,
    instructions,
    count: instructions.length,
    diagnostics: {
      ...(instructionSet.diagnostics || {}),
      originalInstructionCount: instructionSet.diagnostics?.originalInstructionCount || original.length,
      zoneSelection: {
        schemaVersion: 'browser-rvm-zone-selection/v2-preload-hierarchy-checkboxes',
        preloadManifestSchema: PRELOAD_MANIFEST_SCHEMA,
        selectorSource: selection.selectorSource || 'instructions',
        enabled: true,
        mode: selection.mode,
        selectedZones: [...selectedSet],
        originalInstructionCount: original.length,
        afterZoneInstructionCount: zoneFiltered.length,
        renderedInstructionCount: instructions.length,
        skippedByZoneCount: original.length - zoneFiltered.length,
      },
      lodSelection: {
        schemaVersion: 'browser-rvm-lod/v1-instruction-sampling',
        detailPercent: factor === 1 ? 100 : factor === 2 ? 50 : 25,
        samplingFactor: factor,
        skippedByLodCount: lod.skipped,
      },
    },
  };
}

async function beforeRenderInstructions({ instructionSet, file, parsed }) {
  const instructions = Array.isArray(instructionSet?.instructions) ? instructionSet.instructions : [];
  const manifestZones = buildPreloadHierarchyZones(parsed?.manifestNodes || [], instructions);
  const instructionZones = buildZones(instructions);
  const zones = manifestZones.length > 1 ? manifestZones : instructionZones;
  const selectorSource = manifestZones.length > 1 ? 'preload-manifest' : 'instructions';
  const fileSize = Number(file?.size || 0);
  const shouldPrompt = fileSize >= LARGE_FILE_THRESHOLD_BYTES && zones.length > 1;
  const selection = shouldPrompt
    ? await showZoneSelector({ file, zones, instructionCount: instructions.length, selectorSource })
    : { mode: 'all', selectedZones: [], selectorSource };
  return filterInstructionSet(instructionSet, selection);
}

function injectZoneToolbar(root) {
  if (!root || root.dataset.rvmZoneLodBound === 'true') return;
  const ribbon = root.querySelector('.geo-top-ribbon');
  if (!ribbon) return;
  root.dataset.rvmZoneLodBound = 'true';
  const section = document.createElement('div');
  section.className = 'rvm-ribbon-section rvm-zone-lod-section';
  section.innerHTML = `
    <span class="rvm-ribbon-label">Zones</span>
    <div class="rvm-ribbon-button-row">
      <button type="button" class="rvm-btn" data-rvm-zone-help title="Large RVM files use a hierarchy manifest selector before mesh creation">Zones</button>
      <select class="rvm-zone-detail-select" data-rvm-zone-detail title="Render detail for zone-selected loads">
        <option value="100">100%</option>
        <option value="50">50%</option>
        <option value="25">25%</option>
      </select>
    </div>`;
  const orient = ribbon.querySelector('[aria-label="Orient tools"]') || ribbon.querySelector('.rvm-ribbon-search');
  if (orient) ribbon.insertBefore(section, orient.nextSibling || orient);
  else ribbon.appendChild(section);
  const detail = section.querySelector('[data-rvm-zone-detail]');
  detail.value = storageGet(DETAIL_STORAGE_KEY, '100');
  detail.addEventListener('change', () => {
    storageSet(DETAIL_STORAGE_KEY, detail.value || '100');
    setStatus(root, `Next large RVM load will use ${detail.value}% render detail.`);
  });
  section.querySelector('[data-rvm-zone-help]')?.addEventListener('click', () => {
    setStatus(root, 'For files above 8 MB, a searchable hierarchy-zone selector opens before WebGL mesh creation. Use Detail to render 100%, 50%, or 25%.');
  });
}

function injectZoneStyles() {
  if (document.getElementById('rvm-zone-lod-style')) return;
  const style = document.createElement('style');
  style.id = 'rvm-zone-lod-style';
  style.textContent = `
    .rvm-zone-select-overlay{position:fixed;inset:0;background:rgba(2,6,23,.68);display:grid;place-items:center;z-index:99999;color:#e8f3ff;font-family:system-ui,sans-serif}
    .rvm-zone-select-modal{width:min(860px,calc(100vw - 40px));max-height:min(780px,calc(100vh - 40px));background:#111827;border:1px solid rgba(126,190,255,.34);border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.55);display:flex;flex-direction:column;overflow:hidden}
    .rvm-zone-select-head,.rvm-zone-select-toolbar,.rvm-zone-select-foot{display:flex;gap:10px;align-items:center;padding:12px;border-bottom:1px solid rgba(126,190,255,.18)}
    .rvm-zone-select-head{justify-content:space-between}.rvm-zone-select-head p{margin:4px 0 0;color:#9fb4d2;font-size:12px}.rvm-zone-select-toolbar input{flex:1;min-width:160px}.rvm-zone-select-toolbar input,.rvm-zone-select-toolbar select{background:#0b1220;color:#e8f3ff;border:1px solid rgba(126,190,255,.35);border-radius:7px;padding:7px}
    .rvm-zone-list{overflow:auto;padding:8px;display:grid;gap:4px}.rvm-zone-row{display:grid;grid-template-columns:auto 1fr auto;gap:9px;align-items:center;padding:7px 8px;border:1px solid rgba(148,163,184,.14);border-radius:8px;background:rgba(255,255,255,.035)}.rvm-zone-row[data-zone-depth="0"]{background:rgba(74,144,226,.14);border-color:rgba(126,190,255,.26)}.rvm-zone-name{display:flex;align-items:center;gap:4px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rvm-zone-indent{display:inline-block;width:calc(var(--zone-depth,0) * 14px);flex:0 0 calc(var(--zone-depth,0) * 14px)}.rvm-zone-count{color:#9fd0ff;font-size:12px}.rvm-zone-select-foot{justify-content:space-between;border-top:1px solid rgba(126,190,255,.18);border-bottom:0}.rvm-zone-select-modal button{background:#1f2b45;color:#e8f3ff;border:1px solid rgba(126,190,255,.35);border-radius:8px;padding:7px 10px}.rvm-zone-primary{background:#2563eb!important}.rvm-zone-primary:disabled{opacity:.45}`;
  document.head.appendChild(style);
}

function scan() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[data-rvm-viewer]').forEach(injectZoneToolbar);
}

export function installRvmZoneLodLabelBridge() {
  if (typeof document === 'undefined') return;
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;
  injectZoneStyles();
  scan();
  if (typeof MutationObserver === 'function') {
    const observer = new MutationObserver(scan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  globalThis.__PCF_GLB_RVM_ZONE_LOD_LABELS__ = {
    version: '20260621-rvm-preload-hierarchy-selector-1',
    beforeRenderInstructions,
    buildZones,
    buildPreloadHierarchyZones,
    zoneKeyForInstruction,
    instructionMatchesZone,
    preloadManifestSchema: PRELOAD_MANIFEST_SCHEMA,
    labelConfirmThreshold: DEFAULT_LABEL_CONFIRM_THRESHOLD,
  };
}
